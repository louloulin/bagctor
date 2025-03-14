import { v4 as uuidv4 } from 'uuid';
import { log } from '../utils/logger';
import { Actor } from './actor';
import { ActorContext } from './context';
import type { ActorClient, ActorServer, RemoteActorFactory } from '@bactor/common';
import { Message, PID, Props } from './types';
import { DefaultMailbox } from './mailbox';
import { DefaultDispatcher } from './dispatcher';
import { MessagePipeline } from './messaging/pipeline';
import { LoggingMiddleware, MetricsMiddleware } from './messaging/middleware';

// 扩展Message类型以支持请求-响应模式和批处理
declare module '@bactor/common' {
  interface Message {
    responseId?: string;
    recipient?: PID;
  }

  interface ActorClient {
    sendBatchMessage?(actorIds: string[], message: Message): Promise<void>;
  }
}

/**
 * ActorSystem配置选项
 */
export interface ActorSystemConfig {
  /** 是否启用优化的消息处理管道 */
  useMessagePipeline?: boolean;
  /** 是否启用消息处理指标收集 */
  enableMetrics?: boolean;
  /** 是否启用消息处理日志 */
  enableMessageLogging?: boolean;
  /** 日志级别 */
  logLevel?: 'debug' | 'info' | 'warn' | 'error';
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

  // 消息处理管道相关属性
  private messagePipeline?: MessagePipeline;
  private readonly config: Required<ActorSystemConfig>;

  constructor(protected address?: string, remoteFactory?: RemoteActorFactory, config?: ActorSystemConfig) {
    this.remoteFactory = remoteFactory;
    if (address && remoteFactory) {
      this.server = remoteFactory.createServer(address);
    }

    // 初始化默认配置
    this.config = {
      useMessagePipeline: false,
      enableMetrics: false,
      enableMessageLogging: false,
      logLevel: 'info',
      ...config
    };

    // 如果启用了消息管道，则创建它
    if (this.config.useMessagePipeline) {
      this.initMessagePipeline();
    }
  }

