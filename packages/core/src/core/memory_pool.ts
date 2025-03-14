/**
 * 内存池管理系统
 * 提供对象复用和缓冲区管理功能，用于优化内存使用和减少垃圾回收压力
 */

import { log } from '../utils/logger';

/**
 * 对象池接口定义
 */
export interface ObjectPool<T> {
    /**
     * 从对象池获取一个对象
     */
    acquire(): T;

    /**
     * 将对象返回到对象池
     */
    release(obj: T): void;

    /**
     * 获取对象池当前大小
     */
    size(): number;

    /**
     * 清空对象池
     */
    clear(): void;

    /**
     * 获取对象池统计信息
     */
    stats(): PoolStats;
}

/**
 * 池统计信息
 */
export interface PoolStats {
    size: number;
    created: number;
    acquired: number;
    released: number;
    maxSize: number;
    missCount: number;
    hitRate: number;
}

/**
 * 对象工厂函数类型
 */
export type ObjectFactory<T> = () => T;

/**
 * 对象重置函数类型
 */
export type ObjectReset<T> = (obj: T) => void;

/**
 * 对象池配置
 */
export interface ObjectPoolConfig {
    initialSize?: number;
    maxSize?: number;
    growthFactor?: number;
    name?: string;
}

/**
 * 默认对象池配置
 */
const DEFAULT_POOL_CONFIG: ObjectPoolConfig = {
    initialSize: 32,
    maxSize: 1000,
    growthFactor: 2,
    name: 'default'
};

/**
 * 通用对象池实现
 */
export class GenericObjectPool<T> implements ObjectPool<T> {
    private pool: T[] = [];
    private factory: ObjectFactory<T>;
    private reset?: ObjectReset<T>;
    private config: Required<ObjectPoolConfig>;

    // 统计数据
    private createdCount: number = 0;
    private acquiredCount: number = 0;
    private releasedCount: number = 0;
    private missCount: number = 0;

    constructor(
        factory: ObjectFactory<T>,
        reset?: ObjectReset<T>,
        config?: ObjectPoolConfig
    ) {
        this.factory = factory;
        this.reset = reset;
        this.config = {
            initialSize: config?.initialSize ?? DEFAULT_POOL_CONFIG.initialSize!,
            maxSize: config?.maxSize ?? DEFAULT_POOL_CONFIG.maxSize!,
            growthFactor: config?.growthFactor ?? DEFAULT_POOL_CONFIG.growthFactor!,
            name: config?.name ?? DEFAULT_POOL_CONFIG.name!
        };

        // 预先创建初始对象
        this.initialize();
    }

    /**
     * 初始化对象池
     */
    private initialize(): void {
        for (let i = 0; i < this.config.initialSize; i++) {
            this.pool.push(this.createObject());
        }

        log.info(`[MemoryPool] Initialized ${this.config.name} pool with ${this.pool.length} objects`);
    }

    /**
     * 创建新对象
     */
    private createObject(): T {
        this.createdCount++;
        return this.factory();
    }

    /**
     * 从对象池获取一个对象
     */
    acquire(): T {
        this.acquiredCount++;

        if (this.pool.length > 0) {
            return this.pool.pop()!;
        }

        // 池中没有可用对象
        this.missCount++;

        // 创建新对象
        const obj = this.createObject();
        log.debug(`[MemoryPool] Created new object in ${this.config.name} pool (miss)`);
        return obj;
    }

    /**
     * 将对象返回到对象池
     */
    release(obj: T): void {
        this.releasedCount++;

        // 如果池已满，则丢弃对象
        if (this.pool.length >= this.config.maxSize) {
            log.debug(`[MemoryPool] ${this.config.name} pool is full, discarding object`);
            return;
        }

        // 重置对象（如果提供了重置函数）
        if (this.reset) {
            this.reset(obj);
        }

        // 将对象添加回池中
        this.pool.push(obj);
    }

    /**
     * 获取对象池当前大小
     */
    size(): number {
        return this.pool.length;
    }

    /**
     * 清空对象池
     */
    clear(): void {
        const oldSize = this.pool.length;
        this.pool = [];
        log.info(`[MemoryPool] Cleared ${this.config.name} pool (${oldSize} objects released)`);
    }

