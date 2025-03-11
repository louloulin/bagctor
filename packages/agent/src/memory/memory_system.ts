/**
 * 高级记忆系统 - 为Agent提供短期和长期记忆能力
 */

/**
 * 记忆项类型
 */
export interface MemoryItem<T = any> {
    // 记忆键
    key: string;

    // 记忆值
    value: T;

    // 创建时间
    createdAt: number;

    // 最后访问时间
    lastAccessedAt: number;

    // 访问次数
    accessCount: number;

    // 重要性评分 (0-1)
    importance: number;

    // 相关标签
    tags: string[];
}

/**
 * 记忆存储选项
 */
export interface MemoryStoreOptions {
    // 短期记忆容量限制
    shortTermCapacity?: number;

    // 长期记忆容量限制
    longTermCapacity?: number;

    // 自动转移到长期记忆的访问次数阈值
    accessThreshold?: number;

    // 自动转移到长期记忆的重要性阈值
    importanceThreshold?: number;

    // 自动清理时间间隔（毫秒）
    cleanupInterval?: number;
}

/**
 * 记忆查询选项
 */
export interface MemoryQueryOptions {
    // 按标签过滤
    tags?: string[];

    // 按创建时间范围过滤
    createdBefore?: number;
    createdAfter?: number;

    // 按重要性过滤
    minImportance?: number;

    // 结果限制
    limit?: number;

    // 结果排序
    sortBy?: 'createdAt' | 'lastAccessedAt' | 'accessCount' | 'importance';
    sortOrder?: 'asc' | 'desc';
}

/**
 * 记忆存储类
 */
export class MemoryStore {
    // 记忆存储
    private shortTermMemory: Map<string, MemoryItem> = new Map();
    private longTermMemory: Map<string, MemoryItem> = new Map();

    // 清理定时器
    private cleanupTimer: ReturnType<typeof setInterval> | null = null;

    // 配置选项
    private options: Required<MemoryStoreOptions>;

    constructor(options: MemoryStoreOptions = {}) {
        // 设置默认选项
        this.options = {
            shortTermCapacity: options.shortTermCapacity || 100,
            longTermCapacity: options.longTermCapacity || 1000,
            accessThreshold: options.accessThreshold || 3,
            importanceThreshold: options.importanceThreshold || 0.7,
            cleanupInterval: options.cleanupInterval || 60 * 60 * 1000 // 1小时
        };

        // 启动自动清理
        this.startCleanup();
    }

    /**
     * 存储短期记忆
     */
    setShortTerm<T>(key: string, value: T, options: {
        importance?: number;
        tags?: string[];
    } = {}): void {
        const now = Date.now();
        const memoryItem: MemoryItem<T> = {
            key,
            value,
            createdAt: now,
            lastAccessedAt: now,
            accessCount: 0,
            importance: options.importance ?? 0.5,
            tags: options.tags ?? []
        };

        this.shortTermMemory.set(key, memoryItem);

        // 检查容量
        if (this.shortTermMemory.size > this.options.shortTermCapacity) {
            this.trimShortTermMemory();
        }
    }

    /**
     * 存储长期记忆
     */
    setLongTerm<T>(key: string, value: T, options: {
        importance?: number;
        tags?: string[];
    } = {}): void {
        const now = Date.now();
        const memoryItem: MemoryItem<T> = {
            key,
            value,
            createdAt: now,
            lastAccessedAt: now,
            accessCount: 0,
            importance: options.importance ?? 0.5,
            tags: options.tags ?? []
        };

        this.longTermMemory.set(key, memoryItem);

        // 检查容量
        if (this.longTermMemory.size > this.options.longTermCapacity) {
            this.trimLongTermMemory();
        }
    }

    /**
     * 获取短期记忆
     */
    getShortTerm<T = any>(key: string): T | undefined {
        const item = this.shortTermMemory.get(key);
        if (item) {
            // 更新访问信息
            item.lastAccessedAt = Date.now();
            item.accessCount += 1;

            // 检查是否应该转移到长期记忆
            this.checkForPromotion(item);

            return item.value as T;
        }
        return undefined;
    }

    /**
     * 获取长期记忆
     */
    getLongTerm<T = any>(key: string): T | undefined {
        const item = this.longTermMemory.get(key);
        if (item) {
            // 更新访问信息
            item.lastAccessedAt = Date.now();
            item.accessCount += 1;

            return item.value as T;
        }
        return undefined;
    }

    /**
     * 查询短期记忆
     */
    queryShortTerm<T = any>(options: MemoryQueryOptions = {}): MemoryItem<T>[] {
        return this.queryMemory(this.shortTermMemory, options) as MemoryItem<T>[];
    }

    /**
     * 查询长期记忆
     */
    queryLongTerm<T = any>(options: MemoryQueryOptions = {}): MemoryItem<T>[] {
        return this.queryMemory(this.longTermMemory, options) as MemoryItem<T>[];
    }

