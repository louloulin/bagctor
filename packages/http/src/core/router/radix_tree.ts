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
 * 匹配结果类型
 */
export interface MatchResult {
    handler: RouteHandler | null | undefined;
    params: RouteParams;
}

/**
 * 路由节点类型
 */
interface Node {
    path: string;
    children: Node[];
    isWildcard: boolean;
    isParam: boolean;
    paramName: string | null;
    handlers: Map<HttpMethod, RouteHandler>;
}

/**
 * 基数树路由器
 * 使用基数树算法实现高效的路由匹配
 */
export class RadixTreeRouter {
    private root: Node;
    routeCache: Map<string, MatchResult>;
    private readonly cacheLimit: number;

    // 缓存命中统计
    private _cacheHits = 0;
    private _cacheMisses = 0;

    /**
     * 创建基数树路由器
     * @param cacheLimit 缓存大小限制，默认1000
     */
    constructor(cacheLimit: number = 1000) {
        this.root = this.createNode('');
        this.routeCache = new Map();
        this.cacheLimit = cacheLimit;
    }

    /**
     * 获取缓存命中次数
     */
    get cacheHits(): number {
        return this._cacheHits;
    }

    /**
     * 获取缓存未命中次数
     */
    get cacheMisses(): number {
        return this._cacheMisses;
    }

    /**
     * 创建节点
     */
    private createNode(path: string): Node {
        return {
            path,
            children: [],
            isWildcard: false,
            isParam: false,
            paramName: null,
            handlers: new Map()
        };
    }

    /**
     * 添加路由
     * @param method HTTP方法
     * @param path 路径
     * @param handler 处理函数
     */
    addRoute(method: HttpMethod, path: string, handler: RouteHandler): void {
        // 清除缓存，因为路由表变更
        this.clearCache();

        if (!path.startsWith('/')) {
            path = '/' + path;
        }

        this.insertRoute(method, path, handler);
    }

    /**
     * 内部插入路由方法
     */
    private insertRoute(method: HttpMethod, path: string, handler: RouteHandler): void {
        let current = this.root;
        const segments = path.split('/').filter(s => s.length > 0);

        for (let i = 0; i < segments.length; i++) {
            const segment = segments[i];
            let matchedChild: Node | null = null;

            // 参数节点 (:param) 或包含参数的节点 (user-:id)
            if (segment.includes(':')) {
                const paramStartIndex = segment.indexOf(':');
                const prefix = segment.substring(0, paramStartIndex);
                const paramName = segment.substring(paramStartIndex + 1);

                // 查找带有相同前缀和参数名的参数节点
                const paramMatches = current.children.filter(c =>
                    c.isParam &&
                    c.path.startsWith(prefix) &&
                    c.paramName === paramName);

                matchedChild = paramMatches.length > 0 ? paramMatches[0] : null;

                if (!matchedChild) {
                    matchedChild = this.createNode(segment);
                    matchedChild.isParam = true;
                    matchedChild.paramName = paramName;
                    current.children.push(matchedChild);
                }
            }
            // 通配符节点 (*)
            else if (segment.startsWith('*')) {
                // 确保wildcardName始终是字符串
                const wildcardName = segment.length > 1 ? segment.substring(1) : '*';
                const wildcardMatches = current.children.filter(c => c.isWildcard && c.paramName === wildcardName);
                matchedChild = wildcardMatches.length > 0 ? wildcardMatches[0] : null;

                if (!matchedChild) {
                    matchedChild = this.createNode('*' + wildcardName);
                    matchedChild.isWildcard = true;
                    matchedChild.paramName = wildcardName;
                    current.children.push(matchedChild);
                }
            }
            // 普通节点
            else {
                const exactMatches = current.children.filter(c => !c.isParam && !c.isWildcard && c.path === segment);
                matchedChild = exactMatches.length > 0 ? exactMatches[0] : null;

                if (!matchedChild) {
                    matchedChild = this.createNode(segment);
                    current.children.push(matchedChild);
                }
            }

            current = matchedChild;
        }

        // 设置处理函数
        current.handlers.set(method, handler);
    }

