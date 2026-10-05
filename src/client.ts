import { extractErrorMessage, friendlyError } from './pure';
import {
  ChatCompletionRequest,
  ChatCompletionResponse,
  KiyaraApiError,
  KiyaraPublicModel,
  KiyaraPublicModelsResponse,
  OpenAIModel,
  OpenAIModelsResponse,
  OpenAIToolCall,
  ToolCallDelta,
} from './types';

/** Ambil origin situs (tanpa path /v1) dari base URL. */
function siteOrigin(baseUrl: string): string {
  try {
    return new URL(baseUrl).origin;
  } catch {
    return baseUrl.replace(/\/+$/, '').replace(/\/v1$/, '');
  }
}

/**
 * Ambil metadata model publik dari /api/public/models (tanpa API key).
 * Menyediakan context_window, nama tampilan, harga, dan status ketersediaan.
 * Bila gagal, kembalikan array kosong (bukan error) supaya provider tetap jalan.
 */
export async function fetchPublicModels(
  baseUrl: string,
  token?: { isCancellationRequested: boolean; onCancellationRequested: (cb: () => void) => void }
): Promise<Map<string, KiyaraPublicModel>> {
  const url = `${siteOrigin(baseUrl)}/api/public/models`;
  try {
    const res = await fetch(url, {
      method: 'GET',
      headers: { Accept: 'application/json' },
      signal: toSignal(token),
    });
    if (!res.ok) {
      return new Map();
    }
    const json = (await res.json()) as KiyaraPublicModelsResponse;
    const items = Array.isArray(json?.items) ? json.items : [];
    return new Map(items.filter((m) => m && typeof m.code === 'string').map((m) => [m.code, m]));
  } catch {
    return new Map();
  }
}

/** Buat AbortSignal dari CancellationToken VS Code (opsional). */
function toSignal(token?: {
  isCancellationRequested: boolean;
  onCancellationRequested: (cb: () => void) => void;
}): AbortSignal | undefined {
  if (!token) {
    return undefined;
  }
  const controller = new AbortController();
  if (token.isCancellationRequested) {
    controller.abort();
  } else {
    token.onCancellationRequested(() => controller.abort());
  }
  return controller.signal;
}

/** Klien HTTP minimal untuk API Kiyara (OpenAI-compatible). */
export class KiyaraClient {
  constructor(
    private readonly baseUrl: string,
    private readonly apiKey: string
  ) {}

