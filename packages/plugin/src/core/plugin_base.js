"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PluginBase = void 0;
exports.createPluginContext = createPluginContext;
exports.createPluginActor = createPluginActor;
const core_1 = require("@bactor/core");
// 插件基类 - 简化插件实现
class PluginBase {
    constructor() {
        this.handlers = new Map();
    }
    async initialize(context, config) {
        this.context = context;
        this.config = config;
        // 注册插件声明的能力
        this.registerCapabilities();
        // 允许子类执行额外的初始化
        await this.onInitialize();
    }
    // 子类可以覆盖这个方法执行额外的初始化
    async onInitialize() {
        // 默认实现为空
    }
    // 注册插件声明的所有能力
    registerCapabilities() {
        for (const capability of this.metadata.capabilities) {
            // 查找处理此能力的方法
            const handlerName = `handle${this.capitalizeFirstLetter(capability.split('.').pop() || '')}`;
            const handler = this[handlerName];
            if (typeof handler === 'function') {
                this.registerHandler(capability, handler.bind(this));
            }
            else {
                this.context.log.warn(`No handler found for capability: ${capability}`);
            }
        }
    }
    // 注册消息处理器
    registerHandler(messageType, handler) {
        this.handlers.set(messageType, handler);
        this.context.registerHandler(messageType, async (payload) => {
            return await this.handleMessage(messageType, payload);
        });
    }
    // 处理收到的消息
    async handleMessage(type, payload) {
        const handler = this.handlers.get(type);
        if (handler) {
            return await handler(payload);
        }
        throw new Error(`No handler registered for message type: ${type}`);
    }
    // 清理资源
    async cleanup() {
        // 允许子类执行额外的清理
        await this.onCleanup();
    }
    // 子类可以覆盖这个方法执行额外的清理
    async onCleanup() {
        // 默认实现为空
    }
    // 辅助方法：将字符串首字母大写
    capitalizeFirstLetter(string) {
        return string.charAt(0).toUpperCase() + string.slice(1);
    }
}
exports.PluginBase = PluginBase;
// 创建与Actor系统兼容的插件上下文
function createPluginContext(actor, actorContext, pluginId) {
    return {
        send: async (target, type, payload) => {
            let targetPid;
            if (typeof target === 'string') {
                targetPid = { id: target };
            }
            else {
                targetPid = target;
            }
            await actorContext.send(targetPid, {
                type,
                payload
            });
        },
        registerHandler: (messageType, handler) => {
            // 由于addBehavior是受保护的，我们将此操作推迟到PluginAdapterActor中处理
            // 暂时存储处理器，稍后在适配器中注册
            actor.__pendingHandlers = actor.__pendingHandlers || {};
            actor.__pendingHandlers[messageType] = handler;
        },
        getPluginId: () => pluginId,
        log: core_1.log
    };
}
// 适配器函数 - 将新的插件接口适配到现有的Actor系统
function createPluginActor(Plugin, context, config) {
    // 创建插件适配器Actor
    class PluginAdapterActor extends core_1.Actor {
        constructor(context, plugin) {
            super(context);
            this.__pendingHandlers = {};
            this.plugin = plugin;
        }
        behaviors() {
            // 注册所有待处理的消息处理器
            if (this.__pendingHandlers) {
                for (const [messageType, handler] of Object.entries(this.__pendingHandlers)) {
                    this.registerPluginHandler(messageType, handler);
                }
            }
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
        // 注册插件消息处理器
        registerPluginHandler(messageType, handler) {
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
        }
        async preStart() {
            const pluginContext = createPluginContext(this, this.context, 'plugin-' + Date.now());
            await this.plugin.initialize(pluginContext, config);
        }
        async postStop() {
            await this.plugin.cleanup();
        }
    }
    // 创建插件实例
    const plugin = new Plugin();
    // 创建并返回适配器Actor
    return Promise.resolve(new PluginAdapterActor(context, plugin));
}
