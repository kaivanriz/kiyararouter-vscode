import * as vscode from 'vscode';
import { fetchPublicModels, KiyaraClient } from './client';
import { KiyaraConfig } from './config';
import { logDebug } from './log';
import {
  estimateTokens,
  familyOf,
  formatContext,
  isDecisionModel,
  isImageCapable,
  isToolCapable,
  resolveMaxOutputTokens,
} from './pure';
import { ChatMessage, KiyaraApiError, KiyaraPublicModel, OpenAIModel, OpenAITool, OpenAIToolCall } from './types';

/** Metadata gabungan untuk satu model Kiyara. */
interface ModelInfo {
  id: string;
  public?: KiyaraPublicModel;
}

/**
 * Menyediakan model Kiyara ke VS Code (muncul di dropdown model Copilot).
 * Menerjemahkan format pesan VS Code <-> OpenAI, dan streaming balik ke progress.
 */
export class KiyaraLanguageModelProvider implements vscode.LanguageModelChatProvider {
  private readonly _onDidChange = new vscode.EventEmitter<void>();
  readonly onDidChangeLanguageModelChatInformation = this._onDidChange.event;
  private cached: OpenAIModel[] = [];
  private cachedPublic: Map<string, KiyaraPublicModel> = new Map();

  constructor(private readonly config: KiyaraConfig) {}

  dispose(): void {
    this._onDidChange.dispose();
  }

  /** Panggil saat API key / daftar model berubah supaya VS Code me-refresh picker. */
  notifyChanged(): void {
    this._onDidChange.fire();
  }

  /** Paksa muat ulang metadata dari server pada permintaan berikutnya. */
  invalidate(): void {
    this.cached = [];
    this.cachedPublic = new Map();
  }

  async provideLanguageModelChatInformation(
    options: { silent: boolean },
    token: vscode.CancellationToken
  ): Promise<vscode.LanguageModelChatInformation[]> {
    const apiKey = await this.config.getApiKey();
    if (!apiKey) {
      // Tanpa API key: minta pengguna mengatur key lewat command (kecuali mode silent).
      if (!options.silent) {
        void vscode.commands.executeCommand('kiyara.manageProvider');
      }
      return [];
    }

    // Daftar model aktif (butuh API key) + metadata publik (context window, nama).
    if (this.cached.length === 0) {
      try {
        this.cached = await new KiyaraClient(this.config.baseUrl, apiKey).listModels(token);
      } catch (err) {
        if (!options.silent) {
          void vscode.window.showErrorMessage(
            `KiyaraRouter: gagal memuat model — ${err instanceof Error ? err.message : String(err)}`
          );
        }
        return [];
      }
    }
    if (this.cachedPublic.size === 0) {
      this.cachedPublic = await fetchPublicModels(this.config.baseUrl, token);
    }

    // Metadata publik berisi model yang mungkin lebih banyak dari yang tersedia
    // untuk key ini. Yang menentukan = daftar /v1/models (butuh API key).
    const infos: ModelInfo[] = this.cached.map((m) => ({
      id: m.id,
      public: this.cachedPublic.get(m.id),
    }));

    const allow = vscode.workspace
      .getConfiguration('kiyara')
      .get<string[]>('modelAllowList', []);
    const filter = allow.length > 0 ? new Set(allow) : undefined;

    const visionOverrides = vscode.workspace
      .getConfiguration('kiyara')
      .get<string[]>('visionModels', []);

    const fallbackMaxIn = vscode.workspace
      .getConfiguration('kiyara')
      .get<number>('defaultMaxInputTokens', 128000);
    const fallbackMaxOut = vscode.workspace
      .getConfiguration('kiyara')
      .get<number>('defaultMaxOutputTokens', 8192);

    return infos
      .filter(({ id }) => !filter || filter.has(id))
      // Sembunyikan model yang ditandai tidak tersedia di katalog publik.
      .filter(({ public: meta }) => meta?.available !== false)
      // Sembunyikan model kategori "decision" (format & endpoint berbeda).
      .filter(({ public: meta }) => !isDecisionModel(meta))
      .map(({ id, public: meta }) => {
        const contextWindow =
          typeof meta?.context_window === 'number' && meta.context_window > 0
            ? meta.context_window
            : fallbackMaxIn;
        const maxInput = contextWindow;
        const maxOutput = resolveMaxOutputTokens(contextWindow, fallbackMaxOut);
        return {
          id,
          name: displayName(id, meta),
          family: familyOf(id),
          version: '1',
          detail: detailLine(meta),
          maxInputTokens: maxInput,
          maxOutputTokens: maxOutput,
          capabilities: {
            imageInput: isImageCapable(id, {
              supportsVision: meta?.supports_vision,
              overrides: visionOverrides,
            }),
            toolCalling: isToolCapable(meta),
          },
        } satisfies vscode.LanguageModelChatInformation;
      });
  }

