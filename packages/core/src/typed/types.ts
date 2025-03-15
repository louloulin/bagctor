import { PID as BasePID, Message as BaseMessage } from '@bactor/common';
import { ActorSystem } from '../core/system';
import { Message, PID } from '../core/types';

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
 * 增强版ActorProxy选项
 */
export interface EnhancedActorProxyOptions {
    /**
     * 请求方法前缀
     * @default 'request'
     */
    requestPrefix?: string;

    /**
     * 发送方法前缀
     * @default 'send'
     */
    sendPrefix?: string;

    /**
     * 请求超时时间(ms)
     * @default 5000
     */
    timeout?: number;

    /**
     * 错误处理函数
     */
    errorHandler?: (error: Error, messageType: string, payload: any) => void;

    /**
     * 消息拦截器 - 在发送消息前执行
     */
    interceptor?: (messageType: string, payload: any, isRequest: boolean) => boolean | Promise<boolean>;

    /**
     * 重试配置
     */
    retry?: {
        /**
         * 最大重试次数
         * @default 0 (不重试)
         */
        maxRetries?: number;

        /**
         * 重试延迟(ms)
         * @default 100
         */
        delay?: number;

        /**
         * 重试延迟增长因子
         * @default 1.5
         */
        backoffFactor?: number;

        /**
         * 判断错误是否可重试的函数
         */
        shouldRetry?: (error: Error) => boolean;
    };
}

/**
 * 增强的Actor代理接口
 * 为Actor创建类型安全的代理，支持请求-响应模式
 */
export type EnhancedActorProxy<M extends MessageMap, R = any> = {
    [K in keyof M as `send${Capitalize<string & K>}`]: (payload: M[K]) => Promise<void>;
} & {
    [K in keyof M as `request${Capitalize<string & K>}`]: (payload: M[K], timeoutMs?: number) => Promise<R>;
} & {
    /**
     * 批量发送消息
     */
    sendBatch: <K extends keyof M>(messages: Array<{ type: K, payload: M[K] }>) => Promise<void>;

    /**
     * 批量请求并等待所有响应
     */
    requestBatch: <K extends keyof M>(
        messages: Array<{ type: K, payload: M[K], timeout?: number }>,
        options?: { allSettled?: boolean }
    ) => Promise<R[]>;

    /**
     * 设置代理的默认超时时间
     */
    setTimeout: (timeoutMs: number) => void;

    /**
     * 设置错误处理函数
     */
    setErrorHandler: (handler: (error: Error, messageType: string, payload: any) => void) => void;
};

/**
 * 创建增强的ActorProxy，支持基于方法名称的请求和发送模式
 * @param system Actor系统实例
 * @param target 目标Actor的PID
 * @param options 配置选项
 */
