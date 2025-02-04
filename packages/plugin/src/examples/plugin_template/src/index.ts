import { Actor, ActorContext, Message, log } from '@bactor/core';

/**
 * 插件配置接口
 * 所有插件特定的配置选项都应该在这里定义
 */
interface PluginConfig {
    // 插件的基本配置
    name?: string;
    version?: string;
    description?: string;

    // 插件特定的配置选项
    defaultOption?: string;
    [key: string]: any;
}

/**
 * 插件响应接口
 * 定义了插件响应的标准格式
 */
interface PluginResponse<T = any> {
    success: boolean;
    data?: T;
    error?: string;
    timestamp: string;
}

/**
 * 基础插件类
 * 提供了插件的基本功能和生命周期管理
 */
class BasePlugin extends Actor {
    protected config: PluginConfig;
    private readonly pluginName: string;

    constructor(context: ActorContext, config: PluginConfig) {
        super(context);
        this.config = {
            name: 'template-plugin',
            version: '1.0.0',
            description: 'A template plugin for the Bactor system',
            defaultOption: 'default',
            ...config
        };
        this.pluginName = this.config.name || 'unknown';

        this.logInfo('Plugin created with config:', this.config);
    }

    protected behaviors(): void {
        // 注册默认行为处理器
        this.addBehavior('default', async (message: Message) => {
            this.logDebug('Received message:', {
                type: message.type,
                sender: message.sender?.id
            });

            try {
                switch (message.type) {
                    case 'plugin.action':
                        await this.handlePluginAction(message);
                        break;
                    case 'plugin.status':
                        await this.handleStatusRequest(message);
                        break;
                    case 'plugin.config':
                        await this.handleConfigUpdate(message);
                        break;
                    default:
                        await this.handleUnknownMessage(message);
                }
            } catch (error) {
                await this.handleError(message, error);
            }
        });

        this.logInfo('Plugin behaviors registered');
    }

    /**
     * 处理插件的主要动作
     * 子类应该重写这个方法来实现具体的业务逻辑
     */
    protected async handlePluginAction(message: Message): Promise<void> {
        const result = {
            option: this.config.defaultOption,
            ...message.payload
        };

        await this.sendResponse(message, {
            success: true,
            data: result,
            timestamp: new Date().toISOString()
        });
    }

    /**
     * 处理状态请求
     */
    protected async handleStatusRequest(message: Message): Promise<void> {
        await this.sendResponse(message, {
            success: true,
            data: {
                name: this.config.name,
                version: this.config.version,
                status: 'active',
                uptime: process.uptime()
            },
            timestamp: new Date().toISOString()
        });
    }

    /**
     * 处理配置更新
     */
    protected async handleConfigUpdate(message: Message): Promise<void> {
        const newConfig = message.payload;
        this.config = {
            ...this.config,
            ...newConfig
        };

        await this.sendResponse(message, {
            success: true,
            data: { config: this.config },
            timestamp: new Date().toISOString()
        });
    }

    /**
     * 处理未知消息类型
     */
    protected async handleUnknownMessage(message: Message): Promise<void> {
        this.logWarn('Received unknown message type:', message.type);
        await this.sendResponse(message, {
            success: false,
            error: `Unknown message type: ${message.type}`,
            timestamp: new Date().toISOString()
        });
    }

    /**
     * 统一的错误处理
     */
    protected async handleError(message: Message, error: unknown): Promise<void> {
        this.logError('Error handling message:', {
            type: message.type,
            error: error instanceof Error ? error.message : String(error)
        });

        await this.sendResponse(message, {
            success: false,
            error: error instanceof Error ? error.message : String(error),
            timestamp: new Date().toISOString()
        });
    }

    /**
     * 发送响应的统一方法
     */
    protected async sendResponse(message: Message, response: PluginResponse): Promise<void> {
        if (!message.sender) {
            this.logWarn('No sender to respond to');
            return;
        }

        this.logDebug('Sending response:', {
            to: message.sender.id,
            response
        });

        await this.context.send(message.sender, {
            type: `${message.type}.response`,
            payload: response
        });

        this.logDebug('Response sent successfully');
    }

    // 统一的日志方法
    protected logDebug(message: string, ...args: any[]): void {
        log.debug(`[${this.pluginName}] ${message}`, ...args);
    }

    protected logInfo(message: string, ...args: any[]): void {
        log.info(`[${this.pluginName}] ${message}`, ...args);
    }

    protected logWarn(message: string, ...args: any[]): void {
        log.warn(`[${this.pluginName}] ${message}`, ...args);
    }

    protected logError(message: string, ...args: any[]): void {
        log.error(`[${this.pluginName}] ${message}`, ...args);
    }
}

/**
 * 创建插件实例的工厂函数
 */
export async function createActor(context: ActorContext, config: PluginConfig): Promise<Actor> {
    return new BasePlugin(context, config);
} 