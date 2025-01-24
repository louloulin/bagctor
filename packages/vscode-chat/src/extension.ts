import * as vscode from 'vscode';
import { Actor, Message, ActorSystem, Props } from '@bactor/core';
import { ChatWebview } from './webview/ChatWebview';

interface ChatMessage extends Message {
  type: 'chat' | 'response' | 'connect' | 'disconnect';
  content?: string;
  username?: string;
  peerAddress?: string;
}

class ChatActor extends Actor {
  private peers: Map<string, string> = new Map(); // address -> username

  protected behaviors(): void {
    this.addBehavior('default', async (message: Message) => {
      const chatMessage = message as ChatMessage;
      
      switch (chatMessage.type) {
        case 'connect':
          if (chatMessage.peerAddress && chatMessage.username) {
            this.peers.set(chatMessage.peerAddress, chatMessage.username);
            // Notify all peers about new connection
            for (const [address] of this.peers) {
              if (address !== chatMessage.peerAddress) {
                await this.context.send({ id: address }, {
                  type: 'connect',
                  username: chatMessage.username,
                  peerAddress: chatMessage.peerAddress
                } as ChatMessage);
              }
            }
          }
          break;

        case 'disconnect':
          if (chatMessage.peerAddress) {
            const username = this.peers.get(chatMessage.peerAddress);
            this.peers.delete(chatMessage.peerAddress);
            // Notify all peers about disconnection
            for (const [address] of this.peers) {
              await this.context.send({ id: address }, {
                type: 'disconnect',
                username,
                peerAddress: chatMessage.peerAddress
              } as ChatMessage);
            }
          }
          break;

        case 'chat':
          if (chatMessage.content) {
            // Broadcast message to all peers
            for (const [address] of this.peers) {
              await this.context.send({ id: address }, {
                type: 'response',
                content: chatMessage.content,
                username: this.peers.get(this.context.self.id) || 'Anonymous'
              } as ChatMessage);
            }
          }
          break;
      }
    });
  }
}

export async function activate(context: vscode.ExtensionContext) {
  // Create Bactor system with a random port for P2P
  const port = Math.floor(Math.random() * (65535 - 1024) + 1024);
  const systemAddress = `localhost:${port}`;
  const system = new ActorSystem(systemAddress);
  await system.start();

  const username = await vscode.window.showInputBox({
    prompt: 'Enter your username for the chat',
    placeHolder: 'Username'
  }) || 'Anonymous';

  const chatActor = await system.spawn({
    actorClass: ChatActor
  } as Props);

  // Register command to connect to another peer
  const connectDisposable = vscode.commands.registerCommand('vscode-bactor-chat.connect', async (address?: string) => {
    const peerAddress = address || await vscode.window.showInputBox({
      prompt: 'Enter peer address (e.g., localhost:3000)',
      placeHolder: 'host:port'
    });

    if (peerAddress) {
      const actor = system.getActor(chatActor.id);
      if (actor) {
        await actor.receive({
          type: 'connect',
          peerAddress,
          username
        } as ChatMessage);
      }
    }
  });

  context.subscriptions.push(connectDisposable);

  // Register command to start chat
  const startDisposable = vscode.commands.registerCommand('vscode-bactor-chat.startChat', () => {
    ChatWebview.render(context.extensionUri);
    vscode.window.showInformationMessage(`Bactor Chat is now active at ${systemAddress}!`);
  });

  context.subscriptions.push(startDisposable);

  // Handle extension deactivation
  context.subscriptions.push({
    dispose: async () => {
      const actor = system.getActor(chatActor.id);
      if (actor) {
        await actor.receive({
          type: 'disconnect',
          peerAddress: systemAddress
        } as ChatMessage);
      }
      await system.stop();
    }
  });
}

function getWebviewContent() {
  return `<!DOCTYPE html>
  <html>
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Bactor Chat</title>
      <style>
        body {
          margin: 0;
          padding: 20px;
          background: var(--vscode-editor-background);
          color: var(--vscode-editor-foreground);
        }
        .chat-container {
          display: flex;
          flex-direction: column;
          height: 100vh;
        }
        .messages {
          flex: 1;
          overflow-y: auto;
          margin-bottom: 20px;
          padding: 10px;
          border: 1px solid var(--vscode-input-border);
          border-radius: 4px;
        }
        .message {
          margin-bottom: 8px;
          padding: 8px;
          border-radius: 4px;
          background: var(--vscode-input-background);
        }
        .message .username {
          font-weight: bold;
          margin-right: 8px;
          color: var(--vscode-textLink-foreground);
        }
        .input-container {
          display: flex;
          gap: 10px;
        }
        input {
          flex: 1;
          padding: 8px;
          border: 1px solid var(--vscode-input-border);
          background: var(--vscode-input-background);
          color: var(--vscode-input-foreground);
          border-radius: 4px;
        }
        button {
          padding: 8px 16px;
          background: var(--vscode-button-background);
          color: var(--vscode-button-foreground);
          border: none;
          cursor: pointer;
          border-radius: 4px;
        }
        .system-message {
          color: var(--vscode-textPreformat-foreground);
          font-style: italic;
          margin: 8px 0;
        }
      </style>
    </head>
    <body>
      <div class="chat-container">
        <div class="messages" id="messages"></div>
        <div class="input-container">
          <input type="text" id="messageInput" placeholder="Type your message...">
          <button onclick="sendMessage()">Send</button>
        </div>
      </div>
      <script>
        const vscode = acquireVsCodeApi();
        const messagesDiv = document.getElementById('messages');
        const messageInput = document.getElementById('messageInput');

        function sendMessage() {
          const content = messageInput.value;
          if (content) {
            vscode.postMessage({ type: 'chat', content });
            messageInput.value = '';
          }
        }

        messageInput.addEventListener('keypress', (e) => {
          if (e.key === 'Enter') {
            sendMessage();
          }
        });

        window.addEventListener('message', event => {
          const message = event.data;
          const messageDiv = document.createElement('div');
          
          if (message.type === 'connect' || message.type === 'disconnect') {
            messageDiv.className = 'system-message';
            const action = message.type === 'connect' ? 'joined' : 'left';
            messageDiv.textContent = \`\${message.username} has \${action} the chat\`;
          } else {
            messageDiv.className = 'message';
            const usernameSpan = document.createElement('span');
            usernameSpan.className = 'username';
            usernameSpan.textContent = message.username || 'Anonymous';
            
            const contentSpan = document.createElement('span');
            contentSpan.textContent = message.content;

            messageDiv.appendChild(usernameSpan);
            messageDiv.appendChild(contentSpan);
          }

          messagesDiv.appendChild(messageDiv);
          messagesDiv.scrollTop = messagesDiv.scrollHeight;
        });
      </script>
    </body>
  </html>`;
}

export function deactivate() {}