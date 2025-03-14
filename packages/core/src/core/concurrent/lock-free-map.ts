/**
 * 无锁字典实现
 * 
 * 基于分段锁设计的并发字典，适用于高并发场景下的键值存储。
 * 使用分段和哈希分布减少线程竞争，提供高性能的并发读写能力。
 */

/**
 * 字典状态标识
 */
enum MapState {
    OPEN,    // 字典开放，可以进行所有操作
    CLOSING, // 字典正在关闭，不能写入但可以读取
    CLOSED   // 字典已关闭，不能读写
}

/**
 * 无锁字典配置选项
 */
export interface LockFreeMapOptions<K, V> {
    /** 初始容量 */
    initialCapacity?: number;
    /** 负载因子，当填充率超过该值时触发扩容 */
    loadFactor?: number;
    /** 分段数量，影响并发性能 */
    concurrencyLevel?: number;
    /** 最大容量 */
    maxCapacity?: number;
    /** 哈希函数，用于将键映射到数字 */
    hashFn?: (key: K) => number;
    /** 相等性比较函数 */
    equalsFn?: (a: K, b: K) => boolean;
    /** 调试模式 */
    debug?: boolean;
}

/**
 * 字典条目
 */
class MapEntry<K, V> {
    constructor(
        public readonly key: K,
        public value: V,
        public next: MapEntry<K, V> | null = null
    ) { }
}

/**
 * 分段，字典的基本单元
 */
class Segment<K, V> {
    private buckets: Array<MapEntry<K, V> | null>;
    private count: number = 0;

    constructor(
        private capacity: number,
        private loadFactor: number,
        private hashFn: (key: K) => number,
        private equalsFn: (a: K, b: K) => boolean
    ) {
        this.buckets = new Array(capacity).fill(null);
    }

    /**
     * 获取值
     */
    get(key: K): V | undefined {
        const index = this.getIndex(key);
        let entry = this.buckets[index];

        while (entry !== null) {
            if (this.equalsFn(entry.key, key)) {
                return entry.value;
            }
            entry = entry.next;
        }

        return undefined;
    }

    /**
     * 设置键值对
     * @returns 如果是新键则返回true，否则返回false
     */
    set(key: K, value: V): boolean {
        const index = this.getIndex(key);
        let entry = this.buckets[index];
        let prev: MapEntry<K, V> | null = null;

        // 查找现有条目
        while (entry !== null) {
            if (this.equalsFn(entry.key, key)) {
                // 更新现有值
                entry.value = value;
                return false;
            }
            prev = entry;
            entry = entry.next;
        }

        // 添加新条目
        const newEntry = new MapEntry<K, V>(key, value);

        if (prev === null) {
            // 桶为空
            this.buckets[index] = newEntry;
        } else {
            // 添加到链表末尾
            prev.next = newEntry;
        }

        this.count++;
        return true;
    }

    /**
     * 删除键值对
     * @returns 被删除的值，如果键不存在则返回undefined
     */
    delete(key: K): V | undefined {
        const index = this.getIndex(key);
        let entry = this.buckets[index];
        let prev: MapEntry<K, V> | null = null;

        while (entry !== null) {
            if (this.equalsFn(entry.key, key)) {
                // 找到要删除的条目
                if (prev === null) {
                    // 是链表头部
                    this.buckets[index] = entry.next;
                } else {
                    // 是链表中间或尾部
                    prev.next = entry.next;
                }

                this.count--;
                return entry.value;
            }

            prev = entry;
            entry = entry.next;
        }

        return undefined;
    }

    /**
     * 检查键是否存在
     */
    has(key: K): boolean {
        return this.get(key) !== undefined;
    }

    /**
     * 清空分段
     */
    clear(): void {
        this.buckets.fill(null);
        this.count = 0;
    }

    /**
     * 获取分段中的键值对数量
     */
    size(): number {
        return this.count;
    }

    /**
     * 获取所有键值对
     */
    entries(): Array<[K, V]> {
        const result: Array<[K, V]> = [];

        for (let i = 0; i < this.buckets.length; i++) {
            let entry = this.buckets[i];

            while (entry !== null) {
                result.push([entry.key, entry.value]);
                entry = entry.next;
            }
        }

        return result;
    }

    /**
     * 获取键列表
     */
    keys(): K[] {
        return this.entries().map(([k]) => k);
    }

    /**
     * 获取值列表
     */
    values(): V[] {
        return this.entries().map(([_, v]) => v);
    }

    /**
     * 对分段的每个键值对执行回调
     */
    forEach(callback: (value: V, key: K) => void): void {
        for (let i = 0; i < this.buckets.length; i++) {
            let entry = this.buckets[i];

            while (entry !== null) {
                callback(entry.value, entry.key);
                entry = entry.next;
            }
        }
    }

    /**
     * 判断分段是否需要扩容
     */
    needsResize(): boolean {
        return this.count > this.capacity * this.loadFactor;
    }

