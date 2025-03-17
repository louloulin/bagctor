import { Agent } from '@mastra/core/agent';
import { Mastra } from '@mastra/core';
import { BagctorConfig, ServeConfig, TeamConfig, WorkflowConfig, NodeIdentifier, DistributedNode } from './types';
import { Workflow } from './workflow';
import {
    DistributedAgentOrchestrator,
    AgentInteractionProtocol,
    SharedAgentMemory,
    DistributedErrorHandler
} from './distributed-interaction';

/**
 * Bagctor是一个分布式智能体系统，通过Actor模型扩展了Mastra的能力
 */
export class Bagctor {
    private agentsMap: Record<string, Agent> = {};
    private distributionConfig: BagctorConfig['distribution'];
    private nodes: Map<NodeIdentifier, DistributedNode> = new Map();
    private isDistributedMode: boolean = false;

    /**
     * 创建一个新的Bagctor实例
     * @param config Bagctor实例的配置
     */
    constructor(config: BagctorConfig = {}) {
        this.distributionConfig = config.distribution || {};
        this.isDistributedMode = this.distributionConfig.clustered || false;

        // 处理agents
        if (config.agents) {
            if (Array.isArray(config.agents)) {
                // 处理agent数组
                config.agents.forEach(agent => {
                    if (agent.name) {
                        this.agentsMap[agent.name] = agent;
                    } else {
                        throw new Error('Agent必须有name属性');
                    }
                });
            } else {
                // 处理agent对象映射
                this.agentsMap = { ...config.agents };
            }
        }

        // 处理Mastra实例
        if (config.mastra) {
            if (Array.isArray(config.mastra)) {
                // 处理Mastra实例数组
                config.mastra.forEach(mastraInstance => {
                    if (mastraInstance.agents) {
                        this.agentsMap = { ...this.agentsMap, ...mastraInstance.agents };
                    }
                });
            } else {
                // 处理单个Mastra实例
                if (config.mastra.agents) {
                    this.agentsMap = { ...this.agentsMap, ...config.mastra.agents };
                }
            }
        }

        // 初始化分布式环境
        if (this.isDistributedMode) {
            this.initializeDistributedEnvironment();
        }
    }

    /**
     * 初始化分布式环境
     * 设置当前节点并建立与其他节点的连接
     */
    private async initializeDistributedEnvironment() {
        // 创建当前节点
        const currentNode: DistributedNode = {
            id: `node-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
            type: this.distributionConfig.nodeType || 'primary',
            host: 'localhost',
            port: this.distributionConfig.serverPort || 9000,
            status: 'online',
            agents: Object.keys(this.agentsMap),
            resources: {
                cpu: 0,
                memory: 0,
                load: 0
            }
        };

        // 添加到节点列表
        this.nodes.set(currentNode.id, currentNode);

        // 如果是工作节点，连接到主节点
        if (currentNode.type === 'worker' && this.distributionConfig.primaryHost) {
            await this.connectToPrimary(this.distributionConfig.primaryHost, this.distributionConfig.primaryPort || 9000);
        }

        console.log(`分布式环境已初始化。节点ID: ${currentNode.id}, 类型: ${currentNode.type}`);
    }

    /**
     * 连接到主节点
     */
    private async connectToPrimary(host: string, port: number) {
        console.log(`正在连接到主节点: ${host}:${port}`);
        // 实现与主节点的连接逻辑
    }

    /**
     * 获取注册的智能体
     */
    get agents() {
        return this.agentsMap;
    }

    /**
     * 获取分布式节点信息
     */
    get distributedNodes() {
        return Array.from(this.nodes.values());
    }

    /**
     * 注册远程智能体
     * @param agentName 要注册的远程智能体名称
     */
    async registerRemoteAgent(agentName: string): Promise<Agent> {
        if (!this.isDistributedMode) {
            throw new Error('只有在分布式模式下才能注册远程智能体');
        }

        // 实现远程智能体注册逻辑
        return Promise.resolve({} as Agent);
    }

    /**
     * 创建工作流，用于编排多个智能体
     * @param config 工作流配置
     */
    async createWorkflow(config: WorkflowConfig) {
        // 在分布式模式下，检查节点分配
        if (this.isDistributedMode && config.nodeAssignment) {
            for (const [agentId, nodeId] of Object.entries(config.nodeAssignment)) {
                if (!this.nodes.has(nodeId)) {
                    console.warn(`警告: 节点 ${nodeId} 不存在，将使用默认节点`);
                }
            }
        }

        return new Workflow(config, this.agentsMap);
    }

    /**
     * 创建智能体团队，用于协作
     * @param config 团队配置
     */
    async createTeam(config: TeamConfig) {
        if (this.isDistributedMode) {
            // 在分布式模式下使用DistributedAgentOrchestrator
            const orchestrator = new DistributedAgentOrchestrator({
                agents: config.agents,
                strategy: config.orchestrationStrategy
            });

            return {
                execute: async (input: string) => {
                    return await orchestrator.execute(input);
                }
            };
        } else {
            // 简单实现，运行第一个智能体
            return {
                execute: async (input: string) => {
                    const firstAgentName = config.agents[0];
                    const agent = this.agentsMap[firstAgentName];
                    if (!agent) {
                        throw new Error(`智能体 ${firstAgentName} 不存在`);
                    }

                    return await agent.generate(input);
                }
            };
        }
    }

    /**
     * 创建智能体编排器，用于复杂的智能体协调
     * @param config 编排器配置
     */
    createOrchestrator(config: { agents: string[], orchestrationStrategy: string }) {
        if (this.isDistributedMode) {
            // 在分布式模式下使用分布式编排器
            const orchestrator = new DistributedAgentOrchestrator({
                agents: config.agents,
                strategy: config.orchestrationStrategy as any
            });

            return {
                execute: async (input: string) => {
                    return await orchestrator.execute(input);
                }
            };
        } else {
            // 简单的非分布式实现
            return {
                execute: async (input: string) => {
                    const result = await Promise.all(
                        config.agents.map(async agentName => {
                            const agent = this.agentsMap[agentName];
                            if (!agent) {
                                throw new Error(`智能体 ${agentName} 不存在`);
                            }
                            return await agent.generate(input);
                        })
                    );

                    return result.map(r => r.text).join('\n\n');
                }
            };
        }
    }

    /**
     * 直接发送消息到特定智能体
     * @param sourceAgentId 源智能体ID
     * @param targetAgentId 目标智能体ID
     * @param content 消息内容
     */
    async sendMessage(sourceAgentId: string, targetAgentId: string, content: string): Promise<string> {
        return await AgentInteractionProtocol.sendMessage(sourceAgentId, targetAgentId, content);
    }

    /**
     * 创建共享内存空间
     * @param id 内存空间ID
     */
    async createSharedMemory(id: string): Promise<string> {
        return await SharedAgentMemory.createWorkflowContext(id);
    }

    /**
     * 启动Bagctor服务
     * @param config 服务配置
     */
    async serve(config: ServeConfig) {
        const { port, enablePlayground = false } = config;

        console.log(`启动Bagctor服务，端口: ${port}...`);
        console.log(`Playground ${enablePlayground ? '已启用' : '已禁用'}`);

        // 实现启动服务的逻辑

        return {
            port,
            stop: async () => {
                console.log('正在停止Bagctor服务...');
                // 实现停止服务的逻辑
            }
        };
    }
} 