    /**
     * 删除短期记忆
     */
    removeShortTerm(key: string): boolean {
        return this.shortTermMemory.delete(key);
    }

    /**
     * 删除长期记忆
     */
    removeLongTerm(key: string): boolean {
        return this.longTermMemory.delete(key);
    }

    /**
     * 清理所有记忆
     */
    clear(): void {
        this.shortTermMemory.clear();
        this.longTermMemory.clear();
    }

    /**
     * 停止自动清理
     */
    dispose(): void {
        if (this.cleanupTimer) {
            clearInterval(this.cleanupTimer);
            this.cleanupTimer = null;
        }
    }

    /**
     * 手动促进短期记忆到长期记忆
     */
    promoteToLongTerm(key: string): boolean {
        const item = this.shortTermMemory.get(key);
        if (item) {
            this.longTermMemory.set(key, item);
            this.shortTermMemory.delete(key);
            return true;
        }
        return false;
    }

    /**
     * 获取统计信息
     */
    getStats(): {
        shortTermCount: number;
        longTermCount: number;
        shortTermCapacity: number;
        longTermCapacity: number;
    } {
        return {
            shortTermCount: this.shortTermMemory.size,
            longTermCount: this.longTermMemory.size,
            shortTermCapacity: this.options.shortTermCapacity,
            longTermCapacity: this.options.longTermCapacity
        };
    }

    /**
     * 内部方法：查询记忆
     */
    private queryMemory(
        memoryMap: Map<string, MemoryItem>,
        options: MemoryQueryOptions
    ): MemoryItem[] {
        let results = Array.from(memoryMap.values());

        // 过滤
        if (options.tags) {
            results = results.filter(item => {
                return options.tags!.some(tag => item.tags.includes(tag));
            });
        }

        if (options.createdBefore) {
            results = results.filter(item => item.createdAt < options.createdBefore!);
        }

        if (options.createdAfter) {
            results = results.filter(item => item.createdAt > options.createdAfter!);
        }

        if (options.minImportance !== undefined) {
            results = results.filter(item => item.importance >= options.minImportance!);
        }

        // 排序
        if (options.sortBy) {
            results.sort((a, b) => {
                const aValue = a[options.sortBy!];
                const bValue = b[options.sortBy!];

                if (options.sortOrder === 'desc') {
                    return bValue - aValue;
                }
                return aValue - bValue;
            });
        }

        // 限制
        if (options.limit && results.length > options.limit) {
            results = results.slice(0, options.limit);
        }

        return results;
    }

    /**
     * 内部方法：裁剪短期记忆
     */
    private trimShortTermMemory(): void {
        // 按最后访问时间排序，移除最旧的
        const items = Array.from(this.shortTermMemory.values())
            .sort((a, b) => a.lastAccessedAt - b.lastAccessedAt);

        // 移除最旧的项目，保留到容量限制
        const itemsToRemove = items.length - this.options.shortTermCapacity;
        if (itemsToRemove > 0) {
            for (let i = 0; i < itemsToRemove; i++) {
                this.shortTermMemory.delete(items[i].key);
            }
        }
    }

    /**
     * 内部方法：裁剪长期记忆
     */
    private trimLongTermMemory(): void {
        // 按重要性和访问频率排序，移除最不重要的
        const items = Array.from(this.longTermMemory.values())
            .sort((a, b) => {
                // 结合重要性和访问频率的评分
                const scoreA = a.importance * 0.7 + (a.accessCount / 10) * 0.3;
                const scoreB = b.importance * 0.7 + (b.accessCount / 10) * 0.3;
                return scoreA - scoreB; // 低分在前
            });

        // 移除最不重要的项目，保留到容量限制
        const itemsToRemove = items.length - this.options.longTermCapacity;
        if (itemsToRemove > 0) {
            for (let i = 0; i < itemsToRemove; i++) {
                this.longTermMemory.delete(items[i].key);
            }
        }
    }

    /**
     * 内部方法：检查是否应促进到长期记忆
     */
    private checkForPromotion(item: MemoryItem): void {
        // 满足访问次数或重要性阈值时，促进到长期记忆
        if (
            item.accessCount >= this.options.accessThreshold ||
            item.importance >= this.options.importanceThreshold
        ) {
            this.promoteToLongTerm(item.key);
        }
    }

    /**
     * 内部方法：启动自动清理
     */
    private startCleanup(): void {
        this.cleanupTimer = setInterval(() => {
            this.performCleanup();
        }, this.options.cleanupInterval);
    }

    /**
     * 内部方法：执行清理
     */
    private performCleanup(): void {
        // 清理过期的短期记忆
        // 将一周以上未访问的短期记忆移除
        const oneWeekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;

        for (const [key, item] of this.shortTermMemory.entries()) {
            if (item.lastAccessedAt < oneWeekAgo) {
                this.shortTermMemory.delete(key);
            }
        }

        // 清理长期记忆中的低价值项
        this.trimLongTermMemory();
    }
} 