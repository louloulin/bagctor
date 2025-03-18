/**
 * 智能体知识共享与同步
 * 实现智能体之间的知识共享、同步和传递机制
 */

import { Agent } from '@mastra/core/agent';
import { EventEmitter } from 'events';
import {
    MemoryManager,
    MemoryItem,
    SharedMemoryContext,
    createSharedMemoryContext
} from './memory';

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
 * 知识实体类型
 */
export type KnowledgeEntityType =
    | 'fact'           // 事实性知识
    | 'conclusion'     // 结论/推理结果
    | 'definition'     // 概念定义
    | 'procedure'      // 过程/方法
    | 'rule'           // 规则
    | 'link'           // 关联关系
    | 'context'        // 上下文信息
    | 'data'           // 数据点
    | 'question'       // 问题
    | 'answer'         // 回答
    | 'custom';        // 自定义类型

/**
 * 知识实体接口
 */
export interface KnowledgeEntity {
    /**
     * 实体ID
     */
    id: string;

    /**
     * 实体类型
     */
    type: KnowledgeEntityType;

    /**
     * 实体内容
     */
    content: string;

    /**
     * 创建时间戳
     */
    createdAt: number;

    /**
     * 创建者(智能体ID)
     */
    createdBy: string;

    /**
     * 知识重要性
     */
    importance: ImportanceLevel;

    /**
     * 可信度(0-1)
     */
    confidence: number;

    /**
     * 元数据
     */
    metadata?: Record<string, any>;

    /**
     * 关联实体IDs
     */
    relatedEntities?: string[];

    /**
     * 标签
     */
    tags?: string[];

    /**
     * 向量嵌入(用于相似性搜索)
     */
    embedding?: number[];
}

/**
 * 知识同步方向
 */
export enum SyncDirection {
    /**
     * 单向: 从源到目标
     */
    OneWay = 'one-way',

    /**
     * 双向: 在源和目标之间
     */
    TwoWay = 'two-way'
}

/**
 * 同步配置接口
 */
export interface SyncConfig {
    /**
     * 同步方向
     */
    direction: SyncDirection;

    /**
     * 要同步的知识类型
     */
    entityTypes?: KnowledgeEntityType[];

    /**
     * 最小重要性级别
     */
    minImportance?: ImportanceLevel;

    /**
     * 最小可信度
     */
    minConfidence?: number;

    /**
     * 同步间隔(毫秒)
     */
    interval?: number;

    /**
     * 是否自动同步
     */
    autoSync?: boolean;

    /**
     * 特定标签过滤器
     */
    tags?: string[];
}

/**
 * 知识查询选项
 */
export interface KnowledgeQueryOptions {
    /**
     * 知识类型
     */
    types?: KnowledgeEntityType[];

    /**
     * 创建者ID
     */
    createdBy?: string[];

    /**
     * 开始时间
     */
    startTime?: number;

    /**
     * 结束时间
     */
    endTime?: number;

    /**
     * 最小重要性
     */
    minImportance?: ImportanceLevel;

    /**
     * 最小可信度
     */
    minConfidence?: number;

    /**
     * 结果数量限制
     */
    limit?: number;

    /**
     * 标签过滤
     */
    tags?: string[];

    /**
     * 相关性查询文本
     */
    relevantTo?: string;

    /**
     * 关联实体ID
     */
    relatedTo?: string;
}

/**
 * 知识同步对接口
 */
export interface KnowledgeSyncPair {
    /**
     * 源智能体ID
     */
    sourceAgentId: string;

    /**
     * 目标智能体ID
     */
    targetAgentId: string;

    /**
     * 同步配置
     */
    config: SyncConfig;
}

/**
 * 智能体知识库
 */
export class AgentKnowledgeBase {
    /**
     * 知识实体存储
     */
    private entities: Map<string, KnowledgeEntity> = new Map();

    /**
     * 智能体实例
     */
    private agent: Agent;

    /**
     * 知识库ID
     */
    private id: string;

    /**
     * 记忆管理器
     */
    private memoryManager?: MemoryManager;

