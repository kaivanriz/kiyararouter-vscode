import * as vscode from 'vscode';
import { fetchPublicModels, KiyaraClient } from './client';
import { KiyaraConfig } from './config';
import { KiyaraLanguageModelProvider } from './provider';
import { formatContext, formatPrice } from './pure';
import { KiyaraPublicModel, OpenAIModel } from './types';

const VENDOR = 'kiyara';
const PREFIX = 'kiyara';

let config: KiyaraConfig;
let provider: KiyaraLanguageModelProvider;
let statusBar: vscode.StatusBarItem;
let cachedModels: OpenAIModel[] = [];
let cachedPublic: Map<string, KiyaraPublicModel> = new Map();

export function activate(context: vscode.ExtensionContext): void {
  config = new KiyaraConfig(context);
  provider = new KiyaraLanguageModelProvider(config);

  // Daftarkan model KiyaraRouter ke VS Code (muncul di dropdown model Copilot).
  context.subscriptions.push(
    vscode.lm.registerLanguageModelChatProvider(VENDOR, provider)
  );

  statusBar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
  statusBar.command = `${PREFIX}.manageProvider`;
  context.subscriptions.push(statusBar);

  registerCommands(context);
  void updateStatusBar();
  void warmModelCache();

  context.subscriptions.push({ dispose: () => provider.dispose() });
}

export function deactivate(): void {
  statusBar?.dispose();
}

/* -------------------------------------------------------------------------- */
/*                              Status bar                                    */
/* -------------------------------------------------------------------------- */

async function updateStatusBar(): Promise<void> {
  const key = await config.getApiKey();
  if (!key) {
    statusBar.text = '$(key) KiyaraRouter: atur API key';
    statusBar.tooltip = 'Klik untuk mengatur API key KiyaraRouter';
  } else {
    const n = cachedModels.length;
    statusBar.text = `$(sparkle) KiyaraRouter: ${n > 0 ? `${n} model` : 'siap'}`;
    statusBar.tooltip = 'Klik untuk kelola provider KiyaraRouter (API key & model)';
  }
  statusBar.show();
}

async function warmModelCache(): Promise<void> {
  const key = await config.getApiKey();
  if (!key) {
    return;
  }
  try {
    cachedModels = await new KiyaraClient(config.baseUrl, key).listModels();
    cachedPublic = await fetchPublicModels(config.baseUrl);
    provider.notifyChanged();
  } catch {
    // Diamkan; dicoba lagi saat diminta.
  }
  await updateStatusBar();
}

/* -------------------------------------------------------------------------- */
/*                                 Commands                                   */
/* -------------------------------------------------------------------------- */

