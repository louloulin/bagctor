import { Actor, ActorContext, Message, log, PID } from '@bactor/core';
import { BagctorPlugin, createPluginActor } from '../core/plugin_base';

/**
 * 插件适配器函数 - 提供与现有ActorSystem的兼容性
 * 
 * 此函数用于创建一个与BActor系统兼容的Actor，将新的插件接口与现有系统集成
 * 
 * @param context ActorContext - Actor上下文
 * @param pluginConstructor - 插件构造函数
 * @param config - 插件配置
 * @returns Promise<Actor> - 返回适配后的Actor
 */
export async function createPluginActorFromClass<TConfig = any>(
    context: ActorContext,
    pluginConstructor: new () => BagctorPlugin<TConfig>,
    config: TConfig
): Promise<Actor> {
    return await createPluginActor(pluginConstructor, context, config);
}

/**
 * 插件适配器函数 - 从插件工厂函数创建Actor
 * 
 * 此函数用于从一个工厂函数创建插件，并将其包装为与BActor系统兼容的Actor
 * 
 * @param context ActorContext - Actor上下文
 * @param pluginFactory - 创建插件的工厂函数
 * @param config - 插件配置
 * @returns Promise<Actor> - 返回适配后的Actor
 */
export async function createPluginActorFromFactory<TConfig = any>(
    context: ActorContext,
    pluginFactory: (config: TConfig) => BagctorPlugin<TConfig>,
    config: TConfig
): Promise<Actor> {
    // 创建插件适配器Actor
    class PluginFactoryAdapterActor extends Actor {
        private plugin: BagctorPlugin<TConfig>;

        constructor(context: ActorContext, plugin: BagctorPlugin<TConfig>) {
            super(context);
            this.plugin = plugin;

            // 初始化插件
            this.initializePlugin().catch(err => {
                log.error('Failed to initialize plugin:', err);
            });
        }

        private async initializePlugin(): Promise<void> {
            try {
                // 创建插件上下文
                const pluginContext = {
                    send: async (target: string | PID, type: string, payload: any): Promise<void> => {
                        let targetPid: PID;
                        if (typeof target === 'string') {
                            targetPid = { id: target };
                        } else {
                            targetPid = target;
                        }

                        await this.context.send(targetPid, {
                            type,
                            payload
                        });
                    },

                    registerHandler: (messageType: string, handler: (payload: any) => Promise<any>): void => {
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
                    },

                    getPluginId: (): string => this.plugin.metadata.id,

                    log
                };

                // 初始化插件
                await this.plugin.initialize(pluginContext, config);
            } catch (error) {
                log.error('Plugin initialization failed:', error);
                throw error;
            }
        }

        protected behaviors(): void {
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

        async postStop(): Promise<void> {
            try {
                await this.plugin.cleanup();
            } catch (error) {
                log.error('Plugin cleanup failed:', error);
            }
        }
    }

    // 使用工厂函数创建插件
    const plugin = pluginFactory(config);

    // 创建并返回适配器Actor
    return new PluginFactoryAdapterActor(context, plugin);
} 