    /**
     * 下一个实体ID序号
     */
    private nextEntityId: number = 1;

    /**
     * 构造函数
     */
    constructor(agent: Agent, id: string, memoryManager?: MemoryManager) {
        this.agent = agent;
        this.id = id;
        this.memoryManager = memoryManager;
    }

    /**
     * 添加知识实体
     */
    async addEntity(entity: Omit<KnowledgeEntity, 'id' | 'createdBy' | 'createdAt'>): Promise<KnowledgeEntity> {
        const id = `ke_${this.id}_${this.nextEntityId++}`;
        const now = Date.now();

        const fullEntity: KnowledgeEntity = {
            ...entity,
            id,
            createdBy: this.agent.name || 'unknown',
            createdAt: now
        };

        this.entities.set(id, fullEntity);

        // 同步到记忆系统(如果有)
        if (this.memoryManager) {
            await this.memoryManager.addMemory({
                type: 'fact',
                content: entity.content,
                timestamp: now,
                source: this.agent.name || 'unknown',
                importance: entity.importance,
                metadata: {
                    knowledgeEntityId: id,
                    entityType: entity.type,
                    confidence: entity.confidence,
                    ...entity.metadata
                },
                associations: entity.relatedEntities,
                embedding: entity.embedding
            });
        }

        return fullEntity;
    }

    /**
     * 获取知识实体
     */
    getEntity(id: string): KnowledgeEntity | undefined {
        return this.entities.get(id);
    }

    /**
     * 更新知识实体
     */
    updateEntity(id: string, updates: Partial<KnowledgeEntity>): boolean {
        const entity = this.entities.get(id);
        if (!entity) return false;

        const updatedEntity = { ...entity, ...updates };
        this.entities.set(id, updatedEntity);
        return true;
    }

    /**
     * 删除知识实体
     */
    deleteEntity(id: string): boolean {
        return this.entities.delete(id);
    }

    /**
     * 查询知识实体
     */
    queryEntities(options?: KnowledgeQueryOptions): KnowledgeEntity[] {
        let results = Array.from(this.entities.values());

        if (!options) return results;

        // 按类型过滤
        if (options.types && options.types.length > 0) {
            results = results.filter(entity => options.types!.includes(entity.type));
        }

        // 按创建者过滤
        if (options.createdBy && options.createdBy.length > 0) {
            results = results.filter(entity => options.createdBy!.includes(entity.createdBy));
        }

        // 按时间过滤
        if (options.startTime) {
            results = results.filter(entity => entity.createdAt >= options.startTime!);
        }
        if (options.endTime) {
            results = results.filter(entity => entity.createdAt <= options.endTime!);
        }

        // 按重要性过滤
        if (options.minImportance) {
            results = results.filter(entity => entity.importance >= options.minImportance!);
        }

        // 按可信度过滤
        if (options.minConfidence) {
            results = results.filter(entity => entity.confidence >= options.minConfidence!);
        }

        // 按标签过滤
        if (options.tags && options.tags.length > 0) {
            results = results.filter(entity =>
                entity.tags && options.tags!.some(tag => entity.tags!.includes(tag))
            );
        }

        // 按关联过滤
        if (options.relatedTo) {
            results = results.filter(entity =>
                entity.relatedEntities && entity.relatedEntities.includes(options.relatedTo!)
            );
        }

        // 应用限制
        if (options.limit && options.limit > 0) {
            results = results.slice(0, options.limit);
        }

        return results;
    }

    /**
     * 获取所有知识实体
     */
    getAllEntities(): KnowledgeEntity[] {
        return Array.from(this.entities.values());
    }

