/**
 * AdaptiveHttpPools - HTTP对象的自适应对象池实现
 * 
 * 提供针对HTTP请求、响应和上下文对象的自适应对象池，
 * 根据实际服务器负载动态调整池大小，优化内存使用
 */

import { HttpRequest, HttpResponse } from '../../types';
import { AdaptiveObjectPool, AdaptivePoolOptions } from './adaptive_pool';

// 定义RouterContext类型（与原始http_pools.ts保持一致）
type RouterContext = {
    request: HttpRequest;
    params: Record<string, string>;
    query: URLSearchParams;
    state: Map<string, any>;
};

/**
 * HTTP请求的自适应对象池
 */
export class AdaptiveHttpRequestPool extends AdaptiveObjectPool<HttpRequest> {
    /**
     * 构造函数
     * @param options 自适应对象池选项
     */
    constructor(options?: AdaptivePoolOptions) {
        super(
            // 工厂函数：创建新的HTTP请求对象
            () => ({
                method: '',
                url: '',
                headers: new Headers(),
                body: null,
                state: new Map()
            }),

            // 重置函数：清空请求对象的状态
            (request) => {
                request.method = '';
                request.url = '';
                request.headers = new Headers();
                request.body = null;

                // 清空state Map
                if (request.state) {
                    request.state.clear();
                } else {
                    request.state = new Map();
                }
            },

            // 自适应选项，允许池根据实际使用动态调整大小
            {
                ...options,
                // 默认的自适应选项，可被传入选项覆盖
                initialSize: options?.initialSize ?? 50,
                maxSize: options?.maxSize ?? 500,
                minSize: options?.minSize ?? 20,
                adaptiveResizing: options?.adaptiveResizing ?? true,
                adaptiveCheckIntervalMs: options?.adaptiveCheckIntervalMs ?? 5000, // 更频繁检查
                minGrowRatio: options?.minGrowRatio ?? 0.6, // 较早触发增长
                minShrinkRatio: options?.minShrinkRatio ?? 0.2, // 不过早缩减
                exhaustionPolicy: options?.exhaustionPolicy ?? 'grow'
            }
        );
    }

    /**
     * 调整池大小以适应突发流量
     * @param burstFactor 突发系数（与当前活跃请求相乘得到新容量）
     */
    prepareForTrafficBurst(burstFactor: number = 2.0): void {
        const stats = this.getStats();
        const currentActive = stats.active;
        const requiredCapacity = Math.ceil(currentActive * burstFactor);

        // 只有当需要的容量大于当前容量时才扩展
        if (requiredCapacity > stats.size) {
            const growAmount = requiredCapacity - stats.size;
            console.log(`[AdaptiveHttpRequestPool] 为流量突发预分配 ${growAmount} 个请求对象`);

            // 触发手动调整
            this.checkAndResize();
        }
    }
}

/**
 * HTTP响应的自适应对象池
 */
export class AdaptiveHttpResponsePool extends AdaptiveObjectPool<HttpResponse> {
    /**
     * 构造函数
     * @param options 自适应对象池选项
     */
    constructor(options?: AdaptivePoolOptions) {
        super(
            // 工厂函数：创建新的HTTP响应对象
            () => ({
                status: 200,
                headers: new Headers(),
                body: ''
            }),

            // 重置函数：清空响应对象的状态
            (response) => {
                response.status = 200;
                response.headers = new Headers();
                response.body = '';
            },

            // 自适应选项
            {
                ...options,
                initialSize: options?.initialSize ?? 50,
                maxSize: options?.maxSize ?? 500,
                minSize: options?.minSize ?? 20,
                adaptiveResizing: options?.adaptiveResizing ?? true,
                adaptiveCheckIntervalMs: options?.adaptiveCheckIntervalMs ?? 5000,
                exhaustionPolicy: options?.exhaustionPolicy ?? 'grow'
            }
        );
    }
}

/**
 * 路由上下文的自适应对象池
 */
export class AdaptiveRouterContextPool extends AdaptiveObjectPool<RouterContext> {
    /**
     * 构造函数
     * @param options 自适应对象池选项
     */
    constructor(options?: AdaptivePoolOptions) {
        super(
            // 工厂函数：创建新的路由上下文对象
            () => ({
                request: null as any,
                params: {},
                query: new URLSearchParams(),
                state: new Map()
            }),

            // 重置函数：清空路由上下文对象的状态
            (context) => {
                context.request = null as any;
                context.params = {};
                context.query = new URLSearchParams();

                // 清空state Map
                if (context.state) {
                    context.state.clear();
                } else {
                    context.state = new Map();
                }
            },

            // 自适应选项
            {
                ...options,
                initialSize: options?.initialSize ?? 50,
                maxSize: options?.maxSize ?? 500,
                minSize: options?.minSize ?? 20,
                adaptiveResizing: options?.adaptiveResizing ?? true,
                exhaustionPolicy: options?.exhaustionPolicy ?? 'grow'
            }
        );
    }
}

