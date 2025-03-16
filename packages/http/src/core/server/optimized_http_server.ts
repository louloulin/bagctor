/**
 * OptimizedHttpServer - 高性能HTTP服务器实现
 * 
 * 集成多反应器模式、对象池、优化路由器等优化特性
 * 提供高性能、低延迟的HTTP服务能力
 */

import { Actor, ActorRef, createActor } from '@bactor/core';
import { HttpRequest, HttpResponse } from '../../types';
import { MultiReactorPool } from '../reactor/multi_reactor_pool';
import { OptimizedRouter, RouteConfig } from '../router/optimized_router';
import {
    acquireRequest,
    releaseRequest,
    acquireResponse,
    releaseResponse
} from '../pool/http_pools';
import { Work, WorkResult } from '../reactor/reactor';
import { Server as BunServer } from 'bun';

/**
 * HTTP服务器配置
 */
export interface HttpServerConfig {
    /**
     * 服务器端口
     */
    port: number;

    /**
     * 主机地址
     */
    hostname?: string;

    /**
     * TLS配置(HTTPS)
     */
    tls?: {
        cert: string;
        key: string;
    };

    /**
     * 反应器池配置
     */
    reactorPool?: {
        /**
         * 反应器数量
         */
        reactorCount?: number;

        /**
         * 负载均衡策略
         */
        balancingStrategy?: 'round-robin' | 'least-busy' | 'consistent-hash';
    };

    /**
     * 路由器配置
     */
    router?: {
        /**
         * 启用路由缓存
         */
        enableCache?: boolean;

        /**
         * 缓存大小
         */
        cacheSize?: number;
    };

    /**
     * 日志配置
     */
    logging?: {
        enabled: boolean;
        level: 'debug' | 'info' | 'warn' | 'error';
    };
}

/**
 * 优化的HTTP服务器Actor消息类型
 */
export type HttpServerMessage =
    | { type: 'start' }
    | { type: 'stop' }
    | { type: 'add-route'; config: RouteConfig }
    | { type: 'add-routes'; configs: RouteConfig[] }
    | { type: 'get-stats' }
    | { type: 'health-check' };

/**
 * HTTP服务器状态
 */
interface HttpServerStats {
    /**
     * 服务器运行状态
     */
    status: 'starting' | 'running' | 'stopping' | 'stopped';

    /**
     * 处理的请求数
     */
    requestsProcessed: number;

    /**
     * 成功的请求数
     */
    requestsSucceeded: number;

    /**
     * 失败的请求数
     */
    requestsFailed: number;

    /**
     * 平均响应时间(毫秒)
     */
    avgResponseTime: number;

    /**
     * 反应器池统计
     */
    reactorStats: {
        activeReactors: number;
        totalWorkProcessed: number;
    };

    /**
     * 路由器统计
     */
    routerStats: {
        routeCount: number;
        cacheHits: number;
        cacheMisses: number;
    };
}

/**
 * 优化的HTTP服务器Actor实现
 */
export class OptimizedHttpServerActor extends Actor<HttpServerMessage> {
    /**
     * 服务器配置
     */
    private config: HttpServerConfig;

    /**
     * 底层Bun HTTP服务器
     */
    private server: BunServer | null = null;

    /**
     * 多反应器池
     */
    private reactorPool: MultiReactorPool;

    /**
     * 优化的路由器
     */
    private router: OptimizedRouter;

    /**
     * 服务器状态
     */
    private status: 'starting' | 'running' | 'stopping' | 'stopped' = 'stopped';

    /**
     * 统计数据
     */
    private stats = {
        requestsProcessed: 0,
        requestsSucceeded: 0,
        requestsFailed: 0,
        totalResponseTime: 0,
        startTime: 0
    };

    /**
     * 构造函数
     * @param config HTTP服务器配置
     */
    constructor(config: HttpServerConfig) {
        super();
        this.config = config;

        // 初始化多反应器池
        this.reactorPool = new MultiReactorPool({
            reactorCount: config.reactorPool?.reactorCount,
            balancingStrategy: config.reactorPool?.balancingStrategy || 'least-busy',
            enableAffinityIfSupported: true,
            logging: config.logging
        });

        // 初始化路由器
        this.router = new OptimizedRouter();

        this.log('info', '初始化优化HTTP服务器');
    }

