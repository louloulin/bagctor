/**
 * LLM 相关类型定义
 */

// LLM 提供商类型
export type LLMProvider = 'qwen' | 'openai' | 'custom';

// LLM 模型配置
export interface LLMModelConfig {
    provider: LLMProvider;
    model: string;
    temperature?: number;
    maxTokens?: number;
    topP?: number;
    baseURL?: string;
    apiKey?: string;
    headers?: Record<string, string>;
}

// LLM 服务配置
export interface LLMServiceConfig {
    defaultProvider: LLMProvider;
    defaultModel: string;
    defaultTemperature?: number;
    defaultMaxTokens?: number;
    defaultTopP?: number;
    customEndpoints?: Record<string, string>;
    apiKeys?: Record<LLMProvider, string>;
}

// 聊天消息格式
export interface ChatMessage {
    role: 'system' | 'user' | 'assistant' | 'function';
    content: string;
    name?: string;
}

// 函数调用定义
export interface FunctionDefinition {
    name: string;
    description: string;
    parameters: Record<string, any>;
}

// LLM 请求配置
export interface LLMRequestOptions {
    messages: ChatMessage[];
    temperature?: number;
    maxTokens?: number;
    topP?: number;
    functions?: FunctionDefinition[];
    stream?: boolean;
}

// LLM 响应结果
export interface LLMResponse {
    content: string;
    usage?: {
        promptTokens: number;
        completionTokens: number;
        totalTokens: number;
    };
    functionCall?: {
        name: string;
        arguments: string;
    };
}

// 流式响应处理函数
export type StreamHandler = (chunk: string) => void;

// LLM 服务接口
export interface LLMService {
    // 完成（单轮对话）
    complete(prompt: string, options?: any): Promise<string>;

    // 聊天（多轮对话）
    chat(messages: ChatMessage[], options?: any): Promise<LLMResponse>;

    // 流式聊天
    streamChat(
        messages: ChatMessage[],
        handler: StreamHandler,
        options?: any
    ): Promise<void>;

    // 使用自定义设置（临时覆盖全局配置）
    withConfig(config: Partial<LLMModelConfig>): LLMService;
} 