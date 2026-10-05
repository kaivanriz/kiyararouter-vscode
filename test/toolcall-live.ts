/**
 * Uji tool calling nyata ke API KiyaraRouter.
 * Memakai API key dari .env (API_KEY / KIYARA_API_KEY) atau env.
 *
 * Jalankan: npx tsx test/toolcall-live.ts
 */
import { existsSync, readFileSync } from 'node:fs';
import { KiyaraClient } from '../src/client';
import { ChatMessage, OpenAITool } from '../src/types';

function resolveApiKey(): string | undefined {
  for (const n of ['KIYARA_API_KEY', 'API_KEY']) {
    const v = process.env[n];
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

const BASE = process.env.KIYARA_BASE_URL ?? 'https://kiyararouter.web.id/v1';

const MODELS = [
  'deepseek-ai/deepseek-v4-pro-0813',
  'deepseek-ai/deepseek-v4.1-flash',
  'openai/gpt-6-luna',
  'anthropic/claude-opus-5.5',
  'google/gemini-3.8-flash',
];

const TOOLS: OpenAITool[] = [
  {
    type: 'function',
    function: {
      name: 'read_file',
      description: 'Baca isi sebuah file dari disk',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'Path file yang akan dibaca' },
        },
        required: ['path'],
      },
    },
  },
];

const MESSAGES: ChatMessage[] = [
  {
    role: 'user',
    content:
      'Baca file README.md di folder saat ini. Gunakan tool read_file. Jangan jelaskan, langsung panggil tool-nya.',
  },
];

type Category = 'A: NATIVE OK' | 'B: TEKS XML' | 'C: TEKS JSON' | 'D: ABAIKAN' | 'E: ERROR';

async function classify(model: string, apiKey: string): Promise<{ cat: Category; detail: string }> {
  const client = new KiyaraClient(BASE, apiKey);
  let text = '';
  try {
    const result = await client.chatStream(
      { model, messages: MESSAGES, tools: TOOLS, tool_choice: 'auto', max_tokens: 300 },
      (d) => {
        text += d;
      }
    );

    if (result.toolCalls.length > 0) {
      const c = result.toolCalls[0];
      return {
        cat: 'A: NATIVE OK',
        detail: `tool_calls -> ${c.function.name}(${c.function.arguments})`,
      };
    }
    if (/<invoke|<parameter/i.test(text)) {
      return { cat: 'B: TEKS XML', detail: text.slice(0, 120).replace(/\s+/g, ' ') };
    }
    if (/^\s*\{.*"name".*"arguments"/s.test(text)) {
      return { cat: 'C: TEKS JSON', detail: text.slice(0, 120).replace(/\s+/g, ' ') };
    }
    return { cat: 'D: ABAIKAN', detail: text.slice(0, 120).replace(/\s+/g, ' ') };
  } catch (err) {
    return { cat: 'E: ERROR', detail: err instanceof Error ? err.message : String(err) };
  }
}

async function main(): Promise<void> {
  const apiKey = resolveApiKey();
  if (!apiKey) {
    console.error('API key tidak ditemukan di env / .env (API_KEY / KIYARA_API_KEY).');
    process.exit(1);
  }

  console.log(`\nMenguji tool calling ke ${BASE}\n`);
  console.log(`${'Model'.padEnd(38)} | Kategori        | Detail`);
  console.log('-'.repeat(120));

  for (const model of MODELS) {
    const { cat, detail } = await classify(model, apiKey);
    console.log(`${model.padEnd(38)} | ${cat.padEnd(15)} | ${detail}`);
  }
  console.log('');
}

void main();
