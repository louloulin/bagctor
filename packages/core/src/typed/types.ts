import { PID as BasePID, Message as BaseMessage } from '@bactor/common';
import { ActorSystem } from '../core/system';
import { Message as CoreMessage, PID as CorePID } from '../core/types';
import { createMessage } from '../core/helpers';

// ========== 基础消息类型系统 ==========

/**
 * 消息类型映射接口 - 定义Actor可处理的消息类型
 * 这是类型系统的核心接口，用于定义Actor能够处理的所有消息类型及其负载类型
 */
export interface MessageMap {
    [key: string]: any;
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
export interface TypedMessage<T extends keyof TM, TM extends MessageMap = any, P = TM[T]> {
    type: T;
    payload: P;
    sender?: CorePID;
    metadata?: MessageMetadata;
    messageId?: string;
}

// 重新导出为Message，保持向后兼容
export type Message<T extends keyof TM, TM extends MessageMap = any, P = TM[T]> = TypedMessage<T, TM, P>;

/**
 * 类型化PID接口
 * 表示一个支持特定消息类型的Actor引用
 */
export interface TypedPID<TM extends MessageMap = any> extends CorePID {
    // 在CorePID基础上支持类型化消息
}

// 重新导出为PID，保持向后兼容
export type PID<TM extends MessageMap = any> = TypedPID<TM>;

/**
 * 消息上下文接口
 * 包含与消息相关的上下文信息
 */
export interface MessageContext {
    sender?: CorePID;
    messageId?: string;
    metadata?: MessageMetadata;
    self?: CorePID; // 当前Actor的PID
    message?: CoreMessage; // 完整的消息对象
}

// 向后兼容类型
export interface ActorProps<TM extends MessageMap = any> {
    // ...同样的属性，但使用正确的类型引用
}

export interface MessageHandler<K extends keyof TM, TM extends MessageMap> {
    (
        message: TypedMessage<K, TM>,
        context: MessageContext
    ): Promise<any> | any;
}

export interface PayloadHandler<K extends keyof TM, TM extends MessageMap, P = TM[K]> {
    (
        payload: P,
        context: MessageContext
    ): Promise<any> | any;
}

// Actor上下文接口
export interface ActorContext<TM extends MessageMap = any> {
    self: CorePID;

    // 发送消息
    send<K extends keyof TM>(
        target: CorePID,
        type: K,
        payload: TM[K],
        options?: Partial<MessageMetadata>
    ): Promise<void>;

    // 请求-响应模式
    request<K extends keyof TM, TMTarget extends MessageMap, R>(
        target: CorePID,
        type: K,
        payload: TM[K],
        timeout?: number
    ): Promise<R>;

    // 使用完整消息对象发送
    sendMessage<K extends keyof TM>(
        target: CorePID,
        message: TypedMessage<K, TM>
    ): Promise<void>;

    // Actor生命周期管理
    spawn<TMessages extends MessageMap = any>(
        props: ActorProps<TMessages>,
        name?: string
    ): Promise<CorePID>;

