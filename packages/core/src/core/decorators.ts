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
        // 保存原始构造函数引用
        const original = constructor;

        // 创建一个新函数，直接替换原始构造函数
        function ClassWithInitialState(this: any, ...args: any[]) {
            // 调用原始构造函数
            const instance = new original(...args);

            // 通过直接设置state属性来设置初始状态
            instance.state = initialState;

            return instance;
        }

        // 复制原型和构造函数属性
        ClassWithInitialState.prototype = original.prototype;

        // 返回新构造函数
        return ClassWithInitialState as any;
    };
} 