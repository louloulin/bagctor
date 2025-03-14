import { Message, PID, Props, IMailbox, ActorContext as IActorContext, SupervisorStrategy, SupervisorDirective, MessageInvoker, MessageDispatcher } from './types';
import { DefaultMailbox } from './mailbox';
import { ActorSystem } from './system';
import { DefaultDispatcher } from './dispatcher';

export class ActorContext implements IActorContext, MessageInvoker {
  private mailbox: IMailbox;
  protected system: ActorSystem;
  private children: Map<string, PID> = new Map();
  private parent?: PID;
  private supervisorStrategy?: SupervisorStrategy;
  private pid: PID;
  private dispatcher: MessageDispatcher;

  constructor(
    pid: PID,
    system: ActorSystem,
    mailboxType: new () => IMailbox = DefaultMailbox,
    supervisorStrategy?: SupervisorStrategy,
    parent?: PID,
    dispatcher: MessageDispatcher = new DefaultDispatcher()
  ) {
    this.pid = pid;
    this.system = system;
    this.mailbox = new mailboxType();
    this.supervisorStrategy = supervisorStrategy;
    this.parent = parent;
    this.dispatcher = dispatcher;

    // 注册消息处理器
    this.mailbox.registerHandlers(this, this.dispatcher);
  }

  get self(): PID {
    return this.pid;
  }

  getPID(): PID {
    return this.pid;
  }

  getParent(): PID | undefined {
    return this.parent;
  }

  setParent(pid: PID): void {
    this.parent = pid;
  }

  getMailbox(): IMailbox {
    return this.mailbox;
  }

  /**
   * 向当前Actor投递用户消息
   */
  postMessage(message: Message): void {
    this.mailbox.postUserMessage(message);
  }

  /**
   * 向当前Actor投递系统消息
   * 系统消息具有更高的优先级，会在用户消息之前处理
   */
  postSystemMessage(message: Message): void {
    this.mailbox.postSystemMessage(message);
  }

  /**
   * 发送消息到指定的Actor
   */
  send(target: PID, message: Message): Promise<void> {
    return this.system.send(target, message);
  }

  /**
   * 发送消息到指定的Actor并等待响应
   */
  request<T = any>(target: PID, message: Message, timeout?: number): Promise<T> {
    return this.system.request<T>(target, message, timeout);
  }

  /**
   * 发送响应消息给请求方
   */
  respond(message: Message, response: any, error?: any): void {
    if (message.responseId) {
      this.system.handleResponse(message.responseId, response, error);
    }
  }

  async spawn(props: Props): Promise<PID> {
    const child = await this.system.spawn({
      ...props,
      supervisorStrategy: props.supervisorStrategy || this.supervisorStrategy
    });
    this.children.set(child.id, child);
    return child;
  }

  async stop(pid: PID): Promise<void> {
    await this.system.stop(pid);
    this.children.delete(pid.id);
  }

  async stopAll(): Promise<void> {
    for (const child of this.children.values()) {
      await this.stop(child);
    }
  }

  async handleFailure(child: PID, error: Error): Promise<void> {
    if (this.supervisorStrategy) {
      const directive = this.supervisorStrategy.handleFailure(this, child, error);
      await this.handleSupervisorDirective(child, directive, error);
    } else if (this.parent) {
      // Escalate to parent if no supervisor strategy
      await this.system.send(this.parent, {
        type: '$system.failure',
        payload: { child, error }
      });
    }
  }

  private async handleSupervisorDirective(
    child: PID,
    directive: SupervisorDirective,
    error: Error
  ): Promise<void> {
    switch (directive) {
      case SupervisorDirective.Resume:
        // Do nothing, let the actor continue
        break;
      case SupervisorDirective.Restart:
        await this.system.restart(child, error);
        break;
      case SupervisorDirective.Stop:
        await this.stop(child);
        break;
      case SupervisorDirective.Escalate:
        if (this.parent) {
          await this.system.send(this.parent, {
            type: '$system.failure',
            payload: { child, error }
          });
        }
        break;
    }
  }

  // 实现MessageInvoker接口
  async invokeSystemMessage(message: Message): Promise<void> {
    const actor = this.system.getActor(this.pid.id);
    if (!actor) return;

    // 处理系统消息
    if (message.type === '$system.restart') {
      await actor.preRestart(message.payload?.reason);
      await actor.postRestart(message.payload?.reason);
    } else if (message.type === '$system.stop') {
      await actor.postStop();
    } else if (message.type === '$system.failure') {
      await this.handleFailure(message.payload.child, message.payload.error);
    }
  }

  async invokeUserMessage(message: Message): Promise<void> {
    const actor = this.system.getActor(this.pid.id);
    if (!actor) return;

    try {
      await actor.receive(message);
    } catch (error) {
      await this.system.handleActorError(this.pid, error as Error);
    }
  }

  async invoke(message: Message): Promise<void> {
    // 根据消息类型调用相应的处理方法
    if (message.type && (message.type === '$system.restart' ||
      message.type === '$system.stop' ||
      message.type.startsWith('system'))) {
      await this.invokeSystemMessage(message);
    } else {
      await this.invokeUserMessage(message);
    }
  }
} 