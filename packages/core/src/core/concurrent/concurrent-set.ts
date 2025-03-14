import { LockFreeMap } from './lock-free-map';

/**
 * ConcurrentSet - 基于无锁Map实现的线程安全集合
 * 适用于高并发环境下的集合操作。
 */
export class ConcurrentSet<T> implements Iterable<T> {
    // 使用 LockFreeMap 作为内部存储，值统一为 true
    private map: LockFreeMap<T, boolean>;
    private closed: boolean = false;

    /**
     * 创建一个新的并发集合
     * @param options 配置选项
     */
    constructor(options?: {
        hashFn?: (item: T) => number,
        equalsFn?: (a: T, b: T) => boolean,
        initialCapacity?: number,
        loadFactor?: number,
        concurrencyLevel?: number
    }) {
        this.map = new LockFreeMap<T, boolean>(options);
    }

    /**
     * 向集合中添加一个元素
     * @param item 要添加的元素
     * @returns 如果元素是新添加的返回true，如果已存在返回false
     */
    add(item: T): boolean {
        if (this.closed) {
            return false;
        }

        if (this.map.has(item)) {
            return false;
        }

        this.map.set(item, true);
        return true;
    }

    /**
     * 检查集合是否包含指定元素
     * @param item 要检查的元素
     * @returns 如果元素存在返回true，否则返回false
     */
    has(item: T): boolean {
        return this.map.has(item);
    }

    /**
     * 从集合中删除一个元素
     * @param item 要删除的元素
     * @returns 如果元素被删除返回true，如果元素不存在返回false
     */
    delete(item: T): boolean {
        if (this.closed) {
            return false;
        }
        return this.map.delete(item);
    }

    /**
     * 清空集合中的所有元素
     */
    clear(): void {
        if (this.closed) {
            return;
        }
        this.map.clear();
    }

    /**
     * 获取集合中的元素数量
     * @returns 元素数量
     */
    size(): number {
        return this.map.size();
    }

    /**
     * 检查集合是否为空
     * @returns 如果集合为空返回true，否则返回false
     */
    isEmpty(): boolean {
        return this.map.isEmpty();
    }

    /**
     * 获取集合中所有元素的数组
     * @returns 包含所有元素的数组
     */
    toArray(): T[] {
        return this.map.keys();
    }

    /**
     * 为每个元素执行指定函数
     * @param callback 要执行的函数
     */
    forEach(callback: (item: T) => void): void {
        this.map.forEach((_, key) => callback(key));
    }

    /**
     * 检查当前集合是否是另一个集合的子集
     * @param other 另一个集合
     * @returns 如果当前集合是other的子集返回true，否则返回false
     */
    isSubsetOf(other: ConcurrentSet<T>): boolean {
        if (this.size() > other.size()) {
            return false;
        }

        for (const item of this) {
            if (!other.has(item)) {
                return false;
            }
        }

        return true;
    }

    /**
     * 与另一个集合求交集
     * @param other 另一个集合
     * @returns 包含两个集合共有元素的新集合
     */
    intersection(other: ConcurrentSet<T>): ConcurrentSet<T> {
        const result = new ConcurrentSet<T>();

        // 选择较小的集合进行迭代，提高效率
        const [smallerSet, largerSet] = this.size() <= other.size()
            ? [this, other]
            : [other, this];

        for (const item of smallerSet) {
            if (largerSet.has(item)) {
                result.add(item);
            }
        }

        return result;
    }

    /**
     * 与另一个集合求并集
     * @param other 另一个集合
     * @returns 包含两个集合所有元素的新集合
     */
    union(other: ConcurrentSet<T>): ConcurrentSet<T> {
        const result = new ConcurrentSet<T>();

        // 添加当前集合的所有元素
        for (const item of this) {
            result.add(item);
        }

        // 添加另一个集合的所有元素
        for (const item of other) {
            result.add(item);
        }

        return result;
    }

    /**
     * 与另一个集合求差集
     * @param other 另一个集合
     * @returns 包含仅在当前集合中存在的元素的新集合
     */
    difference(other: ConcurrentSet<T>): ConcurrentSet<T> {
        const result = new ConcurrentSet<T>();

        for (const item of this) {
            if (!other.has(item)) {
                result.add(item);
            }
        }

        return result;
    }

    /**
     * 获取集合的迭代器
     * @returns 迭代器
     */
    *[Symbol.iterator](): Iterator<T> {
        for (const item of this.toArray()) {
            yield item;
        }
    }

    /**
     * 关闭集合
     * 关闭后，集合不再接受新的元素，但仍可以读取和删除现有元素
     */
    close(): void {
        this.closed = true;
        this.map.close();
    }

    /**
     * 检查集合是否已关闭
     * @returns 如果集合已关闭返回true，否则返回false
     */
    isClosed(): boolean {
        return this.closed;
    }

    /**
     * 获取集合的统计信息
     * @returns 统计信息对象
     */
    getStats(): any {
        return this.map.getStats();
    }
} 