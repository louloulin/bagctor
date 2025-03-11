/**
 * Bactor Agent Actor Adapter
 * 
 * 这个文件实现了Mastra Agent到Bactor Actor系统的适配。
 * Agent被实现为Actor，可以通过消息传递与其他Agent通信。
 */

import { Agent, AgentConfig } from '../agent';
import { Tool } from '../tools';
import { Actor, PID, ActorSystem, Props, Message } from '@bactor/core';

// Create a mock Agent class if the real one is not available
class MockAgent {
    private config: any;

    constructor(config: any) {
        this.config = config;
    }

    async generate(content: string, options?: any): Promise<any> {
        return {
            text: `Mock response for: ${content}`,
            toolCalls: []
        };
    }

    async streamGenerate(content: string, options?: any): Promise<any> {
        if (options?.onChunk) {
            options.onChunk("Streaming ");
            options.onChunk("mock ");
            options.onChunk("response ");
            options.onChunk(`for: ${content}`);
        }

        if (options?.onFinish) {
            options.onFinish(`Complete mock response for: ${content}`);
        }

        return {
            text: `Complete mock response for: ${content}`,
            toolCalls: []
        };
    }
}

/**
 * Bactor Agent Actor配置
 */
export interface AgentActorConfig extends AgentConfig {
    // 额外的Bactor特定配置
    actorName?: string;
    supervision?: boolean;
    description?: string;
    systemPrompt?: string;
}

/**
 * Agent消息类型
 */
export enum AgentMessageType {
    TASK = 'TASK',
    GENERATE = 'GENERATE',
    STREAM_GENERATE = 'STREAM_GENERATE',
    RESULT = 'RESULT',
    ERROR = 'ERROR'
}

/**
 * Agent消息
 */
export interface AgentMessage {
    type: AgentMessageType;
    sender?: PID;
    [key: string]: any;
}

/**
 * 任务消息
 */
export interface TaskMessage extends AgentMessage {
    type: AgentMessageType.TASK;
    content: string;
    tools?: Record<string, Tool<string, any, any>>;
}

/**
 * 结果消息
 */
export interface ResultMessage extends AgentMessage {
    type: AgentMessageType.RESULT;
    content: string;
    toolCalls?: any[];
    success: boolean;
}

/**
 * AgentActor类
 * 
 * 将Mastra Agent包装为Bactor Actor，以便集成到Bactor Actor系统
 */
export class AgentActor extends Actor {
    private agent: any; // Use any type to avoid dependency on Mastra Agent
    private config: AgentActorConfig;

    constructor(context: any, config: AgentActorConfig) {
        super(context);
        this.config = config;

        // 创建底层的Mastra Agent
        this.agent = new MockAgent({
            name: this.config.name,
            description: this.config.description || '',
            model: this.config.model,
            tools: this.config.tools || {}, // Use empty object instead of array
            systemPrompt: this.config.systemPrompt || ''
        });
    }

    /**
     * 定义Actor行为
     */
    protected behaviors(): Record<string, (message: Message) => Promise<void>> {
        return {
            'default': async (message: Message) => this.handleMessage(message)
        };
    }

    /**
     * 处理消息
     */
    private async handleMessage(message: Message): Promise<void> {
        try {
            // Use payload for custom properties
            const { type, content, sender } = message;
            const actualContent = content || '';

            if (type === AgentMessageType.GENERATE) {
                const result = await this.generate(actualContent);

                if (sender) {
                    await this.send(sender, {
                        type: AgentMessageType.RESULT,
                        content: result.text,
                        payload: {
                            toolCalls: result.toolCalls,
                            success: true
                        }
                    });
                }
            } else if (type === AgentMessageType.STREAM_GENERATE) {
                // Handle stream generation
                // Implementation omitted for brevity
            } else {
                throw new Error(`Unknown message type: ${type}`);
            }
        } catch (error: any) {
            console.error('Error in AgentActor:', error);

            if (message.sender) {
                await this.send(message.sender, {
                    type: AgentMessageType.ERROR,
                    content: `Error: ${error.message}`,
                    payload: {
                        error: error.message,
                        success: false
                    }
                });
            }
        }
    }

    /**
     * 生成响应
     */
    private async generate(content: string): Promise<any> {
        return await this.agent.generate(content);
    }
}

/**
 * 创建AgentActor的工厂函数
 * 
 * @param system Actor系统
 * @param config Agent配置
 * @returns Actor的PID
 */
export async function createAgentActor(system: any, config: AgentActorConfig): Promise<any> {
    // 创建一个包装器类，用于传递配置
    class WrappedAgentActor extends AgentActor {
        constructor(context: any) {
            super(context, config);
        }
    }

    // 使用系统spawn方法创建Actor
    return await system.spawn({
        actorClass: WrappedAgentActor,
        actorContext: { config },
    });
}