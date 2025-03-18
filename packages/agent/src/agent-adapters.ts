/**
 * Mastra兼容的Agent适配器
 * 扩展标准Mastra Agent，增加Bagctor的内存配置和分布式能力
 */

import { Agent } from '@mastra/core/agent';
import { MemoryManager } from './memory';
import { MemoryOptions, MemoryConfigManager, createMemoryConfigManager } from './memory-config';

/**
 * Stream选项接口
 */
export interface StreamOptions {
    /**
     * 流开始时的回调
     */
    onStart?: () => void;

    /**
     * 接收标记的回调
     */
    onToken?: (token: string) => void;

    /**
     * 流完成时的回调
     */
    onComplete?: (result: any) => void;

    /**
     * 错误处理回调
     */
    onError?: (event: { error: unknown }) => void;

    /**
     * 记忆选项
     */
    memoryOptions?: MemoryOptions;

    /**
     * 资源ID（通常是用户ID）
     */
    resourceId?: string;

    /**
     * 线程ID
     */
    threadId?: string;

    /**
     * 其他选项
     */
    [key: string]: any;
}

/**
 * 增强的Agent适配器
 * 为标准Mastra Agent添加Bagctor特性
 */
export class EnhancedAgentAdapter {
    private agent: Agent;
    private memoryManager: MemoryManager;
    private memoryConfigManager: MemoryConfigManager;

    /**
     * 创建增强的Agent适配器
     */
    constructor(agent: Agent, memoryManager: MemoryManager) {
        this.agent = agent;
        this.memoryManager = memoryManager;
        this.memoryConfigManager = createMemoryConfigManager(agent, memoryManager);
    }

    /**
     * 获取原始Agent实例
     */
    getOriginalAgent(): Agent {
        return this.agent;
    }

    /**
     * 使用增强的generate方法
     * 支持内存配置和上下文管理
     */
    async generate(input: string, options: {
        memoryOptions?: MemoryOptions;
        resourceId?: string;
        threadId?: string;
        [key: string]: any;
    } = {}): Promise<any> {
        let processedInput = input;
        const { memoryOptions, resourceId, threadId, ...otherOptions } = options;

        // 如果提供了内存选项和上下文ID，应用内存上下文
        if (memoryOptions && resourceId && threadId) {
            processedInput = await this.memoryConfigManager.prepareContextForAgent(
                input,
                memoryOptions,
                threadId,
                resourceId
            );
        }

        // 调用原始Agent的generate方法
        const result = await this.agent.generate(processedInput, otherOptions);

        // 如果提供了线程和资源ID，记录交互
        if (resourceId && threadId) {
            await this.memoryConfigManager.recordInteraction(
                input,
                result.text,
                threadId,
                resourceId
            );
        }

        return result;
    }

    /**
     * 使用增强的stream方法
     * 支持内存配置和上下文管理
     */
    async stream(input: string, options: StreamOptions = {}): Promise<void> {
        let processedInput = input;
        const { memoryOptions, resourceId, threadId, onStart, onToken, onComplete, onError, ...otherOptions } = options;

        // 如果提供了内存选项和上下文ID，应用内存上下文
        if (memoryOptions && resourceId && threadId) {
            processedInput = await this.memoryConfigManager.prepareContextForAgent(
                input,
                memoryOptions,
                threadId,
                resourceId
            );
        }

        // 用于收集完整响应
        let fullResponse = '';

        try {
            // 调用原始Agent的stream方法
            await this.agent.stream(processedInput, {
                ...otherOptions,
                onStart,
                onToken: (token: string) => {
                    // 收集完整响应
                    fullResponse += token;
                    // 调用原始回调
                    if (onToken) onToken(token);
                },
                onComplete: async (result: any) => {
                    // 如果提供了线程和资源ID，记录交互
                    if (resourceId && threadId) {
                        await this.memoryConfigManager.recordInteraction(
                            input,
                            fullResponse,
                            threadId,
                            resourceId
                        );
                    }

                    // 调用原始回调
                    if (onComplete) onComplete(result);
                },
                onError
            });
        } catch (error) {
            if (onError) onError({ error });
            throw error;
        }
    }

    /**
     * 将上下文添加到记忆
     */
    async addToMemory(
        content: string,
        options: {
            type?: string;
            importance?: number;
            resourceId?: string;
            threadId?: string;
            metadata?: Record<string, any>;
        } = {}
    ): Promise<string> {
        const { resourceId, threadId, type = 'fact', metadata = {} } = options;

        if (!resourceId || !threadId) {
            throw new Error('添加到记忆需要resourceId和threadId');
        }

        return this.memoryConfigManager.addMemoryToThread(
            threadId,
            resourceId,
            content,
            type as any,
            metadata
        );
    }

    /**
     * 获取上下文记忆
     */
    async getContextMemories(
        input: string,
        options: {
            memoryOptions?: MemoryOptions;
            resourceId?: string;
            threadId?: string;
        } = {}
    ): Promise<string> {
        const { memoryOptions, resourceId, threadId } = options;

        if (!resourceId || !threadId) {
            return '';
        }

        return this.memoryConfigManager.getMemoryContext(
            input,
            memoryOptions || {},
            threadId,
            resourceId
        );
    }
}

/**
 * 创建增强的Agent适配器
 */
export function createEnhancedAgent(
    agent: Agent,
    memoryManager: MemoryManager
): EnhancedAgentAdapter {
    return new EnhancedAgentAdapter(agent, memoryManager);
} 