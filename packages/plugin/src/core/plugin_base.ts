import { Actor, ActorContext, Message, log, PID } from '@bactor/core';

// 插件上下文接口 - 提供插件与系统交互的能力
export interface PluginContext {
    // 发送消息到指定目标
    send(target: string | PID, type: string, payload: any): Promise<void>;

    // 注册消息处理器
    registerHandler(messageType: string, handler: (payload: any) => Promise<any>): void;

    // 获取插件ID
    getPluginId(): string;

    // 日志功能
    log: typeof log;
}

// 插件元数据接口
export interface PluginMetadata {
    id: string;
    name: string;
    version: string;
    description?: string;
    author?: string;
    capabilities: string[];
    config?: Record<string, any>;
}

// 核心插件接口
export interface BagctorPlugin<TConfig = any> {
    // 插件元数据
    metadata: PluginMetadata;

    // 插件初始化
    initialize(context: PluginContext, config: TConfig): Promise<void>;

    // 处理消息
    handleMessage<T = any>(type: string, payload: any): Promise<T>;

    // 清理资源
    cleanup(): Promise<void>;
}

// 消息处理器函数类型
export type MessageHandler<TPayload = any, TResult = any> =
    (payload: TPayload) => Promise<TResult>;

// 插件基类 - 简化插件实现
export abstract class PluginBase<TConfig = any> implements BagctorPlugin<TConfig> {
    abstract metadata: PluginMetadata;
    protected context!: PluginContext;
    protected config!: TConfig;
    private handlers: Map<string, MessageHandler> = new Map();

    async initialize(context: PluginContext, config: TConfig): Promise<void> {
        this.context = context;
        this.config = config;

        // 注册插件声明的能力
        this.registerCapabilities();

        // 允许子类执行额外的初始化
        await this.onInitialize();
    }

    // 子类可以覆盖这个方法执行额外的初始化
    protected async onInitialize(): Promise<void> {
        // 默认实现为空
    }

    // 注册插件声明的所有能力
    private registerCapabilities(): void {
        for (const capability of this.metadata.capabilities) {
            // 查找处理此能力的方法
            const handlerName = `handle${this.capitalizeFirstLetter(capability.split('.').pop() || '')}`;
            const handler = (this as any)[handlerName];

            if (typeof handler === 'function') {
                this.registerHandler(capability, handler.bind(this));
            } else {
                this.context.log.warn(`No handler found for capability: ${capability}`);
            }
        }
    }

    // 注册消息处理器
    protected registerHandler(messageType: string, handler: MessageHandler): void {
        this.handlers.set(messageType, handler);
        this.context.registerHandler(messageType, async (payload: any) => {
            return await this.handleMessage(messageType, payload);
        });
    }

    // 处理收到的消息
    async handleMessage<T = any>(type: string, payload: any): Promise<T> {
        const handler = this.handlers.get(type);
        if (handler) {
            return await handler(payload);
        }
        throw new Error(`No handler registered for message type: ${type}`);
    }

    // 清理资源
    async cleanup(): Promise<void> {
        // 允许子类执行额外的清理
        await this.onCleanup();
    }

    // 子类可以覆盖这个方法执行额外的清理
    protected async onCleanup(): Promise<void> {
        // 默认实现为空
    }

    // 辅助方法：将字符串首字母大写
    private capitalizeFirstLetter(string: string): string {
        return string.charAt(0).toUpperCase() + string.slice(1);
    }
}

// 创建与Actor系统兼容的插件上下文
export function createPluginContext(actor: Actor, actorContext: ActorContext, pluginId: string): PluginContext {
    return {
        send: async (target: string | PID, type: string, payload: any): Promise<void> => {
            let targetPid: PID;
            if (typeof target === 'string') {
                targetPid = { id: target };
            } else {
                targetPid = target;
            }

            await actorContext.send(targetPid, {
                type,
                payload
            });
        },

        registerHandler: (messageType: string, handler: MessageHandler): void => {
            // 由于addBehavior是受保护的，我们将此操作推迟到PluginAdapterActor中处理
            // 暂时存储处理器，稍后在适配器中注册
            (actor as any).__pendingHandlers = (actor as any).__pendingHandlers || {};
            (actor as any).__pendingHandlers[messageType] = handler;
        },

        getPluginId: (): string => pluginId,

        log
    };
}

// 适配器函数 - 将新的插件接口适配到现有的Actor系统
export function createPluginActor<TConfig = any>(
    Plugin: new () => BagctorPlugin<TConfig>,
    context: ActorContext,
    config: TConfig
): Promise<Actor> {
    // 创建插件适配器Actor
    class PluginAdapterActor extends Actor {
        private plugin: BagctorPlugin<TConfig>;
        private __pendingHandlers: Record<string, MessageHandler> = {};

        constructor(context: ActorContext, plugin: BagctorPlugin<TConfig>) {
            super(context);
            this.plugin = plugin;
        }

        protected behaviors(): void {
            // 注册所有待处理的消息处理器
            if (this.__pendingHandlers) {
                for (const [messageType, handler] of Object.entries(this.__pendingHandlers)) {
                    this.registerPluginHandler(messageType, handler);
                }
            }

            // 默认行为处理未注册的消息
            this.addBehavior('default', async (message: Message) => {
                try {
                    const result = await this.plugin.handleMessage(message.type, message.payload);

                    if (message.sender) {
                        await this.context.send(message.sender, {
                            type: `${message.type}.result`,
                            payload: {
                                success: true,
                                result
                            }
                        });
                    }
                } catch (error) {
                    log.error(`Error in plugin handling message ${message.type}:`, error);

                    if (message.sender) {
                        await this.context.send(message.sender, {
                            type: `${message.type}.result`,
                            payload: {
                                success: false,
                                error: error instanceof Error ? error.message : 'Unknown error'
                            }
                        });
                    }
                }
            });
        }

        // 注册插件消息处理器
        private registerPluginHandler(messageType: string, handler: MessageHandler): void {
            this.addBehavior(messageType, async (message: Message) => {
                try {
                    const result = await handler(message.payload);

                    // 如果有发送者，发送结果
                    if (message.sender) {
                        await this.context.send(message.sender, {
                            type: `${messageType}.result`,
                            payload: {
                                success: true,
                                result
                            }
                        });
                    }
                } catch (error) {
                    log.error(`Error handling ${messageType}:`, error);

                    // 如果有发送者，发送错误
                    if (message.sender) {
                        await this.context.send(message.sender, {
                            type: `${messageType}.result`,
                            payload: {
                                success: false,
                                error: error instanceof Error ? error.message : 'Unknown error'
                            }
                        });
                    }
                }
            });
        }

        async preStart(): Promise<void> {
            const pluginContext = createPluginContext(this, this.context, 'plugin-' + Date.now());
            await this.plugin.initialize(pluginContext, config);
        }

        async postStop(): Promise<void> {
            await this.plugin.cleanup();
        }
    }

    // 创建插件实例
    const plugin = new Plugin();

    // 创建并返回适配器Actor
    return Promise.resolve(new PluginAdapterActor(context, plugin));
} 