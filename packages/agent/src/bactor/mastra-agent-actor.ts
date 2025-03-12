/**
 * Mastra Agent Adapter for Bactor
 * 
 * 这个文件实现了Mastra Agent到Bactor Actor系统的适配器。
 * 使用Mastra的Agent实现，但包装为Bactor Actor，以便集成到Bactor的Actor系统中。
 */

import { Actor, ActorContext, PID, Message } from '@bactor/core';
// Import the real Agent instead of using a mock
import { Agent } from '../agent';
import type { LanguageModelV1 } from 'ai';
import { v4 as uuidv4 } from 'uuid';

/**
 * Mastra Agent配置接口
 */
export interface MastraAgentConfig {
    /** Agent名称 */
    name: string;
    /** Agent描述（可选） */
    description?: string;
    /** Agent指令/系统提示 */
    instructions: string;
    /** 使用的语言模型 */
    model: LanguageModelV1;
    /** 可用的工具集 */
    tools?: Record<string, any>;
    /** 内存系统 */
    memory?: any;
    /** Actor名称（可选，默认基于Agent名称生成） */
    actorName?: string;
    /** 是否启用监督（将错误报告给父Actor） */
    supervision?: boolean;
    /** 运行时评估指标 */
    evals?: Record<string, any>;
    /** 是否启用缓存 */
    enableCache?: boolean;
    /** 缓存TTL（毫秒） */
    cacheTTL?: number;
}

/**
 * Mastra Agent消息类型
 */
export enum MastraAgentMessageType {
    GENERATE = 'generate',
    STREAM_GENERATE = 'streamGenerate',
    RESULT = 'result',
    ERROR = 'error',
    TOOL_CALL = 'toolCall',
    TOOL_RESULT = 'toolResult',
    CHUNK = 'chunk',
    FINISH = 'finish'
}

/**
 * Mastra Agent响应接口
 */
export interface MastraAgentResponse {
    /** 响应ID */
    id: string;
    /** 时间戳 */
    timestamp: number;
    /** 生成的文本 */
    text?: string;
    /** 工具调用 */
    toolCalls?: any[];
    /** 完整结果对象 */
    result?: any;
    /** 错误信息 */
    error?: string;
    /** 是否成功 */
    success: boolean;
}

/**
 * 简单的内存缓存实现
 */
class ResponseCache {
    private cache = new Map<string, { response: any, timestamp: number }>();
    private ttl: number;

    constructor(ttl: number = 5 * 60 * 1000) { // 默认5分钟
        this.ttl = ttl;
    }

    get(key: string): any | null {
        const entry = this.cache.get(key);
        if (!entry) return null;

        // 检查是否过期
        if (Date.now() - entry.timestamp > this.ttl) {
            this.cache.delete(key);
            return null;
        }

        return entry.response;
    }

    set(key: string, response: any): void {
        this.cache.set(key, {
            response,
            timestamp: Date.now()
        });
    }

    clear(): void {
        this.cache.clear();
    }
}

/**
 * Mastra Agent Actor实现
 */
export class MastraAgentActor extends Actor {
    private agent: Agent;
    private config: MastraAgentConfig;
    private cache: ResponseCache | null = null;

    constructor(context: ActorContext, config: MastraAgentConfig) {
        super(context);
        this.config = config;

        // 如果启用缓存，则创建缓存
        if (this.config.enableCache) {
            this.cache = new ResponseCache(this.config.cacheTTL);
        }

        // 创建真实的Mastra Agent实例
        this.agent = new Agent({
            name: this.config.name,
            instructions: this.config.instructions,
            model: this.config.model,
            tools: this.config.tools || {},
            memory: this.config.memory,
            evals: this.config.evals
        });
    }

    /**
     * 定义Actor行为
     */
    protected behaviors(): Record<string, (message: Message) => Promise<void>> {
        return {
            'default': async (message: Message) => {
                const response = await this.handleMessage(message, message.sender);
                if (message.sender && response) {
                    await this.send(message.sender, response);
                }
            }
        };
    }

    /**
     * 创建标准响应对象
     */
    private createResponse(success: boolean, data?: any, error?: string): MastraAgentResponse {
        return {
            id: uuidv4(),
            timestamp: Date.now(),
            result: data,
            text: typeof data === 'string' ? data : data?.text,
            toolCalls: data?.toolCalls,
            error,
            success
        };
    }

