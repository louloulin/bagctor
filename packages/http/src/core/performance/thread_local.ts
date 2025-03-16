/**
 * thread_local.ts
 * 
 * 线程本地存储(Thread Local Storage)实现
 * 用于减少线程间的资源竞争，提高多线程环境下的性能
 */

import { AsyncLocalStorage } from 'async_hooks';

/**
 * 线程本地存储项接口
 */
export interface ThreadLocalItem<T> {
    get(): T | undefined;
    set(value: T): void;
    remove(): void;
}

/**
 * 线程本地存储管理器
 * 使用 Node.js 的 AsyncLocalStorage API 实现线程本地存储
 */
export class ThreadLocalStorage {
    private static instance: ThreadLocalStorage;
    private storage: AsyncLocalStorage<Map<string, any>>;

    private constructor() {
        this.storage = new AsyncLocalStorage<Map<string, any>>();
    }

    /**
     * 获取线程本地存储单例实例
     */
    public static getInstance(): ThreadLocalStorage {
        if (!ThreadLocalStorage.instance) {
            ThreadLocalStorage.instance = new ThreadLocalStorage();
        }
        return ThreadLocalStorage.instance;
    }

    /**
     * 在线程本地存储上下文中执行回调
     * @param callback 要执行的回调函数
     * @param args 传递给回调函数的参数
     */
    public run<T>(callback: (...args: any[]) => T, ...args: any[]): T {
        return this.storage.run(new Map<string, any>(), () => callback(...args));
    }

    /**
     * 创建线程本地存储项
     * @param key 存储项的唯一键
     * @param initialValue 可选的初始值
     */
    public createThreadLocal<T>(key: string, initialValue?: T): ThreadLocalItem<T> {
        return {
            get: (): T | undefined => {
                const store = this.storage.getStore();
                if (!store) {
                    return undefined;
                }
                return store.get(key) as T;
            },

            set: (value: T): void => {
                const store = this.storage.getStore();
                if (store) {
                    store.set(key, value);
                }
            },

            remove: (): void => {
                const store = this.storage.getStore();
                if (store) {
                    store.delete(key);
                }
            }
        };
    }

    /**
     * 获取当前线程的所有存储项
     */
    public getAllItems(): Map<string, any> | undefined {
        return this.storage.getStore();
    }

    /**
     * 清除当前线程的所有存储项
     */
    public clearAll(): void {
        const store = this.storage.getStore();
        if (store) {
            store.clear();
        }
    }
}

/**
 * 创建指定类型的线程本地变量
 * @param key 存储项的唯一键
 * @param initialValue 可选的初始值
 */
export function createThreadLocal<T>(key: string, initialValue?: T): ThreadLocalItem<T> {
    const tls = ThreadLocalStorage.getInstance();
    const item = tls.createThreadLocal<T>(key, initialValue);

    // 如果提供了初始值且当前没有值，则设置初始值
    if (initialValue !== undefined && item.get() === undefined) {
        item.set(initialValue);
    }

    return item;
}

/**
 * 线程本地请求计数器
 * 用于统计每个线程处理的请求数
 */
export const requestCounter = createThreadLocal<number>('requestCounter', 0);

/**
 * 线程本地性能统计
 * 用于收集每个线程的性能指标
 */
export const performanceStats = createThreadLocal<{
    requestCount: number;
    totalLatency: number;
    maxLatency: number;
    minLatency: number;
    lastRequestTime: number;
}>('performanceStats', {
    requestCount: 0,
    totalLatency: 0,
    maxLatency: 0,
    minLatency: Number.MAX_VALUE,
    lastRequestTime: 0
});

/**
 * 在线程本地存储上下文中执行函数
 * @param callback 要执行的回调函数
 * @param args 传递给回调函数的参数
 */
export function runInThreadLocal<T>(callback: (...args: any[]) => T, ...args: any[]): T {
    return ThreadLocalStorage.getInstance().run(callback, ...args);
}

/**
 * 更新线程本地性能统计
 * @param latency 请求处理延迟时间(毫秒)
 */
export function updatePerformanceStats(latency: number): void {
    const stats = performanceStats.get();
    if (stats) {
        stats.requestCount += 1;
        stats.totalLatency += latency;
        stats.maxLatency = Math.max(stats.maxLatency, latency);
        stats.minLatency = Math.min(stats.minLatency, latency);
        stats.lastRequestTime = Date.now();
        performanceStats.set(stats);
    }

    // 更新请求计数器
    const count = requestCounter.get() || 0;
    requestCounter.set(count + 1);
}

/**
 * 获取当前线程的性能统计
 */
export function getThreadPerformanceStats(): any {
    const stats = performanceStats.get();
    if (!stats) {
        return {
            requestCount: 0,
            avgLatency: 0,
            maxLatency: 0,
            minLatency: 0
        };
    }

    return {
        requestCount: stats.requestCount,
        avgLatency: stats.requestCount > 0 ? stats.totalLatency / stats.requestCount : 0,
        maxLatency: stats.maxLatency,
        minLatency: stats.minLatency === Number.MAX_VALUE ? 0 : stats.minLatency,
        lastRequestTime: stats.lastRequestTime
    };
} 