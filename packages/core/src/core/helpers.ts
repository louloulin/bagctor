import { ActorSystem } from './system';
import { Actor } from './actor';
import { ActorContext, Message, PID, Behavior, BehaviorMap, SupervisorDirective } from './types';
import { PropsBuilder } from './props';

/**
 * 函数式Actor定义
 * @template TState 状态类型
 * @template TMessage 消息类型
 * @param initialState 初始状态
 * @param behaviors 行为定义对象
 * @param options 选项，包括默认行为名称
 * @returns 一个Actor类，可与PropsBuilder一起使用
 */
export function defineActor<TState, TMessage extends Message = Message>(
    initialState: TState,
    behaviors: Record<string, Behavior<TState, TMessage>>,
    options: { defaultBehavior?: string } = {}
): new (context: ActorContext) => Actor {
    class FunctionalActor extends Actor {
        protected customState: TState;
        protected currentBehavior: string;

        constructor(context: ActorContext) {
            super(context);
            this.customState = initialState;
            this.currentBehavior = options.defaultBehavior || 'default';

            Object.entries(behaviors).forEach(([name, fn]) => {
                this.addBehavior(name, async (message: Message) => {
                    const newState = await (fn as any)(this.customState, message, context);
                    if (newState !== undefined) {
                        this.customState = newState;
                    }
                    return newState;
                });
            });
        }

        protected behaviors(): void { }
    }

    return FunctionalActor;
}

/**
 * 消息匹配器，简化消息处理
 * @template TState 状态类型
 * @template TMessage 消息类型
 * @param handlers 处理器对象，键为消息类型
 * @param defaultHandler 默认处理器，当消息类型没有匹配处理器时调用
 * @returns 行为函数
 */
export function match<TState, TMessage extends Message = Message>(
    handlers: Partial<Record<string, Behavior<TState, TMessage>>>,
    defaultHandler?: Behavior<TState, TMessage>
): Behavior<TState, TMessage> {
    return (state, message, context) => {
        const handler = handlers[message.type] || defaultHandler;
        if (!handler) {
            throw new Error(`No handler found for message type: ${message.type}`);
        }
        return handler(state, message, context);
    };
}

/**
 * 请求-响应模式辅助函数
 * @template TResponse 响应类型
 * @param system Actor系统
 * @param target 目标Actor的PID
 * @param message 消息
 * @param timeout 超时时间（毫秒）
 * @returns 响应Promise
 */
export function ask<TResponse>(
    system: ActorSystem,
    target: PID,
    message: Message,
    timeout: number = 5000
): Promise<TResponse> {
    return system.request<TResponse>(target, message, timeout);
}

/**
 * 创建类型安全的消息
 * @template T 负载类型
 * @param type 消息类型
 * @param payload 消息负载
 * @param options 其他消息选项
 * @returns 类型安全的消息对象
 */
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

/**
 * 监督策略工厂
 */
export const SupervisorStrategies = {
    /**
     * 一对一策略，只重启出错的子Actor
     */
    oneForOne: (maxRestarts: number = 10, withinTimeWindow: number = 60000) => {
        return new OneForOneSupervisorStrategy(maxRestarts, withinTimeWindow);
    },

    /**
     * 一对多策略，当一个子Actor出错时重启所有子Actor
     */
    allForOne: (maxRestarts: number = 10, withinTimeWindow: number = 60000) => {
        return new AllForOneSupervisorStrategy(maxRestarts, withinTimeWindow);
    },

    /**
     * 自定义策略
     */
    custom: (handler: (error: Error, childPID: PID, restartCount: number) => SupervisorDirective) => {
        return new CustomSupervisorStrategy(handler);
    }
};

/**
 * 一对一监督策略
 */
class OneForOneSupervisorStrategy {
    constructor(private maxRestarts: number, private withinTimeWindow: number) { }

    handleError(error: Error, childPID: PID, restartCount: number): SupervisorDirective {
        if (restartCount > this.maxRestarts) {
            return SupervisorDirective.Stop;
        }
        return SupervisorDirective.Restart;
    }
}

/**
 * 一对多监督策略
 */
class AllForOneSupervisorStrategy {
    constructor(private maxRestarts: number, private withinTimeWindow: number) { }

    handleError(error: Error, childPID: PID, restartCount: number): SupervisorDirective {
        if (restartCount > this.maxRestarts) {
            return SupervisorDirective.Stop;
        }
        return SupervisorDirective.Restart;
    }

    // 额外属性，用于标识这是一对多策略
    get restartAll(): boolean {
        return true;
    }
}

/**
 * 自定义监督策略
 */
class CustomSupervisorStrategy {
    constructor(private handler: (error: Error, childPID: PID, restartCount: number) => SupervisorDirective) { }

    handleError(error: Error, childPID: PID, restartCount: number): SupervisorDirective {
        return this.handler(error, childPID, restartCount);
    }
} 