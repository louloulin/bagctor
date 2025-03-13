import { PID } from '@bactor/common';
import { MessageMap, Message, MessageMetadata, Validator as TypeValidator } from './types';

/**
 * 消息类型验证器接口
 */
export type Validator<T> = TypeValidator<T>;

/**
 * 消息类型定义工厂
 * 用于创建类型安全的消息类型工厂函数
 */
export function defineMessage<TM extends MessageMap>() {
    return <K extends keyof TM>(
        type: K,
        payload: TM[K],
        sender?: PID,
        metadata?: MessageMetadata
    ): Message<K, TM> => ({
        type,
        payload,
        sender,
        metadata: metadata || {},
        messageId: generateMessageId()
    });
}

/**
 * 消息类型构建器
 * 提供流式API，用于定义消息类型和验证器
 */
export class MessageBuilder<TM extends MessageMap = any> {
    private validators = new Map<keyof TM, Validator<any>>();
    private registry: MessageRegistry<TM>;

    constructor() {
        this.registry = new MessageRegistry<TM>();
    }

    /**
     * 为特定消息类型定义验证器
     */
    define<K extends keyof TM>(
        messageType: K,
        validator: Validator<TM[K]>
    ): this {
        this.validators.set(messageType, validator);
        this.registry.register(messageType, validator);
        return this;
    }

    /**
     * 创建特定类型的消息
     */
    create<K extends keyof TM>(
        messageType: K,
        payload: TM[K],
        sender?: PID,
        metadata?: MessageMetadata
    ): Message<K, TM> {
        // 如果有验证器，先验证payload
        const validator = this.validators.get(messageType);
        if (validator && !validator(payload)) {
            throw new Error(`Invalid payload for message type: ${messageType as string}`);
        }

        return {
            type: messageType,
            payload,
            sender,
            metadata: metadata || {},
            messageId: generateMessageId()
        };
    }

    /**
     * 获取消息注册表
     */
    getRegistry(): MessageRegistry<TM> {
        return this.registry;
    }
}

/**
 * 创建消息模式
 * 用于定义和约束消息类型
 */
export function createMessageSchema<TM extends MessageMap>(): MessageBuilder<TM> {
    return new MessageBuilder<TM>();
}

/**
 * 生成唯一的消息ID
 */
function generateMessageId(): string {
    return Math.random().toString(36).substring(2, 15) +
        Math.random().toString(36).substring(2, 15);
}

/**
 * 消息类型注册表
 * 支持消息类型的运行时验证
 */
export class MessageRegistry<TM extends MessageMap = any> {
    private schemas = new Map<keyof TM, Validator<TM[keyof TM]>>();
    private strictMode: boolean = false;

    /**
     * 注册消息类型验证器
     */
    register<K extends keyof TM>(
        messageType: K,
        validator: Validator<TM[K]>
    ): this {
        this.schemas.set(messageType, validator as Validator<TM[keyof TM]>);
        return this;
    }

    /**
     * 批量注册消息类型验证器
     */
    registerAll(validators: Record<string, Validator<any>>): this {
        for (const [type, validator] of Object.entries(validators)) {
            this.schemas.set(type as keyof TM, validator as Validator<TM[keyof TM]>);
        }
        return this;
    }

    /**
     * 设置严格模式
     * 在严格模式下，所有消息必须有验证器
     */
    setStrictMode(strict: boolean): this {
        this.strictMode = strict;
        return this;
    }

    /**
     * 验证消息负载是否符合指定类型
     */
    validate<K extends keyof TM>(
        messageType: K,
        payload: any
    ): payload is TM[K] {
        const validator = this.schemas.get(messageType);
        if (!validator) {
            // 在严格模式下，没有验证器的消息类型被视为无效
            return !this.strictMode;
        }
        return validator(payload);
    }

    /**
     * 验证完整消息
     */
    validateMessage<K extends keyof TM>(
        message: Partial<Message<K, TM>>
    ): message is Message<K, TM> {
        if (typeof message.type !== 'string' || message.payload === undefined) {
            return false;
        }

        return this.validate(message.type as K, message.payload);
    }

    /**
     * 获取注册的消息类型列表
     */
    getRegisteredTypes(): Array<keyof TM> {
        return Array.from(this.schemas.keys());
    }

    /**
     * 检查消息类型是否已注册
     */
    isTypeRegistered<K extends keyof TM>(messageType: K): boolean {
        return this.schemas.has(messageType);
    }
}

/**
 * 创建通用的类型检查函数
 */
export function createTypeValidator<T>(
    predicate: (value: any) => boolean
): Validator<T> {
    return (value: any): value is T => predicate(value);
}

/**
 * 对象属性验证器
 * 验证对象是否包含指定属性，以及这些属性是否满足特定类型条件
 */
export function objectValidator<T extends Record<string, any>>(
    properties: Record<keyof T, (value: any) => boolean>,
    options?: { allowExtraProperties?: boolean }
): Validator<T> {
    return (value: any): value is T => {
        if (!value || typeof value !== 'object') {
            return false;
        }

        // 检查必要属性
        for (const [prop, validator] of Object.entries(properties)) {
            if (!(prop in value) || !validator(value[prop])) {
                return false;
            }
        }

        // 严格模式：检查额外属性
        if (options?.allowExtraProperties === false) {
            const extraProps = Object.keys(value).filter(
                key => !(key in properties)
            );
            if (extraProps.length > 0) {
                return false;
            }
        }

        return true;
    };
}

/**
 * 联合类型验证器
 * 验证值是否满足多个类型之一
 */
export function unionValidator<T>(...validators: Array<Validator<any>>): Validator<T> {
    return (value: any): value is T => {
        return validators.some(validator => validator(value));
    };
}

/**
 * 数组验证器
 * 验证数组中的每个元素是否满足指定条件
 */
export function arrayValidator<T>(itemValidator: Validator<T>): Validator<T[]> {
    return (value: any): value is T[] => {
        if (!Array.isArray(value)) {
            return false;
        }
        return value.every(item => itemValidator(item));
    };
}

/**
 * 可选值验证器
 * 允许值为undefined
 */
export function optionalValidator<T>(validator: Validator<T>): Validator<T | undefined> {
    return (value: any): value is T | undefined => {
        return value === undefined || validator(value);
    };
}

/**
 * Record验证器
 * 验证对象的键和值是否符合要求
 */
export function recordValidator<K extends string, V>(
    keyValidator: (key: string) => key is K,
    valueValidator: Validator<V>
): Validator<Record<K, V>> {
    return (value: any): value is Record<K, V> => {
        if (!value || typeof value !== 'object') {
            return false;
        }

        return Object.entries(value).every(
            ([key, val]) => keyValidator(key) && valueValidator(val)
        );
    };
}

// 基础类型验证器
export const isString = (value: any): value is string => typeof value === 'string';
export const isNumber = (value: any): value is number => typeof value === 'number';
export const isBoolean = (value: any): value is boolean => typeof value === 'boolean';
export const isObject = (value: any): value is object => value !== null && typeof value === 'object';
export const isArray = <T = any>(value: any): value is T[] => Array.isArray(value);
export const isNull = (value: any): value is null => value === null;
export const isUndefined = (value: any): value is undefined => value === undefined;
export const isDate = (value: any): value is Date => value instanceof Date;
export const isFunction = (value: any): value is Function => typeof value === 'function'; 