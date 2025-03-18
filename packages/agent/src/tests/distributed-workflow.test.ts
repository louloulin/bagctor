import { Agent } from '@mastra/core/agent';
import { createQwen } from 'qwen-ai-provider';
import { Bagctor } from '../bagctor';
import { DefaultWorkflowScheduler } from '../workflow-scheduler';
import { DistributedNode, NodeIdentifier } from '../types';
import { expect, describe, it, beforeAll } from 'bun:test';

describe('Distributed Workflow Tests', () => {
    let bagctor: Bagctor;
    let qwen: any;
    let nodes: Map<NodeIdentifier, DistributedNode>;
    let scheduler: DefaultWorkflowScheduler;

    beforeAll(() => {
        // 配置Qwen模型
        qwen = createQwen({
            baseURL: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
            apiKey: process.env.QWEN_API_KEY,
        });

        // 创建测试节点
        nodes = new Map();
        nodes.set('node1', {
            id: 'node1',
            type: 'primary',
            host: 'localhost',
            port: 9000,
            status: 'online',
            agents: ['researchAgent'],
            resources: { cpu: 0, memory: 0, load: 0 }
        });
        nodes.set('node2', {
            id: 'node2',
            type: 'worker',
            host: 'localhost',
            port: 9001,
            status: 'online',
            agents: ['writingAgent'],
            resources: { cpu: 0, memory: 0, load: 0 }
        });

        // 创建测试智能体
        const researchAgent = new Agent({
            name: 'researchAgent',
            instructions: '你是一个研究助手',
            model: qwen('qwen-plus-2024-12-20'),
        });

        const writingAgent = new Agent({
            name: 'writingAgent',
            instructions: '你是一个写作助手',
            model: qwen('qwen-plus-2024-12-20'),
        });

        // 创建调度器
        scheduler = new DefaultWorkflowScheduler(
            nodes,
            'node1',
            { researchAgent, writingAgent }
        );

        // 创建Bagctor实例
        bagctor = new Bagctor({
            agents: { researchAgent, writingAgent },
            distribution: {
                clustered: true,
                nodeType: 'primary',
                serverPort: 9000
            }
        });
    });

    it('should create and execute a distributed workflow', async () => {
        const workflow = await bagctor.createWorkflow({
            name: '文章创作流程',
            steps: [
                {
                    agent: 'researchAgent',
                    input: '收集关于分布式系统的信息',
                    output: 'research'
                },
                {
                    agent: 'writingAgent',
                    input: (context) => `根据以下研究创建文章: ${context.research}`,
                    output: 'article'
                }
            ],
            nodeAssignment: {
                'researchAgent': 'node1',
                'writingAgent': 'node2'
            }
        });

        expect(workflow).toBeDefined();

        const executionPlan = await scheduler.createExecutionPlan(workflow);
        expect(executionPlan.steps).toHaveLength(2);
        expect(executionPlan.steps[0].agent).toBe('researchAgent');
        expect(executionPlan.steps[1].agent).toBe('writingAgent');
    });

    it('should handle node failures and recovery', async () => {
        // 模拟节点故障
        nodes.get('node2')!.status = 'offline';

        const step = {
            agent: 'writingAgent',
            input: '写一篇文章',
            output: 'article'
        };

        // 获取替代节点
        const alternativeNode = await scheduler.getAlternativeNode(step);
        expect(alternativeNode).toBe('local');

        // 恢复节点
        nodes.get('node2')!.status = 'online';
    });

    it('should distribute load across nodes', async () => {
        // 设置节点负载
        nodes.get('node1')!.resources.load = 80;
        nodes.get('node2')!.resources.load = 20;

        const step = {
            agent: 'writingAgent',
            input: '写一篇文章',
            output: 'article'
        };

        // 获取执行节点
        const executionNode = await scheduler.getExecutionNode(step);
        expect(executionNode).toBe('node2');
    });
}); 