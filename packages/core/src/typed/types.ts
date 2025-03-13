import { PID as BasePID, Message as BaseMessage } from '@bactor/common';

// ========== 基础消息类型系统 ==========

/**
 * 消息类型映射接口 - 定义Actor可处理的消息类型
 * 这是类型系统的核心接口，用于定义Actor能够处理的所有消息类型及其负载类型
 */
export interface MessageMap {
    [messageType: string]: any;
}

/**
 * 消息元数据接口
 */
export interface MessageMetadata {
    correlationId?: string;
    timestamp?: number;
    causationId?: string;
    tags?: string[];
    [key: string]: any;
}

/**
 * 类型安全的消息接口
 * 提供了强类型的消息结构，确保消息类型与负载类型匹配
 */
export interface Message<T extends keyof TM, TM extends MessageMap = any, P = TM[T]> {
    type: T;
    payload: P;
    sender?: PID<any>;
    metadata?: MessageMetadata;
    messageId?: string;
}

/**
 * 消息上下文接口
 * 包含与消息相关的上下文信息
 */
export interface MessageContext {
    sender?: PID<any>;
    messageId?: string;
    metadata?: MessageMetadata;
    self?: PID<any>; // 当前Actor的PID
    message?: Message<any, any>; // 完整的消息对象
}

/**
 * 消息验证器类型
 * 用于验证消息负载是否符合特定类型
 */
export type Validator<T> = (value: any) => value is T;

/**
 * 消息处理函数类型
 * 类型安全的消息处理函数定义
 */
export type MessageHandler<TM extends MessageMap = any> = <K extends keyof TM>(
    message: Message<K, TM>
) => Promise<void>;

/**
 * 消息处理器函数类型
 * 接受payload和上下文作为参数的处理函数
 */
export type PayloadHandler<P, TM extends MessageMap = any> = (
    payload: P,
    context: MessageContext
) => Promise<void> | void;

/**
 * 类型安全的行为映射类型
 */
export type BehaviorMap<TM extends MessageMap = any> = Map<string, MessageHandler<TM>>;

// ========== 核心Actor类型 ==========

/**
 * Actor状态接口
 * 提供类型安全的状态管理
 */
export interface ActorState<T = any> {
    behavior: string;
    data: T;
}

/**
 * 类型安全的PID引用
 * 为Actor引用添加类型信息，使消息发送可以获得类型检查
 */
export interface PID<TM extends MessageMap = any> extends BasePID {
    _messageTypes?: TM; // 只用于类型检查，运行时不存在
}

/**
 * Actor创建属性
 */
export interface Props<TState = any, TM extends MessageMap = any> {
    actorClass: new (...args: any[]) => Actor<TState, TM>;
    actorContext?: Record<string, any>;
    dispatcher?: any;
    initialState?: TState;
    mailbox?: any;
    supervisorStrategy?: any;
}

/**
 * 类型安全的Actor上下文
 */
export interface ActorContext<TM extends MessageMap = any> {
    self: PID<TM>;

    // 类型安全的消息发送
    send<K extends keyof TM>(
        target: PID<any>,
        messageType: K,
        payload: TM[K]
    ): Promise<void>;

    // 类型安全的消息发送（完整消息对象版本）
    sendMessage?<K extends keyof TMTarget, TMTarget extends MessageMap = any>(
        target: PID<TMTarget>,
        message: Message<K, TMTarget>
    ): Promise<void>;

    // 类型安全的请求-响应模式
    ask?<Req, Res>(
        target: PID<any>,
        protocol: any, // RequestResponseProtocol<Req, Res>
        request: Req,
        timeoutMs?: number
    ): Promise<Res>;

    // 处理响应消息
    receive?(message: BaseMessage): boolean;

    // 类型安全的Actor创建
    spawn<TActor extends Actor<TState, TMessages>, TState = any, TMessages extends MessageMap = any>(
        props: Props<TState, TMessages>
    ): Promise<PID<TMessages>>;

    // 其他方法
    stop(pid: PID<any>): Promise<void>;
    stopAll(): Promise<void>;
}

/**
 * Actor接口
 * 类型安全的Actor定义
 */
export interface Actor<TState = any, TM extends MessageMap = any> {
    receive(message: Message<any, TM> | BaseMessage): Promise<void>;
}

// ========== 类型兼容层 ==========

/**
 * 将类型安全的Message转换为基础Message
 */
export function toBaseMessage(message: Message<any, any>): BaseMessage {
    return {
        type: message.type as string,
        payload: message.payload,
        sender: message.sender,
        metadata: message.metadata,
        messageId: message.messageId
    };
}

/**
 * 将基础Message转换为类型安全的Message
 */
export function toTypedMessage<K extends keyof TM, TM extends MessageMap>(
    message: BaseMessage
): Message<K, TM> {
    return {
        type: message.type as K,
        payload: message.payload,
        sender: message.sender,
        metadata: message.metadata,
        messageId: message.messageId
    };
}

/**
 * 创建类型安全的PID引用
 */
export function actorRef<TM extends MessageMap = any>(pid: BasePID): PID<TM> {
    return pid as PID<TM>;
}

/**
 * Actor代理接口
 * 为Actor创建类型安全的代理
 */
export type ActorProxy<M extends MessageMap> = {
    [K in keyof M]: (payload: M[K]) => Promise<void>;
};

/**
 * 创建Actor代理
 * 提供类型安全的Actor调用接口
 */
export function createActorProxy<M extends MessageMap>(
    context: ActorContext<any>,
    target: PID<M>
): ActorProxy<M> {
    return new Proxy({} as ActorProxy<M>, {
        get: (_, messageType: string) => {
            return (payload: any) => context.send(target, messageType as keyof M, payload);
        }
    });
} 