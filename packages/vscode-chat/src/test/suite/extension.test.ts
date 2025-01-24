import { describe, test, expect } from 'bun:test';

declare const vscode: any;

describe('Extension Test Suite', () => {
  test('Extension should be present', () => {
    expect(vscode.extensions.getExtension('bactor.vscode-bactor-chat')).toBeDefined();
  });

  test('Should activate the extension', async () => {
    const ext = vscode.extensions.getExtension('bactor.vscode-bactor-chat');
    expect(ext).toBeDefined();
    if (ext) {
      await ext.activate();
      expect(ext.isActive).toBe(true);
    }
  });

  test('Should register all commands', () => {
    const commands = [
      'vscode-bactor-chat.startChat',
      'vscode-bactor-chat.connect'
    ];

    for (const command of commands) {
      expect(() => vscode.commands.getCommands().then((cmds: string[]) => cmds.includes(command))).not.toThrow();
    }
  });
}); 