function registerCommands(context: vscode.ExtensionContext): void {
  const reg = (id: string, handler: (...args: unknown[]) => unknown) =>
    context.subscriptions.push(vscode.commands.registerCommand(id, handler));

  reg(`${PREFIX}.manageProvider`, async () => {
    const key = await config.getApiKey();
    const pick = await vscode.window.showQuickPick(
      [
        {
          label: key ? '$(refresh) Ganti API Key' : '$(key) Atur API Key',
          cmd: `${PREFIX}.setApiKey`,
        },
        { label: '$(trash) Hapus API Key', cmd: `${PREFIX}.clearApiKey`, when: !!key },
        { label: '$(refresh) Muat Ulang Daftar Model', cmd: `${PREFIX}.refreshModels` },
        { label: '$(comment-discussion) Buka Chat Copilot', cmd: `${PREFIX}.openChat` },
      ]
        .filter((i) => i.when === undefined || i.when)
        .map(({ label, cmd }) => ({ label, cmd })),
      {
        title: 'Kelola Provider KiyaraRouter',
        placeHolder: `API key: ${key ? 'tersimpan' : 'belum diatur'}`,
      }
    );
    if (pick) {
      await vscode.commands.executeCommand(pick.cmd);
    }
  });

  reg(`${PREFIX}.setApiKey`, async () => {
    const value = await vscode.window.showInputBox({
      title: 'API Key KiyaraRouter',
      prompt: 'Tempel API key KiyaraRouter Anda (sk-kiyara-...)',
      password: true,
      ignoreFocusOut: true,
      placeHolder: 'sk-kiyara-...',
      validateInput: (v) => (v.trim() ? undefined : 'API key tidak boleh kosong'),
    });
    if (value === undefined) {
      return;
    }
    await config.setApiKey(value.trim());
    cachedModels = [];
    provider.notifyChanged();
    await warmModelCache();
    vscode.window.showInformationMessage(
      'API key KiyaraRouter disimpan. Model KiyaraRouter kini tersedia di pemilih model Copilot.'
    );
  });

  reg(`${PREFIX}.clearApiKey`, async () => {
    await config.clearApiKey();
    cachedModels = [];
    provider.notifyChanged();
    await updateStatusBar();
    vscode.window.showInformationMessage('API key KiyaraRouter dihapus.');
  });

  reg(`${PREFIX}.selectModel`, async () => {
    if (cachedModels.length === 0) {
      await warmModelCache();
    }
    if (cachedModels.length === 0) {
      vscode.window.showWarningMessage(
        'Belum ada model. Atur API key lalu muat ulang daftar model.'
      );
      return;
    }
    const picked = await vscode.window.showQuickPick(
      cachedModels.map((m) => {
        const meta = cachedPublic.get(m.id);
        return {
          label: meta?.name ? `${meta.name} — ${m.id}` : m.id,
          description: formatContext(meta?.context_window)
            ? `${formatContext(meta?.context_window)} context`
            : '',
          detail: formatPrice(meta?.input_per_1m, meta?.output_per_1m) ?? m.owned_by,
        };
      }),
      {
        title: 'Daftar model KiyaraRouter',
        placeHolder: 'Ketik untuk mencari model',
        matchOnDetail: true,
      }
    );
    if (picked) {
      // Ambil kode model dari label (bagian setelah " — " bila ada).
      const code = picked.label.includes(' — ')
        ? picked.label.split(' — ').pop()!.trim()
        : picked.label;
      await vscode.env.clipboard.writeText(code);
      vscode.window.showInformationMessage(
        `Kode model "${code}" disalin. Pilih di dropdown model Copilot.`
      );
    }
  });

  reg(`${PREFIX}.refreshModels`, async () => {
    const key = await config.getApiKey();
    if (!key) {
      vscode.window.showWarningMessage('Atur API key KiyaraRouter dulu.');
      return;
    }
    await vscode.window.withProgress(
      { location: vscode.ProgressLocation.Notification, title: 'Memuat daftar model KiyaraRouter...' },
      async () => {
        try {
          provider.invalidate();
          cachedModels = await new KiyaraClient(config.baseUrl, key).listModels();
          cachedPublic = await fetchPublicModels(config.baseUrl);
          provider.notifyChanged();
          await updateStatusBar();
          vscode.window.showInformationMessage(`Ditemukan ${cachedModels.length} model KiyaraRouter.`);
        } catch (err) {
          vscode.window.showErrorMessage(
            `Gagal memuat model: ${err instanceof Error ? err.message : String(err)}`
          );
        }
      }
    );
  });

  reg(`${PREFIX}.openChat`, async () => {
    try {
      await vscode.commands.executeCommand('workbench.action.chat.open');
    } catch {
      vscode.window.showWarningMessage(
        'Chat tidak tersedia. Pastikan GitHub Copilot Chat terpasang dan aktif.'
      );
    }
  });

  reg(`${PREFIX}.showStatus`, async () => {
    const key = await config.getApiKey();
    const lines = [
      'Endpoint: kiyararouter.web.id',
      `API key: ${key ? 'tersimpan' : 'belum diatur'}`,
      `Model ter-cache: ${cachedModels.length}`,
    ];
    vscode.window.showInformationMessage(lines.join('  |  '));
  });
}