  async provideLanguageModelChatResponse(
    model: vscode.LanguageModelChatInformation,
    messages: readonly vscode.LanguageModelChatRequestMessage[],
    options: vscode.ProvideLanguageModelChatResponseOptions,
    progress: vscode.Progress<vscode.LanguageModelResponsePart>,
    token: vscode.CancellationToken
  ): Promise<void> {
    const apiKey = await this.config.getApiKey();
    if (!apiKey) {
      throw new Error('API key KiyaraRouter belum diatur. Jalankan perintah "Kiyara: Kelola Provider".');
    }

    const client = new KiyaraClient(this.config.baseUrl, apiKey);
    const openAiMessages = convertMessages(messages);
    const temperature = this.config.temperature;
    const maxTokens = this.config.maxTokens;

    // Teruskan tools dari VS Code ke API (kalau ada).
    const tools = convertTools(options.tools);
    const toolChoice = convertToolMode(options.toolMode, tools.length > 0);

    logDebug(
      `Request model=${model.id} messages=${openAiMessages.length} ` +
        `tools=${tools.length} toolMode=${options.toolMode ?? '-'} toolChoice=${toolChoice ?? '-'}`
    );
    if (tools.length > 0) {
      logDebug(`Tool names: ${tools.map((t) => t.function.name).join(', ')}`);
    }

    try {
      const result = await client.chatStream(
        {
          model: model.id,
          messages: openAiMessages,
          temperature,
          max_tokens: maxTokens > 0 ? maxTokens : undefined,
          tools: tools.length > 0 ? tools : undefined,
          tool_choice: toolChoice,
        },
        (delta) => {
          progress.report(new vscode.LanguageModelTextPart(delta));
        },
        token
      );

      // Kembalikan tool calls (bila model memintanya) ke VS Code.
      if (result.toolCalls.length > 0) {
        logDebug(
          `Model meminta ${result.toolCalls.length} tool call: ` +
            result.toolCalls.map((c) => c.function.name).join(', ')
        );
      }
      for (const call of result.toolCalls) {
        let input: object = {};
        try {
          input = JSON.parse(call.function.arguments || '{}');
        } catch {
          input = {};
        }
        progress.report(
          new vscode.LanguageModelToolCallPart(call.id, call.function.name, input)
        );
      }
    } catch (err) {
      if (err instanceof KiyaraApiError) {
        throw new Error(err.message);
      }
      throw err;
    }
  }

  async provideTokenCount(
    _model: vscode.LanguageModelChatInformation,
    text: string | vscode.LanguageModelChatRequestMessage,
    _token: vscode.CancellationToken
  ): Promise<number> {
    const str =
      typeof text === 'string' ? text : messageToPlainText(text);
    // Estimasi kasar ~4 karakter per token (tanpa tokenizer spesifik).
    return estimateTokens(str);
  }
}

/* -------------------------------------------------------------------------- */
/*                              Konversi pesan                                */
/* -------------------------------------------------------------------------- */

