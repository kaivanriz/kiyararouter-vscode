import * as vscode from 'vscode';

let channel: vscode.OutputChannel | undefined;

/** Inisialisasi output channel untuk log debug. */
export function initLogger(context: vscode.ExtensionContext): void {
  channel = vscode.window.createOutputChannel('KiyaraRouter');
  context.subscriptions.push(channel);
}

/** Apakah debug logging aktif (setting kiyara.debug). */
export function isDebugEnabled(): boolean {
  return vscode.workspace.getConfiguration('kiyara').get<boolean>('debug', false);
}

/** Tulis pesan log bila debug aktif. */
export function logDebug(message: string): void {
  if (!isDebugEnabled() || !channel) {
    return;
  }
  const ts = new Date().toISOString().slice(11, 23);
  channel.appendLine(`[${ts}] ${message}`);
}

/** Tampilkan output channel (untuk perintah "Tampilkan Log"). */
export function showLog(): void {
  channel?.show(true);
}
