import { Agent } from '@mastra/core/agent';
import { Mastra } from '@mastra/core';
import { Bagctor } from '../bagctor';
import { z } from 'zod';
import { Step, Workflow } from '../workflow-compat';
import { MastraWorkflowAdapter, MastraInstanceAdapter } from '../mastra-adapters';
import { openai } from '@ai-sdk/openai';

/**
 * Mastra兼容的分布式工作流示例
 * 
 * 这个示例展示了如何在Bagctor中使用兼容Mastra API的分布式工作流
 */

// 创建智能体
const researchAgent = new Agent({
    name: 'researchAgent',
    instructions: '你是一个专注于研究和收集信息的智能体，擅长深入分析主题并提供详细结果。',
    model: openai('gpt-4o'),
});

const writingAgent = new Agent({
    name: 'writingAgent',
    instructions: '你是一个专注于内容创作的智能体，擅长将研究结果转化为清晰、有吸引力的文章。',
    model: openai('gpt-4o'),
});

const editingAgent = new Agent({
    name: 'editingAgent',
    instructions: '你是一个专注于内容审核和优化的智能体，擅长改进文章质量，纠正错误，并提高其专业性。',
    model: openai('gpt-4o'),
});

// 创建Bagctor实例
const bagctor = new Bagctor({
    agents: { researchAgent, writingAgent, editingAgent },
    distribution: {
        clustered: true,
        nodeType: 'primary',
        serverPort: 9000
    }
});

// 示例1: 使用Bagctor创建分布式Mastra兼容工作流
async function bagctorMastraWorkflowExample() {
    console.log('\n示例1: 使用Bagctor创建分布式Mastra兼容工作流');

    // 创建工作流适配器
    const workflowAdapter = new MastraWorkflowAdapter(
        bagctor.agents,
        // @ts-ignore - 从Bagctor获取节点信息
        bagctor.distributedNodes ? new Map(bagctor.distributedNodes.map(node => [node.id, node])) : new Map(),
        'local-node' // 默认节点ID
    );

    // 创建触发模式
    const triggerSchema = z.object({
        topic: z.string().describe('文章主题'),
    });

    // 创建兼容Mastra的工作流
    const contentWorkflow = workflowAdapter.createWorkflow({
        name: 'content-creation-workflow',
        triggerSchema,
        nodeAssignment: {
            researchStep: 'node-1',
            writingStep: 'node-2',
            editingStep: 'node-3'
        }
    });

    // 创建研究步骤
    const researchStep = workflowAdapter.createStep({
        id: 'researchStep',
        outputSchema: z.object({
            research: z.string()
        }),
        execute: async ({ context }) => {
            const topic = context.machineContext.triggerData?.topic || '分布式系统';
            const agent = context.agentsMap['researchAgent'];

            const result = await agent.generate(`请深入研究以下主题并提供详细信息: ${topic}`);
            return { research: result.text };
        }
    });

    // 创建写作步骤
    const writingStep = workflowAdapter.createStep({
        id: 'writingStep',
        outputSchema: z.object({
            article: z.string()
        }),
        execute: async ({ context }) => {
            const research = (context.machineContext.getStepPayload('researchStep') as any)?.research || '';
            const agent = context.agentsMap['writingAgent'];

            const result = await agent.generate(`根据以下研究内容创建一篇引人入胜的文章:\n\n${research}`);
            return { article: result.text };
        }
    });

    // 创建编辑步骤
    const editingStep = workflowAdapter.createStep({
        id: 'editingStep',
        outputSchema: z.object({
            finalArticle: z.string()
        }),
        execute: async ({ context }) => {
            const article = (context.machineContext.getStepPayload('writingStep') as any)?.article || '';
            const agent = context.agentsMap['editingAgent'];

            const result = await agent.generate(`请编辑和优化以下文章，提高其质量和专业性:\n\n${article}`);
            return { finalArticle: result.text };
        }
    });

    // 按顺序添加步骤并提交工作流
    contentWorkflow.step(researchStep).then(writingStep).then(editingStep).commit();

    // 创建运行实例
    const { runId, start } = contentWorkflow.createRun();

    // 执行工作流
    const results = await start({
        triggerData: { topic: '分布式智能体系统在企业应用中的优势' }
    });

    console.log('工作流执行完成，运行ID:', runId);
    console.log('最终文章:', results.results.editingStep?.finalArticle || '未找到结果');
}

