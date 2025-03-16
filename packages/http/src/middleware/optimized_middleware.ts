/**
 * optimized_middleware.ts
 * 
 * 优化的中间件执行引擎
 * 提高中间件链的执行效率，减少性能开销
 */

import { MiddlewareFunction } from '../core/router/optimized_router';
import { createThreadLocal } from '../core/performance/thread_local';

/**
 * 中间件组合选项
 */
export interface MiddlewareComposeOptions {
    // 是否缓存中间件链函数
    enableCaching?: boolean;
    // 是否在线程本地存储中缓存
    useThreadLocal?: boolean;
    // 缓存大小限制
    cacheLimit?: number;
}

// 全局中间件链函数缓存
const middlewareChainCache = new Map<string, Function>();

// 线程本地中间件链函数缓存
const threadLocalCache = createThreadLocal<Map<string, Function>>(
    'middlewareChainCache',
    new Map<string, Function>()
);

/**
 * 计算中间件链的缓存键
 * @param middleware 中间件函数数组
 */
function calculateCacheKey(middleware: MiddlewareFunction[]): string {
    // 使用中间件函数的引用地址计算哈希
    return middleware.map(fn => fn.toString()).join('::');
}

/**
 * 优化的中间件组合函数
 * 
 * 将多个中间件函数组合成一个单一的异步函数
 * 优化中间件的执行效率，减少函数调用开销
 * 
 * @param middleware 中间件函数数组
 * @param options 中间件组合选项
 */
export function composeMiddleware(
    middleware: MiddlewareFunction[],
    options: MiddlewareComposeOptions = {}
): (context: any, next?: () => Promise<void>) => Promise<void> {
    const {
        enableCaching = true,
        useThreadLocal = true,
        cacheLimit = 100
    } = options;

    // 如果没有中间件，返回一个空的中间件函数
    if (!middleware.length) {
        return async (context: any, next?: () => Promise<void>) => {
            if (next) await next();
        };
    }

    // 启用缓存时，尝试从缓存中获取
    if (enableCaching) {
        const cacheKey = calculateCacheKey(middleware);

        // 优先从线程本地缓存获取
        if (useThreadLocal) {
            const cache = threadLocalCache.get();
            if (cache && cache.has(cacheKey)) {
                return cache.get(cacheKey) as (context: any, next?: () => Promise<void>) => Promise<void>;
            }
        }

        // 全局缓存查找
        if (middlewareChainCache.has(cacheKey)) {
            return middlewareChainCache.get(cacheKey) as (context: any, next?: () => Promise<void>) => Promise<void>;
        }
    }

    /**
     * 递归执行中间件
     * @param context 上下文对象
     * @param middlewareList 中间件列表
     * @param index 当前中间件索引
     * @param finalNext 最终的next函数
     */
    const executeMiddleware = async (
        context: any,
        middlewareList: MiddlewareFunction[],
        index: number,
        finalNext?: () => Promise<void>
    ): Promise<void> => {
        // 所有中间件已执行完毕，调用最终的next函数
        if (index >= middlewareList.length) {
            if (finalNext) await finalNext();
            return;
        }

        // 获取当前中间件
        const currentMiddleware = middlewareList[index];

        // 定义下一个中间件的执行函数
        const next = async (): Promise<void> => {
            await executeMiddleware(context, middlewareList, index + 1, finalNext);
        };

        // 执行当前中间件
        await currentMiddleware(context, next);
    };

    // 创建组合后的中间件函数
    const composedMiddleware = async (
        context: any,
        next?: () => Promise<void>
    ): Promise<void> => {
        await executeMiddleware(context, middleware, 0, next);
    };

    // 缓存组合后的中间件函数
    if (enableCaching) {
        const cacheKey = calculateCacheKey(middleware);

        // 存入线程本地缓存
        if (useThreadLocal) {
            const cache = threadLocalCache.get();
            if (cache) {
                // 控制缓存大小
                if (cache.size >= cacheLimit) {
                    // 简单的LRU策略 - 删除第一个键
                    const firstKey = cache.keys().next().value;
                    cache.delete(firstKey);
                }

                cache.set(cacheKey, composedMiddleware);
                threadLocalCache.set(cache);
            }
        }

        // 存入全局缓存
        if (middlewareChainCache.size >= cacheLimit) {
            // 简单的LRU策略 - 删除第一个键
            const firstKey = middlewareChainCache.keys().next().value;
            middlewareChainCache.delete(firstKey);
        }

        middlewareChainCache.set(cacheKey, composedMiddleware);
    }

    return composedMiddleware;
}

/**
 * 创建优化的中间件处理器
 * @param middleware 中间件函数数组
 * @param options 中间件组合选项
 */
export function createMiddlewareHandler(
    middleware: MiddlewareFunction[],
    options: MiddlewareComposeOptions = {}
): (context: any) => Promise<void> {
    const composed = composeMiddleware(middleware, options);

    // 返回一个处理器函数，该函数接收上下文并执行所有中间件
    return async (context: any): Promise<void> => {
        await composed(context);
    };
}

/**
 * 清除中间件缓存
 * @param clearThreadLocal 是否清除线程本地缓存
 * @param clearGlobal 是否清除全局缓存
 */
export function clearMiddlewareCache(
    clearThreadLocal: boolean = true,
    clearGlobal: boolean = true
): void {
    if (clearThreadLocal) {
        const cache = threadLocalCache.get();
        if (cache) {
            cache.clear();
            threadLocalCache.set(cache);
        }
    }

    if (clearGlobal) {
        middlewareChainCache.clear();
    }
}

/**
 * 获取中间件缓存统计信息
 */
export function getMiddlewareCacheStats(): any {
    const localCache = threadLocalCache.get();

    return {
        globalCacheSize: middlewareChainCache.size,
        threadLocalCacheSize: localCache ? localCache.size : 0
    };
}
