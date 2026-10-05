/**
 * Smoke test koneksi nyata ke Kiyara (kiyararouter.web.id).
 *
 * Pakai:
 *   $env:KIYARA_API_KEY = "sk-kiyara-..."   # PowerShell
 *   npm run test:smoke
 *
 * Tanpa API key, test yang butuh kredensial akan DILEWATI (skipped), bukan gagal.
 * Base URL bisa dioverride lewat KIYARA_BASE_URL.
 */
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { test } from 'node:test';
import { fetchPublicModels, KiyaraClient } from '../src/client';
import { formatContext, formatPrice } from '../src/pure';
import { KiyaraApiError } from '../src/types';

const BASE_URL = process.env.KIYARA_BASE_URL ?? 'https://kiyararouter.web.id/v1';
const DEFAULT_MODEL = process.env.KIYARA_TEST_MODEL ?? 'deepseek-ai/deepseek-v4.1-flash';

/** Ambil API key dari env (KIYARA_API_KEY atau API_KEY), atau dari file .env. */
function resolveApiKey(): string | undefined {
  for (const name of ['KIYARA_API_KEY', 'API_KEY']) {
    const v = process.env[name];
    if (v && v.trim()) {
      return v.trim();
    }
  }
  if (existsSync('.env')) {
    for (const line of readFileSync('.env', 'utf-8').split(/\r?\n/)) {
      const m = /^\s*(KIYARA_API_KEY|API_KEY)\s*=\s*(.+)\s*$/.exec(line);
      if (m) {
        return m[2].replace(/^["']|["']$/g, '').trim();
      }
    }
  }
  return undefined;
}

const apiKey = resolveApiKey();
const hasKey = Boolean(apiKey);

test('endpoint menolak API key yang tidak valid dengan 401', async () => {
  const client = new KiyaraClient(BASE_URL, 'sk-kiyara-invalid-test');
  await assert.rejects(
    () => client.listModels(),
    (err: unknown) => {
      assert.ok(err instanceof KiyaraApiError, 'harus KiyaraApiError');
      assert.equal(err.status, 401);
      assert.match(err.message, /API key tidak valid/);
      return true;
    }
  );
});

test('GET /v1/models mengembalikan daftar model', { skip: !hasKey && 'KIYARA_API_KEY tidak diset' }, async () => {
  const client = new KiyaraClient(BASE_URL, apiKey!);
  const models = await client.listModels();
  assert.ok(Array.isArray(models), 'harus array');
  assert.ok(models.length > 0, 'minimal satu model tersedia');
  assert.ok(
    models.every((m) => typeof m.id === 'string' && m.id.length > 0),
    'setiap model punya id'
  );
  console.log(`\n  → Ditemukan ${models.length} model. Contoh: ${models.slice(0, 5).map((m) => m.id).join(', ')}\n`);
});

test('POST /v1/chat/completions (streaming) menghasilkan balasan', { skip: !hasKey && 'KIYARA_API_KEY tidak diset' }, async () => {
  const client = new KiyaraClient(BASE_URL, apiKey!);
  const models = await client.listModels();
  const model = DEFAULT_MODEL;

  let chunks = 0;
  const text = await client.chatStream(
    {
      model,
      messages: [
        { role: 'system', content: 'Jawab sangat singkat.' },
        { role: 'user', content: 'Balas dengan satu kata: halo' },
      ],
      max_tokens: 32,
    },
    () => {
      chunks++;
    }
  );

  assert.ok(typeof text === 'string');
  assert.ok(text.trim().length > 0, 'balasan tidak boleh kosong');
  assert.ok(chunks > 0, 'harus ada potongan streaming');
  console.log(`\n  → Model ${model} menjawab: "${text.trim()}" (${chunks} chunk)\n`);
});

test('non-streaming chat juga bekerja', { skip: !hasKey && 'KIYARA_API_KEY tidak diset' }, async () => {
  const client = new KiyaraClient(BASE_URL, apiKey!);
  const models = await client.listModels();
  const model = DEFAULT_MODEL;

  const res = await client.chat({
    model,
    messages: [{ role: 'user', content: 'Balas dengan satu kata: tes' }],
    max_tokens: 16,
  });
  assert.ok(res.choices?.length, 'ada choices');
  assert.ok(typeof res.choices[0].message?.content === 'string');
  console.log(`\n  → Non-streaming OK: "${res.choices[0].message?.content?.trim()}"\n`);
});

test('metadata publik menyediakan context window & harga', async () => {
  const map = await fetchPublicModels(BASE_URL);
  assert.ok(map.size > 0, 'harus ada model di katalog publik');
  const withCtx = [...map.values()].filter(
    (m) => typeof m.context_window === 'number' && m.context_window > 0
  );
  assert.ok(withCtx.length > 0, 'harus ada model dengan context_window');
  const sample = withCtx[0];
  console.log(
    `\n  → ${sample.code}: ${formatContext(sample.context_window)} context, ` +
      `${formatPrice(sample.input_per_1m, sample.output_per_1m)}\n`
  );
  // Pastikan format berfungsi untuk beberapa model.
  for (const m of withCtx.slice(0, 5)) {
    assert.ok(formatContext(m.context_window));
  }
});

test('metadata publik menyediakan supports_vision', async () => {
  const map = await fetchPublicModels(BASE_URL);
  const withFlag = [...map.values()].filter((m) => typeof m.supports_vision === 'boolean');
  assert.ok(withFlag.length > 0, 'harus ada model dengan supports_vision');
  const visionCount = withFlag.filter((m) => m.supports_vision).length;
  console.log(
    `\n  → ${withFlag.length} model punya supports_vision (${visionCount} vision, ` +
      `${withFlag.length - visionCount} non-vision)\n`
  );
});