    /**
     * Actor初始化
     */
    async initialize(): Promise<void> {
        // 注册HTTP请求处理器
        this.reactorPool.registerWorkHandler('http.request', this.handleHttpRequest.bind(this));

        this.log('info', 'HTTP服务器Actor初始化完成');
    }

    /**
     * Actor消息处理
     */
    async receive(message: HttpServerMessage): Promise<any> {
        switch (message.type) {
            case 'start':
                return this.startServer();

            case 'stop':
                return this.stopServer();

            case 'add-route':
                this.router.add(message.config);
                return { success: true };

            case 'add-routes':
                this.router.addRoutes(message.configs);
                return { success: true };

            case 'get-stats':
                return this.getStats();

            case 'health-check':
                return {
                    status: this.status,
                    healthy: this.status === 'running'
                };

            default:
                this.log('warn', `收到未知消息类型: ${(message as any).type}`);
                return { error: 'Unknown message type' };
        }
    }

    /**
     * Actor关闭
     */
    async shutdown(): Promise<void> {
        await this.stopServer();
        this.log('info', 'HTTP服务器Actor已关闭');
    }

    /**
     * 启动HTTP服务器
     */
    private async startServer(): Promise<{ success: boolean; port?: number; error?: string }> {
        if (this.status === 'running') {
            return { success: true, port: this.config.port };
        }

        try {
            this.status = 'starting';
            this.log('info', `启动HTTP服务器，端口: ${this.config.port}`);

            // 启动反应器池
            await this.reactorPool.start();

            // 重置统计数据
            this.stats = {
                requestsProcessed: 0,
                requestsSucceeded: 0,
                requestsFailed: 0,
                totalResponseTime: 0,
                startTime: Date.now()
            };

            // 创建并启动Bun HTTP服务器
            this.server = Bun.serve({
                port: this.config.port,
                hostname: this.config.hostname || '0.0.0.0',
                tls: this.config.tls,
                fetch: this.handleRequest.bind(this)
            });

            this.status = 'running';
            this.log('info', `HTTP服务器已启动，正在监听端口 ${this.config.port}`);

            return { success: true, port: this.config.port };
        } catch (error) {
            this.status = 'stopped';
            const errorMessage = error instanceof Error ? error.message : String(error);
            this.log('error', `启动HTTP服务器失败: ${errorMessage}`);
            return { success: false, error: errorMessage };
        }
    }

    /**
     * 停止HTTP服务器
     */
    private async stopServer(): Promise<{ success: boolean; error?: string }> {
        if (this.status === 'stopped') {
            return { success: true };
        }

        try {
            this.status = 'stopping';
            this.log('info', '正在停止HTTP服务器');

            // 停止底层服务器
            if (this.server) {
                this.server.stop();
                this.server = null;
            }

            // 停止反应器池
            await this.reactorPool.stop();

            this.status = 'stopped';
            this.log('info', 'HTTP服务器已停止');

            return { success: true };
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            this.log('error', `停止HTTP服务器失败: ${errorMessage}`);
            return { success: false, error: errorMessage };
        }
    }

    /**
     * 处理HTTP请求入口
     * 在Bun服务器的fetch事件中调用
     */
    private async handleRequest(request: Request): Promise<Response> {
        const startTime = performance.now();

        try {
            // 从请求URL中提取路径
            const url = new URL(request.url);
            const path = url.pathname;

            // 将请求分发到反应器池中处理
            const result = await this.reactorPool.dispatch({
                type: 'http.request',
                payload: {
                    request,
                    method: request.method,
                    path
                }
            });

            // 更新统计信息
            this.stats.requestsProcessed++;
            const responseTime = performance.now() - startTime;
            this.stats.totalResponseTime += responseTime;

            if (result.status === 'success') {
                this.stats.requestsSucceeded++;
                return result.data;
            } else {
                this.stats.requestsFailed++;
                return new Response(
                    JSON.stringify({ error: 'Internal Server Error' }),
                    {
                        status: 500,
                        headers: { 'Content-Type': 'application/json' }
                    }
                );
            }
        } catch (error) {
            this.stats.requestsProcessed++;
            this.stats.requestsFailed++;

            this.log('error', `处理请求时出错: ${error}`);

            return new Response(
                JSON.stringify({
                    error: 'Internal Server Error',
                    message: process.env.NODE_ENV === 'development'
                        ? (error instanceof Error ? error.message : String(error))
                        : undefined
                }),
                {
                    status: 500,
                    headers: { 'Content-Type': 'application/json' }
                }
            );
        }
    }

