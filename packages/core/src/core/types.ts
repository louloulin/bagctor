import { Message as CommonMessage, PID as CommonPID } from '@bactor/common';

// Forward declarations to avoid circular dependencies
export type Actor<TState = any, TMessage extends CommonMessage = CommonMessage> = any;
export type ActorContext<TState = any, TMessage extends CommonMessage = CommonMessage> = any;

// 扩展基础消息类型
export interface Message extends CommonMessage {
  type: string;
  payload?: any;
  sender?: PID;
  timestamp?: number;
  responseId?: string;
  recipient?: PID;
  metadata?: Record<string, unknown>;
}

// Re-export PID from common
export type PID = CommonPID;

// 类型安全的消息创建函数
export function createMessage<T>(
  type: string,
  payload: T,
  options?: Partial<Omit<Message, 'type' | 'payload'>>
): Message & { payload: T } {
  return {
    type,
    payload,
    timestamp: Date.now(),
    ...options
  };
}

// 行为定义类型
export type Behavior<TState, TMessage extends Message = Message> =
  (state: TState, message: TMessage, context: ActorContext<TState, TMessage>) =>
    Promise<TState> | TState;

// 行为映射类型
export type BehaviorMap<TState, TMessage extends Message = Message> =
  Map<string, Behavior<TState, TMessage>>;

// Mailbox related interfaces
export interface MessageInvoker {
  invokeSystemMessage(msg: Message): Promise<void>;
  invokeUserMessage(msg: Message): Promise<void>;
  invoke(msg: Message): Promise<void>;
}

export interface IMailbox {
  registerHandlers(invoker: MessageInvoker, dispatcher: MessageDispatcher): void;
  postUserMessage(message: Message): void;
  postSystemMessage(message: Message): void;
  start(): void;
  isSuspended(): boolean;
}

export interface MessageDispatcher {
  schedule(runner: () => Promise<void>): void;
}

/**
 * Actor实例化属性
 */
export interface Props {
  // Class-based actor
  actorClass?: new (context: ActorContext) => Actor;
  // Function-based actor
  producer?: (context: ActorContext) => Actor;
  // Optional configuration
  mailboxType?: new () => IMailbox;
  supervisorStrategy?: SupervisorStrategy;
  dispatcher?: MessageDispatcher;
  address?: string;
  actorContext?: any;
}

/**
 * 监督指令
 */
export enum SupervisorDirective {
  Resume,   // 继续处理消息，忽略错误
  Restart,  // 重启 Actor
  Stop,     // 停止 Actor
  Escalate  // 将错误升级到父 Actor
}

/**
 * 监督策略接口
 */
export interface SupervisorStrategy {
  handleError(
    error: Error,
    childPID: PID,
    restartCount: number
  ): SupervisorDirective;
}

/**
 * 默认监督策略 - 超过最大重启次数后停止Actor
 */
export class DefaultSupervisorStrategy implements SupervisorStrategy {
  constructor(
    private maxRestarts: number = 10,
    private withinTimeWindow: number = 60000
  ) { }

  handleError(error: Error, childPID: PID, restartCount: number): SupervisorDirective {
    if (restartCount > this.maxRestarts) {
      return SupervisorDirective.Stop;
    }
    return SupervisorDirective.Restart;
  }
}

/**
 * Actor生命周期事件
 */
export interface ActorLifecycleEvent {
  type: 'PreStart' | 'PostStop' | 'PreRestart' | 'PostRestart';
  actor: PID;
}

/**
 * Actor状态
 */
export interface ActorState<TState = any> {
  behavior: string;
  data: TState;
}