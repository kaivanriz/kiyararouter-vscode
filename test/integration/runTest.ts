import { existsSync } from 'node:fs';
import * as path from 'node:path';
import { runTests } from '@vscode/test-electron';

/** Cari VS Code yang terinstall lokal agar tidak perlu mengunduh. */
function findLocalCode(): string | undefined {
  const candidates = [
    process.env.VSCODE_EXECUTABLE_PATH,
    path.join(process.env.LOCALAPPDATA ?? '', 'Programs', 'Microsoft VS Code', 'Code.exe'),
    'C:\\Program Files\\Microsoft VS Code\\Code.exe',
    'C:\\Program Files (x86)\\Microsoft VS Code\\Code.exe',
    '/usr/share/code/code',
    '/Applications/Visual Studio Code.app/Contents/MacOS/Electron',
  ].filter((p): p is string => Boolean(p));
  return candidates.find((p) => existsSync(p));
}

/**
 * Integration test: membuka VS Code Extension Development Host lalu
 * menjalankan test di dalamnya.
 *
 * Jalankan: npm run test:integration
 *
 * PENTING: test ini membutuhkan sesi desktop/GUI. Di server headless atau
 * lingkungan otomatis, jendela VS Code tidak terinisialisasi sehingga
 * extension development tidak ter-load. Bila itu terjadi, jalankan
 * pengujian manual lewat F5 (lihat README bagian "Pengujian").
 *
 * Env opsional:
 *   VSCODE_TEST_DOWNLOAD=1  -> paksa unduh VS Code khusus test (default: pakai lokal)
 *   VSCODE_EXECUTABLE_PATH  -> path Code.exe tertentu
 *   KIYARA_API_KEY          -> supaya provider mengembalikan daftar model
 */
async function main(): Promise<void> {
  try {
    const extensionDevelopmentPath = path.resolve(__dirname, '../../..');
    const extensionTestsPath = path.resolve(__dirname, './suite/index');
    const localCode = process.env.VSCODE_TEST_DOWNLOAD === '1' ? undefined : findLocalCode();

    await runTests({
      version: 'stable',
      ...(localCode ? { vscodeExecutablePath: localCode } : {}),
      extensionDevelopmentPath,
      extensionTestsPath,
      launchArgs: [
        '--disable-gpu',
        '--disable-workspace-trust',
        '--skip-welcome',
        '--skip-release-notes',
        '--no-sandbox',
        '--disable-updates',
        '--disable-telemetry',
      ],
    });
  } catch (err) {
    console.error('Gagal menjalankan integration test:', err);
    console.error(
      'Jika ini karena lingkungan tanpa GUI, jalankan pengujian manual: ' +
        'buka folder project di VS Code lalu tekan F5.'
    );
    process.exit(1);
  }
}

void main();