/**
 * 默认配置选项
 */
const DEFAULT_ADAPTIVE_OPTIONS: AdaptivePoolOptions = {
    initialSize: 50,
    maxSize: 1000,
    minSize: 20,
    adaptiveResizing: true,
    adaptiveCheckIntervalMs: 5000, // 5秒检查一次
    minGrowRatio: 0.65, // 当使用率超过65%时扩展
    minShrinkRatio: 0.25, // 当使用率低于25%时缩减
    growStepRatio: 0.3, // 每次扩展30%
    shrinkStepRatio: 0.1, // 每次缩减10%
    resizeCooldownMs: 2000, // 调整冷却时间2秒
    exhaustionPolicy: 'grow'
};

/**
 * 全局共享的自适应HTTP对象池实例
 */

// HTTP请求自适应对象池
export const sharedAdaptiveRequestPool = new AdaptiveHttpRequestPool(DEFAULT_ADAPTIVE_OPTIONS);

// HTTP响应自适应对象池
export const sharedAdaptiveResponsePool = new AdaptiveHttpResponsePool(DEFAULT_ADAPTIVE_OPTIONS);

// 路由上下文自适应对象池
export const sharedAdaptiveContextPool = new AdaptiveRouterContextPool(DEFAULT_ADAPTIVE_OPTIONS);

/**
 * 从共享池获取HTTP请求对象
 */
export function acquireAdaptiveRequest(): HttpRequest {
    return sharedAdaptiveRequestPool.acquire() as HttpRequest;
}

/**
 * 返回HTTP请求对象到共享池
 */
export function releaseAdaptiveRequest(request: HttpRequest): void {
    sharedAdaptiveRequestPool.release(request);
}

/**
 * 从共享池获取HTTP响应对象
 */
export function acquireAdaptiveResponse(): HttpResponse {
    return sharedAdaptiveResponsePool.acquire() as HttpResponse;
}

/**
 * 返回HTTP响应对象到共享池
 */
export function releaseAdaptiveResponse(response: HttpResponse): void {
    sharedAdaptiveResponsePool.release(response);
}

/**
 * 从共享池获取路由上下文对象
 */
export function acquireAdaptiveContext(): RouterContext {
    return sharedAdaptiveContextPool.acquire() as RouterContext;
}

/**
 * 返回路由上下文对象到共享池
 */
export function releaseAdaptiveContext(context: RouterContext): void {
    sharedAdaptiveContextPool.release(context);
}

/**
 * 准备所有池以应对流量突发
 * @param burstFactor 突发系数
 */
export function preparePoolsForTrafficBurst(burstFactor: number = 2.0): void {
    sharedAdaptiveRequestPool.prepareForTrafficBurst(burstFactor);

    // 获取请求池的统计信息并据此调整其他池
    const requestStats = sharedAdaptiveRequestPool.getStats();
    const currentActive = requestStats.active;
    const requiredCapacity = Math.ceil(currentActive * burstFactor);

    // 手动触发其他池的大小调整
    sharedAdaptiveResponsePool.checkAndResize();
    sharedAdaptiveContextPool.checkAndResize();

    console.log(`[AdaptiveHttpPools] 所有池已准备好应对流量突发，当前活跃: ${currentActive}, 目标容量: ${requiredCapacity}`);
}

/**
 * 获取所有池的统计信息
 */
export function getAllPoolStats(): {
    requestPool: ReturnType<typeof sharedAdaptiveRequestPool.getStats>,
    responsePool: ReturnType<typeof sharedAdaptiveResponsePool.getStats>,
    contextPool: ReturnType<typeof sharedAdaptiveContextPool.getStats>
} {
    return {
        requestPool: sharedAdaptiveRequestPool.getStats(),
        responsePool: sharedAdaptiveResponsePool.getStats(),
        contextPool: sharedAdaptiveContextPool.getStats()
    };
}

/**
 * 调整所有HTTP池的大小
 * @param options 新的池配置选项
 */
export function reconfigureHttpPools(options: AdaptivePoolOptions): void {
    // 更新请求池配置
    if (options.adaptiveResizing !== undefined) {
        sharedAdaptiveRequestPool.setAdaptiveResizing(options.adaptiveResizing);
        sharedAdaptiveResponsePool.setAdaptiveResizing(options.adaptiveResizing);
        sharedAdaptiveContextPool.setAdaptiveResizing(options.adaptiveResizing);
    }

    // 手动触发所有池的大小调整检查
    sharedAdaptiveRequestPool.checkAndResize();
    sharedAdaptiveResponsePool.checkAndResize();
    sharedAdaptiveContextPool.checkAndResize();

    console.log('[AdaptiveHttpPools] 已重新配置所有HTTP对象池');
} 