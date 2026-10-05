import { readdirSync } from 'node:fs';
import * as path from 'node:path';
import Mocha from 'mocha';

/** Cari semua file *.test.js secara rekursif. */
function collectTests(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...collectTests(full));
    } else if (entry.name.endsWith('.test.js')) {
      out.push(full);
    }
  }
  return out;
}

/** Titik masuk test yang dijalankan di dalam VS Code Extension Host. */
export async function run(): Promise<void> {
  const mocha = new Mocha({ ui: 'tdd', color: true, timeout: 60000 });
  const testsRoot = path.resolve(__dirname);

  for (const f of collectTests(testsRoot)) {
    mocha.addFile(f);
  }

  await new Promise<void>((resolve, reject) => {
    mocha.run((failures) => {
      if (failures > 0) {
        reject(new Error(`${failures} test gagal.`));
      } else {
        resolve();
      }
    });
  });
}