    /**
     * 获取知识库摘要
     */
    async getKnowledgeSummary(topic?: string): Promise<string> {
        let entities = this.getAllEntities();

        // 如果指定了主题，过滤相关实体
        if (topic) {
            // 简单实现 - 在实际应用中应该使用向量搜索
            entities = entities.filter(entity =>
                entity.content.toLowerCase().includes(topic.toLowerCase()) ||
                (entity.tags && entity.tags.some(tag => tag.toLowerCase().includes(topic.toLowerCase())))
            );
        }

        if (entities.length === 0) {
            return '知识库中没有相关信息。';
        }

        // 对实体按重要性排序
        entities.sort((a, b) => b.importance - a.importance);

        // 生成摘要内容
        const summaryContent = entities
            .slice(0, 10) // 限制为最重要的10个
            .map(entity => `[${entity.type}] ${entity.content} (可信度: ${entity.confidence})`)
            .join('\n\n');

        // 如果有传入智能体，使用它生成摘要
        if (this.agent.generate) {
            const prompt = `请基于以下知识点生成一个简洁的摘要：\n\n${summaryContent}`;
            try {
                const result = await this.agent.generate(prompt);
                return result.text;
            } catch (error) {
                console.error('生成知识摘要失败:', error);
                return `知识库包含 ${entities.length} 个实体，但无法生成摘要。`;
            }
        }

        // 如果没有智能体，返回原始内容
        return `知识库包含 ${entities.length} 个实体:\n\n${summaryContent}`;
    }
}

/**
 * 知识共享管理器
 * 负责多智能体之间的知识共享和同步
 */
export class KnowledgeSharingManager extends EventEmitter {
    /**
     * 智能体知识库映射
     */
    private knowledgeBases: Map<string, AgentKnowledgeBase> = new Map();

    /**
     * 记忆管理器
     */
    private memoryManager?: MemoryManager;

    /**
     * 智能体映射
     */
    private agents: Map<string, Agent> = new Map();

    /**
     * 同步配置
     */
    private syncPairs: KnowledgeSyncPair[] = [];

    /**
     * 同步定时器
     */
    private syncTimers: Map<string, NodeJS.Timeout> = new Map();

    /**
     * 共享记忆上下文
     */
    private sharedMemoryContexts: Map<string, SharedMemoryContext> = new Map();

    /**
     * 构造函数
     */
    constructor(options: {
        agents?: Record<string, Agent>,
        memoryManager?: MemoryManager
    } = {}) {
        super();

        this.memoryManager = options.memoryManager;

        // 注册智能体
        if (options.agents) {
            Object.entries(options.agents).forEach(([id, agent]) => {
                this.registerAgent(id, agent);
            });
        }
    }

    /**
     * 注册智能体
     */
    registerAgent(id: string, agent: Agent): void {
        this.agents.set(id, agent);

        // 为每个智能体创建知识库
        if (!this.knowledgeBases.has(id)) {
            const knowledgeBase = new AgentKnowledgeBase(agent, id, this.memoryManager);
            this.knowledgeBases.set(id, knowledgeBase);
        }
    }

    /**
     * 添加同步对
     */
    addSyncPair(pair: KnowledgeSyncPair): void {
        this.syncPairs.push(pair);

        // 如果配置了自动同步，设置定时器
        if (pair.config.autoSync && pair.config.interval) {
            const timerId = setInterval(() => {
                this.syncKnowledge(pair.sourceAgentId, pair.targetAgentId, pair.config);
            }, pair.config.interval);

            const pairKey = `${pair.sourceAgentId}->${pair.targetAgentId}`;
            this.syncTimers.set(pairKey, timerId);
        }
    }

    /**
     * 移除同步对
     */
    removeSyncPair(sourceAgentId: string, targetAgentId: string): boolean {
        const pairIndex = this.syncPairs.findIndex(
            pair => pair.sourceAgentId === sourceAgentId && pair.targetAgentId === targetAgentId
        );

        if (pairIndex >= 0) {
            this.syncPairs.splice(pairIndex, 1);

            // 清除定时器
            const pairKey = `${sourceAgentId}->${targetAgentId}`;
            if (this.syncTimers.has(pairKey)) {
                clearInterval(this.syncTimers.get(pairKey)!);
                this.syncTimers.delete(pairKey);
            }

            return true;
        }

        return false;
    }

