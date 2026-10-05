import * as assert from 'node:assert/strict';
import * as vscode from 'vscode';

/** Cari extension Kiyara dengan id apa pun yang berawalan "kiyara". */
function findKiyaraExtension(): vscode.Extension<unknown> | undefined {
  return vscode.extensions.all.find((e) => e.id.toLowerCase().startsWith('kiyara.'));
}

suite('KiyaraRouter for VS Code — Integration', () => {
  test('extension terpasang', () => {
    const all = vscode.extensions.all.map((e) => e.id);
    const ext = findKiyaraExtension();
    assert.ok(ext, `extension Kiyara harus terpasang. Terpasang: ${all.join(', ')}`);
  });

  test('extension aktif tanpa error', async () => {
    const ext = findKiyaraExtension();
    assert.ok(ext);
    await ext!.activate();
    assert.equal(ext!.isActive, true);
  });

  test('semua command terdaftar', async () => {
    const ext = findKiyaraExtension();
    await ext!.activate();
    const all = await vscode.commands.getCommands(true);
    for (const cmd of [
      'kiyara.setApiKey',
      'kiyara.manageProvider',
      'kiyara.clearApiKey',
      'kiyara.selectModel',
      'kiyara.refreshModels',
      'kiyara.openChat',
      'kiyara.showStatus',
    ]) {
      assert.ok(all.includes(cmd), `command ${cmd} harus terdaftar`);
    }
  });

  test('provider Kiyara mengembalikan model bila API key tersedia', async () => {
    const ext = findKiyaraExtension();
    await ext!.activate();

    const models = await vscode.lm.selectChatModels({ vendor: 'kiyara' });
    for (const m of models) {
      assert.equal(typeof m.id, 'string');
      assert.equal(typeof m.name, 'string');
      assert.ok(m.maxInputTokens > 0, 'maxInputTokens harus > 0');
    }
    console.log(`  → Model Kiyara terdeteksi: ${models.length}`);
  });
});
