/**
 * 内存配置实现
 * 为Bagctor提供与Mastra兼容的内存配置功能
 */

import { Agent } from '@mastra/core/agent';
import { MemoryManager, ImportanceLevel, MemoryItem, MemoryItemType } from './memory';

/**
 * 语义记忆召回配置
 */
export interface SemanticRecallConfig {
    /**
     * 要返回的最相关记忆项数量
     */
    topK: number;

    /**
     * 要考虑搜索的最近消息数量
     */
    messageRange?: number;

    /**
     * 最小相关性阈值(0-1)
     */
    threshold?: number;

    /**
     * 哪些类型的记忆项应包含在召回中
     */
    includeTypes?: MemoryItemType[];
}

/**
 * 记忆选项配置
 */
export interface MemoryOptions {
    /**
     * 保留的最近消息数量
     */
    lastMessages?: number;

    /**
     * 语义记忆召回配置
     */
    semanticRecall?: SemanticRecallConfig;

    /**
     * 最小重要性级别阈值
     */
    minImportance?: ImportanceLevel;
}

/**
 * 线程上下文接口
 */
export interface ThreadContext {
    /**
     * 线程ID
     */
    threadId: string;

    /**
     * 资源ID(如用户ID)
     */
    resourceId: string;

    /**
     * 会话记忆
     */
    memories: MemoryItem[];

    /**
     * 上下文元数据
     */
    metadata?: Record<string, any>;
}

/**
 * 记忆配置管理器
 */
export class MemoryConfigManager {
    private memoryManager: MemoryManager;
    private threadContexts: Map<string, ThreadContext> = new Map();
    private agent: Agent;

    /**
     * 创建记忆配置管理器
     */
    constructor(agent: Agent, memoryManager: MemoryManager) {
        this.agent = agent;
        this.memoryManager = memoryManager;
    }

    /**
     * 获取或创建线程上下文
     */
    async getOrCreateThreadContext(threadId: string, resourceId: string): Promise<ThreadContext> {
        const key = `${resourceId}:${threadId}`;

        if (!this.threadContexts.has(key)) {
            // 创建新线程上下文
            const context: ThreadContext = {
                threadId,
                resourceId,
                memories: [],
                metadata: {}
            };

            this.threadContexts.set(key, context);

            // 加载现有记忆
            const existingMemories = await this.memoryManager.storage.queryItems({
                metadata: { threadId, resourceId },
                limit: 100
            });

            context.memories = existingMemories;
        }

        return this.threadContexts.get(key)!;
    }

    /**
     * 添加记忆到线程
     */
    async addMemoryToThread(
        threadId: string,
        resourceId: string,
        content: string,
        type: MemoryItemType = 'interaction',
        metadata: Record<string, any> = {}
    ): Promise<string> {
        const context = await this.getOrCreateThreadContext(threadId, resourceId);

        // 添加线程和资源ID到元数据
        const fullMetadata = {
            ...metadata,
            threadId,
            resourceId
        };

        // 添加到存储系统
        const memoryId = await this.memoryManager.addMemory({
            content,
            type,
            timestamp: Date.now(),
            source: this.agent.name || 'system',
            importance: ImportanceLevel.Medium,
            metadata: fullMetadata
        });

        // 获取新添加的记忆项
        const memoryItem = await this.memoryManager.storage.getItem(memoryId);
        if (memoryItem) {
            context.memories.push(memoryItem);
        }

        return memoryId;
    }

    /**
     * 根据内存配置选项获取记忆上下文
     */
    async getMemoryContext(
        input: string,
        options: MemoryOptions = {},
        threadId?: string,
        resourceId?: string
    ): Promise<string> {
        let memoryContext = '';

        // 如果提供了线程和资源ID，获取对应上下文
        if (threadId && resourceId) {
            const context = await this.getOrCreateThreadContext(threadId, resourceId);

            // 处理最近消息
            if (options.lastMessages && options.lastMessages > 0) {
                const recentMessages = context.memories
                    .filter(mem => mem.type === 'interaction')
                    .sort((a, b) => b.timestamp - a.timestamp)
                    .slice(0, options.lastMessages);

                if (recentMessages.length > 0) {
                    memoryContext += '## Recent Conversation\n';
                    for (const message of recentMessages.reverse()) {
                        memoryContext += `${message.metadata?.role || 'system'}: ${message.content}\n`;
                    }
                    memoryContext += '\n';
                }
            }

            // 处理语义召回
            if (options.semanticRecall) {
                const { topK, messageRange, threshold, includeTypes } = options.semanticRecall;

                // 获取相关记忆
                const relevantMemories = await this.memoryManager.getRelevantMemories({
                    content: input,
                    limit: topK,
                    types: includeTypes,
                    minImportance: options.minImportance
                });

                if (relevantMemories.length > 0) {
                    memoryContext += '## Relevant Context\n';
                    for (const memory of relevantMemories) {
                        memoryContext += `- ${memory.content}\n`;
                    }
                    memoryContext += '\n';
                }
            }
        }

        return memoryContext;
    }

    /**
     * 准备发送给Agent的上下文
     */
    async prepareContextForAgent(
        input: string,
        options: MemoryOptions = {},
        threadId?: string,
        resourceId?: string
    ): Promise<string> {
        // 获取记忆上下文
        const memoryContext = await this.getMemoryContext(input, options, threadId, resourceId);

        // 如果有上下文，添加用户输入
        if (memoryContext) {
            return `${memoryContext}\n## Current Input\n${input}`;
        }

        // 否则直接返回输入
        return input;
    }

    /**
     * 记录交互到记忆
     */
    async recordInteraction(
        userInput: string,
        agentResponse: string,
        threadId?: string,
        resourceId?: string
    ): Promise<void> {
        if (!threadId || !resourceId) return;

        // 记录用户输入
        await this.addMemoryToThread(
            threadId,
            resourceId,
            userInput,
            'interaction',
            { role: 'user' }
        );

        // 记录代理响应
        await this.addMemoryToThread(
            threadId,
            resourceId,
            agentResponse,
            'interaction',
            { role: 'assistant' }
        );
    }
}

/**
 * 创建记忆配置管理器
 */
export function createMemoryConfigManager(
    agent: Agent,
    memoryManager: MemoryManager
): MemoryConfigManager {
    return new MemoryConfigManager(agent, memoryManager);
} 