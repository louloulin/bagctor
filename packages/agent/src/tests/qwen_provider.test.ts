/**
 * Qwen 提供商集成测试
 */
import { test, expect, mock, beforeEach, afterEach, describe } from 'bun:test';
import { generateWithQwen, streamWithQwen, createQwenProvider, supportedQwenModels } from '../llm/providers/qwen';
import { ChatMessage, StreamHandler } from '../llm/types';

// 模拟依赖库
const mockGenerateText = mock((options: any) => Promise.resolve({
    text: 'Mocked Qwen response',
    usage: { promptTokens: 15, completionTokens: 25, totalTokens: 40 }
}));

const mockStreamText = mock((options: any) => {
    const { onTextContent } = options;
    // 模拟流式响应
    setTimeout(() => onTextContent('Mocked Qwen'), 0);
    setTimeout(() => onTextContent(' streaming'), 10);
    setTimeout(() => onTextContent(' response'), 20);
    return Promise.resolve();
});

// 模拟 'ai' 和 'qwen-ai-provider' 库
mock.module('ai', () => ({
    generateText: mockGenerateText,
    streamText: mockStreamText
}));

mock.module('qwen-ai-provider', () => ({
    createQwen: mock(() => ({
        // 返回一个模拟的 Qwen 提供商实例
    }))
}));

describe('Qwen 提供商', () => {
    // 在每个测试前设置环境变量
    beforeEach(() => {
        process.env.DASHSCOPE_API_KEY = 'test-qwen-api-key';
    });

    // 在每个测试后清理环境变量
    afterEach(() => {
        delete process.env.DASHSCOPE_API_KEY;
        delete process.env.QWEN_BASE_URL;
        mockGenerateText.mockClear();
        mockStreamText.mockClear();
    });

    test('支持的模型列表应包含所需模型', () => {
        expect(supportedQwenModels).toContain('qwen-plus');
        expect(supportedQwenModels).toContain('qwen-max');
    });

    test('createQwenProvider 应创建提供商实例', () => {
        const provider = createQwenProvider();
        expect(provider).toBeDefined();
    });

    test('createQwenProvider 应使用自定义配置', () => {
        const customConfig = {
            baseURL: 'https://custom-qwen-endpoint.com/v1',
            apiKey: 'custom-qwen-key'
        };

        const provider = createQwenProvider(customConfig);
        expect(provider).toBeDefined();
    });

    test('generateWithQwen 应返回 LLM 响应', async () => {
        const messages: ChatMessage[] = [
            { role: 'system', content: '你是一个助手' },
            { role: 'user', content: '你好' }
        ];

        const response = await generateWithQwen(messages);
        expect(response).toHaveProperty('content');
        expect(response).toHaveProperty('usage');
        expect(response.content).toBe('Mocked Qwen response');
        expect(response.usage?.totalTokens).toBe(40);

        // 验证 generateText 被调用
        expect(mockGenerateText).toHaveBeenCalled();
    });

    test('generateWithQwen 应支持自定义选项和配置', async () => {
        const messages: ChatMessage[] = [
            { role: 'user', content: '测试消息' }
        ];

        const options = {
            temperature: 0.8,
            maxTokens: 200
        };

        const config = {
            model: 'qwen-max',
            baseURL: 'https://custom-url.com/v1'
        };

        await generateWithQwen(messages, options, config);

        // 验证调用 generateText 时包含了自定义配置
        expect(mockGenerateText).toHaveBeenCalledWith(
            expect.objectContaining({
                temperature: 0.8,
                maxTokens: 200
            })
        );
    });

    test('streamWithQwen 应正确地调用流处理器', async () => {
        const messages: ChatMessage[] = [
            { role: 'user', content: '流式测试' }
        ];

        const receivedChunks: string[] = [];
        const handler: StreamHandler = (chunk: string) => {
            receivedChunks.push(chunk);
        };

        await streamWithQwen(messages, handler);

        // 验证收到了所有预期的块
        expect(receivedChunks.join('')).toBe('Mocked Qwen streaming response');

        // 验证 streamText 被调用
        expect(mockStreamText).toHaveBeenCalled();
    });

    test('streamWithQwen 应支持自定义选项和配置', async () => {
        const messages: ChatMessage[] = [
            { role: 'user', content: '流式测试' }
        ];

        const handler: StreamHandler = () => { };
        const options = {
            temperature: 0.5,
            maxTokens: 150
        };

        const config = {
            model: 'qwen-plus',
            baseURL: 'https://custom-stream-url.com/v1'
        };

        await streamWithQwen(messages, handler, options, config);

        // 验证调用 streamText 时包含了自定义配置
        expect(mockStreamText).toHaveBeenCalledWith(
            expect.objectContaining({
                temperature: 0.5,
                maxTokens: 150
            })
        );
    });
}); 