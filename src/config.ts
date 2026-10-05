import * as vscode from 'vscode';

const SECRET_KEY = 'kiyara.apiKey';

/** Base URL Kiyara dipaku — pengguna tidak perlu (dan tidak bisa) mengubahnya. */
export const KIYARA_BASE_URL = 'https://kiyararouter.web.id/v1';

/** Kelola penyimpanan API key (SecretStorage) dan konfigurasi ekstensi. */
export class KiyaraConfig {
  constructor(private readonly context: vscode.ExtensionContext) {}

  async getApiKey(): Promise<string | undefined> {
    return this.context.secrets.get(SECRET_KEY);
  }

  async setApiKey(value: string): Promise<void> {
    await this.context.secrets.store(SECRET_KEY, value);
  }

  async clearApiKey(): Promise<void> {
    await this.context.secrets.delete(SECRET_KEY);
  }

  get baseUrl(): string {
    return KIYARA_BASE_URL;
  }

  get configuredModel(): string {
    return vscode.workspace.getConfiguration('kiyara').get<string>('model', '');
  }

  async setModel(model: string): Promise<void> {
    await vscode.workspace
      .getConfiguration('kiyara')
      .update('model', model, vscode.ConfigurationTarget.Global);
  }

  get systemPrompt(): string {
    return vscode.workspace
      .getConfiguration('kiyara')
      .get<string>('systemPrompt', '');
  }

  get temperature(): number {
    return vscode.workspace.getConfiguration('kiyara').get<number>('temperature', 0.3);
  }

  get maxTokens(): number {
    return vscode.workspace.getConfiguration('kiyara').get<number>('maxTokens', 0);
  }

  get sendActiveFile(): boolean {
    return vscode.workspace.getConfiguration('kiyara').get<boolean>('sendActiveFile', true);
  }

  get includeSelection(): boolean {
    return vscode.workspace.getConfiguration('kiyara').get<boolean>('includeSelection', true);
  }
}
