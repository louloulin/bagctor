import { Message } from './types';

/**
 * 行为装饰器，用于声明式定义Actor行为
 * @param behaviorName 行为名称，默认为'default'
 * @returns 方法装饰器
 */
export function behavior(behaviorName: string = 'default') {
    return function (
        target: any,
        propertyKey: string,
        descriptor: PropertyDescriptor
    ) {
        // 确保目标对象有behaviorMap属性
        if (!target.behaviorMethods) {
            target.behaviorMethods = new Map<string, string>();
        }

        // 将方法名与行为名关联
        target.behaviorMethods.set(behaviorName, propertyKey);

        return descriptor;
    };
}

/**
 * 消息处理装饰器，用于声明式定义消息处理方法
 * @param messageType 消息类型
 * @returns 方法装饰器
 */
export function messageHandler(messageType: string) {
    return function (
        target: any,
        propertyKey: string,
        descriptor: PropertyDescriptor
    ) {
        // 确保目标对象有messageHandlers属性
        if (!target.messageHandlers) {
            target.messageHandlers = new Map<string, string>();
        }

        // 将方法名与消息类型关联
        target.messageHandlers.set(messageType, propertyKey);

        return descriptor;
    };
}

/**
 * 初始化装饰器，用于自动设置初始状态
 * @param initialState 初始状态对象
 * @returns 类装饰器
 */
export function initialState<T>(initialState: T) {
    return function (constructor: new (...args: any[]) => any) {
        // 保存原始构造函数
        const original = constructor;

        // 创建新的构造函数
        const wrappedConstructor: any = function (...args: any[]) {
            const instance = new original(...args);

            // 自动设置初始状态
            if (instance.setState) {
                instance.setState(initialState);
            }

            return instance;
        };

        // 复制原型
        wrappedConstructor.prototype = original.prototype;

        // 设置构造函数
        return wrappedConstructor;
    };
} 