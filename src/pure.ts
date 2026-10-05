/**
 * Fungsi murni yang dipakai provider & client. Dipisah agar bisa di-unit-test
 * tanpa mengimpor modul `vscode`.
 */

/** Petakan status code Kiyara ke pesan yang mudah dipahami. */
export function friendlyError(status: number, fallback: string): string {
  switch (status) {
    case 401:
      return 'API key tidak valid atau sudah dicabut. Atur ulang lewat perintah "Kiyara: Atur API Key".';
    case 402:
      return 'Saldo tidak mencukupi. Top-up atau aktifkan paket di dashboard Kiyara.';
    case 404:
      return 'Model tidak ditemukan. Cek kode model di daftar model KiyaraRouter.';
    case 429:
      return 'Batas laju / kuota harian tercapai. Coba lagi nanti.';
    case 503:
      return 'Model sedang tidak tersedia (maintenance / upstream down).';
    default:
      return fallback || `Permintaan gagal (HTTP ${status}).`;
  }
}

/** Tebak nama family dari kode model. */
export function familyOf(id: string): string {
  const s = id.toLowerCase();
  if (s.includes('claude')) {
    return 'claude';
  }
  if (s.includes('gemini')) {
    return 'gemini';
  }
  if (s.includes('gpt') || s.startsWith('openai/')) {
    return 'gpt';
  }
  if (s.includes('deepseek')) {
    return 'deepseek';
  }
  if (s.includes('grok') || s.startsWith('xai/')) {
    return 'grok';
  }
  if (s.includes('mistral') || s.includes('mixtral')) {
    return 'mistral';
  }
  if (s.includes('glm')) {
    return 'glm';
  }
  if (s.includes('qwen')) {
    return 'qwen';
  }
  if (s.includes('llama')) {
    return 'llama';
  }
  return 'kiyara';
}

/**
 * Apakah model mendukung input gambar (vision).
 *
 * Prioritas:
 *  1. Override pengguna (`visionModels`) — entri biasa memaksa vision = true,
 *     entri berawalan "-" memaksa vision = false;
 *  2. Nilai `supports_vision` dari katalog KiyaraRouter (bila ada);
 *  3. Tebakan dari pola nama model (fallback terakhir).
 */
export function isImageCapable(
  id: string,
  options: { supportsVision?: boolean; overrides?: readonly string[] } = {}
): boolean {
  const overrides = options.overrides ?? [];
  if (overrides.length > 0) {
    const lower = id.toLowerCase();
    for (const raw of overrides) {
      const entry = raw.trim();
      if (!entry) {
        continue;
      }
      // Entri berawalan "-" menandai model yang BUKAN vision.
      if (entry.startsWith('-')) {
        if (entry.slice(1).trim().toLowerCase() === lower) {
          return false;
        }
      } else if (entry.toLowerCase() === lower) {
        return true;
      }
    }
  }

  // Nilai dari API KiyaraRouter (otoritatif bila tersedia).
  if (typeof options.supportsVision === 'boolean') {
    return options.supportsVision;
  }

  // Tebakan default dari pola nama.
  return (
    /gpt-4o|gpt-4\.1|gpt-5|gpt-6|gemini|claude|vision|gpt-image/i.test(id) ||
    /o[134](?:-|$)/.test(id)
  );
}

/** Estimasi token kasar (~4 karakter per token). */
export function estimateTokens(text: string): number {
  return Math.max(1, Math.ceil(text.length / 4));
}

/**
 * Hitung batas token output yang wajar dari context window.
 * Output tidak boleh lebih besar dari context, dan dibatasi agar tidak
 * melampaui kapasitas model yang umum.
 */
export function resolveMaxOutputTokens(contextWindow: number, fallback: number): number {
  if (!Number.isFinite(contextWindow) || contextWindow <= 0) {
    return fallback;
  }
  // Sisakan ruang untuk input; batasi maksimum 64K token output.
  const quarter = Math.floor(contextWindow / 4);
  const cap = 65536;
  return Math.min(quarter, cap) || fallback;
}

/**
 * Apakah model mendukung tool calling.
 * Model kategori "decision" (System One) tidak mendukung tool calling.
 */
export function isToolCapable(meta?: { category?: string }): boolean {
  if (meta?.category === 'decision') {
    return false;
  }
  return true;
}

/**
 * Model kategori "decision" memakai endpoint & format berbeda (tanpa streaming),
 * sehingga tidak kompatibel dengan provider chat. Sembunyikan dari picker.
 */
export function isDecisionModel(meta?: { category?: string }): boolean {
  return meta?.category === 'decision';
}

/** Format harga USD per 1M token menjadi teks ringkas. */
export function formatPrice(inputPer1M?: number, outputPer1M?: number): string | undefined {
  const hasIn = typeof inputPer1M === 'number' && Number.isFinite(inputPer1M);
  const hasOut = typeof outputPer1M === 'number' && Number.isFinite(outputPer1M);
  if (!hasIn && !hasOut) {
    return undefined;
  }
  const fmt = (n: number): string => {
    if (n === 0) {
      return '$0';
    }
    // Buang nol di belakang: 0.050 -> 0.05, 1.50 -> 1.5, 0.010 -> 0.01
    const trim = (s: string): string => s.replace(/\.?0+$/, '');
    if (n >= 1) {
      return `$${trim(n.toFixed(2))}`;
    }
    if (n >= 0.01) {
      return `$${trim(n.toFixed(3))}`;
    }
    return `$${n.toPrecision(2)}`;
  };
  const parts: string[] = [];
  if (hasIn) {
    parts.push(`${fmt(inputPer1M!)}/1M in`);
  }
  if (hasOut) {
    parts.push(`${fmt(outputPer1M!)}/1M out`);
  }
  return parts.join(' · ');
}

/** Format ukuran context window (mis. 1048576 -> "1M", 131072 -> "128K"). */
export function formatContext(contextWindow?: number): string | undefined {
  if (typeof contextWindow !== 'number' || !Number.isFinite(contextWindow) || contextWindow <= 0) {
    return undefined;
  }
  if (contextWindow >= 1_000_000) {
    const m = contextWindow / 1_000_000;
    const rounded = Math.round(m * 10) / 10;
    // Tampilkan bulat bila sangat dekat dengan bilangan bulat (mis. 1.048576 -> 1M).
    return Math.abs(rounded - Math.round(rounded)) < 0.05
      ? `${Math.round(rounded)}M`
      : `${rounded.toFixed(1)}M`;
  }
  if (contextWindow >= 1000) {
    return `${Math.round(contextWindow / 1000)}K`;
  }
  return String(contextWindow);
}

/** Ambil potongan konten dari satu baris JSON SSE (delta atau message). */
export function parseSseDelta(json: string): string {
  try {
    const obj = JSON.parse(json);
    const choice = obj?.choices?.[0];
    const content = choice?.delta?.content ?? choice?.message?.content ?? '';
    return typeof content === 'string' ? content : '';
  } catch {
    return '';
  }
}

/** Ambil pesan dari body error JSON bila ada. */
export function extractErrorMessage(text: string): string {
  if (!text) {
    return '';
  }
  try {
    const obj = JSON.parse(text);
    if (typeof obj?.error === 'string') {
      return obj.error;
    }
    if (typeof obj?.error?.message === 'string') {
      return obj.error.message;
    }
    if (typeof obj?.message === 'string') {
      return obj.message;
    }
  } catch {
    // bukan JSON
  }
  return text.slice(0, 300);
}
