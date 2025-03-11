"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createPluginActorFromClass = createPluginActorFromClass;
exports.createPluginActorFromFactory = createPluginActorFromFactory;
const core_1 = require("@bactor/core");
const plugin_base_1 = require("../core/plugin_base");
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
async function createPluginActorFromClass(context, pluginConstructor, config) {
    return await (0, plugin_base_1.createPluginActor)(pluginConstructor, context, config);
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
async function createPluginActorFromFactory(context, pluginFactory, config) {
    // 创建插件适配器Actor
    class PluginFactoryAdapterActor extends core_1.Actor {
        constructor(context, plugin) {
            super(context);
            this.plugin = plugin;
            // 初始化插件
            this.initializePlugin().catch(err => {
                core_1.log.error('Failed to initialize plugin:', err);
            });
        }
        async initializePlugin() {
            try {
                // 创建插件上下文
                const pluginContext = {
                    send: async (target, type, payload) => {
                        let targetPid;
                        if (typeof target === 'string') {
                            targetPid = { id: target };
                        }
                        else {
                            targetPid = target;
                        }
                        await this.context.send(targetPid, {
                            type,
                            payload
                        });
                    },
                    registerHandler: (messageType, handler) => {
                        this.addBehavior(messageType, async (message) => {
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
                            }
                            catch (error) {
                                core_1.log.error(`Error handling ${messageType}:`, error);
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
                    getPluginId: () => this.plugin.metadata.id,
                    log: core_1.log
                };
                // 初始化插件
                await this.plugin.initialize(pluginContext, config);
            }
            catch (error) {
                core_1.log.error('Plugin initialization failed:', error);
                throw error;
            }
        }
        behaviors() {
            // 默认行为处理未注册的消息
            this.addBehavior('default', async (message) => {
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
                }
                catch (error) {
                    core_1.log.error(`Error in plugin handling message ${message.type}:`, error);
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
        async postStop() {
            try {
                await this.plugin.cleanup();
            }
            catch (error) {
                core_1.log.error('Plugin cleanup failed:', error);
            }
        }
    }
    // 使用工厂函数创建插件
    const plugin = pluginFactory(config);
    // 创建并返回适配器Actor
    return new PluginFactoryAdapterActor(context, plugin);
}