    /**
     * 扩容并重新哈希
     */
    resize(): void {
        const oldBuckets = this.buckets;
        this.capacity *= 2;
        this.buckets = new Array(this.capacity).fill(null);
        this.count = 0;

        // 重新哈希所有条目
        for (let i = 0; i < oldBuckets.length; i++) {
            let entry = oldBuckets[i];

            while (entry !== null) {
                this.set(entry.key, entry.value);
                entry = entry.next;
            }
        }
    }

    /**
     * 获取键的桶索引
     */
    private getIndex(key: K): number {
        const hash = this.hashFn(key);
        return hash % this.buckets.length;
    }
}

/**
 * 字典统计信息
 */
export interface MapStats {
    /** 总键值对数量 */
    size: number;
    /** 分段数量 */
    segments: number;
    /** 总容量 */
    capacity: number;
    /** 负载因子 */
    loadFactor: number;
    /** 当前填充率 */
    fillRate: number;
    /** 添加操作计数 */
    addCount: number;
    /** 更新操作计数 */
    updateCount: number;
    /** 删除操作计数 */
    removeCount: number;
    /** 获取操作计数 */
    getCount: number;
    /** 命中率 */
    hitRate: number;
    /** 扩容次数 */
    resizeCount: number;
    /** 分段使用情况 */
    segmentUsage?: number[];
}

/**
 * 无锁字典实现
 * 
 * 特性:
 * 1. 分段设计减少冲突
 * 2. 支持自动扩容
 * 3. 支持标准Map操作和迭代
 * 4. 包含详细的性能统计
 */
export class LockFreeMap<K, V> implements Iterable<[K, V]> {
    // 分段数组，每个分段相对独立，减少冲突
    private readonly segments: Segment<K, V>[];
    // 分段掩码，用于快速取模
    private readonly segmentMask: number;
    // 分段移位，用于计算分段索引
    private readonly segmentShift: number;
    // 当前状态
    private state: MapState = MapState.OPEN;
    // 配置选项
    private readonly options: Required<LockFreeMapOptions<K, V>>;
    // 性能统计
    private stats: {
        addCount: number;
        updateCount: number;
        removeCount: number;
        getCount: number;
        getHits: number;
        resizeCount: number;
    };

    /**
     * 创建无锁字典
     */
    constructor(options?: LockFreeMapOptions<K, V>) {
        // 设置默认值
        this.options = {
            initialCapacity: 16,
            loadFactor: 0.75,
            concurrencyLevel: 16,
            maxCapacity: 1_000_000,
            hashFn: this.defaultHashFn,
            equalsFn: this.defaultEqualsFn,
            debug: false,
            ...options
        };

        // 初始化统计信息
        this.stats = {
            addCount: 0,
            updateCount: 0,
            removeCount: 0,
            getCount: 0,
            getHits: 0,
            resizeCount: 0
        };

        // 确保分段数为2的幂
        let concurrencyLevel = this.options.concurrencyLevel;
        let sshift = 0;
        let ssize = 1;

        while (ssize < concurrencyLevel) {
            sshift++;
            ssize <<= 1;
        }

        this.segmentShift = 32 - sshift;
        this.segmentMask = ssize - 1;

        // 初始化分段
        this.segments = new Array(ssize);

        // 计算每个分段的容量
        const segmentCapacity = Math.max(2, Math.floor(this.options.initialCapacity / ssize));

        for (let i = 0; i < this.segments.length; i++) {
            this.segments[i] = new Segment<K, V>(
                segmentCapacity,
                this.options.loadFactor,
                this.options.hashFn,
                this.options.equalsFn
            );
        }

        if (this.options.debug) {
            console.log(`LockFreeMap initialized with ${ssize} segments, each with capacity ${segmentCapacity}`);
        }
    }

    /**
     * 获取指定键的值
     */
    get(key: K): V | undefined {
        if (this.state === MapState.CLOSED) {
            return undefined;
        }

        this.stats.getCount++;
        const segment = this.getSegment(key);
        const value = segment.get(key);

        if (value !== undefined) {
            this.stats.getHits++;
        }

        return value;
    }

    /**
     * 设置键值对
     * @returns 设置后的字典对象，用于链式调用
     */
    set(key: K, value: V): this {
        if (this.state !== MapState.OPEN) {
            if (this.options.debug) {
                console.warn('Cannot set value on a closing or closed map');
            }
            return this;
        }

        const segment = this.getSegment(key);
        const isNewKey = segment.set(key, value);

        if (isNewKey) {
            this.stats.addCount++;
        } else {
            this.stats.updateCount++;
        }

        // 检查并执行扩容
        if (segment.needsResize()) {
            segment.resize();
            this.stats.resizeCount++;
        }

        return this;
    }

