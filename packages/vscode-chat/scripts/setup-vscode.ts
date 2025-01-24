import { join } from 'path';

// Mock VS Code API
const vscode = {
    window: {
        showInformationMessage: () => { },
        showInputBox: () => Promise.resolve('test'),
        createWebviewPanel: () => ({
            webview: {
                html: '',
                onDidReceiveMessage: () => { },
                asWebviewUri: (uri: string) => uri,
            },
            reveal: () => { },
            dispose: () => { },
        }),
    },
    commands: {
        registerCommand: () => ({ dispose: () => { } }),
        executeCommand: () => Promise.resolve(),
        getCommands: () => Promise.resolve(['vscode-bactor-chat.startChat', 'vscode-bactor-chat.connect']),
    },
    Uri: {
        file: (path: string) => path,
        joinPath: (...segments: string[]) => join(...segments),
    },
    ViewColumn: {
        Two: 2,
    },
    extensions: {
        getExtension: () => ({
            activate: () => Promise.resolve(),
            isActive: true,
        }),
    },
    ExtensionContext: class {
        subscriptions = [];
        extensionUri = '';
        constructor() {
            this.extensionUri = process.cwd();
        }
    },
};

// Mock the vscode module
(globalThis as any).vscode = vscode; 