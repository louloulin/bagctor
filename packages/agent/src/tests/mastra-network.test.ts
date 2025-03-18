/**
 * Mastra 兼容的 AgentNetwork 测试
 * 
 * 验证 Mastra 风格的 AgentNetwork 实现与原始 API 的兼容性
 */

import { expect, describe, it, vi, beforeEach, afterEach } from 'vitest';
import { AgentNetwork, MastraAgentNetworkConfig } from '../mastra-network';
import { Agent } from '@mastra/core/agent';
import { SharedAgentMemory } from '../distributed-interaction';

// Mock Agent 类
class MockAgent {
    name: string;
    instructions: string;

    constructor(name: string, instructions: string) {
        this.name = name;
        this.instructions = instructions;
    }

    async generate(input: string) {
        return {
            text: `${this.name} processed: ${input}`
        };
    }
}

describe('Mastra AgentNetwork Tests', () => {
    let researchAgent: any;
    let summaryAgent: any;
    let network: AgentNetwork;

    beforeEach(() => {
        // 创建模拟智能体
        researchAgent = new MockAgent('Research', 'You search for and gather information on topics');
        summaryAgent = new MockAgent('Summary', 'You summarize information into concise points');

        // Mock SharedAgentMemory
        vi.spyOn(SharedAgentMemory, 'createWorkflowContext').mockImplementation(async (id) => id);
        vi.spyOn(SharedAgentMemory, 'updateWorkflowContext').mockImplementation(async () => true);

        // 创建网络
        network = new AgentNetwork({
            name: 'Research Assistant',
            instructions: 'This network researches topics and provides summarized information.',
            agents: [researchAgent, summaryAgent],
            routingModel: {} // 模拟路由模型
        });
    });

    afterEach(() => {
        vi.clearAllMocks();
    });

    it('应该创建 Mastra 风格的 AgentNetwork', () => {
        expect(network).toBeDefined();
        const status = network.getStatus();
        expect(status.teams['Research Assistant']).toBeDefined();
    });

    it('应该添加智能体到网络', () => {
        const analysisAgent = new MockAgent('Analysis', 'You analyze data and provide insights');
        network.addAgent(analysisAgent);

        const status = network.getStatus();
        expect(Object.keys(status.agents)).toContain('Analysis');
    });

    it('应该处理任务并返回结果', async () => {
        // Mock 执行次数跟踪
        let researchCalled = false;
        let summaryCalled = false;

        // 重写 generate 方法
        researchAgent.generate = async (input: string) => {
            researchCalled = true;
            return { text: `Research information about: ${input}` };
        };

        summaryAgent.generate = async (input: string) => {
            summaryCalled = true;
            return { text: `Summary of: ${input}` };
        };

        const result = await network.process('quantum computing');

        expect(result).toBeDefined();
        expect(result.result).toBeDefined();
        expect(result.executionTime).toBeGreaterThan(0);

        // 由于是层次化模型，我们期望至少有一个代理被调用
        expect(researchCalled || summaryCalled).toBe(true);
    });

    it('应该触发事件', (done) => {
        // 监听任务完成事件
        network.on('taskCompleted', (data) => {
            expect(data).toBeDefined();
            expect(data.teamId).toBe('Research Assistant');
            expect(data.taskId).toBeDefined();
            done();
        });

        // 触发任务处理
        network.process('event test topic');
    });
}); 