    /**
     * 同步知识
     */
    async syncKnowledge(
        sourceAgentId: string,
        targetAgentId: string,
        config?: SyncConfig
    ): Promise<number> {
        // 获取源知识库和目标知识库
        const sourceKB = this.knowledgeBases.get(sourceAgentId);
        const targetKB = this.knowledgeBases.get(targetAgentId);

        if (!sourceKB || !targetKB) {
            throw new Error(`知识库不存在: ${!sourceKB ? sourceAgentId : targetAgentId}`);
        }

        // 如果没有提供配置，查找已注册的同步配置
        if (!config) {
            const pair = this.syncPairs.find(
                p => p.sourceAgentId === sourceAgentId && p.targetAgentId === targetAgentId
            );

            if (!pair) {
                throw new Error(`未找到同步配置: ${sourceAgentId} -> ${targetAgentId}`);
            }

            config = pair.config;
        }

        // 从源获取知识实体
        const entities = sourceKB.queryEntities({
            minImportance: config.minImportance,
            minConfidence: config.minConfidence,
            types: config.entityTypes,
            tags: config.tags
        });

        let syncCount = 0;

        // 同步到目标知识库
        for (const entity of entities) {
            // 排除ID，创建者和创建时间，创建一个新实体
            const { id, createdBy, createdAt, ...entityData } = entity;

            await targetKB.addEntity(entityData);
            syncCount++;
        }

        this.emit('knowledge:synced', {
            source: sourceAgentId,
            target: targetAgentId,
            count: syncCount
        });

        // 如果是双向同步，反向同步
        if (config.direction === SyncDirection.TwoWay) {
            const reverseCount = await this.syncKnowledge(
                targetAgentId,
                sourceAgentId,
                { ...config, direction: SyncDirection.OneWay }
            );

            return syncCount + reverseCount;
        }

        return syncCount;
    }

    /**
     * 获取共享记忆上下文
     */
    getSharedMemoryContext(contextId: string): SharedMemoryContext {
        if (!this.memoryManager) {
            throw new Error('记忆管理器未配置，无法创建共享记忆上下文');
        }

        if (!this.sharedMemoryContexts.has(contextId)) {
            const context = createSharedMemoryContext(this.memoryManager, contextId);
            this.sharedMemoryContexts.set(contextId, context);
        }

        return this.sharedMemoryContexts.get(contextId)!;
    }

    /**
     * 共享知识到上下文
     */
    async shareKnowledgeToContext(
        agentId: string,
        contextId: string,
        query: string,
        limit: number = 5
    ): Promise<string[]> {
        const kb = this.knowledgeBases.get(agentId);
        if (!kb) {
            throw new Error(`知识库不存在: ${agentId}`);
        }

        // 查询相关知识
        // 简单实现 - 实际应用中应使用向量相似度搜索
        const entities = kb.queryEntities({
            limit
        }).filter(entity =>
            entity.content.toLowerCase().includes(query.toLowerCase()) ||
            (entity.tags && entity.tags.some(tag => tag.toLowerCase().includes(query.toLowerCase())))
        );

        if (entities.length === 0) {
            return [];
        }

        // 获取共享上下文
        const context = this.getSharedMemoryContext(contextId);

        // 将知识添加到上下文
        const sharedItems: string[] = [];

        for (const entity of entities) {
            const memoryId = await context.addMemory(
                entity.content,
                agentId,
                entity.importance
            );

            sharedItems.push(entity.content);

            // 添加智能体到上下文
            context.addAgent(agentId);
        }

        this.emit('knowledge:shared', {
            agentId,
            contextId,
            count: sharedItems.length
        });

        return sharedItems;
    }

    /**
     * 获取智能体知识库
     */
    getKnowledgeBase(agentId: string): AgentKnowledgeBase | undefined {
        return this.knowledgeBases.get(agentId);
    }

