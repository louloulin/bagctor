import * as vscode from 'vscode';

interface WebviewMessage {
  type: 'connect' | 'chat' | 'init';
  address?: string;
  content?: string;
  username?: string;
  systemAddress?: string;
}

export class ChatWebview {
  public static currentPanel: ChatWebview | undefined;
  private readonly _panel: vscode.WebviewPanel;
  private _disposables: vscode.Disposable[] = [];

  private constructor(panel: vscode.WebviewPanel, extensionUri: vscode.Uri) {
    this._panel = panel;
    this._panel.webview.html = this._getHtmlForWebview(this._panel.webview, extensionUri);
    this._setWebviewMessageListener(this._panel.webview);

    // Handle panel dispose
    this._panel.onDidDispose(() => this.dispose(), null, this._disposables);
  }

  public sendInitData(username: string, systemAddress: string) {
    this._panel.webview.postMessage({
      type: 'init',
      username,
      systemAddress
    });
  }

  public reveal() {
    this._panel.reveal(vscode.ViewColumn.Two);
  }

  public static render(extensionUri: vscode.Uri) {
    if (ChatWebview.currentPanel) {
      ChatWebview.currentPanel._panel.reveal(vscode.ViewColumn.Two);
    } else {
      const panel = vscode.window.createWebviewPanel(
        "bactorChat",
        "Bactor Chat",
        vscode.ViewColumn.Two,
        {
          enableScripts: true,
          localResourceRoots: [
            vscode.Uri.joinPath(extensionUri, 'dist'),
            vscode.Uri.joinPath(extensionUri, 'media')
          ],
          // Enable find widget
          enableFindWidget: true
        }
      );

      ChatWebview.currentPanel = new ChatWebview(panel, extensionUri);

      // Enable Chrome DevTools in development
      if (process.env.NODE_ENV === 'development') {
        // @ts-expect-error Internal VS Code WebView API for development purposes
        panel.webview._options.enableDevTools = true;
      }
    }
  }

  private _getHtmlForWebview(webview: vscode.Webview, extensionUri: vscode.Uri) {
    const scriptUri = webview.asWebviewUri(
      vscode.Uri.joinPath(extensionUri, 'dist', 'index.js')
    );

    const styleUri = webview.asWebviewUri(
      vscode.Uri.joinPath(extensionUri, 'dist', 'style.css')
    );

    const nonce = this._getNonce();

    // Add debugger script in development
    const debuggerScript = process.env.NODE_ENV === 'development'
      ? '<script src="http://localhost:9222/ws"></script>'
      : '';

    return `<!DOCTYPE html>
      <html lang="en">
        <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource}; script-src 'nonce-${nonce}' ${process.env.NODE_ENV === 'development' ? 'http://localhost:9222' : ''};">
          <link href="${styleUri}" rel="stylesheet">
          <title>Bactor Chat</title>
        </head>
        <body>
          <div id="root"></div>
          ${debuggerScript}
          <script nonce="${nonce}" src="${scriptUri}"></script>
        </body>
      </html>`;
  }

  private _setWebviewMessageListener(webview: vscode.Webview) {
    webview.onDidReceiveMessage(
      (message: WebviewMessage) => {
        switch (message.type) {
          case 'connect':
            if (message.address) {
              vscode.commands.executeCommand('vscode-bactor-chat.connect', message.address);
            }
            return;
          case 'chat':
            // Handle chat message
            return;
          case 'init':
            // Handle initialization message
            return;
        }
      },
      undefined,
      this._disposables
    );
  }

  private _getNonce() {
    let text = '';
    const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    for (let i = 0; i < 32; i++) {
      text += possible.charAt(Math.floor(Math.random() * possible.length));
    }
    return text;
  }

  public dispose() {
    ChatWebview.currentPanel = undefined;

    this._panel.dispose();

    while (this._disposables.length) {
      const disposable = this._disposables.pop();
      if (disposable) {
        disposable.dispose();
      }
    }
  }
} 