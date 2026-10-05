import assert from 'node:assert/strict';
import { test } from 'node:test';
import { parseSseChunk, ToolCallAccumulator } from '../src/client';

test('parseSseChunk membaca konten teks biasa', () => {
  const r = parseSseChunk('{"choices":[{"delta":{"content":"Halo"}}]}');
  assert.equal(r.content, 'Halo');
  assert.equal(r.toolCallDeltas, undefined);
});

test('parseSseChunk membaca tool_calls dari delta', () => {
  const r = parseSseChunk(
    '{"choices":[{"delta":{"tool_calls":[{"index":0,"id":"call_1","function":{"name":"read_file","arguments":"{\\"path\\":\\"a\\"}"}}]}}]}'
  );
  assert.equal(r.content, '');
  assert.ok(r.toolCallDeltas);
  assert.equal(r.toolCallDeltas!.length, 1);
  assert.equal(r.toolCallDeltas![0].function?.name, 'read_file');
});

test('parseSseChunk mengembalikan kosong untuk JSON rusak', () => {
  const r = parseSseChunk('{bukan json');
  assert.equal(r.content, '');
  assert.equal(r.toolCallDeltas, undefined);
});

test('ToolCallAccumulator menggabungkan arguments bertahap', () => {
  const acc = new ToolCallAccumulator();
  // OpenAI mengirim tool call bertahap: nama dulu, lalu arguments dicicil.
  acc.add([{ index: 0, id: 'call_abc', function: { name: 'read_file', arguments: '' } }]);
  acc.add([{ index: 0, function: { arguments: '{"pa' } }]);
  acc.add([{ index: 0, function: { arguments: 'th":"README.md"}' } }]);

  const calls = acc.finish();
  assert.equal(calls.length, 1);
  assert.equal(calls[0].id, 'call_abc');
  assert.equal(calls[0].function.name, 'read_file');
  assert.deepEqual(JSON.parse(calls[0].function.arguments), { path: 'README.md' });
});

test('ToolCallAccumulator mendukung beberapa tool call (multi-index)', () => {
  const acc = new ToolCallAccumulator();
  acc.add([{ index: 0, id: 'c0', function: { name: 'read_file', arguments: '{"path":"a"}' } }]);
  acc.add([{ index: 1, id: 'c1', function: { name: 'list_dir', arguments: '{"path":"b"}' } }]);

  const calls = acc.finish();
  assert.equal(calls.length, 2);
  assert.equal(calls[0].function.name, 'read_file');
  assert.equal(calls[1].function.name, 'list_dir');
});

test('ToolCallAccumulator membuang entry tanpa nama', () => {
  const acc = new ToolCallAccumulator();
  acc.add([{ index: 0, id: 'x', function: { arguments: '{}' } }]);
  assert.equal(acc.finish().length, 0);
});

test('ToolCallAccumulator memakai {} untuk arguments kosong/rusak', () => {
  const acc = new ToolCallAccumulator();
  acc.add([{ index: 0, id: 'e', function: { name: 't', arguments: '' } }]);
  assert.equal(acc.finish()[0].function.arguments, '{}');

  const acc2 = new ToolCallAccumulator();
  acc2.add([{ index: 0, id: 'e2', function: { name: 't', arguments: 'not json' } }]);
  assert.equal(acc2.finish()[0].function.arguments, '{}');
});

test('ToolCallAccumulator menerima tool_calls utuh (addComplete)', () => {
  const acc = new ToolCallAccumulator();
  acc.addComplete([
    { id: 'call_z', type: 'function', function: { name: 'grep', arguments: '{"pattern":"x"}' } },
  ]);
  const calls = acc.finish();
  assert.equal(calls.length, 1);
  assert.equal(calls[0].function.name, 'grep');
  assert.deepEqual(JSON.parse(calls[0].function.arguments), { pattern: 'x' });
});