  /**
   * 初始化消息处理管道
   */
  private initMessagePipeline(): void {
    this.messagePipeline = new MessagePipeline(this);

    // 添加中间件
    if (this.config.enableMessageLogging) {
      this.messagePipeline.addMiddleware(new LoggingMiddleware(this.config.logLevel));
    }

    if (this.config.enableMetrics) {
      this.messagePipeline.addMiddleware(new MetricsMiddleware());
    }

    log.info('消息处理管道已初始化');
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

    // 清理消息管道相关资源
    if (this.messagePipeline) {
      this.messagePipeline.clearTargetCache();
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
   * 发送消息到指定Actor
   * 优化版：使用消息处理管道进行高效处理
   */
  async send(pid: PID, message: Message): Promise<void> {
    // 如果启用了消息管道，则使用消息管道发送
    if (this.config.useMessagePipeline && this.messagePipeline) {
      await this.messagePipeline.send(pid, message);
      return;
    }

    // 否则，使用原有实现
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

  // 公开处理Actor错误方法，供Context调用
  async handleActorError(pid: PID, error: Error): Promise<void> {
    log.error(`Actor ${pid.id} encountered an error:`, error);
    const context = this.contexts.get(pid.id);

    if (!context) {
      return;
    }

    // Let the parent handle the failure according to its supervision strategy
    if (context.getParent()) {
      await this.send(context.getParent()!, {
        type: '$system.failure',
        payload: { child: pid, error }
      });
    } else {
      // Root actor - use default strategy (restart)
      await this.restart(pid, error);
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

  /**
   * 批量发送消息到多个目标Actor
   * 优化版：使用消息处理管道进行高效批处理
   */
  async sendBatch(targets: PID[], message: Message): Promise<void> {
    // 如果启用了消息管道，则使用消息管道发送
    if (this.config.useMessagePipeline && this.messagePipeline) {
      // 为每个目标创建相同的消息
      const messages = targets.map(() => ({ ...message }));
      await this.messagePipeline.sendBatch(targets, messages);
      return;
    }

    // 否则使用原有实现
    if (targets.length === 0) return;

    // 按地址分组目标
    const localTargets: PID[] = [];
    const remoteTargetsByAddress = new Map<string, PID[]>();

    for (const target of targets) {
      if (!target.address || target.address === this.address) {
        localTargets.push(target);
      } else {
        if (!remoteTargetsByAddress.has(target.address)) {
          remoteTargetsByAddress.set(target.address, []);
        }
        remoteTargetsByAddress.get(target.address)!.push(target);
      }
    }

    // 并行处理本地和远程消息
    const promises: Promise<void>[] = [];

    // 处理本地消息
    if (localTargets.length > 0) {
      promises.push(this.sendBatchLocal(localTargets, message));
    }

    // 处理远程消息
    for (const [address, addressTargets] of remoteTargetsByAddress.entries()) {
      promises.push(this.sendBatchRemote(address, addressTargets, message));
    }

    await Promise.all(promises);
  }

  /**
   * 批量发送消息到本地Actor
   * 优化版：大批量时进行分组并行处理，避免阻塞主线程
   */
  private async sendBatchLocal(targets: PID[], message: Message): Promise<void> {
    // 针对小批量消息的快速路径
    if (targets.length <= 50) {
      for (const target of targets) {
        const context = this.contexts.get(target.id);
        if (context) {
          if (message.type === 'error' || message.type.startsWith('system')) {
            context.postSystemMessage(message);
          } else {
            context.postMessage(message);
          }
        } else {
          this.deadLetters.push({ ...message, recipient: target });
        }
      }
      return Promise.resolve();
    }

    // 针对大批量消息的优化路径 - 分组并行处理
    const batchSize = 50; // 每批次处理50个目标
    const batches: PID[][] = [];

    // 按照batchSize分组
    for (let i = 0; i < targets.length; i += batchSize) {
      batches.push(targets.slice(i, i + batchSize));
    }

    // 对系统消息使用更高优先级
    const isSystemMessage = message.type === 'error' || message.type.startsWith('system');

    // 对分组进行并行处理
    const batchPromises = batches.map(async (batchTargets) => {
      // 对系统消息和用户消息进行分组，以便优先处理系统消息
      if (isSystemMessage) {
        // 系统消息优先处理
        for (const target of batchTargets) {
          const context = this.contexts.get(target.id);
          if (context) {
            context.postSystemMessage(message);
          } else {
            this.deadLetters.push({ ...message, recipient: target });
          }
        }
      } else {
        // 用户消息
        for (const target of batchTargets) {
          const context = this.contexts.get(target.id);
          if (context) {
            context.postMessage(message);
          } else {
            this.deadLetters.push({ ...message, recipient: target });
          }
        }
      }
    });

    // 等待所有批次完成
    await Promise.all(batchPromises);
    return Promise.resolve();
  }

  /**
   * 批量发送消息到远程Actor
   * 优化版：增加重试和速率限制
   */
  private async sendBatchRemote(address: string, targets: PID[], message: Message): Promise<void> {
    const client = await this.getOrCreateClient(address);
    // 准备发送者信息，确保始终设置address和id
    const sender: PID = message.sender ? {
      id: message.sender.id || '',
      address: this.address || ''
    } : { id: '', address: this.address || '' };

    // 尝试批量发送
    if (client.sendBatchMessage) {
      try {
        await client.sendBatchMessage(
          targets.map(t => t.id),
          { ...message, sender }
        );
        return;
      } catch (error) {
        // 如果批量发送失败，回退到单条消息发送
        console.warn(`Batch message send to ${address} failed, falling back to individual messages:`, error);
      }
    }

    // 回退到单条消息发送 - 使用更小的批次和并行控制
    const MAX_CONCURRENT = 10; // 最大并行发送数
    const targetChunks: string[][] = [];
    const targetIds = targets.map(t => t.id);

    // 将目标分成较小的批次，每批最多10个
    for (let i = 0; i < targetIds.length; i += MAX_CONCURRENT) {
      targetChunks.push(targetIds.slice(i, i + MAX_CONCURRENT));
    }

    // 对每个批次并行发送
    for (const chunk of targetChunks) {
      const sendPromises = chunk.map(targetId =>
        client.sendMessage(
          targetId,
          { ...message, sender }
        ).catch(err => {
          console.error(`Failed to send message to ${address}/${targetId}:`, err);
          return Promise.resolve(); // 防止一个消息失败导致整个批次失败
        })
      );

      // 等待当前批次完成后再处理下一批次
      await Promise.all(sendPromises);
    }
  }

  /**
   * 获取消息处理指标
   */
  getMessageMetrics() {
    if (this.messagePipeline) {
      return this.messagePipeline.getMetrics();
    }
    return null;
  }

  /**
   * 添加自定义消息中间件
   */
  addMessageMiddleware(middleware: any): void {
    if (this.messagePipeline) {
      this.messagePipeline.addMiddleware(middleware);
    } else {
      log.warn('消息管道未启用，无法添加中间件');
    }
  }

  /**
   * 启用消息处理管道
   */
  enableMessagePipeline(): void {
    if (!this.messagePipeline) {
      this.config.useMessagePipeline = true;
      this.initMessagePipeline();
    }
  }

  /**
   * 禁用消息处理管道
   */
  disableMessagePipeline(): void {
    this.config.useMessagePipeline = false;
  }
} 