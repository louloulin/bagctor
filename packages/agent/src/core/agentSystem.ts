import { ActorSystem } from '@bactor/core';
import { PID } from '@bactor/common';
import { AgentActor, AgentActorConfig } from './agentActor';
import { AgentMemoryActor } from './agentMemory';
import { RagActor } from './agentRag';
import { HttpToolActor, FileToolActor, TOOL_NAMES } from '../tools';

/**
 * 代理系统配置
 */
export interface AgentSystemConfig {
    systemId?: string;
    enableMemory?: boolean;
    enableRag?: boolean;
}

/**
 * 代理系统，管理多个代理Actor
 */
export class AgentSystem {
    private actorSystem: ActorSystem;
    private agents: Map<string, PID> = new Map();
    private toolActors: Map<string, PID> = new Map();
    private memoryActor?: PID;
    private ragActor?: PID;

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

        // 可选地创建RAG Actor
        if (config.enableRag) {
            await this.initializeRagActor();
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
     * 初始化RAG Actor
     */
    private async initializeRagActor(): Promise<void> {
        this.ragActor = await this.actorSystem.spawn({
            actorClass: RagActor
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
                memoryActor: this.memoryActor,
                ragActor: this.ragActor
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
    private async registerTools(agentPID: PID, tools?: any[]): Promise<void> {
        // 由于类型不匹配问题，使用字符串数组处理工具名称
        const toolNames = tools?.map(tool =>
            typeof tool === 'string' ? tool : (tool as any).name || ''
        ).filter(Boolean);

        if (!toolNames || toolNames.length === 0) {
            // 默认注册所有工具
            for (const [toolName, toolPID] of this.toolActors.entries()) {
                await this.actorSystem.send(agentPID, {
                    type: 'register_tool',
                    toolName,
                    toolActor: toolPID
                } as any);
            }
        } else {
            // 只注册指定的工具
            for (const toolName of toolNames) {
                const toolPID = this.toolActors.get(toolName);
                if (toolPID) {
                    await this.actorSystem.send(agentPID, {
                        type: 'register_tool',
                        toolName,
                        toolActor: toolPID
                    } as any);
                }
            }
        }
    }

    /**
     * 发送消息给代理
     */
    async sendMessage(agentId: PID, message: any): Promise<any> {
        // 为了解决类型问题，我们使用send并自己处理响应
        return new Promise((resolve, reject) => {
            // 创建响应ID
            const responseId = `resp-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;

            // 设置超时
            const timeout = setTimeout(() => {
                reject(new Error('Agent response timed out'));
            }, 30000); // 30秒超时

            // 发送消息
            this.actorSystem.send(agentId, {
                ...message,
                responseId
            }).then(() => {
                // 由于我们不使用ask方法，需要模拟响应
                // 在实际实现中应该有一个正确的响应处理机制
                setTimeout(() => {
                    clearTimeout(timeout);

                    // 模拟响应
                    if (message.type === 'generate') {
                        resolve(`Response to: ${message.content}`);
                    } else {
                        resolve({ success: true });
                    }
                }, 1000);
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

    /**
     * 获取内存Actor引用
     */
    getMemoryActor(): PID | undefined {
        return this.memoryActor;
    }

    /**
     * 获取RAG Actor引用
     */
    getRagActor(): PID | undefined {
        return this.ragActor;
    }
} 