import { ActorSystem, PropsBuilder } from '@bactor/core';
import { PID } from '@bactor/common';
import { AgentActor, AgentActorConfig } from './agentActor';
import { AgentMemoryActor } from './agentMemory';
import { HttpToolActor, FileToolActor, TOOL_NAMES } from '../tools';

/**
 * 代理系统配置
 */
export interface AgentSystemConfig {
    systemId?: string;
    enableMemory?: boolean;
}

/**
 * 代理系统，管理多个代理Actor
 */
export class AgentSystem {
    private actorSystem: ActorSystem;
    private agents: Map<string, PID> = new Map();
    private toolActors: Map<string, PID> = new Map();
    private memoryActor?: PID;

    constructor(config: AgentSystemConfig = {}) {
        this.actorSystem = new ActorSystem(config.systemId || 'agent-system');

        // 初始化系统
        this.initialize(config);
    }

    /**
     * 初始化代理系统
     */
    private async initialize(config: AgentSystemConfig): Promise<void> {
        // 创建工具Actors
        await this.initializeToolActors();

        // 可选地创建内存Actor
        if (config.enableMemory !== false) {
            await this.initializeMemoryActor();
        }
    }

    /**
     * 初始化工具Actors
     */
    private async initializeToolActors(): Promise<void> {
        // 创建HTTP工具Actor
        const httpToolPID = await this.actorSystem.spawn({
            actorClass: HttpToolActor
        });
        this.toolActors.set(TOOL_NAMES.HTTP, httpToolPID);

        // 创建文件工具Actor
        const fileToolPID = await this.actorSystem.spawn({
            actorClass: FileToolActor
        });
        this.toolActors.set(TOOL_NAMES.FILE, fileToolPID);
    }

    /**
     * 初始化内存Actor
     */
    private async initializeMemoryActor(): Promise<void> {
        this.memoryActor = await this.actorSystem.spawn({
            actorClass: AgentMemoryActor
        });
    }

    /**
     * 创建一个代理
     */
    async createAgent(config: AgentActorConfig): Promise<PID> {
        const agentId = `agent-${config.name.toLowerCase().replace(/\s+/g, '-')}-${Date.now()}`;

        const props = {
            actorClass: AgentActor,
            actorContext: {
                name: config.name,
                instructions: config.instructions,
                tools: config.tools || [],
                memoryActor: this.memoryActor
            }
        };

        const agentPID = await this.actorSystem.spawn(props);

        // 注册工具
        await this.registerTools(agentPID, config.tools);

        // 存储代理引用
        this.agents.set(agentId, agentPID);

        return agentPID;
    }

    /**
     * 为代理注册工具
     */
    private async registerTools(agentPID: PID, tools?: string[]): Promise<void> {
        if (!tools || tools.length === 0) {
            // 默认注册所有工具
            for (const [toolName, toolPID] of this.toolActors.entries()) {
                await this.actorSystem.send(agentPID, {
                    type: 'register_tool',
                    toolName,
                    toolActor: toolPID
                });
            }
        } else {
            // 只注册指定的工具
            for (const toolName of tools) {
                const toolPID = this.toolActors.get(toolName);
                if (toolPID) {
                    await this.actorSystem.send(agentPID, {
                        type: 'register_tool',
                        toolName,
                        toolActor: toolPID
                    });
                }
            }
        }
    }

    /**
     * 发送消息给代理
     */
    async sendMessage(agentId: PID, message: any): Promise<any> {
        return new Promise((resolve, reject) => {
            // 创建响应ID
            const responseId = `resp-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;

            // 设置超时
            const timeout = setTimeout(() => {
                reject(new Error('Agent response timed out'));
            }, 30000); // 30秒超时

            // 发送消息
            this.actorSystem.ask(agentId, {
                ...message,
                responseId
            }).then(response => {
                clearTimeout(timeout);
                resolve(response);
            }).catch(error => {
                clearTimeout(timeout);
                reject(error);
            });
        });
    }

    /**
     * 关闭代理系统
     */
    async shutdown(): Promise<void> {
        return this.actorSystem.shutdown();
    }

    /**
     * 获取ActorSystem实例
     */
    getActorSystem(): ActorSystem {
        return this.actorSystem;
    }
} 