    /**
     * 处理接收到的消息
     */
    private async handleMessage(message: any, sender?: PID): Promise<any> {
        try {
            const { type, content, options = {}, cacheKey } = message;

            // 如果启用了缓存并提供了缓存键，尝试从缓存获取
            if (this.cache && cacheKey) {
                const cachedResponse = this.cache.get(cacheKey);
                if (cachedResponse && sender) {
                    return {
                        type: MastraAgentMessageType.RESULT,
                        ...this.createResponse(true, cachedResponse)
                    };
                }
            }

            switch (type) {
                case MastraAgentMessageType.GENERATE:
                    // 适配实际Agent.generate接口
                    const result = await this.agent.generate(content, {
                        ...options,
                        temperature: options.temperature || 0.7,
                        runId: options.runId || uuidv4()
                    });

                    // 缓存结果
                    if (this.cache && cacheKey) {
                        this.cache.set(cacheKey, result);
                    }

                    return {
                        type: MastraAgentMessageType.RESULT,
                        ...this.createResponse(true, result)
                    };

                case MastraAgentMessageType.STREAM_GENERATE:
                    // 处理流式生成逻辑，使用真实Agent的stream方法
                    if (sender) {
                        const chunks: string[] = [];

                        // 创建回调函数来处理流式结果
                        const onChunk = async (chunk: any) => {
                            if (chunk.type === 'text-delta' && chunk.textDelta) {
                                chunks.push(chunk.textDelta);
                                await this.send(sender, {
                                    type: MastraAgentMessageType.CHUNK,
                                    content: chunk.textDelta,
                                    payload: {
                                        timestamp: Date.now()
                                    }
                                });
                            }
                        };

                        // 开始流式生成，适配实际Agent.stream接口
                        const streamOptions = {
                            ...options,
                            temperature: options.temperature || 0.7,
                            runId: options.runId || uuidv4(),
                            onFinish: async (finalResult: string) => {
                                try {
                                    const parsedResult = JSON.parse(finalResult);
                                    await this.send(sender, {
                                        type: MastraAgentMessageType.FINISH,
                                        content: parsedResult.text,
                                        payload: {
                                            timestamp: Date.now(),
                                            result: parsedResult
                                        }
                                    });

                                    if (options.onFinish) {
                                        options.onFinish(parsedResult.text);
                                    }
                                } catch (error) {
                                    console.error("Error parsing stream result:", error);
                                    await this.send(sender, {
                                        type: MastraAgentMessageType.FINISH,
                                        content: chunks.join(''),
                                        payload: {
                                            timestamp: Date.now()
                                        }
                                    });

                                    if (options.onFinish) {
                                        options.onFinish(chunks.join(''));
                                    }
                                }
                            }
                        };

                        const streamResult = await this.agent.stream(content, streamOptions);

                        // 处理流式结果 - using async iterator properly
                        try {
                            for await (const chunk of streamResult.textStream) {
                                if (chunk) {
                                    await onChunk(chunk);
                                }
                            }
                        } catch (error) {
                            console.error("Error processing stream:", error);
                        }

                        // 缓存完整的结果
                        const fullText = chunks.join('');
                        if (this.cache && cacheKey) {
                            this.cache.set(cacheKey, { text: fullText });
                        }

                        // 发送最终结果
                        return {
                            type: MastraAgentMessageType.RESULT,
                            ...this.createResponse(true, { text: fullText })
                        };
                    }
                    break;

                case MastraAgentMessageType.TOOL_CALL:
                    // 处理工具调用，使用真实Agent的工具处理能力
                    const { toolName, params } = message;
                    try {
                        // 使用工具选择选项调用生成
                        const toolResult = await this.agent.generate(content, {
                            ...options,
                            runId: options.runId || uuidv4(),
                            toolChoice: {
                                type: 'tool',
                                tool: toolName
                            }
                        });

                        return {
                            type: MastraAgentMessageType.TOOL_RESULT,
                            ...this.createResponse(true, toolResult)
                        };
                    } catch (toolError: any) {
                        return {
                            type: MastraAgentMessageType.TOOL_RESULT,
                            ...this.createResponse(false, null, `Tool execution error: ${toolError.message}`)
                        };
                    }

                default:
                    throw new Error(`Unknown message type: ${type}`);
            }
        } catch (error: any) {
            console.error(`Error in MastraAgentActor:`, error);

            const errorResponse = {
                type: MastraAgentMessageType.ERROR,
                ...this.createResponse(false, null, error.message)
            };

            if (this.config.supervision) {
                // 如果启用了监督，将错误发送给父Actor
                const parentMsg = {
                    type: 'ERROR',
                    error,
                    agentId: this.context.self.id,
                    timestamp: Date.now()
                };
                if (this.context.parent) {
                    await this.send(this.context.parent, parentMsg);
                }
            }

            return errorResponse;
        }
    }

    /**
     * 清理资源
     */
    override async postStop(): Promise<void> {
        // 清理缓存
        if (this.cache) {
            this.cache.clear();
        }

        // 调用基类方法
        await super.postStop();
    }
}

/**
 * 创建MastraAgentActor的工厂函数
 * 
 * @param system Actor系统
 * @param config Mastra Agent配置
 * @returns Actor的PID
 */
export async function createMastraAgentActor(
    system: any, // ActorSystem类型
    config: MastraAgentConfig
): Promise<any> { // PID类型
    // 创建一个包装器，用于传递配置
    class WrappedMastraAgent extends MastraAgentActor {
        constructor(context: any) {
            super(context, config);
        }
    }

    // 使用系统spawn方法创建Actor
    return await system.spawn({
        actorClass: WrappedMastraAgent,
        actorContext: { config },
    });
} 