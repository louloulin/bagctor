import { PID as BasePID, Message as BaseMessage } from '@bactor/common';
import { Message as CoreMessage, PID as CorePID } from '../../packages/core/src/core/types';
import { ActorContext as BaseActorContext } from '../../packages/core/src/core/context';

/**
 * 消息映射接口 - 定义Actor可以处理的所有消息类型
 */
export interface MessageMap {
    [key: string]: any;
}

/**
 * Actor状态接口 - 提供类型安全的状态管理
 */
export interface ActorState<T = any> {
    behavior: string;
    data: T;
}

/**
 * Actor属性接口
 */
export interface Props<TState = any, TM extends MessageMap = any> {
    actorClass: new (...args: any[]) => Actor<TM>;
    initialState?: TState;
}

/**
 * 类型安全的PID，包含泛型类型信息
 */
export interface PID<TM extends MessageMap = any> extends CorePID { }

/**
 * 类型安全的消息上下文，用于消息处理
 */
export interface MessageContext<TM extends MessageMap = any> {
    sender?: PID<any>;
    self: PID<TM>;
    messageId?: string;
    metadata?: any;
    message?: Message<any, TM>;
}

/**
 * 消息处理器类型，接收消息负载和上下文
 */
export type PayloadHandler<K, TM extends MessageMap, T> =
    (payload: T, context: MessageContext<TM>) => Promise<void> | void;

/**
 * 类型安全的消息，包含特定类型的消息负载
 */
export interface Message<K extends keyof TM, TM extends MessageMap> {
    type: K;
    payload: TM[K];
    sender?: PID<any>;
    messageId?: string;
    metadata?: any;
}

/**
 * 类型化消息，兼容字符串类型
 */
export interface TypedMessage<K extends keyof TM, TM extends MessageMap> {
    type: K | string;
    payload: TM[K];
    sender?: PID<any>;
    messageId?: string;
    metadata?: any;
}

/**
 * 将基础消息转换为类型安全的消息
 */
export function toTypedMessage<K extends keyof TM, TM extends MessageMap>(
    message: BaseMessage | CoreMessage,
    payloadType?: K,
    messageType?: TM
): Message<K, TM> {
    return {
        type: message.type as K,
        payload: message.payload as TM[K],
        sender: message.sender as PID<any>,
        messageId: (message as any).messageId,
        metadata: message.metadata
    };
}

/**
 * 将类型安全的消息转换为基础消息
 */
export function toBaseMessage<K extends keyof TM, TM extends MessageMap>(
    message: Message<K, TM> | TypedMessage<K, TM>
): BaseMessage {
    return {
        type: String(message.type),
        payload: message.payload,
        sender: message.sender as BasePID,
        metadata: message.metadata
    };
}

/**
 * Actor上下文接口 - 提供类型安全的方法与其他Actor通信
 */
export interface ActorContext<TM extends MessageMap = any> {
    /**
     * 当前Actor的PID
     */
    readonly self: PID<TM>;

    /**
     * 发送消息到目标Actor
     */
    send<K extends keyof TM>(
        target: PID<any>,
        messageType: K,
        payload: TM[K],
        metadata?: any
    ): Promise<void>;

    /**
     * 发送完整消息对象到目标Actor
     */
    sendMessage?<K extends keyof TMTarget, TMTarget extends MessageMap = any>(
        target: PID<TMTarget>,
        message: Message<K, TMTarget> | TypedMessage<K, TMTarget>
    ): Promise<void>;

    /**
     * 发送请求并等待响应
     */
    request<K extends keyof TM, TMTarget extends MessageMap, R>(
        target: PID<any>,
        type: K,
        payload: TM[K],
        timeout?: number
    ): Promise<R>;

    /**
     * 通用请求-响应模式
     */
    ask?<Req, Res>(
        target: PID<any>,
        protocol: any,
        requestPayload: Req,
        timeoutMs?: number
    ): Promise<Res>;

    /**
     * 处理接收到的消息
     */
    receive?(message: BaseMessage): boolean;

    /**
     * 创建子Actor
     */
    spawn<TMessages extends MessageMap = any>(
        props: Props<any, TMessages>
    ): Promise<PID<TMessages>>;

    /**
     * 停止Actor
     */
    stop(pid: PID<any>): Promise<void>;

    /**
     * 获取基础上下文
     */
    getBaseContext?(): BaseActorContext;
}

/**
 * Actor接口 - 定义Actor的基本行为
 */
export interface Actor<TM extends MessageMap = any> {
    /**
     * 接收消息的方法
     */
    receive(message: CoreMessage | BaseMessage): Promise<void>;
} 