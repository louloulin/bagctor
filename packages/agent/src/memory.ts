import { Agent } from '@mastra/core/agent';
import { EventEmitter } from 'events';

/**
 * 记忆项类型
 */
export type MemoryItemType = 'fact' | 'interaction' | 'instruction' | 'file' | 'code' | 'system' | 'custom';

/**
 * 记忆重要性级别
 */
export enum ImportanceLevel {
    Low = 1,
    Medium = 2,
    High = 3,
    Critical = 4
}

/**
 * 记忆项接口
 */
export interface MemoryItem {
    id: string;
    type: MemoryItemType;
    content: string;
    timestamp: number;
    source: string;
    metadata?: Record<string, any>;
    importance: ImportanceLevel;
    associations?: string[];
    embedding?: number[];
}

/**
 * 记忆查询选项
 */
export interface MemoryQueryOptions {
    types?: MemoryItemType[];
    sources?: string[];
    startTime?: number;
    endTime?: number;
    minImportance?: ImportanceLevel;
    limit?: number;
    metadata?: Record<string, any>;
    relevanceTo?: string;
    associatedWith?: string;
}

/**
 * 记忆储存接口
 */
export interface MemoryStorage {
    addItem(item: Omit<MemoryItem, 'id'>): Promise<string>;
    getItem(id: string): Promise<MemoryItem | null>;
    updateItem(id: string, updates: Partial<MemoryItem>): Promise<boolean>;
    deleteItem(id: string): Promise<boolean>;
    queryItems(options?: MemoryQueryOptions): Promise<MemoryItem[]>;
    clear(): Promise<void>;
}

/**
 * 内存存储实现
 */
class InMemoryStorage implements MemoryStorage {
    private items: Map<string, MemoryItem> = new Map();
    private nextId: number = 1;

    /**
     * 添加记忆项
     */
    async addItem(item: Omit<MemoryItem, 'id'>): Promise<string> {
        const id = `mem_${this.nextId++}`;
        const memoryItem: MemoryItem = { ...item, id };
        this.items.set(id, memoryItem);
        return id;
    }

    /**
     * 获取记忆项
     */
    async getItem(id: string): Promise<MemoryItem | null> {
        return this.items.get(id) || null;
    }

    /**
     * 更新记忆项
     */
    async updateItem(id: string, updates: Partial<MemoryItem>): Promise<boolean> {
        const item = this.items.get(id);
        if (!item) return false;

        this.items.set(id, { ...item, ...updates });
        return true;
    }

    /**
     * 删除记忆项
     */
    async deleteItem(id: string): Promise<boolean> {
        return this.items.delete(id);
    }

    /**
     * 查询记忆项
     */
    async queryItems(options?: MemoryQueryOptions): Promise<MemoryItem[]> {
        let results = Array.from(this.items.values());

        if (options) {
            // 按类型过滤
            if (options.types && options.types.length > 0) {
                results = results.filter(item => options.types!.includes(item.type));
            }

            // 按来源过滤
            if (options.sources && options.sources.length > 0) {
                results = results.filter(item => options.sources!.includes(item.source));
            }

            // 按时间过滤
            if (options.startTime) {
                results = results.filter(item => item.timestamp >= options.startTime!);
            }
            if (options.endTime) {
                results = results.filter(item => item.timestamp <= options.endTime!);
            }

            // 按重要性过滤
            if (options.minImportance) {
                results = results.filter(item => item.importance >= options.minImportance!);
            }

            // 按关联过滤
            if (options.associatedWith) {
                results = results.filter(item =>
                    item.associations && item.associations.includes(options.associatedWith!)
                );
            }

            // 按元数据过滤
            if (options.metadata) {
                results = results.filter(item => {
                    if (!item.metadata) return false;

                    return Object.entries(options.metadata!).every(([key, value]) =>
                        item.metadata![key] === value
                    );
                });
            }

            // 按相关性排序
            if (options.relevanceTo) {
                // 简单实现：检查内容中是否包含相关性文本
                const relevanceText = options.relevanceTo.toLowerCase();
                results.sort((a, b) => {
                    const aRelevance = a.content.toLowerCase().includes(relevanceText) ? 1 : 0;
                    const bRelevance = b.content.toLowerCase().includes(relevanceText) ? 1 : 0;
                    return bRelevance - aRelevance;
                });
            }

            // 限制结果数量
            if (options.limit && options.limit > 0) {
                results = results.slice(0, options.limit);
            }
        }

        // 默认按时间戳从新到旧排序
        return results.sort((a, b) => b.timestamp - a.timestamp);
    }