    /**
     * 删除指定键的键值对
     * @returns 如果键存在并被删除则返回true，否则返回false
     */
    delete(key: K): boolean {
        if (this.state !== MapState.OPEN) {
            if (this.options.debug) {
                console.warn('Cannot delete from a closing or closed map');
            }
            return false;
        }

        const segment = this.getSegment(key);
        const removed = segment.delete(key);

        if (removed !== undefined) {
            this.stats.removeCount++;
            return true;
        }

        return false;
    }

    /**
     * 检查键是否存在
     */
    has(key: K): boolean {
        if (this.state === MapState.CLOSED) {
            return false;
        }

        return this.getSegment(key).has(key);
    }

    /**
     * 清空字典
     */
    clear(): void {
        if (this.state !== MapState.OPEN) {
            if (this.options.debug) {
                console.warn('Cannot clear a closing or closed map');
            }
            return;
        }

        for (const segment of this.segments) {
            segment.clear();
        }

        // 重置统计信息
        this.stats = {
            addCount: 0,
            updateCount: 0,
            removeCount: 0,
            getCount: 0,
            getHits: 0,
            resizeCount: 0
        };
    }

    /**
     * 获取键值对数量
     */
    size(): number {
        let sum = 0;
        for (const segment of this.segments) {
            sum += segment.size();
        }
        return sum;
    }

    /**
     * 检查字典是否为空
     */
    isEmpty(): boolean {
        return this.size() === 0;
    }

    /**
     * 关闭字典，禁止写入操作
     */
    close(): void {
        this.state = MapState.CLOSING;

        // 如果为空，直接标记为已关闭
        if (this.isEmpty()) {
            this.state = MapState.CLOSED;
        }
    }

    /**
     * 判断字典是否已关闭
     */
    isClosed(): boolean {
        return this.state === MapState.CLOSED;
    }

    /**
     * 获取所有键值对
     */
    entries(): Array<[K, V]> {
        const result: Array<[K, V]> = [];

        for (const segment of this.segments) {
            result.push(...segment.entries());
        }

        return result;
    }

    /**
     * 获取所有键
     */
    keys(): K[] {
        const result: K[] = [];

        for (const segment of this.segments) {
            result.push(...segment.keys());
        }

        return result;
    }

    /**
     * 获取所有值
     */
    values(): V[] {
        const result: V[] = [];

        for (const segment of this.segments) {
            result.push(...segment.values());
        }

        return result;
    }

    /**
     * 对每个键值对执行回调
     */
    forEach(callback: (value: V, key: K, map: LockFreeMap<K, V>) => void): void {
        for (const segment of this.segments) {
            segment.forEach((value, key) => callback(value, key, this));
        }
    }

    /**
     * 迭代器实现，使字典可以用for..of循环
     */
    *[Symbol.iterator](): Iterator<[K, V]> {
        for (const segment of this.segments) {
            for (const entry of segment.entries()) {
                yield entry;
            }
        }
    }

    /**
     * 获取字典统计信息
     */
    getStats(): MapStats {
        const totalSize = this.size();
        const totalCapacity = this.segments.reduce((sum, segment) => sum + segment.entries().length, 0);

        const segmentUsage = this.segments.map(segment => segment.size());

        return {
            size: totalSize,
            segments: this.segments.length,
            capacity: totalCapacity,
            loadFactor: this.options.loadFactor,
            fillRate: totalCapacity > 0 ? totalSize / totalCapacity : 0,
            addCount: this.stats.addCount,
            updateCount: this.stats.updateCount,
            removeCount: this.stats.removeCount,
            getCount: this.stats.getCount,
            hitRate: this.stats.getCount > 0 ? this.stats.getHits / this.stats.getCount : 0,
            resizeCount: this.stats.resizeCount,
            segmentUsage
        };
    }

    /**
     * 获取键所在的分段
     */
    private getSegment(key: K): Segment<K, V> {
        const hash = this.options.hashFn(key);
        // 使用哈希值的高位来确定分段
        return this.segments[(hash >>> this.segmentShift) & this.segmentMask];
    }

    /**
     * 默认哈希函数
     */
    private defaultHashFn(key: K): number {
        if (key === null || key === undefined) {
            return 0;
        }

        if (typeof key === 'number') {
            return Math.abs(key);
        }

        if (typeof key === 'string') {
            let hash = 0;
            for (let i = 0; i < key.length; i++) {
                hash = ((hash << 5) - hash) + key.charCodeAt(i);
                hash |= 0; // 转为32位整数
            }
            return Math.abs(hash);
        }

        // 对于其他类型，使用其toString的哈希值
        const strKey = String(key);
        let hash = 0;
        for (let i = 0; i < strKey.length; i++) {
            hash = ((hash << 5) - hash) + strKey.charCodeAt(i);
            hash |= 0; // 转为32位整数
        }
        return Math.abs(hash);
    }

    /**
     * 默认相等性比较函数
     */
    private defaultEqualsFn(a: K, b: K): boolean {
        return a === b;
    }
} 