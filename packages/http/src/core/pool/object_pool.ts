/**
 * ObjectPool - 通用对象池实现
 * 
 * 提供高效的对象复用机制，减少内存分配和垃圾回收压力
 * 特别适用于HTTP请求/响应对象等频繁创建和销毁的场景
 */

/**
 * 对象池配置选项
 */
export interface ObjectPoolOptions {
    /**
     * 池的最大大小，0表示无限制
     * 默认: 1000
     */
    maxSize?: number;

    /**
     * 池的初始大小（预分配的对象数量）
     * 默认: 10
     */
    initialSize?: number;

    /**
     * 池耗尽策略，当池为空时的行为
     * - 'grow': 创建新对象（默认）
     * - 'wait': 等待对象返回池中
     * - 'throw': 抛出异常
     */
    exhaustionPolicy?: 'grow' | 'wait' | 'throw';

    /**
     * 等待超时（毫秒），仅当exhaustionPolicy为'wait'时有效
     * 默认: 5000
     */
    waitTimeoutMs?: number;

    /**
     * 是否启用资源验证
     * 默认: false
     */
    enableValidation?: boolean;

    /**
     * 资源验证函数，验证对象是否有效
     */
    validator?: (obj: any) => boolean;
}

/**
 * 对象池统计信息
 */
export interface ObjectPoolStats {
    /**
     * 当前池大小
     */
    size: number;

    /**
     * 当前活跃对象数量（已借出未归还）
     */
    active: number;

    /**
     * 空闲对象数量
     */
    idle: number;

    /**
     * 分配的总对象数量
     */
    totalAllocated: number;

    /**
     * 等待获取对象的请求数量
     */
    waitingCount: number;
}

/**
 * 通用对象池实现
 */
export class ObjectPool<T> {
    /**
     * 池中的空闲对象数组
     */
    private pool: T[] = [];

    /**
     * 当前已分配的对象总数（包括活跃和空闲）
     */
    private totalAllocated: number = 0;

    /**
     * 当前活跃（已借出）的对象数量
     */
    private activeCount: number = 0;

    /**
     * 对象创建工厂函数
     */
    private factory: () => T;

    /**
     * 对象重置函数（归还池前调用）
     */
    private reset: (obj: T) => void;

    /**
     * 最大池大小
     */
    private maxSize: number;

    /**
     * 池耗尽策略
     */
    private exhaustionPolicy: 'grow' | 'wait' | 'throw';

    /**
     * 等待超时（毫秒）
     */
    private waitTimeoutMs: number;

    /**
     * 对象验证器
     */
    private validator?: (obj: T) => boolean;

    /**
     * 是否启用验证
     */
    private enableValidation: boolean;

    /**
     * 等待队列：当池为空且策略为'wait'时使用
     */
    private waitQueue: Array<{
        resolve: (obj: T) => void,
        reject: (err: Error) => void
    }> = [];

    /**
     * 构造函数
     * @param factory 创建新对象的工厂函数
     * @param reset 重置对象状态的函数（在对象返回池之前调用）
     * @param options 对象池选项
     */
    constructor(
        factory: () => T,
        reset: (obj: T) => void,
        options?: ObjectPoolOptions
    ) {
        this.factory = factory;
        this.reset = reset;

        // 设置默认选项
        this.maxSize = options?.maxSize ?? 1000;
        this.exhaustionPolicy = options?.exhaustionPolicy ?? 'grow';
        this.waitTimeoutMs = options?.waitTimeoutMs ?? 5000;
        this.enableValidation = options?.enableValidation ?? false;
        this.validator = options?.validator;

        // 预分配对象
        const initialSize = options?.initialSize ?? 10;
        this.preallocate(initialSize);
    }

    /**
     * 从池中获取一个对象
     */
    acquire(): T | Promise<T> {
        // 如果池中有可用对象，直接返回
        if (this.pool.length > 0) {
            const obj = this.pool.pop()!;
            this.activeCount++;

            // 如果启用了验证，验证对象有效性
            if (this.enableValidation && this.validator && !this.validator(obj)) {
                // 对象无效，创建新对象替代
                const newObj = this.factory();
                this.totalAllocated++;
                return newObj;
            }

            return obj;
        }

        // 池为空，根据策略处理
        switch (this.exhaustionPolicy) {
            case 'grow':
                // 创建新对象
                if (this.maxSize === 0 || this.totalAllocated < this.maxSize) {
                    const obj = this.factory();
                    this.totalAllocated++;
                    this.activeCount++;
                    return obj;
                }
            // 达到最大大小限制，降级到wait策略

            case 'wait':
                // 返回一个Promise，等待对象返回池中
                return new Promise<T>((resolve, reject) => {
                    const timeout = setTimeout(() => {
                        // 从等待队列中移除
                        const index = this.waitQueue.findIndex(entry => entry.resolve === resolve);
                        if (index !== -1) {
                            this.waitQueue.splice(index, 1);
                        }
                        reject(new Error('等待对象池中的对象超时'));
                    }, this.waitTimeoutMs);

                    this.waitQueue.push({
                        resolve: (obj: T) => {
                            clearTimeout(timeout);
                            this.activeCount++;
                            resolve(obj);
                        },
                        reject
                    });
                });

            case 'throw':
                throw new Error('对象池已耗尽');

            default:
                throw new Error(`未知的池耗尽策略: ${this.exhaustionPolicy}`);
        }
    }

    /**
     * 将对象返回到池中
     * @param obj 要返回的对象
     */
    release(obj: T): void {
        // 重置对象状态
        this.reset(obj);

        // 如果有等待的请求，直接分配给它们
        if (this.waitQueue.length > 0) {
            const { resolve } = this.waitQueue.shift()!;
            resolve(obj);
            return;
        }

        // 检查是否超过最大池大小
        if (this.maxSize > 0 && this.pool.length >= this.maxSize) {
            // 池已满，不保留此对象
            this.totalAllocated--;
        } else {
            // 将对象放回池中
            this.pool.push(obj);
        }

        this.activeCount--;
    }

    /**
     * 清空对象池
     */
    clear(): void {
        this.pool = [];
        this.totalAllocated = this.activeCount;

        // 拒绝所有等待的请求
        for (const entry of this.waitQueue) {
            entry.reject(new Error('对象池已清空'));
        }
        this.waitQueue = [];
    }

    /**
     * 获取池统计信息
     */
    getStats(): ObjectPoolStats {
        return {
            size: this.totalAllocated,
            active: this.activeCount,
            idle: this.pool.length,
            totalAllocated: this.totalAllocated,
            waitingCount: this.waitQueue.length
        };
    }

    /**
     * 预分配对象到池中
     * @param count 要预分配的对象数量
     */
    private preallocate(count: number): void {
        const actualCount = this.maxSize > 0
            ? Math.min(count, this.maxSize)
            : count;

        for (let i = 0; i < actualCount; i++) {
            const obj = this.factory();
            this.pool.push(obj);
            this.totalAllocated++;
        }
    }
} 