    /**
     * 获取对象池统计信息
     */
    stats(): PoolStats {
        const hitCount = this.acquiredCount - this.missCount;
        const hitRate = this.acquiredCount > 0 ? hitCount / this.acquiredCount : 0;

        return {
            size: this.pool.length,
            created: this.createdCount,
            acquired: this.acquiredCount,
            released: this.releasedCount,
            maxSize: this.config.maxSize,
            missCount: this.missCount,
            hitRate
        };
    }
}

/**
 * 缓冲区池配置
 */
export interface BufferPoolConfig extends ObjectPoolConfig {
    bufferSize: number;
}

/**
 * 缓冲区池实现
 */
export class BufferPool implements ObjectPool<Buffer> {
    private pool: GenericObjectPool<Buffer>;
    private bufferSize: number;

    constructor(config: BufferPoolConfig) {
        this.bufferSize = config.bufferSize;

        this.pool = new GenericObjectPool<Buffer>(
            // 工厂函数：创建指定大小的缓冲区
            () => Buffer.allocUnsafe(this.bufferSize),

            // 重置函数：清空缓冲区内容
            (buffer) => buffer.fill(0),

            // 配置
            {
                ...config,
                name: config.name || `buffer-${this.bufferSize}`
            }
        );
    }

    acquire(): Buffer {
        return this.pool.acquire();
    }

    release(buffer: Buffer): void {
        if (buffer.length !== this.bufferSize) {
            log.warn(`[MemoryPool] Attempted to release buffer of wrong size to pool (expected ${this.bufferSize}, got ${buffer.length})`);
            return;
        }

        this.pool.release(buffer);
    }

    size(): number {
        return this.pool.size();
    }

    clear(): void {
        this.pool.clear();
    }

    stats(): PoolStats {
        return this.pool.stats();
    }
}

/**
 * 内存池管理器
 * 全局单例，用于管理和访问各种对象池
 */
export class MemoryPoolManager {
    private static instance: MemoryPoolManager;
    private objectPools: Map<string, ObjectPool<any>> = new Map();

    private constructor() {
        // 私有构造函数，确保单例模式
    }

    /**
     * 获取内存池管理器实例
     */
    static getInstance(): MemoryPoolManager {
        if (!MemoryPoolManager.instance) {
            MemoryPoolManager.instance = new MemoryPoolManager();
        }
        return MemoryPoolManager.instance;
    }

    /**
     * 注册对象池
     */
    registerPool<T>(name: string, pool: ObjectPool<T>): void {
        if (this.objectPools.has(name)) {
            log.warn(`[MemoryPool] Pool with name '${name}' already exists, replacing`);
        }

        this.objectPools.set(name, pool);
        log.info(`[MemoryPool] Registered pool '${name}'`);
    }

    /**
     * 获取对象池
     */
    getPool<T>(name: string): ObjectPool<T> | undefined {
        return this.objectPools.get(name) as ObjectPool<T> | undefined;
    }

    /**
     * 创建并注册缓冲区池
     */
    createBufferPool(name: string, bufferSize: number, config?: Omit<BufferPoolConfig, 'bufferSize'>): BufferPool {
        const fullConfig: BufferPoolConfig = {
            bufferSize,
            ...(config || {}),
            name
        };

        const pool = new BufferPool(fullConfig);
        this.registerPool(name, pool);
        return pool;
    }

    /**
     * 创建并注册对象池
     */
    createObjectPool<T>(
        name: string,
        factory: ObjectFactory<T>,
        reset?: ObjectReset<T>,
        config?: ObjectPoolConfig
    ): ObjectPool<T> {
        const pool = new GenericObjectPool<T>(factory, reset, { ...(config || {}), name });
        this.registerPool(name, pool);
        return pool;
    }

    /**
     * 获取所有池的统计信息
     */
    getAllStats(): Record<string, PoolStats> {
        const stats: Record<string, PoolStats> = {};

        for (const [name, pool] of this.objectPools.entries()) {
            stats[name] = pool.stats();
        }

        return stats;
    }

    /**
     * 清除所有池
     */
    clearAll(): void {
        let poolCount = 0;

        for (const pool of this.objectPools.values()) {
            pool.clear();
            poolCount++;
        }

        log.info(`[MemoryPool] Cleared all pools (${poolCount} pools)`);
    }
}

// 导出单例实例
export const memoryPoolManager = MemoryPoolManager.getInstance(); 