// 示例2: 集成现有Mastra实例和工作流
async function integrateMastraWorkflowsExample() {
    console.log('\n示例2: 集成现有Mastra实例和工作流');

    // 创建Mastra实例和工作流
    const copywriterAgent = new Agent({
        name: 'copywriterAgent',
        instructions: '你是一个专业的文案撰写者，擅长创建吸引人的营销内容。',
        model: openai('gpt-4o-mini'),
    });

    const editorAgent = new Agent({
        name: 'editorAgent',
        instructions: '你是一个专业的编辑，擅长优化和完善内容。',
        model: openai('gpt-4o-mini'),
    });

    // 创建Mastra步骤
    const copywriterStep = new Step({
        id: 'copywriterStep',
        execute: async ({ context }) => {
            if (!context.machineContext?.triggerData?.topic) {
                throw new Error('主题不存在');
            }

            // 这里模拟调用copywriterAgent
            console.log('调用文案撰写者生成内容...');
            return {
                copy: `关于${context.machineContext.triggerData.topic}的初始文案...`
            };
        }
    });

    const editorStep = new Step({
        id: 'editorStep',
        execute: async ({ context }) => {
            const copy = context.machineContext.getStepPayload<{ copy: string }>('copywriterStep')?.copy;
            if (!copy) {
                throw new Error('未找到文案内容');
            }

            // 这里模拟调用editorAgent
            console.log('调用编辑优化内容...');
            return {
                copy: `优化后的${copy}`
            };
        }
    });

    // 创建Mastra工作流
    const myWorkflow = new Workflow({
        name: 'my-workflow',
        triggerSchema: z.object({
            topic: z.string(),
        })
    });

    // 配置步骤顺序
    myWorkflow.step(copywriterStep).then(editorStep).commit();

    // 创建Mastra实例
    const mastra = new Mastra({
        agents: { copywriterAgent, editorAgent },
        workflows: {
            myWorkflow: myWorkflow as any
        }
    });

    // 创建工作流适配器
    const workflowAdapter = new MastraWorkflowAdapter(
        { ...bagctor.agents, ...(mastra as any).getAgents?.() || {} },
        // @ts-ignore - 从Bagctor获取节点信息
        bagctor.distributedNodes ? new Map(bagctor.distributedNodes.map(node => [node.id, node])) : new Map(),
        'local-node'
    );

    // 创建Mastra实例适配器
    const mastraAdapter = new MastraInstanceAdapter(mastra, workflowAdapter);

    // 获取并适配Mastra工作流
    const adaptedWorkflows = mastraAdapter.adaptAllWorkflows();
    console.log('已适配的工作流:', Object.keys(adaptedWorkflows));

    // 执行Mastra工作流
    const result = await mastraAdapter.executeWorkflow('my-workflow', {
        triggerData: { topic: 'React框架' }
    });

    console.log('Mastra工作流执行结果:', result);
}

// 示例3: 分布式工作流的错误处理和恢复
async function distributedWorkflowErrorHandlingExample() {
    console.log('\n示例3: 分布式工作流的错误处理和恢复');

    // 创建工作流适配器
    const workflowAdapter = new MastraWorkflowAdapter(
        bagctor.agents,
        // @ts-ignore - 从Bagctor获取节点信息
        bagctor.distributedNodes ? new Map(bagctor.distributedNodes.map(node => [node.id, node])) : new Map(),
        'local-node'
    );

    // 创建一个可能失败的工作流
    const robustWorkflow = workflowAdapter.createWorkflow({
        name: 'robust-workflow',
        triggerSchema: z.object({
            input: z.string()
        })
    });

    // 创建可能失败的步骤
    const unreliableStep = workflowAdapter.createStep({
        id: 'unreliableStep',
        execute: async ({ context }) => {
            // 模拟随机失败
            if (Math.random() < 0.5) {
                throw new Error('步骤执行随机失败');
            }

            return { result: '步骤成功执行' };
        }
    });

    // 创建恢复步骤
    const recoveryStep = workflowAdapter.createStep({
        id: 'recoveryStep',
        execute: async ({ context }) => {
            try {
                const prevResult = context.machineContext.getStepPayload('unreliableStep') as any;
                return { finalResult: `恢复步骤处理结果: ${prevResult?.result || '无结果'}` };
            } catch (error) {
                // 前一步骤失败，执行恢复逻辑
                return { finalResult: '执行恢复逻辑，生成备用结果' };
            }
        }
    });

    // 按顺序添加步骤并提交工作流
    robustWorkflow.step(unreliableStep).then(recoveryStep).commit();

    // 创建运行实例
    const { runId, start } = robustWorkflow.createRun();

    // 执行工作流
    try {
        const results = await start({
            triggerData: { input: '测试输入' }
        });

        console.log('容错工作流执行完成，运行ID:', runId);
        console.log('最终结果:', results.results.recoveryStep?.finalResult || '未找到结果');
    } catch (error) {
        console.error('工作流执行失败:', error);
    }
}

// 运行所有示例
async function runAllExamples() {
    try {
        await bagctorMastraWorkflowExample();
        await integrateMastraWorkflowsExample();
        await distributedWorkflowErrorHandlingExample();
    } catch (error) {
        console.error('运行示例时出错:', error);
    }
}

// 运行示例
runAllExamples(); 