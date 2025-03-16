/**
 * AdaptiveObjectPool - 自适应对象池实现
 *
 * 在基本对象池基础上增加自适应大小调整能力，
 * 根据实际使用情况动态调整池大小，优化内存使用
 */

import { ObjectPool, ObjectPoolOptions, ObjectPoolStats } from './object_pool';

/**
 * 自适应对象池配置选项
 */
export interface AdaptivePoolOptions extends ObjectPoolOptions {
    /**
     * 是否启用自适应大小调整
     * 默认: true
     */
    adaptiveResizing?: boolean;

    /**
     * 自适应检查间隔（毫秒）
     * 默认: 10000 (10秒)
     */
    adaptiveCheckIntervalMs?: number;

    /**
     * 最小缩减比例（缩减触发阈值）
     * 当空闲对象比例超过此值时触发缩减
     * 默认: 0.3 (30%)
     */
    minShrinkRatio?: number;

    /**
     * 最小扩展比例（扩展触发阈值）
     * 当活跃对象比例超过此值时触发扩展
     * 默认: 0.7 (70%)
     */
    minGrowRatio?: number;

    /**
     * 缩减步长
     * 每次缩减调整的对象数量百分比
     * 默认: 0.1 (10%)
     */
    shrinkStepRatio?: number;

    /**
     * 扩展步长
     * 每次扩展调整的对象数量百分比
     * 默认: 0.2 (20%)
     */
    growStepRatio?: number;

    /**
     * 最小池大小（自适应调整不会使池小于此值）
     * 默认: 同initialSize或10
     */
    minSize?: number;

    /**
     * 大小调整冷却时间（毫秒）
     * 两次调整之间的最小间隔时间
     * 默认: 5000 (5秒)
     */
    resizeCooldownMs?: number;
}

/**
 * 自适应对象池统计信息（扩展基本统计信息）
 */
export interface AdaptivePoolStats extends ObjectPoolStats {
    /**
     * 池的当前容量（最大可容纳对象数）
     */
    capacity: number;

    /**
     * 活跃对象比例 (0-1)
     */
    activeRatio: number;

    /**
     * 空闲对象比例 (0-1)
     */
    idleRatio: number;

    /**
     * 上次扩展时间（毫秒时间戳）
     */
    lastGrowTime: number;

    /**
     * 上次缩减时间（毫秒时间戳）
     */
    lastShrinkTime: number;

    /**
     * 累计调整次数
     */
    totalResizeOperations: number;

    /**
     * 是否启用了自适应
     */
    adaptiveEnabled: boolean;
}

/**
 * 自适应对象池
 * 监控使用模式并自动调整池大小以优化性能
 */
export class AdaptiveObjectPool<T> extends ObjectPool<T> {
    /**
     * 是否启用自适应大小调整
     */
    private adaptiveResizing: boolean;

    /**
     * 检查间隔（毫秒）
     */
    private adaptiveCheckIntervalMs: number;

    /**
     * 最小缩减比例
     */
    private minShrinkRatio: number;

    /**
     * 最小扩展比例
     */
    private minGrowRatio: number;

    /**
     * 缩减步长比例
     */
    private shrinkStepRatio: number;

    /**
     * 扩展步长比例
     */
    private growStepRatio: number;

    /**
     * 最小池大小
     */
    private minSize: number;

    /**
     * 大小调整冷却时间（毫秒）
     */
    private resizeCooldownMs: number;

    /**
     * 当前池容量
     */
    private capacity: number;

    /**
     * 上次扩展时间
     */
    private lastGrowTime: number = 0;

    /**
     * 上次缩减时间
     */
    private lastShrinkTime: number = 0;

    /**
     * 调整计时器
     */
    private resizeTimer: any = null;

    /**
     * 总调整次数
     */
    private totalResizeOperations: number = 0;

    /**
     * 是否正在调整大小
     */
    private isResizing: boolean = false;

    /**
     * 使用率历史记录（用于平滑决策）
     */
    private usageHistory: number[] = [];

    /**
     * 历史记录最大长度
     */
    private readonly MAX_HISTORY_LENGTH = 10;

    /**
     * 构造函数
     * @param factory 创建新对象的工厂函数
     * @param reset 重置对象状态的函数（在对象返回池之前调用）
     * @param options 自适应对象池选项
     */
    constructor(
        factory: () => T,
        reset: (obj: T) => void,
        options?: AdaptivePoolOptions
    ) {
        // 调用父类构造函数，传递基本选项
        super(factory, reset, options);

        // 设置自适应选项
        this.adaptiveResizing = options?.adaptiveResizing ?? true;
        this.adaptiveCheckIntervalMs = options?.adaptiveCheckIntervalMs ?? 10000;
        this.minShrinkRatio = options?.minShrinkRatio ?? 0.3;
        this.minGrowRatio = options?.minGrowRatio ?? 0.7;
        this.shrinkStepRatio = options?.shrinkStepRatio ?? 0.1;
        this.growStepRatio = options?.growStepRatio ?? 0.2;
        this.minSize = options?.minSize ?? (options?.initialSize ?? 10);
        this.resizeCooldownMs = options?.resizeCooldownMs ?? 5000;

        // 初始容量
        this.capacity = super.getStats().size;

        // 启动自适应检查
        if (this.adaptiveResizing) {
            this.startAdaptiveChecks();
        }
    }