    // 停止Actor
    stop(pid: CorePID): Promise<void>;
}

// Actor接口
export interface Actor<TM extends MessageMap = any> {
    // 处理接收到的消息
    receive(message: CoreMessage | BaseMessage): Promise<void>;
}

// 类型转换工具
export function toBaseMessage(message: CoreMessage): BaseMessage {
    const { type, payload, sender, metadata, messageId } = message;
    return {
        type: type.toString(), // 确保type是字符串
        payload,
        sender,
        metadata,
        messageId
    } as BaseMessage;
}

// 创建类型化消息
export function toTypedMessage<K extends keyof TM, TM extends MessageMap = any>(
    type: K,
    payload: TM[K],
    options?: Partial<Omit<TypedMessage<K, TM>, 'type' | 'payload'>>
): TypedMessage<K, TM> {
    const message: TypedMessage<K, TM> = {
        type,
        payload,
        ...options
    };

    // 确保消息ID存在
    if (!message.messageId) {
        message.messageId = crypto.randomUUID();
    }

    // 确保元数据存在
    if (!message.metadata) {
        message.metadata = {
            timestamp: Date.now()
        };
    } else if (!message.metadata.timestamp) {
        message.metadata.timestamp = Date.now();
    }

    return message;
}

// 类型转换工具
export function actorRef<TM extends MessageMap = any>(pid: BasePID): CorePID {
    return pid as CorePID;
}

// Actor代理接口和实现

// 验证器类型
export type Validator<T> = (value: any) => value is T;

// 创建类型验证器
export function createTypeValidator<T>(typeName: string): Validator<T> {
    return (value: any): value is T => {
        // 简单验证，实际应用中可能需要更复杂的验证逻辑
        return value !== undefined && value !== null;
    };
}

// 对象验证器
export function objectValidator<T extends object>(
    schema: { [K in keyof T]?: Validator<T[K]> }
): Validator<T> {
    return (value: any): value is T => {
        if (!value || typeof value !== 'object') return false;

        // 验证每个字段
        for (const key in schema) {
            const validator = schema[key];
            if (validator && !validator(value[key])) return false;
        }

        return true;
    };
}

// 基础验证器
export const isString: Validator<string> = (value): value is string =>
    typeof value === 'string';

export const isNumber: Validator<number> = (value): value is number =>
    typeof value === 'number' && !isNaN(value);

export const isBoolean: Validator<boolean> = (value): value is boolean =>
    typeof value === 'boolean';

// 组合验证器
export function unionValidator<T, U>(
    validator1: Validator<T>,
    validator2: Validator<U>
): Validator<T | U> {
    return (value): value is T | U => validator1(value) || validator2(value);
}

export function arrayValidator<T>(itemValidator: Validator<T>): Validator<T[]> {
    return (value): value is T[] => {
        if (!Array.isArray(value)) return false;
        return value.every(item => itemValidator(item));
    };
}

export function optionalValidator<T>(validator: Validator<T>): Validator<T | undefined> {
    return (value): value is T | undefined =>
        value === undefined || validator(value);
}

export function recordValidator<T>(
    valueValidator: Validator<T>
): Validator<Record<string, T>> {
    return (value): value is Record<string, T> => {
        if (!value || typeof value !== 'object') return false;
        return Object.values(value).every(v => valueValidator(v));
    };
}

// 消息注册表
export class MessageRegistry<TM extends MessageMap = any> {
    public validators: { [K in keyof TM]?: Validator<TM[K]> } = {};

    // 注册消息类型
    register<K extends keyof TM>(type: K, validator: Validator<TM[K]>): this {
        this.validators[type] = validator;
        return this;
    }

    // 验证消息
    validate<K extends keyof TM>(type: K, payload: any): payload is TM[K] {
        const validator = this.validators[type];
        if (!validator) return true; // 如果没有验证器，默认通过
        return validator(payload);
    }

    // 创建消息
    createMessage<K extends keyof TM>(
        type: K,
        payload: TM[K],
        options?: Partial<Omit<TypedMessage<K, TM>, 'type' | 'payload'>>
    ): TypedMessage<K, TM> {
        if (this.validators[type] && !this.validators[type]!(payload)) {
            throw new Error(`Invalid payload for message type: ${String(type)}`);
        }

        return toTypedMessage(type, payload, options);
    }
}

// 消息构建器
export class MessageBuilder<TM extends MessageMap = any> {
    private _registry = new MessageRegistry<TM>();

    // 定义消息类型
    define<K extends keyof TM>(type: K, validator: Validator<TM[K]>): this {
        this._registry.register(type, validator);
        return this;
    }

    // 获取验证器
    validator<K extends keyof TM>(type: K): Validator<TM[K]> | undefined {
        return this._registry.validators[type];
    }

