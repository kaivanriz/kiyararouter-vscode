import { extractErrorMessage, friendlyError, parseSseDelta } from './pure';
import {
  ChatCompletionRequest,
  ChatCompletionResponse,
  KiyaraApiError,
  KiyaraPublicModel,
  KiyaraPublicModelsResponse,
  OpenAIModel,
  OpenAIModelsResponse,
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
   * Mengembalikan teks lengkap dan (opsional) usage bila server mengirimkannya.
   */
  async chatStream(
    req: ChatCompletionRequest,
    onDelta: (delta: string) => void | Promise<void>,
    token?: { isCancellationRequested: boolean; onCancellationRequested: (cb: () => void) => void }
  ): Promise<string> {
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
            return full;
          }
          const delta = parseSseDelta(data);
          if (delta) {
            full += delta;
            await onDelta(delta);
          }
        }
      }
      return full;
    } finally {
      reader.releaseLock?.();
    }
  }
}

