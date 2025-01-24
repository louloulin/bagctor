import { ExtensionContext, window, commands } from 'vscode';
import { Actor, Message, ActorSystem, Props } from '@bactor/core';
import { ChatWebview } from './webview/ChatWebview.js';

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

export async function activate(context: ExtensionContext) {
  // Create Bactor system with a random port for P2P
  const port = Math.floor(Math.random() * (65535 - 1024) + 1024);
  const systemAddress = `localhost:${port}`;
  const system = new ActorSystem(systemAddress);
  await system.start();

  const username = await window.showInputBox({
    prompt: 'Enter your username for the chat',
    placeHolder: 'Username'
  }) || 'Anonymous';

  const chatActor = await system.spawn({
    actorClass: ChatActor
  } as Props);

  // Register command to connect to another peer
  const connectDisposable = commands.registerCommand('vscode-bactor-chat.connect', async (address?: string) => {
    const peerAddress = address || await window.showInputBox({
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
  const startDisposable = commands.registerCommand('vscode-bactor-chat.startChat', () => {
    ChatWebview.render(context.extensionUri);
    window.showInformationMessage(`Bactor Chat is now active at ${systemAddress}!`);
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

export function deactivate() { }