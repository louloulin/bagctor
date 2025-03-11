/**
 * Qwen 模型提供商集成 (Vercel AI SDK)
 */
import { createQwen } from 'qwen-ai-provider';
import { generateText, streamText } from 'ai';
import {
    ChatMessage,
    LLMModelConfig,
    LLMResponse,
    LLMRequestOptions,
    StreamHandler
} from '../types';

// Qwen 支持的模型列表
export const supportedQwenModels = [
    'qwen-plus',
    'qwen-max',
    'qwen-vl-max',
    'qwen-plus-latest',
    'qwen2.5-72b-instruct',
    'qwen2.5-14b-instruct-1m',
    'qwen2.5-vl-72b-instruct'
];

// 默认模型
export const defaultQwenModel = 'qwen-plus';

/**
 * 创建 Qwen 提供商实例
 */
export function createQwenProvider(config: Partial<LLMModelConfig> = {}) {
    const baseURL = config.baseURL || process.env.QWEN_BASE_URL || 'https://dashscope-intl.aliyuncs.com/compatible-mode/v1';
    const apiKey = config.apiKey || process.env.DASHSCOPE_API_KEY;

    // 创建 Qwen 提供商实例
    const qwen = createQwen({
        baseURL,
        apiKey,
        headers: config.headers
    });

    return qwen;
}

/**
 * 使用 Qwen 模型进行文本生成
 */
export async function generateWithQwen(
    messages: ChatMessage[],
    options: Partial<LLMRequestOptions> = {},
    config: Partial<LLMModelConfig> = {}
): Promise<LLMResponse> {
    try {
        // 创建 Qwen 提供商
        const qwen = createQwenProvider(config);

        // 设置模型
        const modelId = config.model || defaultQwenModel;
        const model = qwen(modelId);

        // 生成文本
        const result = await generateText({
            model,
            messages: messages.map(msg => ({
                role: msg.role,
                content: msg.content,
                name: msg.name
            })),
            temperature: options.temperature ?? config.temperature ?? 0.7,
            maxTokens: options.maxTokens ?? config.maxTokens,
            topP: options.topP ?? config.topP ?? 0.95,
        });

        // 返回结果
        return {
            content: result.text,
            usage: {
                promptTokens: result.usage?.promptTokens || 0,
                completionTokens: result.usage?.completionTokens || 0,
                totalTokens: result.usage?.totalTokens || 0
            }
        };
    } catch (error: any) {
        console.error('Qwen API error:', error);
        throw new Error(`Qwen API error: ${error.message || String(error)}`);
    }
}

/**
 * 使用 Qwen 模型进行流式文本生成
 */
export async function streamWithQwen(
    messages: ChatMessage[],
    handler: StreamHandler,
    options: Partial<LLMRequestOptions> = {},
    config: Partial<LLMModelConfig> = {}
): Promise<void> {
    try {
        // 创建 Qwen 提供商
        const qwen = createQwenProvider(config);

        // 设置模型
        const modelId = config.model || defaultQwenModel;
        const model = qwen(modelId);

        // 流式生成文本
        const stream = await streamText({
            model,
            messages: messages.map(msg => ({
                role: msg.role,
                content: msg.content,
                name: msg.name
            })),
            temperature: options.temperature ?? config.temperature ?? 0.7,
            maxTokens: options.maxTokens ?? config.maxTokens,
            topP: options.topP ?? config.topP ?? 0.95,
        });

        // 处理流式输出
        for await (const chunk of stream) {
            handler(chunk.text);
        }
    } catch (error: any) {
        console.error('Qwen API streaming error:', error);
        throw new Error(`Qwen API streaming error: ${error.message || String(error)}`);
    }
} 