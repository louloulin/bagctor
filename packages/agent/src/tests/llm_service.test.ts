/**
 * LLM 服务单元测试
 */
import { test, expect, mock, beforeEach, afterEach, describe } from 'bun:test';
import {
    createLLMService,
    createDefaultLLMService,
    BActorLLMService,
    LLMServiceConfig,
    ChatMessage,
    LLMResponse,
    StreamHandler
} from '../llm';

// 模拟 'ai' 和 'qwen-ai-provider' 库
mock.module('ai', () => ({
    generateText: mock(() => Promise.resolve({
        text: 'Mocked response',
        usage: { promptTokens: 10, completionTokens: 20, totalTokens: 30 }
    })),
    streamText: mock((options: any) => {
        const { onTextContent } = options;
        // 模拟流式响应
        setTimeout(() => onTextContent('Mocked'), 0);
        setTimeout(() => onTextContent(' stream'), 10);
        setTimeout(() => onTextContent(' response'), 20);
        return Promise.resolve();
    })
}));

mock.module('qwen-ai-provider', () => ({
    createQwen: mock(() => ({
        // 返回一个模拟的 Qwen 提供商实例
    }))
}));

describe('LLM 服务', () => {
    // 在每个测试前设置环境变量
    beforeEach(() => {
        process.env.DASHSCOPE_API_KEY = 'test-api-key';
    });

    // 在每个测试后清理环境变量
    afterEach(() => {
        delete process.env.DASHSCOPE_API_KEY;
        delete process.env.QWEN_BASE_URL;
    });

    test('创建默认 LLM 服务', () => {
        const service = createDefaultLLMService();
        expect(service).toBeInstanceOf(BActorLLMService);
    });

    test('使用自定义配置创建 LLM 服务', () => {
        const config: LLMServiceConfig = {
            defaultProvider: 'qwen',
            defaultModel: 'qwen-plus',
            defaultTemperature: 0.7,
            customEndpoints: {
                qwen: 'https://custom-endpoint.com/v1'
            },
            apiKeys: {
                qwen: 'custom-api-key',
                openai: '',
                custom: ''
            }
        };

        const service = createLLMService(config);
        expect(service).toBeInstanceOf(BActorLLMService);
    });

    test('complete 方法应返回文本响应', async () => {
        const service = createDefaultLLMService();

        const response = await service.complete('测试提示');
        expect(typeof response).toBe('string');
        expect(response).toBe('Mocked response');
    });

    test('chat 方法应返回完整的 LLM 响应对象', async () => {
        const service = createDefaultLLMService();

        const messages: ChatMessage[] = [
            { role: 'system', content: '你是一个助手' },
            { role: 'user', content: '你好' }
        ];

        const response = await service.chat(messages);
        expect(response).toHaveProperty('content');
        expect(response).toHaveProperty('usage');
        expect(response.content).toBe('Mocked response');
        expect(response.usage?.totalTokens).toBe(30);
    });

    test('streamChat 方法应正确地调用流处理器', async () => {
        const service = createDefaultLLMService();

        const messages: ChatMessage[] = [
            { role: 'user', content: '你好' }
        ];

        const receivedChunks: string[] = [];
        const handler: StreamHandler = (chunk: string) => {
            receivedChunks.push(chunk);
        };

        await service.streamChat(messages, handler);

        // 验证收到了所有预期的块
        expect(receivedChunks.join('')).toBe('Mocked stream response');
    });

    test('withConfig 方法应返回具有新配置的服务实例', () => {
        const service = createDefaultLLMService();
        const newService = service.withConfig({ model: 'qwen-max', temperature: 0.9 });

        expect(newService).toBeInstanceOf(BActorLLMService);
        expect(newService).not.toBe(service); // 应该是一个新实例
    });
}); 