    // 创建消息
    create<K extends keyof TM>(
        type: K,
        payload: TM[K],
        options?: Partial<Omit<TypedMessage<K, TM>, 'type' | 'payload'>>
    ): TypedMessage<K, TM> {
        return this._registry.createMessage(type, payload, options);
    }
}

// 定义消息类型
export function defineMessage<T>(validator: Validator<T>) {
    return validator;
}

// 创建消息模式
export function createMessageSchema<TM extends MessageMap>() {
    return new MessageBuilder<TM>();
}

// Actor代理选项
export interface ActorProxyOptions {
    timeout?: number;
    errorHandler?: (error: Error, messageType: string, payload: any) => void;
}

// 基础Actor代理接口
export interface ActorProxy<M extends MessageMap = any> {
    [key: string]: (payload: any, timeout?: number) => Promise<any>;
}

// 消息拦截器类型
export type MessageInterceptor = (type: string, payload: any, isRequest: boolean) => boolean | Promise<boolean>;

// 错误处理器类型
export type ErrorHandler = (error: Error, messageType: string, payload: any) => void;

// 批量操作结果类型
export type SettledResult<T = any> = {
    status: 'fulfilled' | 'rejected';
    value?: T;
    reason?: Error;
};

// Enhanced Actor代理接口
export interface EnhancedActorProxy<M extends MessageMap = any> {
    [key: string]: ((payload: any, timeout?: number) => Promise<any>) | any;

    // 批量发送
    sendBatch(operations: Array<{ type: keyof M; payload: any }>): Promise<Array<SettledResult>>;

    // 批量请求
    requestBatch(operations: Array<{ type: keyof M; payload: any }>, options?: { allSettled?: boolean }): Promise<Array<SettledResult>>;

    // 设置选项
    withOptions(options: EnhancedActorProxyOptions): EnhancedActorProxy<M>;

    // 添加拦截器
    withInterceptor(
        interceptor: {
            beforeSend?: MessageInterceptor;
        }
    ): EnhancedActorProxy<M>;

    // 获取原始PID
    getPID(): CorePID;

    // 设置超时
    setTimeout(timeout: number): EnhancedActorProxy<M>;

