import * as assert from 'assert';
import * as vscode from 'vscode';

suite('Extension Test Suite', () => {
  test('Extension should be present', () => {
    assert.ok(vscode.extensions.getExtension('bactor.vscode-bactor-chat'));
  });

  test('Extension should activate', async () => {
    const ext = vscode.extensions.getExtension('bactor.vscode-bactor-chat');
    await ext?.activate();
    assert.ok(ext?.isActive);
  });

  test('Should register all commands', () => {
    return vscode.commands.getCommands(true).then((commands) => {
      const ourCommands = commands.filter(cmd => cmd.startsWith('vscode-bactor-chat.'));
      assert.strictEqual(ourCommands.length, 2);
      assert.ok(ourCommands.includes('vscode-bactor-chat.startChat'));
      assert.ok(ourCommands.includes('vscode-bactor-chat.connect'));
    });
  });
}); 