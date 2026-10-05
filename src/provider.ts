import * as vscode from 'vscode';
import { fetchPublicModels, KiyaraClient } from './client';
import { KiyaraConfig } from './config';
import {
  estimateTokens,
  familyOf,
  formatContext,
  isDecisionModel,
  isImageCapable,
  isToolCapable,
  resolveMaxOutputTokens,
} from './pure';
import { ChatMessage, KiyaraApiError, KiyaraPublicModel, OpenAIModel } from './types';

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
    _options: vscode.ProvideLanguageModelChatResponseOptions,
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

    try {
      await client.chatStream(
        {
          model: model.id,
          messages: openAiMessages,
          temperature,
          max_tokens: maxTokens > 0 ? maxTokens : undefined,
        },
        (delta) => {
          progress.report(new vscode.LanguageModelTextPart(delta));
        },
        token
      );
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

/** VS Code message -> OpenAI chat message. */
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
    const content = messageToPlainText(msg);
    if (content) {
      out.push({ role, content });
    }
  }
  return out;
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