    // 设置错误处理器
    setErrorHandler(handler: ErrorHandler): EnhancedActorProxy<M>;
}

// 增强型Actor代理选项
export interface EnhancedActorProxyOptions extends ActorProxyOptions {
    interceptor?: MessageInterceptor;
}

// 创建基础Actor代理
export function createActorProxy<M extends MessageMap = any>(
    system: ActorSystem,
    target: CorePID,
    options: ActorProxyOptions = {}
): ActorProxy<M> {
    // 创建基本代理对象
    const proxy = new Proxy(
        Object.create(null) as unknown as ActorProxy<M>,
        {
            get(_, prop) {
                // 处理特殊属性
                if (prop === 'then' || prop === 'catch' || prop === 'finally') {
                    return undefined;
                }

                // 创建发送方法
                return async (payload: any, timeout?: number) => {
                    const normalizedType = prop.toString();

                    // 发送请求
                    try {
                        return await system.request(
                            target,
                            {
                                type: normalizedType,
                                payload
                            },
                            timeout
                        );
                    } catch (error) {
                        // 处理错误
                        if (options.errorHandler) {
                            options.errorHandler(error instanceof Error ? error : new Error(String(error)), normalizedType, payload);
                        }
                        throw error;
                    }
                };
            }
        }
    );

    return proxy;
}

// 创建增强型Actor代理
export function createEnhancedActorProxy<TMessages extends MessageMap = MessageMap>(
    system: ActorSystem,
    target: CorePID,
    options: EnhancedActorProxyOptions = {}
): EnhancedActorProxy<TMessages> {
    // 默认配置
    let currentTimeout = options.timeout || 5000;
    let currentErrorHandler = options.errorHandler;
    let currentInterceptor = options.interceptor;

    // 创建基本代理
    const baseProxy = createActorProxy<TMessages>(system, target, options);

    // 实现增强型代理
    const enhancedProxy: EnhancedActorProxy<TMessages> = {
        ...baseProxy,

        // 批量处理
        async sendBatch(operations: Array<{ type: keyof TMessages; payload: any }>) {
            const results: SettledResult[] = [];
            for (const op of operations) {
                if (currentInterceptor) {
                    const allowed = await currentInterceptor(op.type as string, op.payload, false);
                    if (!allowed) {
                        continue;
                    }
                }
                try {
                    await system.send(target, {
                        type: op.type as string,
                        payload: op.payload
                    });
                    results.push({ status: 'fulfilled' as const, value: undefined });
                } catch (error) {
                    if (currentErrorHandler) {
                        currentErrorHandler(error as Error, op.type as string, op.payload);
                    }
                    results.push({ status: 'rejected' as const, reason: error as Error });
                }
            }
            return results;
        },

        async requestBatch(operations: Array<{ type: keyof TMessages; payload: any }>, options?: { allSettled?: boolean }) {
            const results: SettledResult[] = [];
            for (const op of operations) {
                if (currentInterceptor) {
                    const allowed = await currentInterceptor(op.type as string, op.payload, true);
                    if (!allowed) {
                        if (options?.allSettled) {
                            results.push({ status: 'rejected' as const, reason: new Error('Operation intercepted') });
                            continue;
                        }
                        throw new Error('Operation intercepted');
                    }
                }
                try {
                    const result = await system.request(target, {
                        type: op.type as string,
                        payload: op.payload
                    }, currentTimeout);
                    results.push({ status: 'fulfilled' as const, value: result });
                } catch (error) {
                    if (currentErrorHandler) {
                        currentErrorHandler(error as Error, op.type as string, op.payload);
                    }
                    if (options?.allSettled) {
                        results.push({ status: 'rejected' as const, reason: error as Error });
                    } else {
                        throw error;
                    }
                }
            }
            return options?.allSettled ? results : results.map(r => r.status === 'fulfilled' ? r.value : undefined);
        },

        // 设置选项
        withOptions(newOptions: EnhancedActorProxyOptions) {
            currentTimeout = newOptions.timeout || currentTimeout;
            currentErrorHandler = newOptions.errorHandler || currentErrorHandler;
            currentInterceptor = newOptions.interceptor || currentInterceptor;
            return this;
        },

        // 添加拦截器
        withInterceptor(interceptor: { beforeSend?: MessageInterceptor }) {
            currentInterceptor = async (type: string, payload: any, isRequest: boolean) => {
                if (interceptor.beforeSend && !await interceptor.beforeSend(type, payload, isRequest)) {
                    return false;
                }
                return true;
            };
            return this;
        },

        // 获取原始PID
        getPID() {
            return target;
        },

        // 设置超时
        setTimeout(timeout: number) {
            currentTimeout = timeout;
            return this;
        },

        // 设置错误处理器
        setErrorHandler(handler: ErrorHandler) {
            currentErrorHandler = handler;
            return this;
        }
    };

    // 创建方法风格的代理
    return new Proxy(enhancedProxy, {
        get(target: any, prop: string | symbol) {
            if (prop in target) {
                return target[prop];
            }

            // 处理方法风格的调用
            const methodMatch = prop.toString().match(/^(send|request)(.+)$/);
            if (methodMatch) {
                const [, operation, messageType] = methodMatch;
                const type = messageType.charAt(0).toLowerCase() + messageType.slice(1);

                return async (payload: any, timeout?: number) => {
                    if (currentInterceptor) {
                        const allowed = await currentInterceptor(type, payload, operation === 'request');
                        if (!allowed) {
                            throw new Error('Operation intercepted');
                        }
                    }

                    try {
                        if (operation === 'send') {
                            return await system.send(target, { type, payload });
                        } else {
                            return await system.request(target, { type, payload }, timeout || currentTimeout);
                        }
                    } catch (error) {
                        if (currentErrorHandler) {
                            currentErrorHandler(error as Error, type, payload);
                        }
                        throw error;
                    }
                };
            }

            return undefined;
        }
    }) as EnhancedActorProxy<TMessages>;
}

// 创建拦截器
export function createInterceptor(handlers: {
    beforeSend?: (message: any) => boolean | Promise<boolean>;
    afterSend?: (result: any) => any | Promise<any>;
}) {
    return handlers;
} 