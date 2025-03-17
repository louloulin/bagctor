import { Agent } from '@mastra/core/agent';
import { createQwen } from 'qwen-ai-provider';
import { Bagctor } from '../bagctor';
import {
    AgentInteractionProtocol,
    SharedAgentMemory,
    DistributedAgentOrchestrator
} from '../distributed-interaction';
import { MessageType } from '../types';

/**
 * 分布式智能体交互示例
 * 
 * 这个示例展示了如何设置分布式智能体环境，并实现不同智能体之间的交互
 */

// 配置Qwen模型
const qwen = createQwen({
    baseURL: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    apiKey: 'sk-bc977c4e31e542f1a34159cb42478198',
});

// 创建研究智能体
const researchAgent = new Agent({
    name: 'researchAgent',
    instructions: '你是一个专注于研究和收集信息的智能体。你擅长深入分析主题并提供详细的研究结果。',
    model: qwen('qwen-plus-2024-12-20'),
});

// 创建写作智能体
const writingAgent = new Agent({
    name: 'writingAgent',
    instructions: '你是一个专注于内容创作的智能体。你擅长将研究结果转化为清晰、有吸引力的文章。',
    model: qwen('qwen-plus-2024-12-20'),
});

// 创建审核智能体
const reviewAgent = new Agent({
    name: 'reviewAgent',
    instructions: '你是一个专注于内容审核和优化的智能体。你擅长改进文章质量，纠正错误，并提高其专业性。',
    model: qwen('qwen-plus-2024-12-20'),
});

// 创建分布式Bagctor环境
const bagctor = new Bagctor({
    agents: { researchAgent, writingAgent, reviewAgent },
    distribution: {
        clustered: true,
        nodeType: 'primary',
        serverPort: 9000
    }
});

// 示例1: 基础消息传递
async function basicMessagingExample() {
    console.log('示例1: 基础消息传递');

    // 研究智能体向写作智能体发送消息
    const response = await AgentInteractionProtocol.sendMessage(
        'researchAgent',
        'writingAgent',
        '我已经完成了关于分布式系统的研究，请基于以下内容创建一篇文章: [研究内容]',
        MessageType.TASK
    );

    console.log('写作智能体的响应:', response);
}

// 示例2: 共享内存使用
async function sharedMemoryExample() {
    console.log('\n示例2: 共享内存使用');

    // 创建工作流上下文
    const contextId = await SharedAgentMemory.createWorkflowContext('article-creation');

    // 研究智能体将研究结果存入共享内存
    const researchResult = '分布式系统是一种可以在多台计算机上运行但却可以作为单个系统呈现给用户的软件系统。这些系统具有高可用性、可扩展性和容错能力...';
    await SharedAgentMemory.updateWorkflowContext(contextId, 'research', researchResult);

    // 写作智能体从共享内存中获取研究结果并创建文章
    const context = await SharedAgentMemory.get(contextId);
    const articleContent = `基于研究结果"${context.data.research}"创建的文章...`;
    await SharedAgentMemory.updateWorkflowContext(contextId, 'article', articleContent);

    // 审核智能体访问文章并提供反馈
    const updatedContext = await SharedAgentMemory.get(contextId);
    const feedback = `对文章"${updatedContext.data.article}"的审核意见...`;
    await SharedAgentMemory.updateWorkflowContext(contextId, 'feedback', feedback);

    // 输出完整上下文
    const finalContext = await SharedAgentMemory.get(contextId);
    console.log('工作流上下文:', finalContext.data);
}

// 示例3: 分布式编排
async function distributedOrchestratorExample() {
    console.log('\n示例3: 分布式编排');

    // 创建分布式编排器
    const orchestrator = new DistributedAgentOrchestrator({
        agents: ['researchAgent', 'writingAgent', 'reviewAgent'],
        strategy: 'sequential',
        nodeAssignment: {
            'researchAgent': 'node-1',
            'writingAgent': 'node-2',
            'reviewAgent': 'node-3'
        }
    });

    // 执行分布式协作任务
    const result = await orchestrator.execute('创建一篇关于分布式智能体系统的文章');

    console.log('分布式协作结果:', result);
}

// 示例4: 层次化协作
async function hierarchicalCollaborationExample() {
    console.log('\n示例4: 层次化协作');

    // 创建分布式编排器，使用层次化策略
    const orchestrator = new DistributedAgentOrchestrator({
        agents: ['reviewAgent', 'researchAgent', 'writingAgent'], // 审核智能体作为主智能体
        strategy: 'hierarchical'
    });

    // 执行层次化协作任务
    const result = await orchestrator.execute('分析分布式智能体系统的优势和挑战');

    console.log('层次化协作结果:', result);
}

// 运行所有示例
async function runAllExamples() {
    try {
        await basicMessagingExample();
        await sharedMemoryExample();
        await distributedOrchestratorExample();
        await hierarchicalCollaborationExample();
    } catch (error) {
        console.error('运行示例时出错:', error);
    }
}

// 运行示例
runAllExamples(); 