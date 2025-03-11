/**
 * LLM 集成测试
 */
import { test, expect, mock, beforeEach, afterEach, describe } from 'bun:test';
import {
    createLLMService,
    ChatMessage,
    LLMResponse,
    LLMServiceConfig,
    StreamHandler
} from '../llm';

// 模拟 'ai' 和 'qwen-ai-provider' 库
mock.module('ai', () => ({
    generateText: mock((options: any) => {
        // 根据不同的提示返回不同的响应
        const prompt = Array.isArray(options.messages)
            ? options.messages.map((m: any) => m.content).join(' ')
            : '';

        let responseText = 'Default mock response';

        if (prompt.includes('测试单轮对话')) {
            responseText = '这是单轮对话的响应';
        } else if (prompt.includes('测试多轮对话')) {
            responseText = '这是多轮对话的响应';
        } else if (prompt.includes('自定义配置')) {
            responseText = `使用模型: ${options.model}, 温度: ${options.temperature}`;
        }

        return Promise.resolve({
            text: responseText,
            usage: { promptTokens: 10, completionTokens: 20, totalTokens: 30 }
        });
    }),
    streamText: mock((options: any) => {
        const { onTextContent } = options;

        const prompt = Array.isArray(options.messages)
            ? options.messages.map((m: any) => m.content).join(' ')
            : '';

        // 模拟不同类型的流式响应
        if (prompt.includes('流式测试')) {
            setTimeout(() => onTextContent('这是'), 0);
            setTimeout(() => onTextContent('流式'), 10);
            setTimeout(() => onTextContent('响应'), 20);
        } else {
            setTimeout(() => onTextContent('默认'), 0);
            setTimeout(() => onTextContent('流式'), 10);
            setTimeout(() => onTextContent('响应'), 20);
        }

        return Promise.resolve();
    })
}));

mock.module('qwen-ai-provider', () => ({
    createQwen: mock(() => ({
        // 返回一个模拟的 Qwen 提供商实例
    }))
}));

describe('LLM 集成测试', () => {
    // 在每个测试前设置环境变量
    beforeEach(() => {
        process.env.DASHSCOPE_API_KEY = 'test-api-key';
    });

    // 在每个测试后清理环境变量
    afterEach(() => {
        delete process.env.DASHSCOPE_API_KEY;
    });

    test('单轮对话流程应工作正常', async () => {
        // 创建服务
        const config: LLMServiceConfig = {
            defaultProvider: 'qwen',
            defaultModel: 'qwen-plus',
            defaultTemperature: 0.7,
            customEndpoints: {},
            apiKeys: {
                qwen: 'test-api-key',
                openai: '',
                custom: ''
            }
        };

        const service = createLLMService(config);

        // 执行单轮对话
        const prompt = '测试单轮对话';
        const response = await service.complete(prompt);

        expect(response).toBe('这是单轮对话的响应');
    });

    test('多轮对话流程应工作正常', async () => {
        // 创建服务
        const config: LLMServiceConfig = {
            defaultProvider: 'qwen',
            defaultModel: 'qwen-plus',
            defaultTemperature: 0.7,
            customEndpoints: {},
            apiKeys: {
                qwen: 'test-api-key',
                openai: '',
                custom: ''
            }
        };

        const service = createLLMService(config);

        // 创建多轮对话消息
        const messages: ChatMessage[] = [
            { role: 'system', content: '你是一个助手' },
            { role: 'user', content: '测试多轮对话' }
        ];

        // 执行多轮对话
        const response = await service.chat(messages);

        expect(response.content).toBe('这是多轮对话的响应');
        expect(response.usage).toBeDefined();
        expect(response.usage?.totalTokens).toBe(30);
    });

    test('流式对话流程应工作正常', async () => {
        // 创建服务
        const config: LLMServiceConfig = {
            defaultProvider: 'qwen',
            defaultModel: 'qwen-plus',
            defaultTemperature: 0.7,
            customEndpoints: {},
            apiKeys: {
                qwen: 'test-api-key',
                openai: '',
                custom: ''
            }
        };

        const service = createLLMService(config);

        // 创建流式对话消息
        const messages: ChatMessage[] = [
            { role: 'user', content: '流式测试' }
        ];

        // 收集流式响应
        const receivedChunks: string[] = [];
        const handler: StreamHandler = (chunk: string) => {
            receivedChunks.push(chunk);
        };

        // 执行流式对话
        await service.streamChat(messages, handler);

        // 验证结果
        expect(receivedChunks).toHaveLength(3);
        expect(receivedChunks.join('')).toBe('这是流式响应');
    });

    test('自定义配置应正确应用', async () => {
        // 创建服务
        const config: LLMServiceConfig = {
            defaultProvider: 'qwen',
            defaultModel: 'qwen-plus',
            defaultTemperature: 0.7,
            customEndpoints: {},
            apiKeys: {
                qwen: 'test-api-key',
                openai: '',
                custom: ''
            }
        };

        const service = createLLMService(config);

        // 创建临时自定义配置
        const customService = service.withConfig({
            model: 'qwen-max',
            temperature: 0.9
        });

        // 使用自定义配置执行对话
        const messages: ChatMessage[] = [
            { role: 'user', content: '自定义配置测试' }
        ];

        const response = await customService.chat(messages);

        // 验证自定义配置是否生效
        expect(response.content).toContain('使用模型: qwen-max');
        expect(response.content).toContain('温度: 0.9');
    });

    test('综合测试各种调用方式', async () => {
        // 创建服务
        const config: LLMServiceConfig = {
            defaultProvider: 'qwen',
            defaultModel: 'qwen-plus',
            defaultTemperature: 0.7,
            customEndpoints: {},
            apiKeys: {
                qwen: 'test-api-key',
                openai: '',
                custom: ''
            }
        };

        const service = createLLMService(config);

        // 测试单轮对话
        const prompt = '测试单轮对话';
        const textResponse = await service.complete(prompt);
        expect(textResponse).toBe('这是单轮对话的响应');

        // 测试多轮对话
        const messages: ChatMessage[] = [
            { role: 'system', content: '你是一个助手' },
            { role: 'user', content: '测试多轮对话' }
        ];
        const chatResponse = await service.chat(messages);
        expect(chatResponse.content).toBe('这是多轮对话的响应');

        // 测试流式对话
        const streamMessages: ChatMessage[] = [
            { role: 'user', content: '流式测试' }
        ];
        const receivedChunks: string[] = [];
        await service.streamChat(streamMessages, chunk => {
            receivedChunks.push(chunk);
        });
        expect(receivedChunks.join('')).toBe('这是流式响应');
    });
}); 