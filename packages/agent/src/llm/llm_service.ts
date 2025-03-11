/**
 * LLM 服务实现 - 集成多种LLM提供商
 */
import {
    LLMService,
    LLMServiceConfig,
    LLMModelConfig,
    LLMRequestOptions,
    LLMResponse,
    ChatMessage,
    StreamHandler,
    LLMProvider
} from './types';
import { generateWithQwen, streamWithQwen } from './providers/qwen';

// 扩展请求选项，添加provider字段
interface ExtendedLLMRequestOptions extends Partial<LLMRequestOptions> {
    provider?: LLMProvider;
}

/**
 * LLM服务类 - 封装多种LLM提供商的统一访问
 */
export class BActorLLMService implements LLMService {
    private config: LLMServiceConfig;
    private modelConfig: LLMModelConfig;

    /**
     * 创建LLM服务
     */
    constructor(config: LLMServiceConfig) {
        this.config = config;

        // 初始化默认模型配置
        this.modelConfig = {
            provider: config.defaultProvider,
            model: config.defaultModel,
            temperature: config.defaultTemperature,
            maxTokens: config.defaultMaxTokens,
            topP: config.defaultTopP
        };

        // 如果有自定义端点，设置baseURL
        if (config.customEndpoints && config.customEndpoints[config.defaultProvider]) {
            this.modelConfig.baseURL = config.customEndpoints[config.defaultProvider];
        }

        // 如果有API密钥，设置apiKey
        if (config.apiKeys && config.apiKeys[config.defaultProvider]) {
            this.modelConfig.apiKey = config.apiKeys[config.defaultProvider];
        }
    }

    /**
     * 简单的单轮对话
     */
    async complete(prompt: string, options: ExtendedLLMRequestOptions = {}): Promise<string> {
        const messages: ChatMessage[] = [
            { role: 'user', content: prompt }
        ];

        const response = await this.chat(messages, options);
        return response.content;
    }

    /**
     * 多轮对话
     */
    async chat(messages: ChatMessage[], options: ExtendedLLMRequestOptions = {}): Promise<LLMResponse> {
        const provider = options.provider || this.modelConfig.provider;

        // 根据提供商选择不同的实现
        switch (provider) {
            case 'qwen':
                return generateWithQwen(messages, options, this.modelConfig);
            case 'openai':
                // 未实现
                throw new Error('OpenAI provider not implemented yet');
            case 'custom':
                // 自定义实现
                if (!this.modelConfig.baseURL) {
                    throw new Error('Custom provider requires baseURL');
                }
                return generateWithQwen(messages, options, this.modelConfig);
            default:
                throw new Error(`Unknown provider: ${provider}`);
        }
    }

    /**
     * 流式多轮对话
     */
    async streamChat(
        messages: ChatMessage[],
        handler: StreamHandler,
        options: ExtendedLLMRequestOptions = {}
    ): Promise<void> {
        const provider = options.provider || this.modelConfig.provider;

        // 根据提供商选择不同的实现
        switch (provider) {
            case 'qwen':
                return streamWithQwen(messages, handler, options, this.modelConfig);
            case 'openai':
                // 未实现
                throw new Error('OpenAI provider not implemented yet');
            case 'custom':
                // 自定义实现
                if (!this.modelConfig.baseURL) {
                    throw new Error('Custom provider requires baseURL');
                }
                return streamWithQwen(messages, handler, options, this.modelConfig);
            default:
                throw new Error(`Unknown provider: ${provider}`);
        }
    }

    /**
     * 使用自定义配置创建新的LLM服务实例
     */
    withConfig(config: Partial<LLMModelConfig>): LLMService {
        // 创建一个新的实例，使用当前配置合并新的配置
        const newService = new BActorLLMService(this.config);

        // 更新模型配置
        newService.modelConfig = {
            ...this.modelConfig,
            ...config
        };

        return newService;
    }
}

/**
 * 创建默认LLM服务
 */
export function createLLMService(config: LLMServiceConfig): LLMService {
    return new BActorLLMService(config);
}

/**
 * 创建基于环境变量的默认LLM服务
 */
export function createDefaultLLMService(): LLMService {
    // 默认使用Qwen作为提供商
    const provider: LLMProvider = (process.env.LLM_PROVIDER as LLMProvider) || 'qwen';

    // 创建配置
    const config: LLMServiceConfig = {
        defaultProvider: provider,
        defaultModel: process.env.LLM_MODEL || 'qwen-plus',
        defaultTemperature: process.env.LLM_TEMPERATURE ? parseFloat(process.env.LLM_TEMPERATURE) : 0.7,
        customEndpoints: {}
    };

    // 如果有自定义端点，设置baseURL
    if (process.env.QWEN_BASE_URL && config.customEndpoints) {
        config.customEndpoints.qwen = process.env.QWEN_BASE_URL;
    }

    // 创建服务
    return createLLMService(config);
} 