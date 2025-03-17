import { Actor, Message } from '@bactor/core';
import { PID } from '@bactor/common';
import type { ActorContext } from '@bactor/core';

/**
 * 代理内存项
 */
export interface MemoryItem {
    id: string;
    content: string;
    metadata: Record<string, any>;
    timestamp: number;
    type: 'message' | 'observation' | 'thought' | 'action';
    agentId?: string;
}

/**
 * 内存查询选项
 */
export interface MemoryQueryOptions {
    type?: string;
    limit?: number;
    before?: number;
    after?: number;
    metadata?: Record<string, any>;
    query?: string;
}

/**
 * 内存系统状态
 */
export interface MemoryState {
    items: Map<string, MemoryItem>;
    agentThreads: Map<string, string[]>;
    vectorIds: string[];
}

/**
 * 添加内存条目消息
 */
export interface AddMemoryMessage extends Message {
    type: 'add_memory';
    item: Omit<MemoryItem, 'id' | 'timestamp'>;
}

/**
 * 查询内存消息
 */
export interface QueryMemoryMessage extends Message {
    type: 'query_memory';
    options: MemoryQueryOptions;
    threadId?: string;
}

/**
 * 内存查询结果消息
 */
export interface MemoryResultMessage extends Message {
    type: 'memory_result';
    items: MemoryItem[];
}

/**
 * 内存错误消息
 */
export interface MemoryErrorMessage extends Message {
    type: 'memory_error';
    error: string;
}

export type MemoryMessage = AddMemoryMessage | QueryMemoryMessage;
export type MemoryResponseMessage = MemoryResultMessage | MemoryErrorMessage;

/**
 * 代理内存Actor，负责存储和检索代理交互历史
 * 基于Mastra内存系统构建，适配到Bagctor的Actor模型
 */
export class AgentMemoryActor extends Actor<MemoryState, Message> {
    // 简单的向量存储模拟，后续会替换为真实的向量数据库
    private vectorStore: Map<string, { vector: number[], content: string }> = new Map();

    constructor(context: ActorContext) {
        super(context, {
            items: new Map(),
            agentThreads: new Map(),
            vectorIds: []
        });
    }

    /**
     * 定义Actor的行为
     */
    protected behaviors(): void {
        this.addBehavior('default', this.handleMemoryRequest.bind(this));
    }

    /**
     * 处理内存请求
     */
    private async handleMemoryRequest(message: Message): Promise<void> {
        try {
            if (message.type === 'add_memory') {
                await this.handleAddMemory(message as AddMemoryMessage);
            } else if (message.type === 'query_memory') {
                await this.handleQueryMemory(message as QueryMemoryMessage);
            }
        } catch (error: any) {
            if (message.sender) {
                await this.send(message.sender, {
                    type: 'memory_error',
                    error: error?.message || String(error)
                } as MemoryErrorMessage);
            }
        }
    }

