import { ExtensionContext, window, commands } from 'vscode';
import { Actor, Message, ActorSystem, Props, log } from '@bactor/core';
import { ChatWebview } from './webview/ChatWebview.js';

// Configure logger
log.level = 'debug';

interface ChatMessage extends Message {
  type: 'chat' | 'response' | 'connect' | 'disconnect';
  content?: string;
  username?: string;
  peerAddress?: string;
}

class ChatActor extends Actor {
  private peers: Map<string, string> = new Map(); // address -> username

  protected behaviors(): void {
    log.debug('Initializing ChatActor behaviors');
    this.addBehavior('default', async (message: Message) => {
      const chatMessage = message as ChatMessage;
      log.debug(`ChatActor received message: ${chatMessage.type}`);

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
  try {
    log.debug('Starting to activate extension');

    // Create Bactor system with a random port for P2P
    const port = Math.floor(Math.random() * (65535 - 1024) + 1024);
    const systemAddress = `localhost:${port}`;
    log.debug(`Creating ActorSystem at ${systemAddress}`);

    const system = new ActorSystem(systemAddress);
    log.debug('ActorSystem created, starting...');

    await system.start();
    log.debug('ActorSystem started');

    const username = await window.showInputBox({
      prompt: 'Enter your username for the chat',
      placeHolder: 'Username'
    }) || 'Anonymous';
    log.debug(`Username entered: ${username}`);

    // Initialize UI with user data
    log.debug('Rendering ChatWebview');
    ChatWebview.render(context.extensionUri);

    if (ChatWebview.currentPanel) {
      log.debug('Sending init data to webview');
      ChatWebview.currentPanel.sendInitData(username, systemAddress);
    } else {
      log.warn('ChatWebview.currentPanel is undefined after render');
    }

    window.showInformationMessage(`Bactor Chat is now active at ${systemAddress}!`);

    log.debug('Spawning ChatActor');
    const chatActor = await system.spawn({
      actorClass: ChatActor
    } as Props);
    log.debug(`ChatActor spawned with ID: ${chatActor.id}`);

    // Register command to connect to another peer
    log.debug('Registering connect command');
    const connectDisposable = commands.registerCommand('vscode-bactor-chat.connect', async (address?: string) => {
      try {
        const peerAddress = address || await window.showInputBox({
          prompt: 'Enter peer address (e.g., localhost:3000)',
          placeHolder: 'host:port'
        });

        if (peerAddress) {
          log.debug(`Connecting to peer: ${peerAddress}`);
          const actor = system.getActor(chatActor.id);
          if (actor) {
            await actor.receive({
              type: 'connect',
              peerAddress,
              username
            } as ChatMessage);
            log.debug('Connect message sent to actor');
          } else {
            log.warn(`Actor not found: ${chatActor.id}`);
          }
        }
      } catch (error) {
        log.error(`Error in connect command: ${error instanceof Error ? error.message : String(error)}`);
        throw error;
      }
    });

    context.subscriptions.push(connectDisposable);

    // Register command to start chat
    log.debug('Registering startChat command');
    const startDisposable = commands.registerCommand('vscode-bactor-chat.startChat', () => {
      try {
        if (ChatWebview.currentPanel) {
          log.debug('Revealing existing webview');
          ChatWebview.currentPanel.reveal();
        } else {
          log.debug('Creating new webview');
          ChatWebview.render(context.extensionUri);
          if (ChatWebview.currentPanel) {
            ChatWebview.currentPanel.sendInitData(username, systemAddress);
          } else {
            log.warn('ChatWebview.currentPanel is undefined after render in startChat');
          }
        }
      } catch (error) {
        log.error(`Error in startChat command: ${error instanceof Error ? error.message : String(error)}`);
        throw error;
      }
    });

    context.subscriptions.push(startDisposable);

    // Handle extension deactivation
    context.subscriptions.push({
      dispose: async () => {
        try {
          log.debug('Disposing extension');
          const actor = system.getActor(chatActor.id);
          if (actor) {
            await actor.receive({
              type: 'disconnect',
              peerAddress: systemAddress
            } as ChatMessage);
          }
          await system.stop();
          log.debug('Extension disposed');
        } catch (error) {
          log.error(`Error disposing extension: ${error instanceof Error ? error.message : String(error)}`);
          throw error;
        }
      }
    });

    log.info('Extension activated successfully');
  } catch (error) {
    log.error(`Error activating extension: ${error instanceof Error ? error.message : String(error)}`);
    throw error;
  }
}

export function deactivate() {
  log.debug('Extension deactivating');
}