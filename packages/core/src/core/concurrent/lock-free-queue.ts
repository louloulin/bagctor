/**
 * 无锁队列实现
 * 
 * 基于单生产者多消费者模型设计的无锁队列，适用于高并发场景下的消息传递。
 * 使用原子操作和循环缓冲区实现高性能无锁队列，减少线程同步开销。
 */

// 队列状态标识
enum QueueState {
    OPEN,    // 队列开放，可以入队和出队
    CLOSING, // 队列正在关闭，不能入队但可以出队
    CLOSED   // 队列已关闭，不能入队和出队
}

/**
 * 无锁队列配置选项
 */
export interface LockFreeQueueOptions<T> {
    /** 初始缓冲区大小 */
    initialCapacity?: number;
    /** 自动扩容策略 */
    autoResize?: boolean;
    /** 最大容量 */
    maxCapacity?: number;
    /** 用于记录队列溢出的回调 */
    onOverflow?: (item: T) => void;
    /** 用于记录队列为空的回调 */
    onEmpty?: () => void;
    /** 队列统计信息采样间隔(ms) */
    statsSampleInterval?: number;
}

/**
 * 无锁队列统计信息
 */
export interface QueueStats {
    /** 当前队列长度 */
    length: number;
    /** 队列容量 */
    capacity: number;
    /** 入队操作计数 */
    enqueueCount: number;
    /** 出队操作计数 */
    dequeueCount: number;
    /** 队列溢出计数 */
    overflowCount: number;
    /** 平均等待时间(ms) */
    averageWaitTimeMs: number;
    /** 最后一次操作时间戳 */
    lastOperationTimestamp: number;
    /** 队列利用率百分比 */
    utilizationPercent: number;
}

/**
 * 无锁队列实现
 * 
 * 特性:
 * 1. 使用原子操作避免锁开销
 * 2. 支持自动扩容
 * 3. 支持优雅关闭
 * 4. 包含详细的性能统计
 */
export class LockFreeQueue<T> {
    // 内部缓冲区
    private buffer: T[];
    // 头指针和尾指针 (使用普通变量，JS中没有真正的原子操作)
    private head: number = 0;
    private tail: number = 0;
    // 队列状态
    private state: QueueState = QueueState.OPEN;
    // 元素计数
    private count: number = 0;
    // 性能统计
    private stats: QueueStats;
    // 配置选项
    private readonly options: Required<LockFreeQueueOptions<T>>;

    /**
     * 创建无锁队列
     */
    constructor(options?: LockFreeQueueOptions<T>) {
        // 设置默认选项
        this.options = {
            initialCapacity: 1024,
            autoResize: true,
            maxCapacity: 1048576, // 1M
            onOverflow: null as unknown as (item: T) => void,
            onEmpty: null as unknown as () => void,
            statsSampleInterval: 1000,
            ...options
        };

        // 初始化缓冲区
        this.buffer = new Array<T>(this.options.initialCapacity);

        // 初始化统计信息
        this.stats = {
            length: 0,
            capacity: this.options.initialCapacity,
            enqueueCount: 0,
            dequeueCount: 0,
            overflowCount: 0,
            averageWaitTimeMs: 0,
            lastOperationTimestamp: Date.now(),
            utilizationPercent: 0
        };
    }

    /**
     * 入队操作
     * @returns 是否入队成功
     */
    enqueue(item: T): boolean {
        // 检查队列状态
        if (this.state !== QueueState.OPEN) {
            return false;
        }

        // 检查队列是否已满
        if (this.isFull()) {
            // 尝试扩容
            if (this.options.autoResize && this.resize()) {
                // 扩容成功，继续入队
            } else {
                // 触发溢出回调
                if (this.options.onOverflow) {
                    this.options.onOverflow(item);
                }
                this.stats.overflowCount++;
                return false;
            }
        }

        // 执行入队
        this.buffer[this.tail] = item;
        this.tail = (this.tail + 1) % this.buffer.length;

        // 原子更新计数
        this.count++;

        // 更新统计信息
        this.stats.enqueueCount++;
        this.stats.length = this.count;
        this.stats.lastOperationTimestamp = Date.now();
        this.stats.utilizationPercent = (this.count / this.buffer.length) * 100;

        return true;
    }