    /**
     * 清空存储
     */
    async clear(): Promise<void> {
        this.items.clear();
        this.nextId = 1;
    }
}

/**
 * 创建默认存储
 */
function createDefaultStorage(): MemoryStorage {
    return new InMemoryStorage();
}

/**
 * 记忆管理系统
 */
export class MemoryManager extends EventEmitter {
    private _storage: MemoryStorage;
    private _agents: Record<string, Agent>;
    private recentMemoryCache: MemoryItem[] = [];
    private cacheSize: number = 50;

    /**
     * 构造记忆管理器
     */
    constructor(options: {
        storage?: MemoryStorage;
        agents?: Record<string, Agent>;
        cacheSize?: number;
    } = {}) {
        super();
        this._storage = options.storage || createDefaultStorage();
        this._agents = options.agents || {};
        this.cacheSize = options.cacheSize || 50;
    }

    /**
     * 获取存储实例
     */
    get storage(): MemoryStorage {
        return this._storage;
    }

    /**
     * 获取智能体映射
     */
    get agents(): Record<string, Agent> {
        return this._agents;
    }

    /**
     * 添加智能体
     */
    addAgent(name: string, agent: Agent): void {
        this._agents[name] = agent;
    }

    /**
     * 添加记忆项
     */
    async addMemory(item: Omit<MemoryItem, 'id'>): Promise<string> {
        const id = await this._storage.addItem(item);
        const fullItem = await this._storage.getItem(id);

        if (fullItem) {
            this.updateRecentMemoryCache(fullItem);
            this.emit('memory:add', fullItem);
        }

        return id;
    }

    /**
     * 添加交互记忆
     */
    async addInteraction(options: {
        agentName: string;
        userInput: string;
        agentResponse: string;
        metadata?: Record<string, any>;
    }): Promise<string> {
        const { agentName, userInput, agentResponse, metadata } = options;

        return this.addMemory({
            type: 'interaction',
            content: JSON.stringify({ userInput, agentResponse }),
            timestamp: Date.now(),
            source: agentName,
            importance: ImportanceLevel.Medium,
            metadata
        });
    }

    /**
     * 添加事实记忆
     */
    async addFact(options: {
        content: string;
        source: string;
        importance?: ImportanceLevel;
        metadata?: Record<string, any>;
    }): Promise<string> {
        const { content, source, importance = ImportanceLevel.Medium, metadata } = options;

        return this.addMemory({
            type: 'fact',
            content,
            timestamp: Date.now(),
            source,
            importance,
            metadata
        });
    }

    /**
     * 获取相关记忆
     */
    async getRelevantMemories(options: {
        content: string;
        limit?: number;
        types?: MemoryItemType[];
        minImportance?: ImportanceLevel;
    }): Promise<MemoryItem[]> {
        const { content, limit = 10, types, minImportance } = options;

        return this._storage.queryItems({
            relevanceTo: content,
            limit,
            types,
            minImportance
        });
    }

    /**
     * 获取最近记忆
     */
    async getRecentMemories(limit: number = 10, types?: MemoryItemType[]): Promise<MemoryItem[]> {
        if (types && types.length > 0) {
            return this._storage.queryItems({
                types,
                limit
            });
        }

        // 如果没有类型限制，使用缓存提高性能
        if (this.recentMemoryCache.length > 0 && limit <= this.recentMemoryCache.length) {
            return this.recentMemoryCache.slice(0, limit);
        }

        const items = await this._storage.queryItems({ limit });
        this.recentMemoryCache = items.slice(0, this.cacheSize);
        return items;
    }

    /**
     * 更新记忆重要性
     */
    async updateImportance(id: string, importance: ImportanceLevel): Promise<boolean> {
        const success = await this._storage.updateItem(id, { importance });

        if (success) {
            const item = await this._storage.getItem(id);
            if (item) {
                this.emit('memory:update', item);
            }
        }

        return success;
    }

    /**
     * 添加记忆关联
     */
    async addAssociation(id: string, associatedId: string): Promise<boolean> {
        const item = await this._storage.getItem(id);
        if (!item) return false;

        const associations = item.associations || [];
        if (!associations.includes(associatedId)) {
            associations.push(associatedId);
            const success = await this._storage.updateItem(id, { associations });

            if (success) {
                this.emit('memory:associate', id, associatedId);
            }


            return success;
        }

        return true;
    }