    /**
     * 生成同步报告
     */
    async generateSyncReport(): Promise<Record<string, any>> {
        const report: Record<string, any> = {
            agentCount: this.agents.size,
            knowledgeBaseCount: this.knowledgeBases.size,
            syncPairsCount: this.syncPairs.length,
            knowledgeCounts: {},
            syncDetails: []
        };

        // 收集每个知识库的统计信息
        for (const [agentId, kb] of this.knowledgeBases.entries()) {
            const entities = kb.getAllEntities();
            report.knowledgeCounts[agentId] = entities.length;
        }

        // 收集同步配置详情
        for (const pair of this.syncPairs) {
            report.syncDetails.push({
                source: pair.sourceAgentId,
                target: pair.targetAgentId,
                direction: pair.config.direction,
                autoSync: pair.config.autoSync,
                interval: pair.config.interval
            });
        }

        return report;
    }

    /**
     * 清理资源
     */
    dispose(): void {
        // 清除所有同步定时器
        for (const timer of this.syncTimers.values()) {
            clearInterval(timer);
        }

        this.syncTimers.clear();
        this.syncPairs = [];
        this.knowledgeBases.clear();
        this.agents.clear();
        this.removeAllListeners();
    }
}

/**
 * 创建知识共享管理器
 */
export function createKnowledgeSharingManager(options?: {
    agents?: Record<string, Agent>,
    memoryManager?: MemoryManager
}): KnowledgeSharingManager {
    return new KnowledgeSharingManager(options);
}

/**
 * 知识流程化类型
 */
export enum KnowledgeFlowType {
    Broadcast = 'broadcast',   // 广播到所有智能体
    Chain = 'chain',          // 链式传递
    Star = 'star'             // 中心辐射
}

/**
 * 知识流程化配置
 */
export interface KnowledgeFlowConfig {
    /**
     * 流程类型
     */
    type: KnowledgeFlowType;

    /**
     * 参与智能体
     */
    participants: string[];

    /**
     * 中心智能体(用于Star类型)
     */
    centralAgent?: string;

    /**
     * 知识类型过滤器
     */
    entityTypes?: KnowledgeEntityType[];

    /**
     * 最小重要性级别
     */
    minImportance?: ImportanceLevel;

    /**
     * 最小可信度
     */
    minConfidence?: number;
}

/**
 * 创建知识流程
 */
export function setupKnowledgeFlow(
    manager: KnowledgeSharingManager,
    config: KnowledgeFlowConfig
): void {
    const { type, participants, centralAgent, entityTypes, minImportance, minConfidence } = config;

    // 基本验证
    if (participants.length < 2) {
        throw new Error('知识流程至少需要2个参与者');
    }

    if (type === KnowledgeFlowType.Star && !centralAgent) {
        throw new Error('Star类型流程需要指定中心智能体');
    }

    // 创建同步配置
    const syncConfig: SyncConfig = {
        direction: SyncDirection.OneWay,
        entityTypes,
        minImportance,
        minConfidence,
        autoSync: true,
        interval: 60000 // 默认每分钟同步一次
    };

    switch (type) {
        case KnowledgeFlowType.Broadcast:
            // 每个智能体向所有其他智能体广播
            for (const source of participants) {
                for (const target of participants) {
                    if (source !== target) {
                        manager.addSyncPair({
                            sourceAgentId: source,
                            targetAgentId: target,
                            config: syncConfig
                        });
                    }
                }
            }
            break;

        case KnowledgeFlowType.Chain:
            // 智能体形成一个链，每个只向下一个传递
            for (let i = 0; i < participants.length - 1; i++) {
                manager.addSyncPair({
                    sourceAgentId: participants[i],
                    targetAgentId: participants[i + 1],
                    config: syncConfig
                });
            }
            break;

        case KnowledgeFlowType.Star:
            // 所有智能体与中心智能体双向同步
            const center = centralAgent!;
            for (const participant of participants) {
                if (participant !== center) {
                    manager.addSyncPair({
                        sourceAgentId: center,
                        targetAgentId: participant,
                        config: syncConfig
                    });

                    manager.addSyncPair({
                        sourceAgentId: participant,
                        targetAgentId: center,
                        config: syncConfig
                    });
                }
            }
            break;
    }
} 