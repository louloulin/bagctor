/**
 * OptimizedHttpServer - 高性能HTTP服务器实现
 * 
 * 集成多反应器模式、对象池、优化路由器等优化特性
 * 提供高性能、低延迟的HTTP服务能力
 */

import { Actor, ActorRef, ActorContext, ActorSystem, Message } from '@bactor/core';
import { HttpRequest, HttpResponse } from '../../types';
import { MultiReactorPoolOptions, RouteConfig } from '../../types/index.d';
import { MultiReactorPool } from '../reactor/multi_reactor_pool';
import {
    acquireRequest,
    releaseRequest,
    acquireResponse,
    releaseResponse
} from '../pool/http_pools';
import { Work, WorkResult } from '../reactor/reactor';
import { Server as BunServer } from 'bun';
import { RadixTreeRouter } from '../router/radix_tree';

/**
 * HTTP服务器配置
 */
export interface HttpServerConfig {
    /**
     * 服务器端口
     */
    port?: number;

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
    routerOptions?: any;

    /**
     * 日志配置
     */
    logging?: {
        enabled: boolean;
        level: 'debug' | 'info' | 'warn' | 'error';
    };

    /**
     * 调试模式
     */
    debug?: boolean;
}

/**
 * 优化的HTTP服务器Actor消息类型
 */
export type HttpServerMessage =
    | { type: 'start' }
    | { type: 'stop' }
    | { type: 'add-route'; config: RouteConfig }
    | { type: 'add-routes'; configs: RouteConfig[] }
    | { type: 'status' }
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
 * Optimized HTTP Server State
 */
interface OptimizedServerState {
    port: number;
    hostname: string;
    tls?: { cert: string; key: string };
    router: RadixTreeRouter;
    running: boolean;
    debug: boolean;
    options: HttpServerConfig;
}

/**
 * Optimized HTTP Server Actor
 */
export class OptimizedHttpServerActor extends Actor<HttpServerMessage> {
    private server: any; // Bun.Server
    private monitorInterval: NodeJS.Timeout | null = null;
    protected state: any; // ServerState

    /**
     * 多反应器池
     */
    private reactorPool: MultiReactorPool;

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

    constructor(context: ActorContext, config: HttpServerConfig = {}) {
        super(context);

        // Default configuration
        const defaultConfig: HttpServerConfig = {
            port: 3000,
            hostname: 'localhost',
            debug: false,
            routerOptions: {
                cacheSize: 1000
            }
        };

        // Merge with provided config
        const finalConfig = { ...defaultConfig, ...config };

        // Initialize state
        this.state = {
            port: finalConfig.port || 3000,
            hostname: finalConfig.hostname || 'localhost',
            tls: finalConfig.tls,
            router: new RadixTreeRouter(),
            running: false,
            debug: finalConfig.debug || false,
            options: finalConfig
        };

        // 初始化多反应器池
        this.reactorPool = new MultiReactorPool({
            reactorCount: config.reactorPool?.reactorCount,
            balancingStrategy: config.reactorPool?.balancingStrategy || 'least-busy',
            enableAffinityIfSupported: true,
            logging: config.logging
        });

        this.log('info', '初始化优化HTTP服务器');

        // Set up behaviors
        this.behaviors();
    }

    /**
     * Define actor behaviors
     */
    protected behaviors(): void {
        this.addBehavior('idle', this.handleIdle.bind(this));
        this.addBehavior('running', this.handleRunning.bind(this));
        this.become('idle');
    }

    /**
     * Handle messages in idle state
     */
    private async handleIdle(message: HttpServerMessage): Promise<any> {
        switch (message.type) {
            case 'start':
                const result = await this.startServer();
                if (result.success) {
                    this.become('running');
                }
                return result;

            case 'add-route':
                if (message.config) {
                    this.addRoute(message.config);
                }
                return { success: true };

            case 'add-routes':
                if (message.configs && Array.isArray(message.configs)) {
                    message.configs.forEach(config => this.addRoute(config));
                }
                return { success: true };

            case 'status':
                return {
                    status: 'idle',
                    port: this.state.port,
                    routes: 0 // TODO: count routes
                };

            case 'get-stats':
                return this.getStats();

            case 'health-check':
                return {
                    status: this.status,
                    healthy: this.status === 'running'
                };

            default:
                return { error: `Unknown message type: ${message.type}` };
        }
    }

    /**
     * Handle messages in running state
     */
    private async handleRunning(message: HttpServerMessage): Promise<any> {
        switch (message.type) {
            case 'stop':
                const result = await this.stopServer();
                if (result.success) {
                    this.become('idle');
                }
                return result;

            case 'add-route':
                if (message.config) {
                    this.addRoute(message.config);
                }
                return { success: true };

            case 'add-routes':
                if (message.configs && Array.isArray(message.configs)) {
                    message.configs.forEach(config => this.addRoute(config));
                }
                return { success: true };

            case 'status':
                return {
                    status: 'running',
                    port: this.state.port,
                    uptime: process.uptime(),
                    routes: 0 // TODO: count routes
                };

            case 'get-stats':
                return this.getStats();

            case 'health-check':
                return {
                    status: this.status,
                    healthy: this.status === 'running'
                };

            default:
                return { error: `Unknown message type: ${message.type}` };
        }
    }

    /**
     * Start the HTTP server
     */
    private async startServer(): Promise<{ success: boolean; port?: number; error?: string }> {
        if (this.status === 'running') {
            return { success: true, port: this.state.port };
        }

        try {
            this.status = 'starting';
            this.log('info', `启动HTTP服务器，端口: ${this.state.port}`);

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
            this.server = (Bun as any).serve({
                port: this.state.port,
                hostname: this.state.hostname,
                tls: this.state.tls,
                fetch: this.handleRequest.bind(this)
            });

            this.status = 'running';
            this.log('info', `HTTP服务器已启动，正在监听端口 ${this.state.port}`);

            return { success: true, port: this.state.port };
        } catch (error) {
            this.status = 'stopped';
            const errorMessage = error instanceof Error ? error.message : String(error);
            this.log('error', `启动HTTP服务器失败: ${errorMessage}`);
            return { success: false, error: errorMessage };
        }
    }

    /**
     * Stop the HTTP server
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
     * Add a route configuration
     */
    private addRoute(config: RouteConfig): void {
        const { path, method, handler, middleware = [] } = config;
        this.state.router.insert(path, { method, handler, middleware });

        if (this.state.debug) {
            this.log('info', `Added route: ${method} ${path}`);
        }
    }

    /**
     * Handle HTTP request
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
                routeCount: (this.state.router as any).routeCount || 0,
                cacheHits: this.state.router.cacheHits,
                cacheMisses: this.state.router.cacheMisses
            }
        };
    }

    /**
     * 记录日志
     */
    private log(level: 'debug' | 'info' | 'warn' | 'error', message: string): void {
        if (!this.state.options.logging?.enabled) {
            return;
        }

        const levelPriority = {
            'debug': 0,
            'info': 1,
            'warn': 2,
            'error': 3
        };

        const configLevel = this.state.options.logging?.level || 'info';
        if (levelPriority[level] >= levelPriority[configLevel as keyof typeof levelPriority]) {
            console[level](`[OptimizedHttpServer] ${message}`);
        }
    }

    /**
     * Factory method to create an instance of OptimizedHttpServerActor
     */
    static create(system: ActorSystem, config: HttpServerConfig): ActorRef {
        return system.actorOf(() => new OptimizedHttpServerActor(system.context, config));
    }
} 