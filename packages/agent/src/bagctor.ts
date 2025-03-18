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
import { z } from 'zod';
import { EventEmitter } from 'events';
import { MCPIntegrationManager, MCPIntegrationOptions } from './mcp';
import { MemoryManager, createMemoryManager, SharedMemoryContext } from './memory';
import { WorkflowGraph, createWorkflowGraph } from './workflow-state';
import { AgentNetworkManager, AgentTeamConfig } from './agent-network';

/**
 * Bagctor是一个分布式智能体系统，通过Actor模型扩展了Mastra的能力
 */
export class Bagctor extends EventEmitter {
    private agentsMap: Map<string, Agent> = new Map();
    private distributionConfig: BagctorConfig['distribution'];
    private nodes: Map<NodeIdentifier, DistributedNode> = new Map();
    private isDistributedMode: boolean = false;
    private mcpManager?: MCPIntegrationManager;
    private _memoryManager?: MemoryManager;
    private useWorkflowGraph: boolean = false;
    private agentNetworkManager?: AgentNetworkManager;

    /**
     * 创建一个新的Bagctor实例
     * @param config Bagctor实例的配置
     */
    constructor(config: BagctorConfig = {}) {
        super();
        this.distributionConfig = config.distribution || {};
        this.isDistributedMode = this.distributionConfig.clustered || false;

        // 处理agents
        if (config.agents) {
            if (Array.isArray(config.agents)) {
                // 处理agent数组
                config.agents.forEach(agent => {
                    if (agent.name) {
                        this.agentsMap.set(agent.name, agent);
                    } else {
                        throw new Error('Agent必须有name属性');
                    }
                });
            } else {
                // 处理agent对象映射
                Object.entries(config.agents).forEach(([name, agent]) => {
                    this.agentsMap.set(name, agent);
                });
            }
        }

        // 处理Mastra实例
        if (config.mastra) {
            if (Array.isArray(config.mastra)) {
                // 处理Mastra实例数组
                config.mastra.forEach(mastraInstance => {
                    // 使用getter方法或安全地获取agents
                    const mastraAgents = (mastraInstance as any).getAgents?.() || {};
                    Object.entries(mastraAgents).forEach(([name, agent]) => {
                        this.agentsMap.set(name, agent as Agent);
                    });
                });
            } else {
                // 处理单个Mastra实例
                // 使用getter方法或安全地获取agents
                const mastraAgents = (config.mastra as any).getAgents?.() || {};
                Object.entries(mastraAgents).forEach(([name, agent]) => {
                    this.agentsMap.set(name, agent as Agent);
                });
            }
        }

        // 初始化分布式环境
        if (this.isDistributedMode) {
            this.initializeDistributedEnvironment();
        }

        // 初始化 MCP 集成
        if (config.mcp) {
            this.initializeMCPIntegration(config.mcp);
        }

        // 初始化记忆管理系统
        if (config.memory?.enabled) {
            this._memoryManager = createMemoryManager({
                agents: Object.fromEntries(this.agentsMap),
                cacheSize: config.memory.cacheSize,
                storage: config.memory.customStorage
            });
            console.log('记忆管理系统已初始化');
        }

        // 设置工作流图系统启用状态
        this.useWorkflowGraph = !!config.workflow?.graphEnabled;
        if (this.useWorkflowGraph) {
            console.log('工作流图系统已启用');
        }
    }

    /**
     * 初始化 MCP 集成
     */
    private async initializeMCPIntegration(options: MCPIntegrationOptions): Promise<void> {
        try {
            this.mcpManager = new MCPIntegrationManager(options);
            await this.mcpManager.initialize();

            // 如果配置了自动发现工具，则为所有智能体注册 MCP 工具
            if (options.autoDiscoverTools) {
                for (const agent of Object.values(this.agentsMap)) {
                    await this.mcpManager.registerToolsToAgent(agent);
                }
            }

            console.log('MCP 集成初始化完成');
        } catch (error) {
            console.error('初始化 MCP 集成时出错:', error);
        }
    }

