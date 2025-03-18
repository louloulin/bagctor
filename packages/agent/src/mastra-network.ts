/**
 * Mastra 兼容的 AgentNetwork 实现
 * 
 * 提供与 Mastra 完全兼容的 AgentNetwork API，同时利用 Bagctor 的分布式能力
 */

import { Agent } from '@mastra/core/agent';
import { openai } from '@ai-sdk/openai';
import { EventEmitter } from 'events';
import { AgentNetworkManager, AgentTeamConfig } from './agent-network';
import { Bagctor } from './bagctor';

/**
 * Mastra 兼容的 AgentNetwork 配置
 */
export interface MastraAgentNetworkConfig {
    name: string;
    instructions: string;
    agents: Agent[];
    routingModel?: any; // 路由模型，通常是 LLM
}

/**
 * Mastra 兼容的 AgentNetwork 类
 * 
 * 使用 Bagctor 的 AgentNetworkManager 实现 Mastra 风格的 AgentNetwork API
 */
export class AgentNetwork extends EventEmitter {
    private name: string;
    private instructions: string;
    private agents: Agent[];
    private routingModel: any;
    private networkManager: AgentNetworkManager;
    private bagctor: Bagctor;

    /**
     * 创建 AgentNetwork 实例
     */
    constructor(config: MastraAgentNetworkConfig) {
        super();
        this.name = config.name;
        this.instructions = config.instructions;
        this.agents = config.agents;
        this.routingModel = config.routingModel;

        // 创建 Bagctor 实例
        this.bagctor = new Bagctor({
            distribution: {
                clustered: false // 默认非集群模式
            }
        });

        // 注册所有代理
        const agentsMap: Record<string, Agent> = {};
        this.agents.forEach(agent => {
            if (agent.name) {
                agentsMap[agent.name] = agent;
            }
        });

        // 初始化网络管理器
        this.networkManager = this.bagctor.initAgentNetwork();
        this.networkManager.updateAgentRegistry(agentsMap);

        // 创建默认团队
        this._createDefaultTeam();

        // 转发事件
        this._setupEventForwarding();
    }

    /**
     * 创建默认团队，将所有代理添加到一个团队中
     */
    private async _createDefaultTeam() {
        // 创建团队配置
        const teamConfig: AgentTeamConfig = {
            name: this.name,
            agents: {},
            collaborationModel: 'hierarchical', // 默认使用层次化模型
            communicationProtocol: 'direct'     // 默认使用直接通信协议
        };

        // 确保至少有一个协调者角色
        let hasCoordinator = false;

        // 将所有代理添加到团队配置中
        this.agents.forEach((agent, index) => {
            if (agent.name) {
                // 第一个代理设为协调者
                const role = index === 0 ? 'coordinator' : 'specialist';
                if (role === 'coordinator') hasCoordinator = true;

                teamConfig.agents[agent.name] = {
                    agent: agent.name,
                    role: role
                };
            }
        });

        // 如果没有协调者，确保添加一个
        if (!hasCoordinator && this.agents.length > 0 && this.agents[0].name) {
            teamConfig.agents[this.agents[0].name].role = 'coordinator';
        }

        // 创建团队
        await this.networkManager.createTeam(teamConfig);
    }

    /**
     * 设置事件转发
     */
    private _setupEventForwarding() {
        // 团队任务相关事件转发
        this.networkManager.on('teamTaskStarted', (data) => {
            this.emit('taskStarted', data);
        });

        this.networkManager.on('teamTaskCompleted', (data) => {
            this.emit('taskCompleted', data);
        });

        this.networkManager.on('teamTaskError', (data) => {
            this.emit('taskError', data);
        });
    }

    /**
     * 处理任务 - 从输入并获取结果
     * 
     * 这是 Mastra 风格的 API，内部使用 Bagctor 的团队任务执行机制
     */
    async process(input: string, options?: any): Promise<any> {
        // 获取默认团队
        const team = this.networkManager.getTeam(this.name);
        if (!team) {
            throw new Error(`团队 ${this.name} 不存在`);
        }

        // 准备任务
        const task = {
            task: input,
            parameters: options || {}
        };

        // 执行任务
        const result = await team.execute(task);
        return {
            result: result.result,
            contributions: result.agentContributions,
            executionTime: result.executionTime
        };
    }

    /**
     * 添加代理到网络中
     */
    addAgent(agent: Agent): void {
        if (!agent.name) {
            throw new Error('代理必须有名称');
        }

        // 添加到代理列表
        this.agents.push(agent);

        // 更新注册表
        const agentsMap: Record<string, Agent> = {};
        agentsMap[agent.name] = agent;
        this.networkManager.updateAgentRegistry(agentsMap);

        // 将代理添加到默认团队
        const team = this.networkManager.getTeam(this.name);
        if (team) {
            team.addMember(agent.name, {
                agent: agent.name,
                role: 'specialist'
            }, agent);
        }
    }

    /**
     * 获取网络状态
     */
    getStatus(): any {
        const networkStatus = this.networkManager.getNetworkStatus();

        // 添加agents属性，确保兼容性
        const agentsMap: Record<string, any> = {};
        this.agents.forEach(agent => {
            if (agent.name) {
                agentsMap[agent.name] = agent;
            }
        });

        return {
            ...networkStatus,
            agents: agentsMap
        };
    }
}

/**
 * 创建兼容 Mastra 的 AgentNetwork 工厂函数
 */
export function createMastraAgentNetwork(config: MastraAgentNetworkConfig): AgentNetwork {
    return new AgentNetwork(config);
} 