    /**
     * HTTP请求处理器 - 在反应器中执行
     */
    private async handleHttpRequest(work: Work): Promise<Response> {
        const { request, method, path } = work.payload;

        // 从对象池获取请求和响应对象
        const httpRequest = acquireRequest();
        const httpResponse = acquireResponse();

        try {
            // 填充请求对象
            httpRequest.method = method;
            httpRequest.url = path;
            httpRequest.headers = request.headers;

            // 解析请求体 (如果需要)
            if (['POST', 'PUT', 'PATCH'].includes(method)) {
                const contentType = request.headers.get('content-type') || '';

                if (contentType.includes('application/json')) {
                    httpRequest.body = await request.json();
                } else if (contentType.includes('application/x-www-form-urlencoded')) {
                    const formData = await request.formData();
                    const body: Record<string, any> = {};

                    for (const [key, value] of formData.entries()) {
                        body[key] = value;
                    }

                    httpRequest.body = body;
                } else {
                    httpRequest.body = await request.text();
                }
            }

            // 使用路由器处理请求
            const handled = await this.router.handle(httpRequest, httpResponse);

            if (!handled) {
                // 没有找到匹配的路由
                httpResponse.statusCode = 404;
                httpResponse.setHeader('Content-Type', 'application/json');
                httpResponse.end(JSON.stringify({ error: 'Not Found' }));
            }

            // 构造响应
            const headers = new Headers();
            for (const [key, value] of httpResponse.headers.entries()) {
                headers.set(key, value);
            }

            const response = new Response(
                httpResponse.body,
                {
                    status: httpResponse.statusCode,
                    headers
                }
            );

            return response;
        } catch (error) {
            this.log('error', `处理请求时出错: ${error}`);

            // 返回错误响应
            return new Response(
                JSON.stringify({
                    error: 'Internal Server Error',
                    message: process.env.NODE_ENV === 'development'
                        ? (error instanceof Error ? error.message : String(error))
                        : undefined
                }),
                {
                    status: 500,
                    headers: { 'Content-Type': 'application/json' }
                }
            );
        } finally {
            // 归还请求和响应对象到池中
            releaseRequest(httpRequest);
            releaseResponse(httpResponse);
        }
    }

    /**
     * 获取服务器统计信息
     */
    private getStats(): HttpServerStats {
        const reactorStats = this.reactorPool.getStats();
        const uptime = Date.now() - this.stats.startTime;

        return {
            status: this.status,
            requestsProcessed: this.stats.requestsProcessed,
            requestsSucceeded: this.stats.requestsSucceeded,
            requestsFailed: this.stats.requestsFailed,
            avgResponseTime: this.stats.requestsProcessed > 0
                ? this.stats.totalResponseTime / this.stats.requestsProcessed
                : 0,
            reactorStats: {
                activeReactors: reactorStats.activeReactors,
                totalWorkProcessed: reactorStats.totalWorkProcessed
            },
            routerStats: {
                routeCount: 0, // 需要从router获取统计信息
                cacheHits: 0,
                cacheMisses: 0
            }
        };
    }

    /**
     * 记录日志
     */
    private log(level: 'debug' | 'info' | 'warn' | 'error', message: string): void {
        if (!this.config.logging?.enabled) {
            return;
        }

        const levelPriority = {
            'debug': 0,
            'info': 1,
            'warn': 2,
            'error': 3
        };

        if (levelPriority[level] >= levelPriority[this.config.logging.level || 'info']) {
            console[level](`[OptimizedHttpServer] ${message}`);
        }
    }

    /**
     * 创建优化的HTTP服务器Actor
     * @param config 服务器配置
     */
    static create(config: HttpServerConfig): ActorRef<HttpServerMessage> {
        return createActor(new OptimizedHttpServerActor(config));
    }
} 