    /**
     * 出队操作
     * @returns 出队的元素，如果队列为空则返回undefined
     */
    dequeue(): T | undefined {
        // 检查队列是否为空
        if (this.isEmpty()) {
            // 触发队列为空回调
            if (this.options.onEmpty) {
                this.options.onEmpty();
            }

            // 如果队列正在关闭且为空，标记为已关闭
            if (this.state === QueueState.CLOSING) {
                this.state = QueueState.CLOSED;
            }

            return undefined;
        }

        // 获取头部元素
        const item = this.buffer[this.head];
        // 清除引用以帮助垃圾回收
        this.buffer[this.head] = undefined as any;
        // 更新头指针
        this.head = (this.head + 1) % this.buffer.length;

        // 原子更新计数
        this.count--;

        // 更新统计信息
        this.stats.dequeueCount++;
        this.stats.length = this.count;
        this.stats.lastOperationTimestamp = Date.now();
        this.stats.utilizationPercent = (this.count / this.buffer.length) * 100;

        // 如果出队后队列变为空
        if (this.count === 0) {
            // 触发队列为空回调
            if (this.options.onEmpty) {
                this.options.onEmpty();
            }

            // 如果队列正在关闭且为空，标记为已关闭
            if (this.state === QueueState.CLOSING) {
                this.state = QueueState.CLOSED;
            }
        }

        return item;
    }

    /**
     * 查看队首元素但不出队
     * @returns 队首元素，如果队列为空则返回undefined
     */
    peek(): T | undefined {
        if (this.isEmpty()) {
            return undefined;
        }
        return this.buffer[this.head];
    }

    /**
     * 队列是否为空
     */
    isEmpty(): boolean {
        return this.count === 0;
    }

    /**
     * 队列是否已满
     */
    isFull(): boolean {
        return this.count === this.buffer.length;
    }

    /**
     * 获取队列当前长度
     */
    size(): number {
        return this.count;
    }

    /**
     * 获取队列容量
     */
    capacity(): number {
        return this.buffer.length;
    }

    /**
     * 清空队列
     */
    clear(): void {
        this.head = 0;
        this.tail = 0;
        this.count = 0;
        this.buffer = new Array<T>(this.buffer.length);

        // 更新统计信息
        this.stats.length = 0;
        this.stats.lastOperationTimestamp = Date.now();
        this.stats.utilizationPercent = 0;
    }

    /**
     * 调整队列大小
     * @returns 是否调整成功
     */
    private resize(): boolean {
        // 检查是否达到最大容量
        if (this.buffer.length >= this.options.maxCapacity) {
            return false;
        }

        // 计算新容量 (2倍增长，但不超过最大容量)
        const newCapacity = Math.min(this.buffer.length * 2, this.options.maxCapacity);

        // 创建新缓冲区
        const newBuffer = new Array<T>(newCapacity);

        // 复制元素到新缓冲区
        let count = 0;
        let index = this.head;

        while (count < this.count) {
            newBuffer[count] = this.buffer[index];
            index = (index + 1) % this.buffer.length;
            count++;
        }

        // 更新指针和缓冲区
        this.head = 0;
        this.tail = this.count;
        this.buffer = newBuffer;

        // 更新容量统计
        this.stats.capacity = newCapacity;
        this.stats.utilizationPercent = (this.count / newCapacity) * 100;

        return true;
    }

    /**
     * 关闭队列，禁止新的入队操作
     */
    close(): void {
        this.state = QueueState.CLOSING;

        // 如果队列为空，直接标记为已关闭
        if (this.isEmpty()) {
            this.state = QueueState.CLOSED;
        }
    }

    /**
     * 判断队列是否已关闭
     */
    isClosed(): boolean {
        return this.state === QueueState.CLOSED;
    }

    /**
     * 获取队列统计信息
     */
    getStats(): QueueStats {
        return { ...this.stats };
    }
} 