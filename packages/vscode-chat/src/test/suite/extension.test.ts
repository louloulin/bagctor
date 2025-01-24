import * as assert from 'assert';
import * as vscode from 'vscode';
import { suite, test } from 'mocha';

suite('Extension Test Suite', () => {
  test('Extension should be present', () => {
    assert.ok(vscode.extensions.getExtension('bactor.vscode-bactor-chat'));
  });

  test('Extension should activate', async () => {
    const ext = vscode.extensions.getExtension('bactor.vscode-bactor-chat');
    if (!ext) {
      throw new Error('Extension not found');
    }
    await ext.activate();
  });

  test('Should register all commands', () => {
    return vscode.commands.getCommands(true)
      .then((commands) => {
        assert.ok(commands.includes('vscode-bactor-chat.startChat'));
        assert.ok(commands.includes('vscode-bactor-chat.connect'));
      });
  });
}); 