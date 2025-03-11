/**
 * Bactor Agent Actor Adapter
 * 
 * 这个文件实现了Mastra Agent到Bactor Actor系统的适配。
 * Agent被实现为Actor，可以通过消息传递与其他Agent通信。
 */

import { Agent, AgentConfig } from '../agent';
import { Tool } from '../tools';
import { Actor, PID, ActorSystem, Props, Message } from '@bactor/core';

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
 * Agent Actor消息类型
 */
export enum AgentMessageType {
    TASK = 'TASK',
    RESULT = 'RESULT',
    FEEDBACK = 'FEEDBACK',
    COORDINATION = 'COORDINATION'
}

/**
 * 基础Agent消息接口
 */
export interface AgentMessage {
    type: AgentMessageType;
    id: string;
    timestamp: number;
}

/**
 * 任务消息
 */
export interface TaskMessage extends AgentMessage {
    type: AgentMessageType.TASK;
    content: string;
    tools?: Tool<string, any, any>[];
}

/**
 * 结果消息
 */
export interface ResultMessage extends AgentMessage {
    type: AgentMessageType.RESULT;
    content: string;
    taskId: string;
}

/**
 * AgentActor类
 * 
 * 将Mastra Agent包装为Bactor Actor，以便集成到Bactor Actor系统
 */
export class AgentActor extends Actor {
    private agent: Agent;
    private config: AgentActorConfig;

    constructor(props: any) {
        super(props);
        this.config = props.args;

        // 创建底层的Mastra Agent
        this.agent = new Agent({
            name: this.config.name,
            description: this.config.description || '',
            model: this.config.model,
            tools: this.config.tools || [],
            systemPrompt: this.config.systemPrompt || ''
        });
    }

    /**
     * 实现Actor的behaviors抽象方法
     */
    protected behaviors(): { [key: string]: (message: Message) => Promise<void> } {
        return {
            'default': (message: Message) => this.receive(message as AgentMessage, message.sender)
        };
    }

    /**
     * 处理接收到的消息
     */
    async receive(message: AgentMessage, sender?: PID): Promise<void> {
        try {
            switch (message.type) {
                case AgentMessageType.TASK:
                    await this.handleTaskMessage(message as TaskMessage, sender);
                    break;
                case AgentMessageType.FEEDBACK:
                    // 处理反馈消息
                    break;
                case AgentMessageType.COORDINATION:
                    // 处理协调消息
                    break;
                default:
                    console.warn(`Unknown message type: ${(message as any).type}`);
            }
        } catch (error) {
            if (this.config.supervision) {
                // 如果启用了监督，将错误发送给父Actor
                this.context.parent.tell({
                    type: 'ERROR',
                    error,
                    agentId: this.context.self.path,
                    messageId: message.id
                });
            } else {
                throw error;
            }
        }
    }

    /**
     * 处理任务消息
     */
    private async handleTaskMessage(message: TaskMessage, sender?: PID): Promise<void> {
        // 使用Mastra Agent执行任务
        const response = await this.agent.execute(message.content);

        // 向发送者返回结果
        if (sender) {
            sender.tell({
                type: AgentMessageType.RESULT,
                id: crypto.randomUUID(),
                timestamp: Date.now(),
                content: response,
                taskId: message.id
            } as ResultMessage);
        }
    }
}

/**
 * 创建AgentActor的工厂函数
 */
export function createAgentActor(
    system: ActorSystem,
    config: AgentActorConfig
): PID {
    return system.spawn(
        AgentActor,
        { args: config },
        config.actorName || `agent-${config.name.toLowerCase().replace(/\s+/g, '-')}`
    );
}