export function createEnhancedActorProxy<M extends MessageMap, R = any>(
    system: ActorSystem,
    target: PID,
    options: EnhancedActorProxyOptions = {}
): EnhancedActorProxy<M, R> {
    const {
        requestPrefix = 'request',
        sendPrefix = 'send',
        timeout = 5000,
        errorHandler: initialErrorHandler,
        interceptor,
        retry = {
            maxRetries: 0,
            delay: 100,
            backoffFactor: 1.5,
            shouldRetry: () => true
        }
    } = options;

    let currentTimeout = timeout;
    let currentErrorHandler = initialErrorHandler;

    // 创建代理对象，拦截属性访问，动态创建方法
    const proxy: any = {
        // 实现批量方法
        sendBatch: async <K extends keyof M>(messages: Array<{ type: K, payload: M[K] }>) => {
            const promises: Promise<void>[] = [];
            for (const { type, payload } of messages) {
                const message = createMessage(type as string, payload);

                // 应用拦截器
                if (interceptor) {
                    const shouldContinue = await interceptor(type as string, payload, false);
                    if (!shouldContinue) continue;
                }

                promises.push(system.send(target, message));
            }
            await Promise.all(promises);
        },

        requestBatch: async <K extends keyof M>(
            messages: Array<{ type: K, payload: M[K], timeout?: number }>,
            options?: { allSettled?: boolean }
        ): Promise<R[]> => {
            const promises = messages.map(async ({ type, payload, timeout: msgTimeout }) => {
                const message = createMessage(type as string, payload);

                // 应用拦截器
                if (interceptor) {
                    const shouldContinue = await interceptor(type as string, payload, true);
                    if (!shouldContinue) {
                        throw new Error(`Request canceled by interceptor: ${type}`);
                    }
                }

                // 支持重试逻辑
                const doRequest = async (attempt: number): Promise<R> => {
                    try {
                        return await system.request<R>(target, message, msgTimeout || currentTimeout);
                    } catch (error) {
                        const shouldRetry = retry.shouldRetry && retry.shouldRetry(error as Error);
                        if (shouldRetry && attempt < (retry.maxRetries || 0)) {
                            // 计算延迟时间
                            const delayTime = retry.delay! * Math.pow(retry.backoffFactor!, attempt);
                            await new Promise(resolve => setTimeout(resolve, delayTime));
                            return doRequest(attempt + 1);
                        }

                        // 应用错误处理
                        if (currentErrorHandler) {
                            currentErrorHandler(error as Error, type as string, payload);
                        }
                        throw error;
                    }
                };

                return doRequest(0);
            });

            // 使用allSettled或all来等待所有请求完成
            if (options?.allSettled) {
                const results = await Promise.allSettled(promises);
                return results.map(result =>
                    result.status === 'fulfilled' ? result.value : undefined as any
                );
            } else {
                return Promise.all(promises);
            }
        },

        setTimeout: (timeoutMs: number) => {
            currentTimeout = timeoutMs;
        },

        setErrorHandler: (handler: (error: Error, messageType: string, payload: any) => void) => {
            currentErrorHandler = handler;
        }
    };

    return new Proxy(proxy, {
        get(proxy, methodName: string) {
            // 如果方法已存在于proxy对象中，直接返回
            if (methodName in proxy) {
                return proxy[methodName];
            }

            if (typeof methodName !== 'string') {
                return undefined;
            }

            // 处理请求方法
            if (methodName.startsWith(requestPrefix)) {
                const messageType = methodName.substring(requestPrefix.length);
                if (messageType) {
                    // 转换第一个字母为小写
                    const normalizedType = messageType.charAt(0).toLowerCase() + messageType.slice(1) as keyof M;
                    return async (payload: M[typeof normalizedType], customTimeout?: number): Promise<R> => {
                        try {
                            // 应用拦截器
                            if (interceptor) {
                                const shouldContinue = await interceptor(normalizedType as string, payload, true);
                                if (!shouldContinue) {
                                    throw new Error(`Request canceled by interceptor: ${normalizedType}`);
                                }
                            }

                            // 构建消息对象
                            const message = createMessage(normalizedType as string, payload);

                            // 支持重试逻辑
                            const doRequest = async (attempt: number): Promise<R> => {
                                try {
                                    return await system.request<R>(target, message, customTimeout || currentTimeout);
                                } catch (error) {
                                    const shouldRetry = retry.shouldRetry && retry.shouldRetry(error as Error);
                                    if (shouldRetry && attempt < (retry.maxRetries || 0)) {
                                        // 计算延迟时间
                                        const delayTime = retry.delay! * Math.pow(retry.backoffFactor!, attempt);
                                        await new Promise(resolve => setTimeout(resolve, delayTime));
                                        return doRequest(attempt + 1);
                                    }
                                    throw error;
                                }
                            };

                            return await doRequest(0);
                        } catch (error) {
                            if (currentErrorHandler) {
                                currentErrorHandler(error as Error, normalizedType as string, payload);
                            }
                            throw error;
                        }
                    };
                }
            }

            // 处理发送方法
            if (methodName.startsWith(sendPrefix)) {
                const messageType = methodName.substring(sendPrefix.length);
                if (messageType) {
                    // 转换第一个字母为小写
                    const normalizedType = messageType.charAt(0).toLowerCase() + messageType.slice(1) as keyof M;
                    return async (payload: M[typeof normalizedType]) => {
                        try {
                            // 应用拦截器
                            if (interceptor) {
                                const shouldContinue = await interceptor(normalizedType as string, payload, false);
                                if (!shouldContinue) return;
                            }

                            // 构建消息对象
                            const message = createMessage(normalizedType as string, payload);

                            return await system.send(target, message);
                        } catch (error) {
                            if (currentErrorHandler) {
                                currentErrorHandler(error as Error, normalizedType as string, payload);
                            }
                            throw error;
                        }
                    };
                }
            }

            // 兼容旧版函数式调用
            return (payload: any) => {
                const message = createMessage(methodName as string, payload);
                return system.send(target, message);
            };
        }
    });
}

/**
 * Actor代理接口
 * 为Actor创建类型安全的代理
 * @deprecated 使用EnhancedActorProxy替代
 */
export type ActorProxy<M extends MessageMap> = {
    [K in keyof M]: (payload: M[K]) => Promise<void>;
};

/**
 * 创建Actor代理
 * 提供类型安全的Actor调用接口
 * @deprecated 使用createEnhancedActorProxy替代
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