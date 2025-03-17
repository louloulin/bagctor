import { ActorSystem, PropsBuilder } from '@bactor/core';
import { PID, Message } from '@bactor/common';
import { AgentActor, AgentActorConfig, ResponseMessage } from './agentActor';

export interface AgentSystemConfig {
    systemId?: string;
    host?: string;
    port?: number;
}

/**
 * AgentSystem负责管理多个智能代理Actor，提供创建、发送消息和协调的功能
 */
export class AgentSystem {
    private actorSystem: ActorSystem;
    private messageHandlers: Map<string, (response: any) => void> = new Map();

    /**
     * 创建一个新的AgentSystem
     * @param config 系统配置
     */
    constructor(config: AgentSystemConfig = {}) {
        this.actorSystem = new ActorSystem(config.systemId || 'agent-system', undefined, {
            useMessagePipeline: true,
            enableMessageLogging: true,
            logLevel: 'debug'
        });

        // 注册系统级消息处理器
        this.setupMessageHandlers();
    }

    /**
     * 设置消息处理机制，用于接收Actor的响应
     */
    private setupMessageHandlers(): void {
        // 注册一个全局消息处理器，用于接收所有Actor发送的响应
        const messageHandler = async (message: Message): Promise<void> => {
            // 检查消息是否含有响应ID
            if (message && 'responseId' in message) {
                const responseId = (message as any).responseId;
                const handler = this.messageHandlers.get(responseId);
                if (handler) {
                    // 调用处理器处理响应
                    handler(message);
                }
            }
        };

        // 注册处理器到ActorSystem
        // 注意：这里假设ActorSystem有一个addMessageHandler方法
        // 如果没有，需要实现其他机制来接收响应
        if (typeof this.actorSystem['addMessageHandler'] === 'function') {
            this.actorSystem['addMessageHandler'](messageHandler);
        }
    }

    /**
     * 创建一个新的AgentActor
     * @param config 代理配置
     * @param name 可选的Actor名称
     * @returns 创建的代理Actor的PID
     */
    async createAgent(config: AgentActorConfig, name?: string): Promise<PID> {
        const actorName = name || `agent-${config.name.toLowerCase().replace(/\s+/g, '-')}`;

        // 使用PropsBuilder创建Props
        const props = new PropsBuilder()
            .withActorClass(AgentActor)
            .withContext({
                name: config.name,
                instructions: config.instructions,
                tools: new Map()
            })
            .build();

        // 使用spawn创建Actor - 只使用一个参数
        const agentRef = await this.actorSystem.spawn(props);

        return agentRef;
    }

    /**
     * 向特定代理发送消息
     * @param agentId 代理Actor的PID
     * @param message 要发送的消息
     * @returns 代理响应的Promise
     */
    async sendMessage(agentId: PID, message: any): Promise<any> {
        return new Promise((resolve, reject) => {
            const responseId = Math.random().toString(36).substring(2, 15);

            // 设置一个临时处理器来接收响应
            const handler = (response: any) => {
                if (response.responseId === responseId) {
                    // 清理处理器
                    this.messageHandlers.delete(responseId);

                    if (response.type === 'error') {
                        reject(new Error(response.error));
                    } else {
                        resolve(response.payload);
                    }
                }
            };

            this.messageHandlers.set(responseId, handler);

            // 设置超时
            const timeout = setTimeout(() => {
                this.messageHandlers.delete(responseId);
                reject(new Error('Request timed out after 30 seconds'));
            }, 30000);

            // 发送消息 - 这是void返回类型
            try {
                // 添加响应ID和发送方信息到消息中
                this.actorSystem.send(agentId, {
                    ...message,
                    responseId,
                    timestamp: Date.now()
                });
            } catch (error) {
                clearTimeout(timeout);
                this.messageHandlers.delete(responseId);
                reject(error);
            }
        });
    }

    /**
     * 关闭代理系统及其所有Actors
     */
    async shutdown(): Promise<void> {
        await this.actorSystem.shutdown();
    }
} 