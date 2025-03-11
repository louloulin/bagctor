/**
 * LLM 服务示例 - 使用不同的 LLM 提供商和自定义 URL
 */
import { createLLMService, ChatMessage, LLMServiceConfig, LLMProvider } from '../llm';

/**
 * 使用默认 Qwen 提供商
 */
async function testDefaultQwen(): Promise<void> {
    console.log('--- 测试默认 Qwen 提供商 ---');

    // 创建 LLM 服务配置
    const config: LLMServiceConfig = {
        defaultProvider: 'qwen',
        defaultModel: 'qwen-plus',
        defaultTemperature: 0.7,
        customEndpoints: {}
    };

    // 使用环境变量中的 API 密钥
    // 确保设置了 DASHSCOPE_API_KEY 环境变量

    // 创建 LLM 服务
    const llmService = createLLMService(config);

    // 使用简单的单轮对话
    try {
        const prompt = '用中文回答：什么是 BActor？';
        console.log(`发送问题: ${prompt}`);

        const response = await llmService.complete(prompt);
        console.log(`收到回答: ${response}`);
    } catch (error: any) {
        console.error('调用失败:', error.message);
    }
}

/**
 * 使用自定义 URL 的 Qwen 提供商
 */
async function testCustomUrlQwen(): Promise<void> {
    console.log('\n--- 测试自定义 URL 的 Qwen 提供商 ---');

    // 创建 LLM 服务配置，使用自定义 URL
    const config: LLMServiceConfig = {
        defaultProvider: 'qwen',
        defaultModel: 'qwen-plus',
        defaultTemperature: 0.7,
        customEndpoints: {
            qwen: 'https://your-custom-qwen-endpoint.com/v1'
        },
        apiKeys: {
            qwen: process.env.CUSTOM_QWEN_API_KEY || '',
            openai: '',
            custom: ''
        }
    };

    // 创建 LLM 服务
    const llmService = createLLMService(config);

    // 使用多轮对话
    try {
        const messages: ChatMessage[] = [
            { role: 'system', content: '你是一个有帮助的助手。' },
            { role: 'user', content: '你能用中文简单介绍一下 TypeScript 吗？' }
        ];

        console.log('发送多轮对话...');
        console.log(messages.map(m => `${m.role}: ${m.content}`).join('\n'));

        const response = await llmService.chat(messages);
        console.log(`\n收到回答: ${response.content}`);

        if (response.usage) {
            console.log(`\n使用统计：提示词 ${response.usage.promptTokens} 令牌，完成 ${response.usage.completionTokens} 令牌，总计 ${response.usage.totalTokens} 令牌`);
        }
    } catch (error: any) {
        console.error('调用失败:', error.message);
    }
}

/**
 * 使用流式输出
 */
async function testStreamingQwen(): Promise<void> {
    console.log('\n--- 测试流式输出 ---');

    // 创建 LLM 服务配置
    const config: LLMServiceConfig = {
        defaultProvider: 'qwen',
        defaultModel: 'qwen-plus',
        defaultTemperature: 0.7,
        customEndpoints: {}
    };

    // 创建 LLM 服务
    const llmService = createLLMService(config);

    // 使用流式输出
    try {
        const messages: ChatMessage[] = [
            { role: 'system', content: '你是一个有帮助的助手。' },
            { role: 'user', content: '写一个简短的关于人工智能的故事。' }
        ];

        console.log('发送流式请求...');
        console.log(messages.map(m => `${m.role}: ${m.content}`).join('\n'));

        console.log('\n收到流式回答:');
        let fullResponse = '';

        // 流式处理函数
        const streamHandler = (chunk: string) => {
            process.stdout.write(chunk);
            fullResponse += chunk;
        };

        await llmService.streamChat(messages, streamHandler);
        console.log('\n\n流式输出完成，总长度:', fullResponse.length, '字符');
    } catch (error: any) {
        console.error('调用失败:', error.message);
    }
}

/**
 * 主函数
 */
async function main() {
    console.log('=== BActor LLM 服务示例 ===\n');

    // 检查是否设置了必要的环境变量
    if (!process.env.DASHSCOPE_API_KEY) {
        console.error('错误: 未设置 DASHSCOPE_API_KEY 环境变量，请先设置此环境变量再运行示例。');
        process.exit(1);
    }

    // 测试默认 Qwen
    await testDefaultQwen();

    // 测试自定义 URL (注释掉，因为自定义 URL 可能不可用)
    // await testCustomUrlQwen();

    // 测试流式输出
    await testStreamingQwen();

    console.log('\n=== 示例结束 ===');
}

// 运行主函数
if (require.main === module) {
    main().catch(err => {
        console.error('示例执行错误:', err);
        process.exit(1);
    });
}

export { testDefaultQwen, testCustomUrlQwen, testStreamingQwen }; 