/**
 * radix_tree.ts
 * 
 * 高性能基数树(Radix Tree)实现，用于HTTP路由匹配
 * 提供近乎常数时间的路由查找性能，显著优化路由匹配效率
 */

import { RouteParams } from '../../types';

/**
 * HTTP方法枚举
 */
export enum HttpMethod {
    GET = 'GET',
    POST = 'POST',
    PUT = 'PUT',
    DELETE = 'DELETE',
    PATCH = 'PATCH',
    HEAD = 'HEAD',
    OPTIONS = 'OPTIONS',
    TRACE = 'TRACE',
    CONNECT = 'CONNECT'
}

/**
 * 路由处理函数类型
 */
export type RouteHandler = (params: RouteParams, path: string) => any;

/**
 * 路由节点类型
 */
interface RouteNode {
    // 节点路径段
    segment: string;
    // 是否是通配符
    isWildcard: boolean;
    // 参数名（如果是参数节点）
    paramName: string | null;
    // 处理函数（如果是终端节点）
    handlers: Map<HttpMethod, RouteHandler> | null;
    // 子节点
    children: RouteNode[];
    // 缓存前缀，用于快速匹配
    prefixCache: Map<string, RouteNode>;
}

/**
 * 匹配结果类型
 */
export interface MatchResult {
    handler: RouteHandler | null;
    params: RouteParams;
}

/**
 * 基数树路由器
 * 使用基数树算法实现高效的路由匹配
 */
export class RadixTreeRouter {
    private root: RouteNode;
    // 路由缓存，提高频繁访问路由的性能
    private routeCache: Map<string, Map<HttpMethod, MatchResult>>;
    // 缓存大小限制
    private readonly cacheLimit: number;

    /**
     * 创建基数树路由器
     * @param cacheLimit 缓存大小限制，默认1000
     */
    constructor(cacheLimit: number = 1000) {
        this.root = this.createNode('', false);
        this.routeCache = new Map();
        this.cacheLimit = cacheLimit;
    }

    /**
     * 创建路由节点
     */
    private createNode(segment: string, isWildcard: boolean): RouteNode {
        return {
            segment,
            isWildcard,
            paramName: null,
            handlers: null,
            children: [],
            prefixCache: new Map()
        };
    }

    /**
     * 添加路由
     * @param method HTTP方法
     * @param path 路径
     * @param handler 处理函数
     */
    public addRoute(method: HttpMethod, path: string, handler: RouteHandler): void {
        // 清除缓存，确保路由更新后缓存一致性
        this.routeCache.clear();

        // 标准化路径
        if (!path.startsWith('/')) {
            path = '/' + path;
        }

        // 分割路径段
        const segments = this.splitPath(path);
        let current = this.root;

        for (let i = 0; i < segments.length; i++) {
            const segment = segments[i];
            const isLast = i === segments.length - 1;

            // 检查是否是参数节点
            let isParam = false;
            let paramName: string | null = null;
            let isWildcard = false;
            let nodeSegment = segment;

            if (segment.startsWith(':')) {
                isParam = true;
                paramName = segment.slice(1);
                nodeSegment = '*'; // 使用通配符表示参数
            } else if (segment === '*') {
                isWildcard = true;
            }

            // 查找匹配的子节点
            let found = false;
            for (const child of current.children) {
                if (child.segment === nodeSegment) {
                    current = child;
                    found = true;
                    break;
                }
            }

            // 没有找到匹配的子节点，创建新节点
            if (!found) {
                const newNode = this.createNode(nodeSegment, isWildcard);
                if (isParam) {
                    newNode.paramName = paramName;
                }
                current.children.push(newNode);
                current = newNode;
            }

            // 如果是最后一个段，设置处理函数
            if (isLast) {
                if (!current.handlers) {
                    current.handlers = new Map();
                }
                current.handlers.set(method, handler);
            }
        }
    }

    /**
     * 匹配路由
     * @param method HTTP方法
     * @param path 路径
     * @returns 匹配结果
     */
    public matchRoute(method: HttpMethod, path: string): MatchResult {
        // 检查缓存
        const cacheKey = `${method}:${path}`;
        const cachedMethod = this.routeCache.get(path);
        if (cachedMethod && cachedMethod.has(method)) {
            const result = cachedMethod.get(method);
            if (result) {
                return result;
            }
        }

        // 标准化路径
        if (!path.startsWith('/')) {
            path = '/' + path;
        }

        const segments = this.splitPath(path);
        const params: RouteParams = {};

        // 执行匹配
        const result = this.matchNode(this.root, segments, 0, params);

        // 更新缓存
        if (result.handler) {
            if (!this.routeCache.has(path)) {
                // 如果缓存过大，清理最早的条目
                if (this.routeCache.size >= this.cacheLimit) {
                    const firstKey = this.routeCache.keys().next().value;
                    if (firstKey) {
                        this.routeCache.delete(firstKey);
                    }
                }
                this.routeCache.set(path, new Map());
            }

            const methodMap = this.routeCache.get(path);
            if (methodMap) {
                methodMap.set(method, result);
            }
        }

        return result;
    }

    /**
     * 匹配节点
     * @param node 当前节点
     * @param segments 路径段
     * @param index 当前索引
     * @param params 参数对象
     * @returns 匹配结果
     */
    private matchNode(
        node: RouteNode,
        segments: string[],
        index: number,
        params: RouteParams
    ): MatchResult {
        // 到达路径末尾
        if (index === segments.length) {
            if (node.handlers && node.handlers.has(HttpMethod.GET)) {
                const handler = node.handlers.get(HttpMethod.GET);
                if (handler) {
                    return { handler, params };
                }
            }
            return { handler: null, params };
        }

        const segment = segments[index];

        // 检查前缀缓存
        if (node.prefixCache.has(segment)) {
            const nextNode = node.prefixCache.get(segment);
            if (nextNode) {
                return this.matchNode(nextNode, segments, index + 1, params);
            }
        }

        // 尝试精确匹配
        for (const child of node.children) {
            if (child.segment === segment) {
                // 更新前缀缓存
                node.prefixCache.set(segment, child);
                return this.matchNode(child, segments, index + 1, params);
            }
        }

        // 尝试参数匹配
        for (const child of node.children) {
            if (child.segment === '*' && child.paramName) {
                params[child.paramName] = segment;
                return this.matchNode(child, segments, index + 1, params);
            }
        }

        // 尝试通配符匹配
        for (const child of node.children) {
            if (child.isWildcard) {
                return this.matchNode(child, segments, index + 1, params);
            }
        }

        // 没有匹配
        return { handler: null, params };
    }

    /**
     * 分割路径为段
     * @param path 路径
     * @returns 路径段数组
     */
    private splitPath(path: string): string[] {
        return path.split('/').filter(segment => segment.length > 0);
    }

    /**
     * 清除路由缓存
     */
    public clearCache(): void {
        this.routeCache.clear();
    }

    /**
     * 获取路由数量
     */
    public getRoutesCount(): number {
        return this.countRoutes(this.root);
    }

    /**
     * 计算路由数量
     */
    private countRoutes(node: RouteNode): number {
        let count = 0;
        if (node.handlers) {
            count += node.handlers.size;
        }

        for (const child of node.children) {
            count += this.countRoutes(child);
        }

        return count;
    }
}
