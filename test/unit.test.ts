import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  estimateTokens,
  extractErrorMessage,
  familyOf,
  formatContext,
  formatPrice,
  friendlyError,
  isDecisionModel,
  isImageCapable,
  isToolCapable,
  parseSseDelta,
  resolveMaxOutputTokens,
} from '../src/pure';

test('friendlyError memetakan kode status ke pesan yang benar', () => {
  assert.match(friendlyError(401, ''), /API key tidak valid/);
  assert.match(friendlyError(402, ''), /Saldo tidak mencukupi/);
  assert.match(friendlyError(404, ''), /Model tidak ditemukan/);
  assert.match(friendlyError(429, ''), /Batas laju/);
  assert.match(friendlyError(503, ''), /tidak tersedia/);
});

test('friendlyError memakai fallback untuk kode tak dikenal', () => {
  assert.equal(friendlyError(500, 'Boom'), 'Boom');
  assert.match(friendlyError(500, ''), /HTTP 500/);
});

test('familyOf mendeteksi provider dari kode model', () => {
  assert.equal(familyOf('anthropic/claude-3.5-sonnet'), 'claude');
  assert.equal(familyOf('google/gemini-2.0-flash'), 'gemini');
  assert.equal(familyOf('openai/gpt-4o'), 'gpt');
  assert.equal(familyOf('deepseek/deepseek-chat'), 'deepseek');
  assert.equal(familyOf('xai/grok-2'), 'grok');
  assert.equal(familyOf('mistral/mistral-large'), 'mistral');
  assert.equal(familyOf('z-ai/glm-5.3'), 'glm');
  assert.equal(familyOf('qwen/qwen-2.5'), 'qwen');
  assert.equal(familyOf('meta/llama-3.1'), 'llama');
  assert.equal(familyOf('some/unknown-model'), 'kiyara');
});

test('familyOf tidak peka huruf besar/kecil', () => {
  assert.equal(familyOf('OpenAI/GPT-4o'), 'gpt');
  assert.equal(familyOf('Anthropic/Claude-3'), 'claude');
});

test('isImageCapable: nilai dari API menang atas tebakan nama', () => {
  // z-ai/glm-5.3 tidak terdeteksi regex, tapi API bilang vision.
  assert.equal(isImageCapable('z-ai/glm-5.3', { supportsVision: true }), true);
  // gpt-6 terdeteksi regex vision, tapi API bilang bukan.
  assert.equal(isImageCapable('openai/gpt-6-luna', { supportsVision: false }), false);
});

test('isImageCapable: override pengguna menang atas API', () => {
  assert.equal(
    isImageCapable('z-ai/glm-5.3', { supportsVision: false, overrides: ['z-ai/glm-5.3'] }),
    true
  );
  assert.equal(
    isImageCapable('openai/gpt-6-luna', { supportsVision: true, overrides: ['-openai/gpt-6-luna'] }),
    false
  );
});

test('isImageCapable: fallback ke tebakan nama bila tanpa info', () => {
  assert.equal(isImageCapable('openai/gpt-4o'), true);
  assert.equal(isImageCapable('anthropic/claude-3.5-sonnet'), true);
  assert.equal(isImageCapable('google/gemini-1.5-pro'), true);
  assert.equal(isImageCapable('openai/gpt-image-2.5'), true);
  assert.equal(isImageCapable('deepseek/deepseek-chat'), false);
  assert.equal(isImageCapable('z-ai/glm-5.3'), false);
});

test('isDecisionModel mendeteksi kategori decision', () => {
  assert.equal(isDecisionModel({ category: 'decision' }), true);
  assert.equal(isDecisionModel({ category: '' }), false);
  assert.equal(isDecisionModel(undefined), false);
});

test('estimateTokens minimal 1 dan kira-kira len/4', () => {
  assert.equal(estimateTokens(''), 1);
  assert.equal(estimateTokens('abcd'), 1);
  assert.equal(estimateTokens('12345678'), 2);
});

test('parseSseDelta mengambil konten dari delta', () => {
  assert.equal(
    parseSseDelta('{"choices":[{"delta":{"content":"Halo"}}]}'),
    'Halo'
  );
});

test('parseSseDelta mengambil konten dari message (non-stream)', () => {
  assert.equal(
    parseSseDelta('{"choices":[{"message":{"content":"Dunia"}}]}'),
    'Dunia'
  );
});

test('parseSseDelta mengembalikan string kosong untuk JSON rusak', () => {
  assert.equal(parseSseDelta('{bukan json'), '');
  assert.equal(parseSseDelta('{"choices":[]}'), '');
});

test('extractErrorMessage membaca berbagai bentuk body error', () => {
  assert.equal(extractErrorMessage('{"error":"API key tidak valid"}'), 'API key tidak valid');
  assert.equal(extractErrorMessage('{"error":{"message":"Upstream down"}}'), 'Upstream down');
  assert.equal(extractErrorMessage('{"message":"Nope"}'), 'Nope');
  assert.equal(extractErrorMessage(''), '');
  assert.equal(extractErrorMessage('plain text'), 'plain text');
});

test('resolveMaxOutputTokens memakai seperempat context & dibatasi 64K', () => {
  assert.equal(resolveMaxOutputTokens(128000, 8192), 32000);
  assert.equal(resolveMaxOutputTokens(1_048_576, 8192), 65536); // quart > 64K -> cap
  assert.equal(resolveMaxOutputTokens(4000, 2048), 1000);
  assert.equal(resolveMaxOutputTokens(0, 8192), 8192); // fallback
  assert.equal(resolveMaxOutputTokens(NaN, 999), 999);
});

test('formatContext meringkas ukuran context', () => {
  assert.equal(formatContext(1_048_576), '1M');
  assert.equal(formatContext(1_310_720), '1.3M');
  assert.equal(formatContext(128000), '128K');
  assert.equal(formatContext(8192), '8K');
  assert.equal(formatContext(500), '500');
  assert.equal(formatContext(undefined), undefined);
  assert.equal(formatContext(0), undefined);
});

test('formatPrice memformat harga USD per 1M token', () => {
  assert.equal(formatPrice(0.0084, 0.0252), '$0.0084/1M in · $0.025/1M out');
  assert.equal(formatPrice(1, 5), '$1/1M in · $5/1M out');
  assert.equal(formatPrice(0.01, 0.05), '$0.01/1M in · $0.05/1M out');
  assert.equal(formatPrice(0, 0), '$0/1M in · $0/1M out');
  assert.equal(formatPrice(undefined, 2), '$2/1M out');
  assert.equal(formatPrice(undefined, undefined), undefined);
});

test('isToolCapable menonaktifkan tool untuk model decision', () => {
  assert.equal(isToolCapable({ category: 'decision' }), false);
  assert.equal(isToolCapable({ category: '' }), true);
  assert.equal(isToolCapable(undefined), true);
});