    /**
     * 匹配路由
     * @param method HTTP方法
     * @param path 路径
     * @returns 匹配结果
     */
    matchRoute(method: HttpMethod, path: string): MatchResult {
        // 检查缓存
        const cacheKey = `${method}:${path}`;
        if (this.routeCache.has(cacheKey)) {
            this._cacheHits++;
            return this.routeCache.get(cacheKey)!;
        }
        this._cacheMisses++;

        // 标准化路径
        if (!path.startsWith('/')) {
            path = '/' + path;
        }

        const segments = path.split('/').filter(s => s.length > 0);
        const params: RouteParams = {};

        // 匹配路由
        const node = this.findNode(this.root, segments, 0, params);

        // 构建结果
        const result: MatchResult = {
            handler: node && node.handlers.has(method) ? node.handlers.get(method) : undefined,
            params
        };

        // 更新缓存
        if (this.routeCache.size >= this.cacheLimit) {
            // 如果缓存超出限制，移除最早的项
            const firstKey = this.routeCache.keys().next().value;
            if (firstKey) {
                this.routeCache.delete(firstKey);
            }
        }
        this.routeCache.set(cacheKey, result);

        return result;
    }

    /**
     * 查找匹配节点
     */
    private findNode(node: Node, segments: string[], index: number, params: RouteParams): Node | null {
        // 已经匹配完所有段
        if (index === segments.length) {
            return node;
        }

        const segment = segments[index];
        let matchedNode: Node | null = null;

        // 1. 尝试精确匹配
        const exactMatches = node.children.filter(child =>
            !child.isParam && !child.isWildcard && child.path === segment);
        const exactMatch = exactMatches.length > 0 ? exactMatches[0] : null;

        if (exactMatch) {
            matchedNode = this.findNode(exactMatch, segments, index + 1, params);
            if (matchedNode) return matchedNode;
        }

        // 2. 尝试参数匹配
        const paramMatches = node.children.filter(child => child.isParam);
        for (const paramNode of paramMatches) {
            // 如果路径包含前缀（如 user-:id）
            if (paramNode.path.indexOf(':') > 0) {
                const prefix = paramNode.path.substring(0, paramNode.path.indexOf(':'));

                // 如果当前段不以前缀开头，跳过
                if (!segment.startsWith(prefix)) {
                    continue;
                }

                // 提取参数值
                const paramValue = segment.substring(prefix.length);

                // 保存原始参数
                const originalParams = { ...params };

                // 设置参数
                if (paramNode.paramName) {
                    params[paramNode.paramName] = paramValue;
                }

                matchedNode = this.findNode(paramNode, segments, index + 1, params);
                if (matchedNode) return matchedNode;

                // 回滚参数
                Object.assign(params, originalParams);
            }
            else {
                // 标准参数节点 (:param)
                // 保存原始参数
                const originalParams = { ...params };

                // 设置参数
                if (paramNode.paramName) {
                    params[paramNode.paramName] = segment;
                }

                matchedNode = this.findNode(paramNode, segments, index + 1, params);
                if (matchedNode) return matchedNode;

                // 回滚参数
                Object.assign(params, originalParams);
            }
        }

        // 3. 尝试通配符匹配
        const wildcardMatches = node.children.filter(child => child.isWildcard);
        const wildcardMatch = wildcardMatches.length > 0 ? wildcardMatches[0] : null;

        if (wildcardMatch) {
            // 通配符匹配剩余所有段
            if (wildcardMatch.paramName && wildcardMatch.paramName !== '*') {
                params[wildcardMatch.paramName] = segments.slice(index).join('/');
            }
            return wildcardMatch;
        }

        return null;
    }

    /**
     * 插入路由（用于兼容旧代码）
     */
    insert(path: string, handler: any): void {
        // 向后兼容旧接口
        const { method, handler: routeHandler } = handler;
        if (method && routeHandler) {
            this.addRoute(method, path, routeHandler);
        }
    }

    /**
     * 查找路由（用于兼容旧代码）
     */
    lookup(path: string): any {
        // 尝试查找任意方法的路由
        if (!path.startsWith('/')) {
            path = '/' + path;
        }

        const segments = path.split('/').filter(s => s.length > 0);
        const params: RouteParams = {};

        const node = this.findNode(this.root, segments, 0, params);

        if (node && node.handlers.size > 0) {
            // 返回第一个匹配的处理函数和参数
            const firstMethodEntry = node.handlers.entries().next();

            if (!firstMethodEntry.done) {
                const [firstMethod, handler] = firstMethodEntry.value;

                return {
                    handler,
                    params,
                    value: { method: firstMethod, handler, middleware: [] }
                };
            }
        }

        return null;
    }

    /**
     * 清除缓存
     */
    clearCache(): void {
        this.routeCache.clear();
    }

    /**
     * 获取路由数
     */
    getRoutesCount(): number {
        return this.countRoutes(this.root);
    }

    /**
     * 计算路由数
     */
    private countRoutes(node: Node): number {
        let count = node.handlers.size;

        for (const child of node.children) {
            count += this.countRoutes(child);
        }

        return count;
    }
} 