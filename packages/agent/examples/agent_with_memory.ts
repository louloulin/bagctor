import { createAgentSystem, AgentActorConfig, TOOL_NAMES } from '../src';

async function main() {
    // 创建一个代理系统，启用内存
    const agentSystem = createAgentSystem({
        systemId: 'example-system',
        enableMemory: true
    });

    console.log('Agent system created with memory enabled');

    // 创建一个助手代理，启用HTTP和文件工具
    const assistantConfig: AgentActorConfig = {
        name: 'ResearchAssistant',
        instructions: 'You are a helpful research assistant. You can search for information and process documents.',
        tools: [TOOL_NAMES.HTTP, TOOL_NAMES.FILE]
    };

    const assistantRef = await agentSystem.createAgent(assistantConfig);
    console.log(`Created research assistant agent with ID: ${assistantRef.id}`);

    // 创建一个专门的写作代理
    const writerConfig: AgentActorConfig = {
        name: 'ContentWriter',
        instructions: 'You are a content writer that creates well-structured documents based on research materials.',
        tools: [TOOL_NAMES.FILE]
    };

    const writerRef = await agentSystem.createAgent(writerConfig);
    console.log(`Created content writer agent with ID: ${writerRef.id}`);

    // 与研究助手交互，收集信息
    console.log('Asking research assistant to find information...');
    const researchResponse = await agentSystem.sendMessage(assistantRef, {
        type: 'generate',
        content: 'Please find information about the history of artificial intelligence.'
    });

    console.log('Research assistant response:');
    console.log(researchResponse);

    // 让内容写手基于研究创建内容
    console.log('Asking content writer to create a summary...');
    const writingResponse = await agentSystem.sendMessage(writerRef, {
        type: 'generate',
        content: `Based on this research information, create a short summary about AI history: ${researchResponse}`
    });

    console.log('Content writer response:');
    console.log(writingResponse);

    // 关闭系统
    console.log('Shutting down agent system...');
    await agentSystem.shutdown();
    console.log('Done');
}

// 运行示例
main().catch(error => {
    console.error('Error running example:', error);
    process.exit(1);
}); 