  private headers(): Record<string, string> {
    return {
      Authorization: `Bearer ${this.apiKey}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    };
  }

  /** Ambil daftar model aktif. Membuang model gambar/decision bila perlu bisa difilter pemanggil. */
  async listModels(token?: { isCancellationRequested: boolean; onCancellationRequested: (cb: () => void) => void }): Promise<OpenAIModel[]> {
    const res = await fetch(`${this.baseUrl}/models`, {
      method: 'GET',
      headers: this.headers(),
      signal: toSignal(token),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new KiyaraApiError(friendlyError(res.status, extractErrorMessage(text)), res.status);
    }

    const json = (await res.json()) as OpenAIModelsResponse;
    const data = Array.isArray(json?.data) ? json.data : [];
    return data
      .filter((m) => m && typeof m.id === 'string')
      .sort((a, b) => a.id.localeCompare(b.id));
  }

  /** Chat completion non-streaming. */
  async chat(req: ChatCompletionRequest): Promise<ChatCompletionResponse> {
    const res = await fetch(`${this.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: this.headers(),
      body: JSON.stringify({ ...req, stream: false }),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new KiyaraApiError(friendlyError(res.status, extractErrorMessage(text)), res.status);
    }
    return (await res.json()) as ChatCompletionResponse;
  }

  /**
   * Chat completion streaming. Memanggil onDelta untuk setiap potongan teks.
   * Mengembalikan teks lengkap dan tool calls (bila model memintanya).
   */
  async chatStream(
    req: ChatCompletionRequest,
    onDelta: (delta: string) => void | Promise<void>,
    token?: { isCancellationRequested: boolean; onCancellationRequested: (cb: () => void) => void }
  ): Promise<StreamResult> {
    const res = await fetch(`${this.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: { ...this.headers(), Accept: 'text/event-stream' },
      body: JSON.stringify({ ...req, stream: true }),
      signal: toSignal(token),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new KiyaraApiError(friendlyError(res.status, extractErrorMessage(text)), res.status);
    }
    if (!res.body) {
      throw new KiyaraApiError('Server tidak mengirim stream respons.');
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder('utf-8');
    let buffer = '';
    let full = '';
    const toolCalls = new ToolCallAccumulator();

    try {
      // Baca stream baris demi baris (SSE: "data: {...}").
      for (;;) {
        const { done, value } = await reader.read();
        if (done) {
          break;
        }
        buffer += decoder.decode(value, { stream: true });

        let newlineIndex: number;
        while ((newlineIndex = buffer.indexOf('\n')) >= 0) {
          const line = buffer.slice(0, newlineIndex).trim();
          buffer = buffer.slice(newlineIndex + 1);
          if (!line || !line.startsWith('data:')) {
            continue;
          }
          const data = line.slice(5).trim();
          if (data === '[DONE]') {
            buffer = '';
            return { text: full, toolCalls: toolCalls.finish() };
          }
          const parsed = parseSseChunk(data);
          if (parsed.toolCallDeltas) {
            toolCalls.add(parsed.toolCallDeltas);
          }
          if (parsed.content) {
            full += parsed.content;
            await onDelta(parsed.content);
          }
          // Beberapa server mengirim tool_calls utuh di message (non-delta).
          if (parsed.messageToolCalls) {
            toolCalls.addComplete(parsed.messageToolCalls);
          }
        }
      }
      return { text: full, toolCalls: toolCalls.finish() };
    } finally {
      reader.releaseLock?.();
    }
  }
}

/** Hasil satu permintaan streaming: teks + tool calls yang diminta model. */
export interface StreamResult {
  text: string;
  toolCalls: OpenAIToolCall[];
}

/** Hasil parse satu baris JSON SSE. */
export interface ParsedChunk {
  content: string;
  toolCallDeltas?: ToolCallDelta[];
  messageToolCalls?: OpenAIToolCall[];
}

/** Kumpulkan tool calls yang datang bertahap lewat stream.
 * OpenAI mengirim tool call secara bertahap: id & nama dulu, lalu arguments
 * dipecah beberapa chunk, diindeks dengan `index`.
 */
export class ToolCallAccumulator {
  private byIndex = new Map<number, { id: string; name: string; arguments: string }>();

  add(deltas: ToolCallDelta[]): void {
    for (const d of deltas) {
      const index = typeof d.index === 'number' ? d.index : 0;
      const entry = this.byIndex.get(index) ?? { id: '', name: '', arguments: '' };
      if (d.id) {
        entry.id = d.id;
      }
      if (d.function?.name) {
        entry.name = d.function.name;
      }
      if (d.function?.arguments) {
        entry.arguments += d.function.arguments;
      }
      this.byIndex.set(index, entry);
    }
  }

  addComplete(calls: OpenAIToolCall[]): void {
    for (const c of calls) {
      const index = this.byIndex.size;
      this.byIndex.set(index, {
        id: c.id,
        name: c.function?.name ?? '',
        arguments: c.function?.arguments ?? '',
      });
    }
  }

  finish(): OpenAIToolCall[] {
    return [...this.byIndex.values()]
      .filter((e) => e.name)
      .map((e, i) => ({
        id: e.id || `call_${i}`,
        type: 'function' as const,
        function: {
          name: e.name,
          // Pastikan arguments selalu string JSON yang valid.
          arguments: normalizeArguments(e.arguments),
        },
      }));
  }
}

/** Pastikan arguments berbentuk string JSON object yang valid. */
function normalizeArguments(raw: string): string {
  const trimmed = (raw ?? '').trim();
  if (!trimmed) {
    return '{}';
  }
  // Sebagian model kadang dobel-encode atau tidak valid; fallback ke {}.
  try {
    const parsed = JSON.parse(trimmed);
    return JSON.stringify(parsed);
  } catch {
    return trimmed.startsWith('{') ? trimmed : '{}';
  }
}

/** Ambil konten & tool_calls dari satu baris JSON SSE. */
export function parseSseChunk(json: string): ParsedChunk {
  try {
    const obj = JSON.parse(json) as ChatCompletionResponse;
    const choice = obj?.choices?.[0];
    const content = choice?.delta?.content ?? '';
    const toolCallDeltas = choice?.delta?.tool_calls;
    const messageToolCalls = choice?.message?.tool_calls;
    return {
      content: typeof content === 'string' ? content : '',
      toolCallDeltas: Array.isArray(toolCallDeltas) ? toolCallDeltas : undefined,
      messageToolCalls: Array.isArray(messageToolCalls) ? messageToolCalls : undefined,
    };
  } catch {
    return { content: '' };
  }
}

