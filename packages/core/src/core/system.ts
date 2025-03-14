import { v4 as uuidv4 } from 'uuid';
import { log } from '../utils/logger';
import { Actor } from './actor';
import { ActorContext } from './context';
import type { ActorClient, ActorServer, RemoteActorFactory } from '@bactor/common';
import { Message, PID, Props } from './types';
import { DefaultMailbox } from './mailbox';
import { DefaultDispatcher } from './dispatcher';

// 扩展Message类型以支持请求-响应模式
declare module '@bactor/common' {
  interface Message {
    responseId?: string;
  }
}

export class ActorSystem {
  private actors: Map<string, Actor> = new Map();
  private contexts: Map<string, ActorContext> = new Map();
  private deadLetters: Message[] = [];
  private remoteClients: Map<string, ActorClient> = new Map();
  private server?: ActorServer;
  private actorClasses: Map<string, new (context: ActorContext) => Actor> = new Map();
  private messageHandlers: Set<(message: Message) => Promise<void>> = new Set();
  private remoteFactory?: RemoteActorFactory;
  private responseHandlers: Map<string, { resolve: (value: any) => void; reject: (error: any) => void }> = new Map();

  constructor(protected address?: string, remoteFactory?: RemoteActorFactory) {
    this.remoteFactory = remoteFactory;
    if (address && remoteFactory) {
      this.server = remoteFactory.createServer(address);
    }
  }

  async start(): Promise<void> {
    if (this.server) {
      // Register all known actor classes with the server
      for (const [name, actorClass] of this.actorClasses) {
        this.server.registerActor(name, actorClass);
      }
      await this.server.start(0); // Port will be determined by the server implementation
    }
  }

  async stop(pid?: PID): Promise<void> {
    if (pid) {
      // Stop specific actor
      if (pid.address && pid.address !== this.address) {
        const client = await this.getOrCreateClient(pid.address);
        await client.stopActor(pid.id);
        return;
      }

      // Local actor stopping
      const actor = this.actors.get(pid.id);
      const context = this.contexts.get(pid.id);

      if (actor && context) {
        try {
          await context.stopAll(); // Stop all children first
          await actor.postStop();
        } finally {
          this.actors.delete(pid.id);
          this.contexts.delete(pid.id);
        }
      }

    }
  }

  async shutdown(): Promise<void> {
    // Stop all actors
    const stopPromises = Array.from(this.actors.keys()).map(actorId =>
      this.stop({ id: actorId, address: this.address })
    );
    await Promise.all(stopPromises);

    // Stop the server if it exists
    if (this.server) {
      await this.server.stop();
    }

    // Clear all maps and collections
    this.actors.clear();
    this.contexts.clear();
    this.deadLetters = [];
    this.remoteClients.clear();
    this.actorClasses.clear();
    this.messageHandlers.clear();
  }

  async spawn(props: Props): Promise<PID> {
    // Handle remote actor spawning
    if (props.address) {
      const client = await this.getOrCreateClient(props.address);
      const className = props.actorClass ? props.actorClass.name : 'FunctionalActor';
      return await client.spawnActor(className);
    }

    // Local actor spawning
    const pid: PID = {
      id: uuidv4(),
      address: this.address
    };

    const context = new ActorContext(pid, this, props.mailboxType, props.supervisorStrategy);
    this.contexts.set(pid.id, context);  // 先设置 context

    let actor: Actor;
    if (props.actorClass) {
      // Class-based actor
      actor = new props.actorClass(context);
      // Register for remote spawning
      const className = props.actorClass.name;
      if (!this.actorClasses.has(className)) {
        this.actorClasses.set(className, props.actorClass);
      }
    } else if (props.producer) {
      // Function-based actor
      actor = await props.producer(context);
      if (actor instanceof Actor) {
        // Set context if actor extends Actor
        Object.defineProperty(actor, 'context', {
          value: context,
          writable: false,
          enumerable: true
        });
      }
    } else {
      throw new Error('Props must have either actorClass or producer defined');
    }

    this.actors.set(pid.id, actor);

    try {
      if (actor.preStart) {
        await actor.preStart();
      }
    } catch (error) {
      await this.handlePreStartError(pid, error as Error);
      throw error;
    }

    return pid;
  }