    /**
     * 获取智能体记忆上下文
     */
    async getAgentMemoryContext(agentName: string, maxItems: number = 10): Promise<string> {
        const memories = await this.storage.queryItems({
            sources: [agentName],
            limit: maxItems
        });

        if (memories.length === 0) return '';

        return memories
            .map(memory => {
                if (memory.type === 'interaction') {
                    try {
                        const interaction = JSON.parse(memory.content);
                        return `User: ${interaction.userInput}\nAgent: ${interaction.agentResponse}`;
                    } catch {
                        return memory.content;
                    }
                }
                return memory.content;
            })
            .join('\n\n');
    }

    /**
     * 生成智能体共享记忆摘要
     */
    async generateMemorySummary(
        targetAgentName: string,
        fromAgentName: string,
        relevancyQuery: string
    ): Promise<string> {
        // 获取来源智能体的相关记忆
        const relevantMemories = await this.storage.queryItems({
            sources: [fromAgentName],
            relevanceTo: relevancyQuery,
            limit: 10
        });

        if (relevantMemories.length === 0) {
            return '';
        }

        // 获取目标智能体
        const agent = this.agents[targetAgentName];
        if (!agent) {
            throw new Error(`Agent "${targetAgentName}" not found`);
        }

        // 使用目标智能体生成摘要
        const memories = relevantMemories
            .map(memory => memory.content)
            .join('\n\n');

        const result = await agent.generate(
            `请基于以下信息生成一个简洁的摘要，抓住最重要的信息：\n\n${memories}`
        );

        return result.text;
    }

    /**
     * 清空记忆
     */
    async clearMemories(): Promise<void> {
        await this.storage.clear();
        this.recentMemoryCache = [];
        this.emit('memory:clear');
    }

    /**
     * 更新最近记忆缓存
     */
    private updateRecentMemoryCache(newItem: MemoryItem): void {
        // 将新项添加到缓存的开头
        this.recentMemoryCache.unshift(newItem);

        // 如果缓存超出大小限制，移除最旧的项
        if (this.recentMemoryCache.length > this.cacheSize) {
            this.recentMemoryCache.pop();
        }
    }
}

/**
 * 创建记忆管理器
 */
export function createMemoryManager(options?: {
    storage?: MemoryStorage;
    agents?: Record<string, Agent>;
    cacheSize?: number;
}): MemoryManager {
    return new MemoryManager(options);
}

/**
 * 共享记忆上下文
 * 用于多智能体之间共享记忆
 */
export class SharedMemoryContext {
    private memoryManager: MemoryManager;
    private contextId: string;
    private agentNames: string[] = [];

    /**
     * 构造共享记忆上下文
     */
    constructor(memoryManager: MemoryManager, contextId: string) {
        this.memoryManager = memoryManager;
        this.contextId = contextId;
    }

    /**
     * 添加智能体到共享上下文
     */
    addAgent(agentName: string): void {
        if (!this.agentNames.includes(agentName)) {
            this.agentNames.push(agentName);
        }
    }

    /**
     * 添加记忆到共享上下文
     */
    async addMemory(content: string, agentSource: string, importance: ImportanceLevel = ImportanceLevel.Medium): Promise<string> {
        return this.memoryManager.addMemory({
            type: 'custom',
            content,
            timestamp: Date.now(),
            source: agentSource,
            importance,
            metadata: { contextId: this.contextId },
            associations: this.agentNames,
        });
    }

    /**
     * 获取上下文中的所有记忆
     */
    async getContextMemories(limit: number = 20): Promise<MemoryItem[]> {
        return this.memoryManager.storage.queryItems({
            metadata: { contextId: this.contextId },
            limit
        });
    }

    /**
     * 获取特定智能体在此上下文中的记忆
     */
    async getAgentContextMemories(agentName: string, limit: number = 10): Promise<MemoryItem[]> {
        return this.memoryManager.storage.queryItems({
            metadata: { contextId: this.contextId },
            sources: [agentName],
            limit
        });
    }

    /**
     * 生成上下文摘要
     */
    async generateContextSummary(summarizingAgentName: string): Promise<string> {
        const memories = await this.getContextMemories();

        if (memories.length === 0) {
            return '';
        }

        const agent = this.memoryManager.agents[summarizingAgentName];
        if (!agent) {
            throw new Error(`Agent "${summarizingAgentName}" not found`);
        }

        const content = memories
            .map(memory => `[${memory.source}]: ${memory.content}`)
            .join('\n\n');

        const result = await agent.generate(
            `请对以下多智能体协作上下文生成一个简洁的摘要：\n\n${content}`
        );

        return result.text;
    }
}

/**
 * 创建共享记忆上下文
 */
export function createSharedMemoryContext(
    memoryManager: MemoryManager,
    contextId: string
): SharedMemoryContext {
    return new SharedMemoryContext(memoryManager, contextId);
} 