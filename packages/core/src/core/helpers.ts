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
 * 增强的消息匹配器，支持更复杂的模式匹配
 * @template TState 状态类型
 * @template TMessage 消息类型
 * @param handlers 处理器对象，键为消息类型
 * @param defaultHandler 默认处理器，当消息类型没有匹配处理器时调用
 * @returns 行为函数
 */
export function match<TState, TMessage extends Message = Message>(
    handlers: Partial<Record<string,
        | Behavior<TState, TMessage>
        | {
            condition?: ((message: TMessage) => boolean) | Array<(message: TMessage) => boolean>;
            handler: Behavior<TState, TMessage>;
            priority?: number;
        }
        | Array<{
            condition?: ((message: TMessage) => boolean) | Array<(message: TMessage) => boolean>;
            handler: Behavior<TState, TMessage>;
            priority?: number;
        }>
    >>,
    defaultHandler?: Behavior<TState, TMessage>
): Behavior<TState, TMessage> {
    return (state, message, context) => {
        // 尝试获取消息类型对应的处理器
        const handler = handlers[message.type];

        if (!handler) {
            // 如果没有找到处理器，使用默认处理器
            if (defaultHandler) {
                return defaultHandler(state, message, context);
            }
            throw new Error(`No handler found for message type: ${message.type}`);
        }

        // 如果处理器是处理器数组
        if (Array.isArray(handler)) {
            // 按优先级降序排序
            const sortedHandlers = [...handler].sort((a, b) =>
                (b.priority || 0) - (a.priority || 0)
            );

            // 尝试每个处理器，直到找到满足条件的
            for (const h of sortedHandlers) {
                // 处理单个条件或条件数组
                if (h.condition) {
                    const conditions = Array.isArray(h.condition)
                        ? h.condition
                        : [h.condition];

                    // 检查所有条件是否满足（逻辑与）
                    const allConditionsMet = conditions.every(condition =>
                        condition(message)
                    );

                    if (allConditionsMet) {
                        return h.handler(state, message, context);
                    }
                } else {
                    // 没有条件，直接执行处理器
                    return h.handler(state, message, context);
                }
            }

            // 如果没有满足条件的处理器，使用默认处理器
            if (defaultHandler) {
                return defaultHandler(state, message, context);
            }
            throw new Error(`No matching handler found for message type: ${message.type}`);
        }

        // 如果处理器是对象，检查条件
        if (typeof handler !== 'function') {
            // 处理单个条件或条件数组
            if (handler.condition) {
                const conditions = Array.isArray(handler.condition)
                    ? handler.condition
                    : [handler.condition];

                // 检查所有条件是否满足（逻辑与）
                const allConditionsMet = conditions.every(condition => condition(message));

                if (allConditionsMet) {
                    return handler.handler(state, message, context);
                }

                // 如果条件不满足，使用默认处理器
                if (defaultHandler) {
                    return defaultHandler(state, message, context);
                }
                throw new Error(`Conditions not satisfied for message type: ${message.type}`);
            }

            // 没有条件，直接执行处理器
            return handler.handler(state, message, context);
        }

        // 直接调用处理函数
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
    custom: (
        handler: (error: Error, childPID: PID, restartCount: number) => SupervisorDirective,
        options?: {
            restartAll?: boolean,
            errorClassifiers?: ErrorClassifier[]
        }
    ) => {
        return new CustomSupervisorStrategy(handler, options);
    },

    /**
     * 创建错误分类器
     */
    createErrorClassifier: (
        name: string,
        matchFn: (error: Error) => boolean,
        directive: SupervisorDirective
    ): ErrorClassifier => {
        return {
            name,
            matches: matchFn,
            directive
        };
    }
};

/**
 * 一对一监督策略
 */
class OneForOneSupervisorStrategy {
    constructor(private maxRestarts: number, private withinTimeWindow: number) { }

    handleError(error: Error, childPID: PID, restartCount: number): SupervisorDirective {
        console.log(`[OneForOne] handleError called for child ${childPID.id}, restartCount=${restartCount}, maxRestarts=${this.maxRestarts}`);

        console.log(`[OneForOne] Error details: ${error.message}`);
        console.log(`[OneForOne] Error stack: ${error.stack?.split('\n')[0] || 'No stack'}`);

        if (restartCount > this.maxRestarts) {
            console.log(`[OneForOne] Returning SupervisorDirective.Stop (${SupervisorDirective.Stop})`);
            return SupervisorDirective.Stop;
        }
        console.log(`[OneForOne] Returning SupervisorDirective.Restart (${SupervisorDirective.Restart})`);
        return SupervisorDirective.Restart;
    }
}

/**
 * 一对多监督策略
 */
class AllForOneSupervisorStrategy {
    constructor(private maxRestarts: number, private withinTimeWindow: number) { }

    handleError(error: Error, childPID: PID, restartCount: number): SupervisorDirective {
        console.log(`[AllForOne] handleError called for child ${childPID.id}, restartCount=${restartCount}, maxRestarts=${this.maxRestarts}`);

        console.log(`[AllForOne] Error details: ${error.message}`);
        console.log(`[AllForOne] Error stack: ${error.stack?.split('\n')[0] || 'No stack'}`);

        if (restartCount > this.maxRestarts) {
            console.log(`[AllForOne] Returning SupervisorDirective.Stop (${SupervisorDirective.Stop})`);
            return SupervisorDirective.Stop;
        }
        console.log(`[AllForOne] Returning SupervisorDirective.Restart (${SupervisorDirective.Restart})`);
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
    private _restartAll: boolean = false;
    private _errorClassifiers: ErrorClassifier[] = [];

    constructor(
        private handler: (error: Error, childPID: PID, restartCount: number) => SupervisorDirective,
        options?: {
            restartAll?: boolean,
            errorClassifiers?: ErrorClassifier[]
        }
    ) {
        this._restartAll = options?.restartAll || false;
        this._errorClassifiers = options?.errorClassifiers || [];
    }

    handleError(error: Error, childPID: PID, restartCount: number): SupervisorDirective {
        console.log(`[Custom] handleError called for child ${childPID.id}, restartCount=${restartCount}`);

        console.log(`[Custom] Error details: ${error.message}`);
        console.log(`[Custom] Error stack: ${error.stack?.split('\n')[0] || 'No stack'}`);

        // Check if we have classifiers that match this error
        for (const classifier of this._errorClassifiers) {
            if (classifier.matches(error)) {
                console.log(`[Custom] Error matched classifier: ${classifier.name}`);
                return classifier.directive;
            }
        }

        // Fall back to the default handler
        const directive = this.handler(error, childPID, restartCount);
        console.log(`[Custom] Handler returned SupervisorDirective.${SupervisorDirective[directive]} (${directive})`);
        return directive;
    }

    get restartAll(): boolean {
        return this._restartAll;
    }
}

/**
 * 错误分类器
 * 用于自定义监督策略中对不同类型的错误进行分类处理
 */
export interface ErrorClassifier {
    name: string;
    matches: (error: Error) => boolean;
    directive: SupervisorDirective;
} 