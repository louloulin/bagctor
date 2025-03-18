/**
 * Agent Network 测试
 * 
 * 测试智能体团队和网络功能
 */

import { Bagctor } from '../bagctor';
import { Agent } from '@mastra/core/agent';
import { expect, describe, it, vi, beforeEach, afterEach } from 'vitest';
import { SharedAgentMemory } from '../distributed-interaction';
import { AgentTeam, AgentNetworkManager, TeamTask, AgentTeamConfig } from '../agent-network';

// Mock Agent
class MockAgent {
    private name: string;

    constructor(name: string) {
        this.name = name;
    }

    async generate(input: string) {
        return {
            text: `${this.name} processed: ${input}`
        };
    }
}

describe('Agent Network Tests', () => {
    let bagctor: Bagctor;
    let mockAgents: Record<string, any>;

    beforeEach(() => {
        // 创建模拟智能体
        mockAgents = {
            coordinator: new MockAgent('Coordinator'),
            specialist1: new MockAgent('Specialist1'),
            specialist2: new MockAgent('Specialist2'),
            observer: new MockAgent('Observer')
        };

        // 创建Bagctor实例
        bagctor = new Bagctor({
            agents: mockAgents,
            distribution: {
                clustered: false
            }
        });

        // Mock SharedAgentMemory
        vi.spyOn(SharedAgentMemory, 'createWorkflowContext').mockImplementation(async (id) => id);
        vi.spyOn(SharedAgentMemory, 'updateWorkflowContext').mockImplementation(async () => true);
    });

    afterEach(() => {
        vi.clearAllMocks();
    });

    it('应该创建智能体网络管理器', () => {
        const network = bagctor.initAgentNetwork();
        expect(network).toBeDefined();
        expect(network).toBeInstanceOf(AgentNetworkManager);
    });

    it('应该创建智能体团队', async () => {
        const network = bagctor.initAgentNetwork();

        const teamConfig: AgentTeamConfig = {
            name: 'TestTeam',
            agents: {
                coord: {
                    agent: 'coordinator',
                    role: 'coordinator'
                },
                spec1: {
                    agent: 'specialist1',
                    role: 'specialist',
                    tools: ['analysis']
                },
                spec2: {
                    agent: 'specialist2',
                    role: 'specialist',
                    tools: ['research']
                }
            },
            collaborationModel: 'hierarchical',
            communicationProtocol: 'direct'
        };

        const team = await network.createTeam(teamConfig);
        expect(team).toBeDefined();
        expect(team).toBeInstanceOf(AgentTeam);

        const status = team.getStatus();
        expect(status.name).toBe('TestTeam');
        expect(Object.keys(status.agents).length).toBe(3);
        expect(status.collaborationModel).toBe('hierarchical');
    });

    it('应该使用层次化模型执行团队任务', async () => {
        const network = bagctor.initAgentNetwork();

        const teamConfig: AgentTeamConfig = {
            name: 'HierarchicalTeam',
            agents: {
                coord: {
                    agent: 'coordinator',
                    role: 'coordinator'
                },
                spec1: {
                    agent: 'specialist1',
                    role: 'specialist'
                },
                spec2: {
                    agent: 'specialist2',
                    role: 'specialist'
                }
            },
            collaborationModel: 'hierarchical',
            communicationProtocol: 'direct'
        };

        const team = await network.createTeam(teamConfig);

        const task: TeamTask = {
            task: '分析市场数据并提供建议',
            parameters: {
                sector: 'technology'
            }
        };

        const result = await team.execute(task);

        expect(result).toBeDefined();
        expect(result.taskId).toBeDefined();
        expect(result.executionTime).toBeGreaterThan(0);
        expect(result.agentContributions).toBeDefined();
        expect(Object.keys(result.agentContributions).length).toBeGreaterThanOrEqual(2);
        expect(result.result).toContain('Coordinator');
    });

    it('应该使用对等模型执行团队任务', async () => {
        const network = bagctor.initAgentNetwork();

        const teamConfig: AgentTeamConfig = {
            name: 'PeerTeam',
            agents: {
                agent1: {
                    agent: 'specialist1',
                    role: 'specialist'
                },
                agent2: {
                    agent: 'specialist2',
                    role: 'specialist'
                }
            },
            collaborationModel: 'peer',
            communicationProtocol: 'direct'
        };

        const team = await network.createTeam(teamConfig);

        const task: TeamTask = {
            task: '生成产品描述',
            parameters: {
                product: 'smartphone'
            }
        };

        const result = await team.execute(task);

        expect(result).toBeDefined();
        expect(result.taskId).toBeDefined();
        expect(result.executionTime).toBeGreaterThan(0);
        expect(result.agentContributions).toBeDefined();
        expect(Object.keys(result.agentContributions).length).toBe(2);
    });

    it('应该连接多个团队并执行跨团队任务', async () => {
        const network = bagctor.initAgentNetwork();

        // 创建两个团队
        const team1Config: AgentTeamConfig = {
            name: 'ResearchTeam',
            agents: {
                leader: {
                    agent: 'coordinator',
                    role: 'coordinator'
                },
                researcher: {
                    agent: 'specialist1',
                    role: 'specialist'
                }
            },
            collaborationModel: 'hierarchical',
            communicationProtocol: 'direct'
        };

        const team2Config: AgentTeamConfig = {
            name: 'WritingTeam',
            agents: {
                editor: {
                    agent: 'coordinator',
                    role: 'coordinator'
                },
                writer: {
                    agent: 'specialist2',
                    role: 'specialist'
                }
            },
            collaborationModel: 'hierarchical',
            communicationProtocol: 'direct'
        };

        const team1 = await network.createTeam(team1Config);
        const team2 = await network.createTeam(team2Config);

        // 连接团队
        const connected = network.connectTeams('ResearchTeam', 'WritingTeam');
        expect(connected).toBe(true);

        // 执行跨团队任务
        const task: TeamTask = {
            task: '研究并撰写关于人工智能最新发展的文章',
            priority: 'high'
        };

        const result = await network.executeAcrossTeams('ResearchTeam', task);

        expect(result).toBeDefined();
        expect(result.result || result).toContain('Coordinator');

        // 检查网络状态
        const status = network.getNetworkStatus();
        expect(status.teams).toBeDefined();
        expect(Object.keys(status.teams).length).toBe(2);
        expect(status.connections).toBeDefined();
        expect(status.connections['ResearchTeam']).toContain('WritingTeam');
    });

    it('应该创建网络并通过Bagctor管理多个团队', async () => {
        // 创建多个团队配置
        const teams: AgentTeamConfig[] = [
            {
                name: 'AnalysisTeam',
                agents: {
                    leader: {
                        agent: 'coordinator',
                        role: 'coordinator'
                    },
                    analyst: {
                        agent: 'specialist1',
                        role: 'specialist'
                    }
                },
                collaborationModel: 'hierarchical',
                communicationProtocol: 'direct'
            },
            {
                name: 'ImplementationTeam',
                agents: {
                    manager: {
                        agent: 'coordinator',
                        role: 'coordinator'
                    },
                    implementer: {
                        agent: 'specialist2',
                        role: 'specialist'
                    }
                },
                collaborationModel: 'hierarchical',
                communicationProtocol: 'direct'
            }
        ];

        // 使用Bagctor创建网络
        const network = await bagctor.createNetwork(teams);

        expect(network).toBeDefined();
        expect(network).toBeInstanceOf(AgentNetworkManager);

        // 验证团队是否创建
        const status = network.getNetworkStatus();
        expect(Object.keys(status.teams).length).toBe(2);
        expect(status.teams['AnalysisTeam']).toBeDefined();
        expect(status.teams['ImplementationTeam']).toBeDefined();
    });
}); 