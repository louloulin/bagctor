/**
 * optimized_router.ts
 * 
 * 基于基数树(Radix Tree)的优化路由器实现
 * 提供高效的路由匹配和路由缓存机制
 */

import { RouteParams } from '../../types';
import { RadixTreeRouter, HttpMethod, RouteHandler, MatchResult } from './radix_tree';

/**
 * 中间件函数类型
 */
export type MiddlewareFunction = (ctx: any, next: () => Promise<void>) => Promise<void>;

/**
 * 路由配置接口
 */
export interface RouteConfig {
    method: string;
    path: string;
    handler: Function;
    middleware?: MiddlewareFunction[];
}

/**
 * 路由上下文接口
 */
export interface RouterContext {
    params: RouteParams;
    path: string;
    route: RouteConfig | null;
    handler: Function | null;
    middleware: MiddlewareFunction[];
}

/**
 * 优化路由器
 * 
 * 使用高效的基数树算法进行路由匹配，优化路由查找性能
 * 实现路由缓存，提高频繁访问路由的响应速度
 */
export class OptimizedRouter {
    private router: RadixTreeRouter;
    private routes: Map<string, RouteConfig>;
    // 中间件缓存，避免重复构建中间件链
    private middlewareCache: Map<string, MiddlewareFunction[]>;
    // 路由命中统计，用于潜在的自适应优化
    private routeHits: Map<string, number>;

    /**
     * 创建优化路由器
     * @param cacheLimit 路由缓存大小限制
     */
    constructor(cacheLimit: number = 1000) {
        this.router = new RadixTreeRouter(cacheLimit);
        this.routes = new Map();
        this.middlewareCache = new Map();
        this.routeHits = new Map();
    }

    /**
     * 将HTTP方法字符串转换为枚举值
     * @param method HTTP方法字符串
     */
    private getMethodEnum(method: string): HttpMethod {
        const upperMethod = method.toUpperCase();
        switch (upperMethod) {
            case 'GET': return HttpMethod.GET;
            case 'POST': return HttpMethod.POST;
            case 'PUT': return HttpMethod.PUT;
            case 'DELETE': return HttpMethod.DELETE;
            case 'PATCH': return HttpMethod.PATCH;
            case 'HEAD': return HttpMethod.HEAD;
            case 'OPTIONS': return HttpMethod.OPTIONS;
            case 'TRACE': return HttpMethod.TRACE;
            case 'CONNECT': return HttpMethod.CONNECT;
            default: return HttpMethod.GET; // 默认使用GET方法
        }
    }

    /**
     * 添加路由
     * @param config 路由配置
     */
    public addRoute(config: RouteConfig): void {
        const { method, path, handler, middleware = [] } = config;
        const routeKey = `${method}:${path}`;

        // 存储路由配置
        this.routes.set(routeKey, config);

        // 转换为枚举类型
        const methodEnum = this.getMethodEnum(method);

        // 添加到基数树路由器
        this.router.addRoute(methodEnum, path, (params: RouteParams, matchedPath: string) => {
            return { params, handler, middleware, path: matchedPath };
        });

        // 预缓存中间件链
        if (middleware.length > 0) {
            this.middlewareCache.set(routeKey, middleware);
        }

        // 初始化路由命中计数
        this.routeHits.set(routeKey, 0);
    }

    /**
     * 获取路由处理函数
     * @param method HTTP方法
     * @param path 路径
     */
    public match(method: string, path: string): RouterContext {
        // 转换为枚举类型
        const methodEnum = this.getMethodEnum(method);

        // 匹配路由
        const result: MatchResult = this.router.matchRoute(methodEnum, path);

        // 路由不存在
        if (!result.handler) {
            return {
                params: {},
                path,
                route: null,
                handler: null,
                middleware: []
            };
        }

        // 获取处理结果
        const handlerResult = result.handler(result.params, path);

        // 增加路由命中计数
        const routeKey = `${method}:${path}`;
        this.routeHits.set(routeKey, (this.routeHits.get(routeKey) || 0) + 1);

        // 构造路由上下文
        const matchedPath = handlerResult.path || path;
        return {
            params: result.params,
            path,
            route: this.routes.get(`${method}:${matchedPath}`) || null,
            handler: handlerResult.handler,
            middleware: handlerResult.middleware || []
        };
    }

    /**
     * 清除路由缓存
     */
    public clearCache(): void {
        this.router.clearCache();
        this.middlewareCache.clear();
    }

    /**
     * 获取路由统计信息
     */
    public getStats(): any {
        // 按命中次数排序的前10个路由
        const topRoutes = Array.from(this.routeHits.entries())
            .sort((a, b) => b[1] - a[1])
            .slice(0, 10);

        return {
            totalRoutes: this.routes.size,
            cachedMiddlewares: this.middlewareCache.size,
            topRoutes
        };
    }

    /**
     * 获取所有路由
     */
    public getRoutes(): Map<string, RouteConfig> {
        return this.routes;
    }
} 