    /**
     * 初始化分布式环境
     * 设置当前节点并建立与其他节点的连接
     */
    private async initializeDistributedEnvironment() {
        // 确保distributionConfig存在
        if (!this.distributionConfig) {
            this.distributionConfig = {};
        }

        // 创建当前节点
        const currentNode: DistributedNode = {
            id: `node-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
            type: this.distributionConfig?.nodeType || 'primary',
            host: 'localhost',
            port: this.distributionConfig?.serverPort || 9000,
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
        if (currentNode.type === 'worker' && this.distributionConfig?.primaryHost) {
            await this.connectToPrimary(this.distributionConfig.primaryHost, this.distributionConfig?.primaryPort || 9000);
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
    get agents(): Record<string, Agent> {
        return Object.fromEntries(this.agentsMap);
    }

    /**
     * 获取分布式节点信息
     */
    get distributedNodes(): DistributedNode[] {
        return Array.from(this.nodes.values());
    }

    /**
     * 获取 MCP 管理器
     */
    get mcpIntegration(): MCPIntegrationManager | undefined {
        return this.mcpManager;
    }

    /**
     * 启用 MCP 支持
     * @param options MCP 集成选项
     */
    async enableMCP(options: MCPIntegrationOptions): Promise<void> {
        await this.initializeMCPIntegration(options);
    }

    /**
     * 为特定智能体注册 MCP 工具
     * @param agentId 智能体 ID
     * @param toolIds 要注册的工具 ID 列表，如果为空则注册所有可用工具
     */
    async registerMCPToolsToAgent(agentId: string, toolIds?: string[]): Promise<string[]> {
        if (!this.mcpManager) {
            throw new Error('MCP 集成未初始化');
        }

        const agent = this.agentsMap.get(agentId);
        if (!agent) {
            throw new Error(`找不到智能体: ${agentId}`);
        }

        if (toolIds && toolIds.length > 0) {
            const registeredTools: string[] = [];
            for (const toolId of toolIds) {
                const success = await this.mcpManager.registerSpecificToolToAgent(agent, toolId);
                if (success) {
                    registeredTools.push(toolId);
                }
            }
            return registeredTools;
        } else {
            return await this.mcpManager.registerToolsToAgent(agent);
        }
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
     * 获取记忆管理器
     */
    get memoryManager(): MemoryManager | undefined {
        return this._memoryManager;
    }

    /**
     * 启用记忆管理系统
     */
    enableMemorySystem(options: {
        cacheSize?: number;
        customStorage?: any;
    } = {}): MemoryManager {
        if (!this._memoryManager) {
            this._memoryManager = createMemoryManager({
                agents: Object.fromEntries(this.agentsMap),
                cacheSize: options.cacheSize,
                storage: options.customStorage
            });
            console.log('记忆管理系统已启用');
        }
        return this._memoryManager;
    }

    /**
     * 创建工作流，用于编排多个智能体
     * @param config 工作流配置
     */
    async createWorkflow(config: WorkflowConfig): Promise<Workflow> {
        // 验证智能体存在
        for (const step of config.steps) {
            if (!this.agentsMap.has(step.agent)) {
                throw new Error(`Agent ${step.agent} not found`);
            }
        }

        // 创建工作流实例
        const workflow = new Workflow(config, Object.fromEntries(this.agentsMap));

        // 如果启用了记忆系统，创建共享记忆上下文
        if (this.memoryManager) {
            await this.createSharedMemory(config.name);
        }

        return workflow;
    }

    /**
     * 创建智能体团队，用于协作
     * @param config 团队配置
     */
    async createTeam(config: TeamConfig) {
        if (this.isDistributedMode) {
            // 在分布式模式下使用DistributedAgentOrchestrator
            const strategy = config.orchestrationStrategy || 'sequential';
            const orchestrator = new DistributedAgentOrchestrator({
                agents: config.agents,
                strategy: strategy as 'hierarchical' | 'parallel' | 'sequential'
            });

            return {
                execute: async (input: string) => {
                    return await orchestrator.execute(input);
                }
            };
        } else {
            // 简单实现，运行第一个智能体
            const firstAgentName = config.agents[0];
            const agent = this.agentsMap.get(firstAgentName);
            if (!agent) {
                throw new Error(`智能体 ${firstAgentName} 不存在`);
            }

            return {
                execute: async (input: string) => {
                    const result = await agent.generate(input);
                    return result;
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
                strategy: config.orchestrationStrategy as 'hierarchical' | 'parallel' | 'sequential'
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
                    const results = await Promise.all(
                        config.agents.map(async agentName => {
                            const agent = this.agentsMap.get(agentName);
                            if (!agent) {
                                throw new Error(`智能体 ${agentName} 不存在`);
                            }
                            const result = await agent.generate(input);
                            return result.text;
                        })
                    );

                    return results.join('\n\n');
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
    async createSharedMemory(id: string): Promise<string | SharedMemoryContext> {
        // 如果启用了高级记忆管理系统，使用它
        if (this._memoryManager) {
            // 确保记忆管理器已初始化
            if (!this._memoryManager) {
                this._memoryManager = this.enableMemorySystem();
            }

            // 创建共享记忆上下文
            const sharedContext = new SharedMemoryContext(this._memoryManager, id);
            return sharedContext;
        }
        // 否则使用原有的分布式内存系统
        else {
            return await SharedAgentMemory.createWorkflowContext(id);
        }
    }

    /**
     * 启动Bagctor服务
     * @param config 服务配置
     */
    async serve(config: ServeConfig = {}) {
        const port = config.port || 4111;
        const enablePlayground = config.enablePlayground !== false;

        console.log(`Bagctor服务启动在端口 ${port}`);

        if (enablePlayground) {
            console.log('Playground可在 http://localhost:' + port + '/playground 访问');
        }

        // 实现服务启动逻辑

        return {
            port,
            stop: async () => {
                console.log('正在停止Bagctor服务...');
                // 实现服务停止逻辑
            }
        };
    }

    /**
     * 初始化智能体网络管理器
     */
    initAgentNetwork(): AgentNetworkManager {
        if (!this.agentNetworkManager) {
            const agentRegistry: Record<string, any> = {};

            // 将所有已注册的智能体添加到网络管理器的注册表中
            if (this.agents instanceof Map) {
                // 如果是Map类型
                for (const [name, agent] of this.agents.entries()) {
                    agentRegistry[name] = agent;
                }
            } else if (typeof this.agents === 'object') {
                // 如果是普通对象
                for (const [name, agent] of Object.entries(this.agents)) {
                    agentRegistry[name] = agent;
                }
            }

            this.agentNetworkManager = new AgentNetworkManager(agentRegistry);

            // 监听智能体网络事件
            this.agentNetworkManager.on('teamCreated', (data) => {
                this.emit('networkTeamCreated', data);
            });
            this.agentNetworkManager.on('teamRemoved', (data) => {
                this.emit('networkTeamRemoved', data);
            });
            this.agentNetworkManager.on('teamTaskStarted', (data) => {
                this.emit('networkTeamTaskStarted', data);
            });
            this.agentNetworkManager.on('teamTaskCompleted', (data) => {
                this.emit('networkTeamTaskCompleted', data);
            });
        }

        return this.agentNetworkManager;
    }

    /**
     * 创建智能体团队网络
     */
    async createNetwork(teams: AgentTeamConfig[]): Promise<AgentNetworkManager> {
        const network = this.initAgentNetwork();

        // 创建所有团队
        for (const teamConfig of teams) {
            await network.createTeam(teamConfig);
        }

        this.emit('networkInitialized', {
            teamCount: teams.length
        });

        return network;
    }
} 