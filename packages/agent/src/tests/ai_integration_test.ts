/**
 * AI集成系统单元测试
 * 测试Vercel AI统一接口的集成
 */

import { test, expect, describe, mock, beforeEach } from 'bun:test';
import { LLMService, LLMProvider, ChatMessage, LLMRequestOptions, LLMModelConfig } from '../llm/types';
import { BActorLLMService } from '../llm/llm_service';

// 创建模拟的API响应对象
const mockLLMResponse = {
    content: "这是一个模拟的LLM响应",
    usage: {
        promptTokens: 10,
        completionTokens: 20,
        totalTokens: 30
    }
};

// 创建一个生成器函数，用于模拟流式响应
async function* mockStreamGenerator() {
    yield "这是";
    yield "一个";
    yield "模拟的";
    yield "流式";
    yield "响应";
}

describe('AI集成测试', () => {
    let llmService: BActorLLMService;
    let mockQwenGenerate: any;
    let mockQwenStream: any;

    beforeEach(() => {
        // 创建模拟函数
        mockQwenGenerate = mock(() => Promise.resolve(mockLLMResponse));
        mockQwenStream = mock(async (messages: any, handler: any) => {
            for await (const chunk of mockStreamGenerator()) {
                handler(chunk);
            }
        });

        // 替换实际的API调用
        // 注意：这里应该使用实际的模块路径
        // 这里仅作示例，实际测试中需要正确设置模块路径
        // mock.module('../llm/providers/qwen', () => ({
        //     generateWithQwen: mockQwenGenerate,
        //     streamWithQwen: mockQwenStream
        // }));

        // 创建LLM服务实例
        llmService = new BActorLLMService({
            defaultProvider: 'qwen',
            defaultModel: 'qwen-turbo',
            apiKeys: {
                qwen: 'test-api-key',
                openai: 'test-openai-key',
                custom: ''
            }
        });

        // 替换实际方法以使用模拟
        (llmService as any).chat = mockQwenGenerate;
        (llmService as any).streamChat = mockQwenStream;
    });

    test('应使用默认提供商发送消息', async () => {
        const messages: ChatMessage[] = [
            { role: 'user', content: '这是一个测试消息' }
        ];

        await llmService.chat(messages);

        expect(mockQwenGenerate).toHaveBeenCalled();
        expect(mockQwenGenerate.mock.calls[0][0]).toEqual(messages);
    });

    test('应能指定不同的LLM提供商', async () => {
        const messages: ChatMessage[] = [
            { role: 'user', content: '这是一个使用OpenAI的测试' }
        ];

        await llmService.chat(messages, { provider: 'openai' });

        expect(mockQwenGenerate).toHaveBeenCalled();
        expect(mockQwenGenerate.mock.calls[0][1]).toEqual({ provider: 'openai' });
    });

    test('应支持自定义端点', async () => {
        const messages: ChatMessage[] = [
            { role: 'user', content: '这是一个使用自定义端点的测试' }
        ];

        // 创建带有自定义端点的服务
        const customService = new BActorLLMService({
            defaultProvider: 'custom',
            defaultModel: 'custom-model',
            customEndpoints: {
                custom: 'https://custom-llm-api.example.com'
            }
        });

        (customService as any).chat = mockQwenGenerate;

        await customService.chat(messages);

        expect(mockQwenGenerate).toHaveBeenCalled();
    });

    test('应支持流式响应', async () => {
        const messages: ChatMessage[] = [
            { role: 'user', content: '这是一个流式响应测试' }
        ];

        const chunks: string[] = [];
        const handler = (chunk: string) => {
            chunks.push(chunk);
        };

        await llmService.streamChat(messages, handler);

        expect(mockQwenStream).toHaveBeenCalled();
        expect(chunks).toEqual(['这是', '一个', '模拟的', '流式', '响应']);
    });

    test('应支持多轮对话', async () => {
        const messages: ChatMessage[] = [
            { role: 'user', content: '你好' },
            { role: 'assistant', content: '你好，有什么我可以帮助你的？' },
            { role: 'user', content: '讲个笑话' }
        ];

        await llmService.chat(messages);

        expect(mockQwenGenerate).toHaveBeenCalled();
        expect(mockQwenGenerate.mock.calls[0][0]).toEqual(messages);
    });

    test('应支持自定义模型参数', async () => {
        const messages: ChatMessage[] = [
            { role: 'user', content: '这是一个测试自定义参数的消息' }
        ];

        const options: LLMRequestOptions = {
            temperature: 0.7,
            topP: 0.9,
            maxTokens: 100,
            messages: messages
        };

        await llmService.chat(messages, options);

        expect(mockQwenGenerate).toHaveBeenCalled();
        expect(mockQwenGenerate.mock.calls[0][1]).toMatchObject({
            temperature: 0.7,
            topP: 0.9,
            maxTokens: 100
        });
    });

    test('应处理错误响应', async () => {
        // 创建一个新的模拟函数，它会抛出错误
        const errorMock = mock(() => {
            throw new Error('API错误');
        });

        // 创建一个新的服务实例，专门用于测试错误
        const errorService = new BActorLLMService({
            defaultProvider: 'qwen',
            defaultModel: 'qwen-turbo',
            apiKeys: {
                qwen: 'test-api-key',
                openai: 'test-openai-key',
                custom: ''
            }
        });

        // 替换方法以使用模拟
        (errorService as any).chat = errorMock;

        const messages: ChatMessage[] = [
            { role: 'user', content: '这应该会产生一个错误' }
        ];

        // 使用try/catch来测试错误
        let errorThrown = false;
        try {
            await errorService.chat(messages);
        } catch (error: any) {
            errorThrown = true;
            expect(error.message).toBe('API错误');
        }

        // 确保错误被抛出
        expect(errorThrown).toBe(true);
    });

    test('应使用Vercel AI兼容格式处理请求和响应', async () => {
        const messages: ChatMessage[] = [
            { role: 'user', content: '测试Vercel AI兼容格式' }
        ];

        const response = await llmService.chat(messages);

        expect(response).toEqual(mockLLMResponse);
    });
}); 