    /**
     * 从池中获取一个对象
     * 重写父类方法以收集使用率统计信息
     */
    acquire(): T | Promise<T> {
        const result = super.acquire();

        // 记录使用情况
        this.recordUsage();

        return result;
    }

    /**
     * 将对象返回到池中
     * 重写父类方法以收集使用率统计信息
     */
    release(obj: T): void {
        super.release(obj);

        // 记录使用情况
        this.recordUsage();
    }

    /**
     * 获取池统计信息，包括自适应特定统计
     */
    getStats(): AdaptivePoolStats {
        const baseStats = super.getStats();
        const activeRatio = baseStats.active / (baseStats.size || 1);
        const idleRatio = baseStats.idle / (baseStats.size || 1);

        return {
            ...baseStats,
            capacity: this.capacity,
            activeRatio,
            idleRatio,
            lastGrowTime: this.lastGrowTime,
            lastShrinkTime: this.lastShrinkTime,
            totalResizeOperations: this.totalResizeOperations,
            adaptiveEnabled: this.adaptiveResizing
        };
    }

    /**
     * 设置自适应调整状态
     * @param enabled 是否启用自适应调整
     */
    setAdaptiveResizing(enabled: boolean): void {
        if (this.adaptiveResizing === enabled) {
            return;
        }

        this.adaptiveResizing = enabled;

        if (enabled) {
            this.startAdaptiveChecks();
        } else {
            this.stopAdaptiveChecks();
        }
    }

    /**
     * 手动触发大小调整检查
     */
    checkAndResize(): void {
        this.performResizeCheck();
    }

    /**
     * 清空对象池
     * 重写父类方法以重置调整状态
     */
    clear(): void {
        super.clear();

        // 重置历史记录
        this.usageHistory = [];

        // 重置容量到初始大小
        this.capacity = this.minSize;
    }

    /**
     * 启动自适应检查
     */
    private startAdaptiveChecks(): void {
        this.stopAdaptiveChecks();

        this.resizeTimer = setInterval(() => {
            this.performResizeCheck();
        }, this.adaptiveCheckIntervalMs);
    }

    /**
     * 停止自适应检查
     */
    private stopAdaptiveChecks(): void {
        if (this.resizeTimer) {
            clearInterval(this.resizeTimer);
            this.resizeTimer = null;
        }
    }

    /**
     * 执行大小调整检查
     */
    private performResizeCheck(): void {
        if (this.isResizing) {
            return;
        }

        this.isResizing = true;

        try {
            const stats = super.getStats();
            const now = Date.now();

            // 计算平均使用率
            const avgUsage = this.calculateAverageUsage();

            // 如果没有足够的历史数据，跳过调整
            if (avgUsage === null) {
                return;
            }

            // 检查是否需要扩展池
            if (
                avgUsage > this.minGrowRatio &&
                now - this.lastGrowTime > this.resizeCooldownMs
            ) {
                this.growPool();
                this.lastGrowTime = now;
                this.totalResizeOperations++;
            }
            // 检查是否需要缩减池
            else if (
                avgUsage < this.minShrinkRatio &&
                stats.size > this.minSize &&
                now - this.lastShrinkTime > this.resizeCooldownMs
            ) {
                this.shrinkPool();
                this.lastShrinkTime = now;
                this.totalResizeOperations++;
            }
        } finally {
            this.isResizing = false;
        }
    }

    /**
     * 扩展池大小
     */
    private growPool(): void {
        const stats = super.getStats();
        const currentSize = stats.size;

        // 计算增长数量
        const growAmount = Math.max(
            1,
            Math.ceil(currentSize * this.growStepRatio)
        );

        // 增加容量
        this.capacity = currentSize + growAmount;

        // 预分配新对象
        this.addNewObjects(growAmount);
    }

    /**
     * 缩减池大小
     */
    private shrinkPool(): void {
        const stats = super.getStats();
        const currentSize = stats.size;
        const idleCount = stats.idle;

        // 不缩减低于最小大小
        if (currentSize <= this.minSize) {
            return;
        }

        // 计算缩减数量
        const shrinkAmount = Math.min(
            idleCount,
            Math.ceil(currentSize * this.shrinkStepRatio)
        );

        // 新容量不应小于最小大小
        this.capacity = Math.max(
            this.minSize,
            currentSize - shrinkAmount
        );

        // 实际缩减在返回对象时自然发生，这里只调整容量
    }

    /**
     * 记录当前使用情况
     */
    private recordUsage(): void {
        const stats = super.getStats();
        const usage = stats.active / (stats.size || 1);

        // 添加到历史记录
        this.usageHistory.push(usage);

        // 限制历史记录大小
        if (this.usageHistory.length > this.MAX_HISTORY_LENGTH) {
            this.usageHistory.shift();
        }
    }

    /**
     * 计算平均使用率
     */
    private calculateAverageUsage(): number | null {
        if (this.usageHistory.length < 3) {
            return null;
        }

        const sum = this.usageHistory.reduce((total, usage) => total + usage, 0);
        return sum / this.usageHistory.length;
    }

    /**
     * 添加新对象到池中
     * @param count 要添加的对象数量
     */
    private addNewObjects(count: number): void {
        for (let i = 0; i < count; i++) {
            // 使用父类的factory创建新对象
            const newObj = super['factory']();
            // 直接添加到池中
            super.release(newObj);
        }
    }
} 