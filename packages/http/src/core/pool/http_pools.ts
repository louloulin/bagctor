/**
 * HTTP对象池 - 专用的HTTP请求和响应对象池实现
 * 
 * 提供针对HTTP请求/响应对象优化的对象池，减少内存分配，
 * 提高HTTP服务器性能
 */

import { ObjectPool, ObjectPoolOptions } from './object_pool';
import { HttpRequest, HttpResponse } from '../../types';

/**
 * HTTP请求对象池
 * 用于复用HTTP请求对象，减少内存分配和GC压力
 */
export class HttpRequestPool extends ObjectPool<HttpRequest> {
    /**
     * 构造函数
     * @param options 对象池选项
     */
    constructor(options?: ObjectPoolOptions) {
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

            // 选项
            options
        );
    }
}

/**
 * HTTP响应对象池
 * 用于复用HTTP响应对象，减少内存分配和GC压力
 */
export class HttpResponsePool extends ObjectPool<HttpResponse> {
    /**
     * 构造函数
     * @param options 对象池选项
     */
    constructor(options?: ObjectPoolOptions) {
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

            // 选项
            options
        );
    }
}

/**
 * 路由上下文对象池
 * 用于复用路由上下文对象，减少内存分配和GC压力
 */
export class RouterContextPool extends ObjectPool<{
    request: HttpRequest;
    params: Record<string, string>;
    query: URLSearchParams;
    state: Map<string, any>;
}> {
    /**
     * 构造函数
     * @param options 对象池选项
     */
    constructor(options?: ObjectPoolOptions) {
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

            // 选项
            options
        );
    }
}

/**
 * 全局共享的HTTP对象池实例
 * 为应用程序提供高效的对象复用
 */

// 默认配置
const DEFAULT_POOL_OPTIONS: ObjectPoolOptions = {
    initialSize: 100,
    maxSize: 1000,
    exhaustionPolicy: 'grow'
};

// HTTP请求对象池
export const sharedRequestPool = new HttpRequestPool(DEFAULT_POOL_OPTIONS);

// HTTP响应对象池
export const sharedResponsePool = new HttpResponsePool(DEFAULT_POOL_OPTIONS);

// 路由上下文对象池
export const sharedContextPool = new RouterContextPool(DEFAULT_POOL_OPTIONS);

/**
 * 从共享池获取HTTP请求对象
 */
export function acquireRequest(): HttpRequest {
    return sharedRequestPool.acquire() as HttpRequest;
}

/**
 * 返回HTTP请求对象到共享池
 */
export function releaseRequest(request: HttpRequest): void {
    sharedRequestPool.release(request);
}

/**
 * 从共享池获取HTTP响应对象
 */
export function acquireResponse(): HttpResponse {
    return sharedResponsePool.acquire() as HttpResponse;
}

/**
 * 返回HTTP响应对象到共享池
 */
export function releaseResponse(response: HttpResponse): void {
    sharedResponsePool.release(response);
}

/**
 * 从共享池获取路由上下文对象
 */
export function acquireContext(): {
    request: HttpRequest;
    params: Record<string, string>;
    query: URLSearchParams;
    state: Map<string, any>;
} {
    return sharedContextPool.acquire() as any;
}

/**
 * 返回路由上下文对象到共享池
 */
export function releaseContext(context: {
    request: HttpRequest;
    params: Record<string, string>;
    query: URLSearchParams;
    state: Map<string, any>;
}): void {
    sharedContextPool.release(context);
} 