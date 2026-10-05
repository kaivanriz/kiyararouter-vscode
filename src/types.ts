/** Tipe balasan /v1/models dari Kiyara (kompatibel OpenAI). */
export interface OpenAIModel {
  id: string;
  object?: string;
  created?: number;
  owned_by?: string;
}

export interface OpenAIModelsResponse {
  object: string;
  data: OpenAIModel[];
}

/**
 * Satu model dari endpoint publik Kiyara /api/public/models.
 * Endpoint ini TIDAK butuh API key dan menyediakan metadata lengkap
 * (context window, nama tampilan, harga, ketersediaan).
 */
export interface KiyaraPublicModel {
  id: number;
  code: string;
  name: string;
  provider?: string;
  provider_label?: string;
  provider_color?: string;
  context_window?: number;
  input_per_1m?: number;
  output_per_1m?: number;
  discount_pct?: number;
  tps?: number;
  ttft_ms?: number;
  available?: boolean;
  status?: string;
  unlimited?: boolean;
  category?: string;
  /** Apakah model mendukung input gambar (vision). Disediakan oleh katalog KiyaraRouter. */
  supports_vision?: boolean;
}

export interface KiyaraPublicModelsResponse {
  items: KiyaraPublicModel[];
}

export type ChatRole = 'system' | 'user' | 'assistant' | 'tool';

/** Definisi tool (format OpenAI). */
export interface OpenAITool {
  type: 'function';
  function: {
    name: string;
    description?: string;
    parameters?: object;
  };
}

/** Panggilan tool dari assistant (format OpenAI). */
export interface OpenAIToolCall {
  id: string;
  type: 'function';
  function: {
    name: string;
    arguments: string;
  };
}

export interface ChatMessage {
  role: ChatRole;
  content: string | null;
  /** Tool calls yang diminta assistant (bila role = assistant). */
  tool_calls?: OpenAIToolCall[];
  /** ID tool call yang dijawab (bila role = tool). */
  tool_call_id?: string;
}

export interface ChatCompletionRequest {
  model: string;
  messages: ChatMessage[];
  stream?: boolean;
  temperature?: number;
  max_tokens?: number;
  tools?: OpenAITool[];
  tool_choice?: 'auto' | 'required' | 'none';
}

export interface ToolCallDelta {
  index: number;
  id?: string;
  type?: string;
  function?: {
    name?: string;
    arguments?: string;
  };
}

export interface ChatCompletionChoice {
  index: number;
  message?: { role: string; content: string | null; tool_calls?: OpenAIToolCall[] };
  delta?: { role?: string; content?: string | null; tool_calls?: ToolCallDelta[] };
  finish_reason?: string | null;
}

export interface ChatCompletionUsage {
  prompt_tokens?: number;
  completion_tokens?: number;
  total_tokens?: number;
}

export interface ChatCompletionResponse {
  id: string;
  object: string;
  created: number;
  model: string;
  choices: ChatCompletionChoice[];
  usage?: ChatCompletionUsage;
}

/** Kesalahan yang berasal dari API Kiyara dengan pesan ramah pengguna. */
export class KiyaraApiError extends Error {
  constructor(
    message: string,
    readonly status?: number
  ) {
    super(message);
    this.name = 'KiyaraApiError';
  }
}