  /**
   * 向指定的Actor发送消息
   * 优化版本：默认完全解耦发送和处理过程，提高吞吐量
   */
  async send(pid: PID, message: Message): Promise<void> {
    // 处理远程消息发送
    if (pid.address && pid.address !== this.address) {
      const client = await this.getOrCreateClient(pid.address);
      await client.sendMessage(pid.id, {
        ...message,
        sender: message.sender ? {
          ...message.sender,
          address: this.address
        } : undefined
      });
      return;
    }

    // 本地消息发送 - 解耦发送和处理
    const context = this.contexts.get(pid.id);
    if (context) {
      // 区分系统消息和用户消息
      if (message.type === 'error' || message.type.startsWith('system')) {
        context.postSystemMessage(message);
      } else {
        context.postMessage(message);
      }
      return Promise.resolve();
    }

    // 处理无效消息
    this.deadLetters.push(message);
    // 通知所有消息处理程序关于死信
    for (const handler of this.messageHandlers) {
      await handler(message);
    }

    return Promise.resolve();
  }

  /**
   * 向指定的Actor发送消息并等待响应
   * 适用于需要请求-响应模式的场景
   */
  async request<T = any>(target: PID, message: Message, timeout: number = 5000): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      // 创建唯一响应ID
      const responseId = uuidv4();
      message.responseId = responseId;

      // 设置超时处理
      const timeoutId = setTimeout(() => {
        this.responseHandlers.delete(responseId);
        reject(new Error(`Request to ${target.id} timed out after ${timeout}ms`));
      }, timeout);

      // 注册响应处理程序
      this.responseHandlers.set(responseId, {
        resolve: (value: any) => {
          clearTimeout(timeoutId);
          this.responseHandlers.delete(responseId);
          resolve(value);
        },
        reject: (error: any) => {
          clearTimeout(timeoutId);
          this.responseHandlers.delete(responseId);
          reject(error);
        }
      });

      // 发送消息
      this.send(target, message).catch(error => {
        clearTimeout(timeoutId);
        this.responseHandlers.delete(responseId);
        reject(error);
      });
    });
  }

  /**
   * 处理来自Actor的响应消息
   */
  handleResponse(responseId: string, response: any, error?: any): void {
    const handler = this.responseHandlers.get(responseId);
    if (handler) {
      if (error) {
        handler.reject(error);
      } else {
        handler.resolve(response);
      }
    }
  }

  async restart(pid: PID, reason: Error): Promise<void> {
    const actor = this.actors.get(pid.id);
    if (actor) {
      try {
        await actor.preRestart(reason);
        await actor.postRestart(reason);
      } catch (error) {
        await this.handleActorError(pid, error as Error);
      }
    }
  }

  private async handlePreStartError(pid: PID, error: Error): Promise<void> {
    const context = this.contexts.get(pid.id);
    if (context) {
      await context.handleFailure(pid, error);
    }
  }

  private async handleActorError(pid: PID, error: Error): Promise<void> {
    const context = this.contexts.get(pid.id);
    if (context) {
      await context.handleFailure(pid, error);
    }
  }

  getActor(actorId: string): Actor | undefined {
    return this.actors.get(actorId);
  }

  getActorClass(className: string): (new (context: ActorContext) => Actor) | undefined {
    return this.actorClasses.get(className);
  }

  private async getOrCreateClient(address: string): Promise<ActorClient> {
    let client = this.remoteClients.get(address);
    if (!client) {
      if (!this.remoteFactory) {
        throw new Error('Remote factory not configured');
      }
      client = this.remoteFactory.createClient(address);
      await client.connect(address);
      this.remoteClients.set(address, client);
    }
    return client;
  }

  watchActor(pid: PID, watcherId: string): void {
    if (pid.address && pid.address !== this.address) {
      const client = this.remoteClients.get(pid.address);
      if (client) {
        client.watchActor(pid.id, watcherId);
      }
    }
  }

  // 添加消息处理器
  addMessageHandler(handler: (message: Message) => Promise<void>): void {
    this.messageHandlers.add(handler);
  }

  // 移除消息处理器
  removeMessageHandler(handler: (message: Message) => Promise<void>): void {
    this.messageHandlers.delete(handler);
  }

  // 广播消息给所有处理器
  async broadcast(message: Message): Promise<void> {
    for (const handler of this.messageHandlers) {
      await handler(message);
    }
  }
} 