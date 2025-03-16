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
    const { type, payload, ...rest } = message;
    return {
        type: type.toString(), // 确保type是字符串
        payload,
        ...rest
    } as BaseMessage;
}

// 创建类型化消息
export function toTypedMessage<K extends keyof TM, TM extends MessageMap = any>(
    type: K,
    payload: TM[K],
    options?: Partial<Omit<TypedMessage<K, TM>, 'type' | 'payload'>>
): TypedMessage<K, TM> {
    return {
        type,
        payload,
        ...options
    };
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
    timeout?: number; // 请求超时时间
    retries?: number; // 重试次数
    retryDelay?: number; // 重试延迟
    onError?: (error: Error) => void; // 错误处理回调
    onTimeout?: () => void; // 超时处理回调
    interceptors?: {
        beforeSend?: (message: any) => boolean | Promise<boolean>; // 发送前拦截器
        afterSend?: (result: any) => any | Promise<any>; // 发送后拦截器
    };
}

// Actor代理接口
export interface ActorProxy<M extends MessageMap = any> {
    // 发送消息方法，会为每个消息类型生成
    [key: string]: any;
}

// Enhanced Actor代理接口
export interface EnhancedActorProxy<M extends MessageMap = any> extends ActorProxy<M> {
    // 批量处理
    batch(
        operations: Array<{
            type: keyof M;
            payload: any;
        }>
    ): Promise<void>;

    // 设置选项
    withOptions(options: ActorProxyOptions): EnhancedActorProxy<M>;

    // 添加拦截器
    withInterceptor(
        interceptor: {
            beforeSend?: (message: any) => boolean | Promise<boolean>;
            afterSend?: (result: any) => any | Promise<any>;
        }
    ): EnhancedActorProxy<M>;

    // 获取原始PID
    getPID(): CorePID;
}

// 创建Actor代理
export function createActorProxy<M extends MessageMap = any>(
    system: ActorSystem,
    target: CorePID,
    options: ActorProxyOptions = {}
): ActorProxy<M> {
    // 创建基本代理对象
    const proxy = new Proxy(
        Object.create(null) as unknown as ActorProxy<M>, // 使用Object.create(null)创建一个干净的对象并进行类型断言
        {
            get(_, prop) { // 不使用target参数，避免类型问题
                // 处理特殊属性
                if (prop === 'then' || prop === 'catch' || prop === 'finally') {
                    return undefined;
                }

                // 创建发送方法
                return async (payload: any) => {
                    const normalizedType = prop.toString();

                    // 应用拦截器
                    if (options.interceptors?.beforeSend) {
                        const shouldContinue = await options.interceptors.beforeSend({
                            type: normalizedType,
                            payload
                        });

                        if (!shouldContinue) {
                            throw new Error(`Request canceled by interceptor: ${String(normalizedType)}`);
                        }
                    }

                    // 发送请求
                    try {
                        const result = await system.request(
                            target,
                            {
                                type: normalizedType,
                                payload
                            },
                            options.timeout
                        );

                        // 应用响应拦截器
                        if (options.interceptors?.afterSend) {
                            return await options.interceptors.afterSend(result);
                        }

                        return result;
                    } catch (error) {
                        // 处理错误
                        if (options.onError) {
                            options.onError(error instanceof Error ? error : new Error(String(error)));
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
    target: CorePID
): EnhancedActorProxy<TMessages> {
    // 实现增强型代理
    // 这里需要返回代理的实现
    const proxy = {
        // 实现增强型代理的方法和属性
        getPID() {
            return target;
        }
        // 其他方法的实现...
    };

    return proxy as EnhancedActorProxy<TMessages>;
}

// 创建拦截器
export function createInterceptor(handlers: {
    beforeSend?: (message: any) => boolean | Promise<boolean>;
    afterSend?: (result: any) => any | Promise<any>;
}) {
    return handlers;
} 