/** VS Code message -> OpenAI chat message (termasuk tool call & hasil tool). */
function convertMessages(
  messages: readonly vscode.LanguageModelChatRequestMessage[]
): ChatMessage[] {
  const out: ChatMessage[] = [];
  for (const msg of messages) {
    const role: ChatMessage['role'] =
      msg.role === vscode.LanguageModelChatMessageRole.User
        ? 'user'
        : msg.role === vscode.LanguageModelChatMessageRole.Assistant
          ? 'assistant'
          : 'system';

    // Pisahkan tool call & hasil tool dari bagian teks biasa.
    const toolCalls: OpenAIToolCall[] = [];
    const toolResults: vscode.LanguageModelToolResultPart[] = [];
    const textParts: string[] = [];

    for (const part of msg.content) {
      if (part instanceof vscode.LanguageModelTextPart) {
        textParts.push(part.value);
      } else if (part instanceof vscode.LanguageModelToolCallPart) {
        toolCalls.push({
          id: part.callId,
          type: 'function',
          function: {
            name: part.name,
            arguments: JSON.stringify(part.input ?? {}),
          },
        });
      } else if (part instanceof vscode.LanguageModelToolResultPart) {
        toolResults.push(part);
      } else if (typeof part === 'string') {
        textParts.push(part);
      }
    }

    const content = textParts.join('');

    // Pesan hasil tool: satu pesan per hasil, dengan role "tool".
    if (toolResults.length > 0) {
      for (const result of toolResults) {
        out.push({
          role: 'tool',
          tool_call_id: result.callId,
          content: toolResultText(result),
        });
      }
      // Bila ada teks tambahan menyertai hasil tool, kirim sebagai user.
      if (content) {
        out.push({ role: 'user', content });
      }
      continue;
    }

    // Pesan assistant dengan tool_calls.
    if (role === 'assistant' && toolCalls.length > 0) {
      out.push({
        role: 'assistant',
        content: content || null,
        tool_calls: toolCalls,
      });
      continue;
    }

    if (content) {
      out.push({ role, content });
    }
  }
  return out;
}

/** Ubah konten hasil tool menjadi teks. */
function toolResultText(result: vscode.LanguageModelToolResultPart): string {
  const parts: string[] = [];
  for (const c of result.content) {
    if (c instanceof vscode.LanguageModelTextPart) {
      parts.push(c.value);
    } else if (typeof c === 'string') {
      parts.push(c);
    }
  }
  return parts.join('') || JSON.stringify(result.content);
}

/** VS Code tools -> tool format OpenAI. */
function convertTools(
  tools: readonly vscode.LanguageModelChatTool[] | undefined
): OpenAITool[] {
  if (!tools || tools.length === 0) {
    return [];
  }
  return tools.map((t) => ({
    type: 'function' as const,
    function: {
      name: t.name,
      description: t.description,
      parameters: t.inputSchema ?? { type: 'object', properties: {} },
    },
  }));
}

/** Mode tool VS Code -> tool_choice OpenAI. */
function convertToolMode(
  mode: vscode.LanguageModelChatToolMode | undefined,
  hasTools: boolean
): 'auto' | 'required' | undefined {
  if (!hasTools) {
    return undefined;
  }
  return mode === vscode.LanguageModelChatToolMode.Required ? 'required' : 'auto';
}

/** Gabungkan semua bagian teks dari satu pesan menjadi string. */
function messageToPlainText(msg: vscode.LanguageModelChatRequestMessage): string {
  const parts: string[] = [];
  for (const part of msg.content) {
    if (part instanceof vscode.LanguageModelTextPart) {
      parts.push(part.value);
    } else if (part instanceof vscode.LanguageModelToolResultPart) {
      parts.push(
        part.content
          .map((c) => (c instanceof vscode.LanguageModelTextPart ? c.value : ''))
          .join('')
      );
    } else if (typeof part === 'string') {
      parts.push(part);
    }
  }
  return parts.join('');
}

/** Nama tampilan model: nama rapi dari katalog bila ada, jika tidak kode model. */
function displayName(id: string, meta?: KiyaraPublicModel): string {
  const nice = meta?.name?.trim();
  return nice ? nice : id;
}

/** Baris detail ringkas: context + vision (harga tidak ditampilkan di picker). */
function detailLine(meta?: KiyaraPublicModel): string {
  const bits: string[] = [];
  const ctx = formatContext(meta?.context_window);
  if (ctx) {
    bits.push(`${ctx} context`);
  }
  if (meta?.supports_vision) {
    bits.push('vision');
  }
  if (meta?.category === 'decision') {
    bits.push('decision');
  }
  return bits.join(' · ');
}


