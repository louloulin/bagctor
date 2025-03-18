/**
 * Mastra 兼容的 AgentNetwork 使用示例
 * 
 * 展示如何使用Bagctor实现的Mastra风格AgentNetwork
 */

import { Agent } from '@mastra/core/agent';
import { openai } from '@ai-sdk/openai';
import { AgentNetwork } from '../mastra-network';

/**
 * 创建研究与总结的智能体网络
 */
async function createResearchNetwork() {
    // 创建研究智能体
    const researchAgent = new Agent({
        name: "Research",
        instructions: "You search for and gather information on topics",
        model: openai("gpt-4o"),
    });

    // 创建总结智能体
    const summaryAgent = new Agent({
        name: "Summary",
        instructions: "You summarize information into concise points",
        model: openai("gpt-4o"),
    });

    // 创建智能体网络
    const researchNetwork = new AgentNetwork({
        name: "Research Assistant",
        instructions: "This network researches topics and provides summarized information.",
        agents: [researchAgent, summaryAgent],
        routingModel: openai("gpt-4o"),
    });

    // 监听网络事件
    researchNetwork.on('taskStarted', (data) => {
        console.log(`任务开始: ${data.taskId}`);
    });

    researchNetwork.on('taskCompleted', (data) => {
        console.log(`任务完成: ${data.taskId}`);
        console.log(`结果: ${JSON.stringify(data.result, null, 2)}`);
    });

    // 处理任务
    const result = await researchNetwork.process("Tell me about quantum computing advancements in 2025");

    console.log("网络处理结果:");
    console.log(result.result);
    console.log("\n贡献者:");
    for (const [agentId, contribution] of Object.entries(result.contributions)) {
        console.log(`${agentId}: ${(contribution as any).contribution}`);
    }

    // 获取网络状态
    const status = researchNetwork.getStatus();
    console.log(`\n网络状态: ${status.teams['Research Assistant'].status}`);

    // 添加新的智能体到网络
    const analysisAgent = new Agent({
        name: "Analysis",
        instructions: "You analyze information and identify patterns",
        model: openai("gpt-4o"),
    });

    researchNetwork.addAgent(analysisAgent);

    // 再次处理任务，现在有三个智能体参与
    const result2 = await researchNetwork.process(
        "Compare classical computing with quantum computing and provide an analysis"
    );

    console.log("\n使用三个智能体的结果:");
    console.log(result2.result);
}

// 执行示例
if (require.main === module) {
    createResearchNetwork()
        .then(() => console.log("Example completed"))
        .catch(error => console.error("Error in example:", error));
} 