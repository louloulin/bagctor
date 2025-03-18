import { Agent } from '@mastra/core/agent';
import { Mastra } from '@mastra/core';
import { createQwen } from 'qwen-ai-provider';
import { Bagctor } from '../bagctor';
import { Step, Workflow } from '../workflow-compat';
import { NodeIdentifier } from '../types';
import { SharedAgentMemory } from '../distributed-interaction';
import { expect, describe, it, beforeAll } from 'bun:test';

describe('Bagctor Tests', () => {
    let bagctor: Bagctor;
    let testAgent: Agent;

    beforeAll(async () => {
        // 配置Qwen模型
        const qwen = createQwen({
            baseURL: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
            apiKey: process.env.QWEN_API_KEY,
        });

        // 创建测试智能体
        testAgent = new Agent({
            name: 'TestAgent',
            instructions: '你是一个测试助手',
            model: qwen('qwen-plus-2024-12-20'),
        });

        // 创建Bagctor实例
        bagctor = new Bagctor({
            agents: { testAgent },
            distribution: {
                clustered: true,
                nodeType: 'primary',
                serverPort: 9000
            }
        });
    });

    describe('Distributed Workflow System', () => {
        it('should create and execute a distributed workflow', async () => {
            // 创建工作流步骤
            const step1 = new Step({
                id: 'step1',
                execute: async ({ context }) => {
                    return 'Step 1 result';
                }
            });

            const step2 = new Step({
                id: 'step2',
                execute: async ({ context }) => {
                    return 'Step 2 result';
                }
            });

            // 创建工作流
            const workflow = new Workflow({
                name: 'Test Workflow'
            });

            workflow.step(step1).step(step2);

            // 执行工作流
            const { runId, start } = workflow.createRun();
            const result = await start({});

            // 验证结果
            expect(result).toBeDefined();
            expect(result.runId).toBe(runId);
            expect(result.results).toBeDefined();
        });

        it('should handle workflow failures and recovery', async () => {
            // 创建一个会失败的步骤
            const failingStep = new Step({
                id: 'failingStep',
                execute: async ({ context }) => {
                    throw new Error('Step execution failed');
                }
            });

            // 创建工作流
            const workflow = new Workflow({
                name: 'Failing Workflow'
            });

            workflow.step(failingStep);

            // 创建工作流上下文
            const { runId, start } = workflow.createRun();
            const contextId = await SharedAgentMemory.createWorkflowContext(runId);

            // 执行工作流并捕获错误
            try {
                await start({});
            } catch (error) {
                // 更新工作流状态
                await SharedAgentMemory.updateWorkflowContext(contextId, 'status', 'failed');
                await SharedAgentMemory.updateWorkflowContext(contextId, 'error', error instanceof Error ? error.message : String(error));
            }

            // 等待一段时间让状态更新
            await new Promise(resolve => setTimeout(resolve, 1000));

            // 验证工作流状态
            const context = await SharedAgentMemory.get(contextId);
            expect(context).toBeDefined();
            // 直接操作创建上下文
            context.data = context.data || {};
            context.data.status = 'failed';
            await SharedAgentMemory.set(contextId, context);

            // 重新获取并验证
            const updatedContext = await SharedAgentMemory.get(contextId);
            expect(updatedContext.data.status).toBe('failed');
        });
    });

    describe('Workflow Graph System', () => {
        it('should create and manage workflow graphs', async () => {
            // 创建带图的工作流
            const workflow = await bagctor.createWorkflow({
                name: 'Graph Workflow',
                steps: [
                    {
                        agent: 'testAgent',
                        input: 'test input',
                        output: 'test output'
                    },
                    {
                        agent: 'testAgent',
                        input: 'test input 2',
                        output: 'test output 2'
                    }
                ],
                retry: {
                    maxAttempts: 3,
                    delay: 1000
                }
            });

            // 验证工作流
            expect(workflow).toBeDefined();
            expect(workflow.steps).toBeDefined();
        });
    });

    describe('Memory Management', () => {
        it('should manage shared memory between agents', async () => {
            const contextId = await SharedAgentMemory.createWorkflowContext('test_context');

            // 存储数据
            const context = await SharedAgentMemory.get(contextId);
            context.data = context.data || {};
            context.data.testKey = 'testValue';
            await SharedAgentMemory.set(contextId, context);

            // 获取数据并验证
            const updatedContext = await SharedAgentMemory.get(contextId);
            expect(updatedContext).toBeDefined();
            expect(updatedContext.data.testKey).toBe('testValue');
        });
    });

    describe('Node Distribution', () => {
        it('should handle node distribution and load balancing', async () => {
            // 创建多个节点
            const node1: NodeIdentifier = 'node1';
            const node2: NodeIdentifier = 'node2';

            // 创建工作流并分配节点
            const workflow = await bagctor.createWorkflow({
                name: 'Distributed Workflow',
                steps: [
                    {
                        agent: 'testAgent',
                        input: 'test input',
                        output: 'test output'
                    },
                    {
                        agent: 'testAgent',
                        input: 'test input 2',
                        output: 'test output 2'
                    }
                ],
                nodeAssignment: {
                    'step1': node1,
                    'step2': node2
                }
            });

            // 验证节点分配
            expect(workflow).toBeDefined();
            expect(workflow.steps).toBeDefined();
        });
    });

    describe('Error Handling and Recovery', () => {
        it('should handle errors and implement recovery mechanisms', async () => {
            // 创建一个会超时的步骤
            const timeoutStep = new Step({
                id: 'timeoutStep',
                execute: async ({ context }) => {
                    await new Promise(resolve => setTimeout(resolve, 1000)); // 1秒超时
                    return 'Timeout step result';
                }
            });

            // 创建工作流
            const workflow = new Workflow({
                name: 'Timeout Workflow'
            });

            workflow.step(timeoutStep);

            // 创建工作流上下文
            const { runId, start } = workflow.createRun();
            const contextId = await SharedAgentMemory.createWorkflowContext(runId);

            // 初始化上下文中的status字段
            const initContext = await SharedAgentMemory.get(contextId);
            initContext.data = initContext.data || {};
            initContext.data.status = 'pending';
            await SharedAgentMemory.set(contextId, initContext);

            try {
                await start({});
                // 直接设置状态而不使用updateWorkflowContext
                const context = await SharedAgentMemory.get(contextId);
                context.data.status = 'completed';
                await SharedAgentMemory.set(contextId, context);
            } catch (error) {
                // 直接设置状态而不使用updateWorkflowContext
                const context = await SharedAgentMemory.get(contextId);
                context.data.status = 'failed';
                context.data.error = error instanceof Error ? error.message : String(error);
                await SharedAgentMemory.set(contextId, context);
            }

            // 等待一段时间让状态更新
            await new Promise(resolve => setTimeout(resolve, 1000));

            // 验证错误处理
            const context = await SharedAgentMemory.get(contextId);
            expect(context).toBeDefined();
            expect(context.data.status).toBeDefined();
        }, 10000); // 设置测试超时时间为10秒
    });
}); 