    /**
     * 处理添加内存请求
     */
    private async handleAddMemory(message: AddMemoryMessage): Promise<void> {
        const { item } = message;
        const id = `mem_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;

        const memoryItem: MemoryItem = {
            ...item,
            id,
            timestamp: Date.now()
        };

        // 保存到内存
        const updatedItems = new Map(this.state.items);
        updatedItems.set(id, memoryItem);

        // 如果有agent ID，添加到对应的线程
        if (item.agentId) {
            const updatedThreads = new Map(this.state.agentThreads);
            const agentThread = updatedThreads.get(item.agentId) || [];
            updatedThreads.set(item.agentId, [...agentThread, id]);

            this.setState({
                items: updatedItems,
                agentThreads: updatedThreads,
                vectorIds: this.state.vectorIds
            });
        } else {
            this.setState({
                items: updatedItems,
                agentThreads: this.state.agentThreads,
                vectorIds: this.state.vectorIds
            });
        }

        // 创建向量嵌入（模拟）
        // 实际实现中，我们应该使用@mastra/memory的向量存储功能
        this.createEmbedding(id, item.content);

        // 返回成功响应
        if (message.sender) {
            await this.send(message.sender, {
                type: 'memory_result',
                items: [memoryItem]
            } as MemoryResultMessage);
        }
    }

    /**
     * 处理查询内存请求
     */
    private async handleQueryMemory(message: QueryMemoryMessage): Promise<void> {
        const { options, threadId } = message;
        let results: MemoryItem[] = [];

        if (options.query) {
            // 如果有查询字符串，执行语义搜索
            results = await this.semanticSearch(options.query, options.limit || 5);
        } else if (threadId) {
            // 如果有线程ID，返回该线程的所有内存
            const threadItems = this.state.agentThreads.get(threadId) || [];
            results = threadItems
                .map(id => this.state.items.get(id))
                .filter(Boolean) as MemoryItem[];
        } else {
            // 否则执行基于过滤器的搜索
            results = [...this.state.items.values()].filter(item => {
                let match = true;

                if (options.type && item.type !== options.type) {
                    match = false;
                }

                if (options.before && item.timestamp >= options.before) {
                    match = false;
                }

                if (options.after && item.timestamp <= options.after) {
                    match = false;
                }

                if (options.metadata) {
                    for (const [key, value] of Object.entries(options.metadata)) {
                        if (item.metadata[key] !== value) {
                            match = false;
                            break;
                        }
                    }
                }

                return match;
            });
        }

        // 应用限制
        if (options.limit && results.length > options.limit) {
            results = results.slice(0, options.limit);
        }

        // 返回结果
        if (message.sender) {
            await this.send(message.sender, {
                type: 'memory_result',
                items: results
            } as MemoryResultMessage);
        }
    }

    /**
     * 模拟语义搜索功能
     * 在真实实现中，这将使用向量数据库进行搜索
     */
    private async semanticSearch(query: string, limit: number): Promise<MemoryItem[]> {
        // 模拟相似度计算
        const queryLower = query.toLowerCase();
        const scores: [string, number][] = [];

        for (const [id, data] of this.vectorStore.entries()) {
            const content = data.content.toLowerCase();
            // 简单的文本匹配作为相似度分数
            const score = queryLower.split(' ').filter(word => content.includes(word)).length;
            scores.push([id, score]);
        }

        // 按分数排序并获取前N项
        const topIds = scores
            .sort((a, b) => b[1] - a[1])
            .slice(0, limit)
            .map(([id]) => id);

        // 返回对应的内存项
        return topIds
            .map(id => this.state.items.get(id))
            .filter(Boolean) as MemoryItem[];
    }

    /**
     * 模拟创建文本嵌入
     * 在真实实现中，这将使用OpenAI嵌入模型
     */
    private createEmbedding(id: string, content: string): void {
        // 模拟的嵌入向量（随机数组）
        const vector = Array(1536).fill(0).map(() => Math.random());
        this.vectorStore.set(id, { vector, content });

        // 更新state中的向量ID列表
        this.setState({
            items: this.state.items,
            agentThreads: this.state.agentThreads,
            vectorIds: [...this.state.vectorIds, id]
        });
    }
}

/**
 * 内存接口，用于AgentActor调用
 */
export class AgentMemory {
    private actorRef: PID;
    private context: ActorContext;

    constructor(actorRef: PID, context: ActorContext) {
        this.actorRef = actorRef;
        this.context = context;
    }

    /**
     * 添加内存项
     */
    async add(item: Omit<MemoryItem, 'id' | 'timestamp'>): Promise<MemoryItem[]> {
        return new Promise((resolve, reject) => {
            this.context.send(this.actorRef, {
                type: 'add_memory',
                item,
                sender: this.context.self
            } as AddMemoryMessage)
                .then(() => {
                    // 消息发送成功，等待响应
                    // 实际响应处理将通过消息传递完成
                    // 这里使用超时机制确保不会永久等待
                    const timeout = setTimeout(() => {
                        reject(new Error('Memory operation timed out'));
                    }, 5000);

                    // 这是一个简化实现，实际应该有一个完整的响应处理机制
                    // 在实际实现中，我们会在AgentActor中处理响应
                    resolve([]);
                    clearTimeout(timeout);
                })
                .catch(reject);
        });
    }

    /**
     * 查询内存
     */
    async query(options: MemoryQueryOptions, threadId?: string): Promise<MemoryItem[]> {
        return new Promise((resolve, reject) => {
            this.context.send(this.actorRef, {
                type: 'query_memory',
                options,
                threadId,
                sender: this.context.self
            } as QueryMemoryMessage)
                .then(() => {
                    // 与add方法类似的简化实现
                    const timeout = setTimeout(() => {
                        reject(new Error('Memory operation timed out'));
                    }, 5000);

                    resolve([]);
                    clearTimeout(timeout);
                })
                .catch(reject);
        });
    }
} 