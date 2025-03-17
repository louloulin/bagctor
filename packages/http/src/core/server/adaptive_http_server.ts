/**
 * AdaptiveHttpServerActor - 自适应HTTP服务器Actor实现
 * 
 * 整合自适应对象池、多反应器和优化路由，自动根据负载调整资源，
 * 提供最佳性能和内存效率的HTTP服务器实现
 */

import { Actor, ActorRef, ActorSystem, ActorContext } from '@bactor/core';
import { ServerOptions, HttpRequest, HttpResponse, HandlerFunction, MiddlewareFunction } from '../../types';
import { MultiReactorPool, MultiReactorPoolOptions } from '../reactor/multi_reactor_pool';
import { AdaptivePoolOptions, AdaptivePoolStats } from '../pool/adaptive_pool';
import { RadixTreeRouter } from '../router/radix_tree';
import {
    acquireAdaptiveRequest,
    releaseAdaptiveRequest,
    acquireAdaptiveResponse,
    releaseAdaptiveResponse,
    acquireAdaptiveContext,
    releaseAdaptiveContext,
    preparePoolsForTrafficBurst,
    getAllPoolStats,
    reconfigureHttpPools
} from '../pool/adaptive_http_pools';

/**
 * 自适应HTTP服务器配置选项
 */
export interface AdaptiveServerOptions extends ServerOptions {
    /**
     * 自适应对象池选项
     */
    poolOptions?: AdaptivePoolOptions;

    /**
     * 负载监控间隔（毫秒）
     * 用于周期性检查负载并调整资源
     */
    loadMonitorIntervalMs?: number;

    /**
     * 是否启用自动流量突发准备
     * 当请求量快速增长时自动预分配对象
     */
    enableAutoTrafficBurstPreparation?: boolean;

    /**
     * 流量突发阈值
     * 当请求量在短时间内增加超过此百分比时触发突发准备
     */
    trafficBurstThresholdPercent?: number;

    /**
     * 流量采样窗口大小（毫秒）
     * 用于计算请求率变化
     */
    trafficSamplingWindowMs?: number;

    /**
     * 多反应器池容量
     * 设置为0将使用系统可用CPU核心数
     */
    reactorPoolSize?: number;

    /**
     * 历史数据点数量
     */
    historyPointsCount?: number;
}

// Local type definition for HttpServerMessage
interface HttpServerMessage {
    type: string;
    method?: string;
    path?: string;
    handler?: HandlerFunction;
    middleware?: MiddlewareFunction[];
    options?: AdaptivePoolOptions;
    factor?: number;
    [key: string]: any;
}

// Define ServerState class
class ServerState {
    running: boolean = false;
    port: number;
    hostname: string;
    tls?: { cert: string; key: string };
    router: RadixTreeRouter;
    options: AdaptiveServerOptions;
    reactorPool: MultiReactorPool;
    stats: {
        requestsProcessed: number;
        activeConnections: number;
        averageResponseTime: number;
        lastTrafficSample: { timestamp: number; requests: number }[];
        requestsPerSecond: number;
    };
    monitorInterval: NodeJS.Timeout | null = null;

    constructor(options: AdaptiveServerOptions = {}, router?: RadixTreeRouter) {
        this.port = options.port || 3000;
        this.hostname = options.hostname || 'localhost';
        this.tls = options.tls;
        this.router = router || new RadixTreeRouter();
        this.options = options;
        this.reactorPool = new MultiReactorPool({
            reactorCount: options.reactorPoolSize === 0
                ? require('os').cpus().length
                : options.reactorPoolSize,
            balancingStrategy: 'least-busy',
            enableAffinityIfSupported: true,
            logging: {
                enabled: options.debug === true,
                level: 'info'
            }
        });
        this.stats = {
            requestsProcessed: 0,
            activeConnections: 0,
            averageResponseTime: 0,
            lastTrafficSample: [],
            requestsPerSecond: 0
        };
    }

    addRoute(method: string, path: string, handler: HandlerFunction, middleware: MiddlewareFunction[] = []): void {
        method = method.toUpperCase();
        this.router.insert(path, { method, handler, middleware });
        console.log(`添加路由: ${method} ${path}`);
    }

    async handleRequest(request: HttpRequest): Promise<HttpResponse> {
        const startTime = performance.now();

        // 记录请求
        this.updateTrafficStats();

        // 获取请求方法和路径
        const method = request.method;
        const url = new URL(request.url);
        const path = url.pathname;

        // 从对象池获取对象
        const httpRequest = acquireAdaptiveRequest();
        const httpResponse = acquireAdaptiveResponse();
        const context = acquireAdaptiveContext();

        try {
            // 填充HTTP请求对象
            httpRequest.method = method;
            httpRequest.url = url.toString();
            httpRequest.headers = request.headers;
            httpRequest.body = request.body;

            // 设置上下文
            context.request = httpRequest;
            context.params = {};
            context.query = url.searchParams;

            // 查找匹配的路由
            const match = this.router.lookup(path);
            if (!match) {
                // 路由未找到
                return this.createNotFoundResponse();
            }

            // 设置路由参数
            context.params = match.params || {};

            // 获取处理函数和中间件
            const { handler, middleware } = match.value;

            // 处理中间件链
            if (middleware && middleware.length > 0) {
                let index = 0;

                const next = async (): Promise<void> => {
                    if (index < middleware.length) {
                        const currentMiddleware = middleware[index++];
                        await currentMiddleware(context, next);
                    } else {
                        // 所有中间件已处理，执行主处理函数
                        await handler(context);
                    }
                };

                // 开始中间件链
                await next();
            } else {
                // 没有中间件，直接执行处理函数
                await handler(context);
            }

            // 创建响应
            const response = new Response(httpResponse.body, {
                status: httpResponse.status,
                headers: httpResponse.headers
            });

            // 更新统计信息
            this.updatePerformanceStats(startTime);

            return response;
        } catch (error) {
            console.error('请求处理错误:', error);
            return this.createErrorResponse(error);
        } finally {
            // 返回对象到池
            releaseAdaptiveRequest(httpRequest);
            releaseAdaptiveResponse(httpResponse);
            releaseAdaptiveContext(context);
        }
    }

    /**
     * 创建404响应
     */
    private createNotFoundResponse(): Response {
        return new Response('Not Found', {
            status: 404,
            headers: { 'Content-Type': 'text/plain' }
        });
    }

    /**
     * 创建500错误响应
     */
    private createErrorResponse(error: any): Response {
        return new Response(`Internal Server Error: ${error.message || 'Unknown error'}`, {
            status: 500,
            headers: { 'Content-Type': 'text/plain' }
        });
    }

    /**
     * 更新流量统计信息
     */
    private updateTrafficStats(): void {
        this.stats.requestsProcessed++;

        const now = Date.now();
        this.stats.lastTrafficSample.push({
            timestamp: now,
            requests: this.stats.requestsProcessed
        });

        // 移除采样窗口之外的样本
        const windowStart = now - this.options.trafficSamplingWindowMs!;
        this.stats.lastTrafficSample = this.stats.lastTrafficSample.filter(
            sample => sample.timestamp >= windowStart
        );

        // 检查是否需要准备流量突发
        if (this.options.enableAutoTrafficBurstPreparation) {
            this.checkForTrafficBurst();
        }
    }

    /**
     * 检查流量突发情况
     */
    private checkForTrafficBurst(): void {
        const samples = this.stats.lastTrafficSample;
        if (samples.length < 2) return;

        // 计算短期请求率
        const shortTermSamples = samples.slice(-5); // 最近5个样本
        if (shortTermSamples.length < 2) return;

        const shortTermRate = this.calculateRequestRate(shortTermSamples);

        // 计算长期请求率
        const longTermSamples = samples.slice(0, -5); // 较早的样本
        if (longTermSamples.length < 2) return;

        const longTermRate = this.calculateRequestRate(longTermSamples);

        // 计算增长百分比
        if (longTermRate === 0) return;

        const growthPercent = ((shortTermRate - longTermRate) / longTermRate) * 100;

        if (growthPercent >= this.options.trafficBurstThresholdPercent!) {
            console.log(`检测到流量突发: 增长 ${growthPercent.toFixed(2)}%, 准备资源`);

            // 计算突发系数
            const burstFactor = Math.max(2.0, 1.0 + (growthPercent / 100));

            // 准备对象池
            preparePoolsForTrafficBurst(burstFactor);
        }
    }

    /**
     * 计算请求率（每秒请求数）
     */
    private calculateRequestRate(samples: { timestamp: number, requests: number }[]): number {
        if (samples.length < 2) return 0;

        const firstSample = samples[0];
        const lastSample = samples[samples.length - 1];

        const requestDiff = lastSample.requests - firstSample.requests;
        const timeDiffSeconds = (lastSample.timestamp - firstSample.timestamp) / 1000;

        return timeDiffSeconds === 0 ? 0 : requestDiff / timeDiffSeconds;
    }

    /**
     * 更新性能统计信息
     */
    private updatePerformanceStats(startTime: number): void {
        const responseTime = performance.now() - startTime;

        // 更新平均响应时间（使用移动平均）
        const alpha = 0.05; // 平滑系数
        this.stats.averageResponseTime = (alpha * responseTime) +
            ((1 - alpha) * this.stats.averageResponseTime);

        // 更新每秒请求数
        const samples = this.stats.lastTrafficSample;
        if (samples.length >= 2) {
            const firstSample = samples[0];
            const lastSample = samples[samples.length - 1];

            const requestDiff = lastSample.requests - firstSample.requests;
            const timeDiffSeconds = (lastSample.timestamp - firstSample.timestamp) / 1000;

            if (timeDiffSeconds > 0) {
                this.stats.requestsPerSecond = requestDiff / timeDiffSeconds;
            }
        }
    }

    /**
     * 启动负载监控
     */
    private startLoadMonitoring(): void {
        if (this.monitorInterval !== null) return;

        this.monitorInterval = setInterval(() => {
            // 记录当前状态
            const poolStats = getAllPoolStats();
            const serverStats = this.stats;

            // 输出监控信息
            if (this.options.debug) {
                console.log('----- 自适应HTTP服务器监控 -----');
                console.log(`请求/秒: ${serverStats.requestsPerSecond.toFixed(2)}`);
                console.log(`平均响应时间: ${serverStats.averageResponseTime.toFixed(2)}ms`);

                // Use optional chaining to handle potential undefined properties
                if (poolStats.requestPool) {
                    console.log(`请求池: ${poolStats.requestPool.active}/${poolStats.requestPool.size} 活跃`);
                    console.log(`请求池等待: ${(poolStats.requestPool as any).waiting ?? 0}`);
                }

                console.log('对象池状态:');
                console.log(`  响应池: ${poolStats.responsePool.active}/${poolStats.responsePool.size} 活跃`);
                console.log(`  上下文池: ${poolStats.contextPool.active}/${poolStats.contextPool.size} 活跃`);
                console.log('----------------------------');
            }
        }, this.options.loadMonitorIntervalMs || 5000);
    }

    /**
     * 停止负载监控
     */
    private stopLoadMonitoring(): void {
        if (this.monitorInterval !== null) {
            clearInterval(this.monitorInterval);
            this.monitorInterval = null;
        }
    }
}

/**
 * 自适应HTTP服务器Actor
 * 整合自适应对象池、多反应器和优化路由的高性能HTTP服务器
 */
export class AdaptiveHttpServerActor extends Actor<HttpServerMessage> {
    private server: any; // Bun.Server
    private monitorInterval: NodeJS.Timeout | null = null;
    protected state: ServerState;

    constructor(context: ActorContext, options: AdaptiveServerOptions) {
        super(context);

        // Initialize with default values
        const defaultedOptions: AdaptiveServerOptions = {
            port: options.port || 3000,
            hostname: options.hostname || 'localhost',
            tls: options.tls,
            poolOptions: options.poolOptions || {
                initialSize: 100,
                maxSize: 10000,
                adaptiveResizing: true,
                minSize: 50
            },
            loadMonitorIntervalMs: options.loadMonitorIntervalMs || 5000,
            enableAutoTrafficBurstPreparation:
                options.enableAutoTrafficBurstPreparation !== undefined
                    ? options.enableAutoTrafficBurstPreparation
                    : true,
            trafficBurstThresholdPercent: options.trafficBurstThresholdPercent || 30,
            trafficSamplingWindowMs: options.trafficSamplingWindowMs || 10000,
            reactorPoolSize: options.reactorPoolSize || 0,
            historyPointsCount: options.historyPointsCount || 100,
            debug: options.debug || false
        };

        // Initialize state
        this.state = new ServerState(defaultedOptions);
    }

    protected behaviors(): void {
        this.addBehavior('default', this.handleMessage.bind(this));
    }

    private async handleMessage(message: HttpServerMessage): Promise<any> {
        switch (message.type) {
            case 'start':
                return this.startServer();
            case 'stop':
                return this.stopServer();
            case 'status':
                return {
                    running: this.state.running,
                    port: this.state.port,
                    stats: this.state.stats
                };
            case 'addRoute':
                return this.addRoute(message.method!, message.path!, message.handler!, message.middleware);
            case 'getStats':
                return {
                    server: this.state.stats,
                    pools: getAllPoolStats()
                };
            case 'updatePoolConfig':
                reconfigureHttpPools(message.options!);
                return { success: true };
            case 'prepareForTrafficBurst':
                preparePoolsForTrafficBurst(message.factor || 2.0);
                return { success: true };
            default:
                console.warn(`Unknown message type: ${message.type}`);
                return { error: `Unknown message type: ${message.type}` };
        }
    }

    /**
     * Start the HTTP server
     */
    private async startServer(): Promise<{ success: boolean; port?: number; error?: string }> {
        if (this.server) {
            console.warn('Server is already running');
            return { success: true, port: this.state.port };
        }

        try {
            // Create server
            this.server = (Bun as any).serve({
                port: this.state.port,
                hostname: this.state.hostname,
                tls: this.state.tls,
                fetch: (req: Request) => this.handleRequest(req)
            });

            console.log(`Adaptive HTTP server started on ${this.state.hostname}:${this.state.port}`);

            return { success: true, port: this.state.port };
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            console.error(`Failed to start server: ${errorMessage}`);
            return { success: false, error: errorMessage };
        }
    }

    /**
     * Stop the HTTP server
     */
    private async stopServer(): Promise<{ success: boolean; error?: string }> {
        if (!this.server) {
            console.warn('Server is not running');
            return { success: true };
        }

        try {
            this.server.stop();
            this.server = null;
            console.log('Adaptive HTTP server stopped');

            return { success: true };
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            console.error(`Failed to stop server: ${errorMessage}`);
            return { success: false, error: errorMessage };
        }
    }

    /**
     * Add a new route
     */
    private addRoute(method: string, path: string, handler: HandlerFunction, middleware: MiddlewareFunction[] = []): { success: boolean } {
        this.state.addRoute(method, path, handler, middleware);
        return { success: true };
    }

    /**
     * Handle HTTP request
     */
    private async handleRequest(request: Request): Promise<Response> {
        try {
            const result = await this.state.handleRequest(request as any);

            // Convert HttpResponse to Response if needed
            if (result instanceof Response) {
                return result;
            }

            // Create a new Response if result is HttpResponse
            return new Response(result.body, {
                status: result.statusCode || 200,
                headers: result.headers
            });
        } catch (error) {
            console.error('Error handling request:', error);
            return new Response('Internal Server Error', {
                status: 500,
                headers: { 'Content-Type': 'text/plain' }
            });
        }
    }

    /**
     * Starting load monitoring is handled in the ServerState class
     */
    private startLoadMonitoring(): void {
        // This is handled in the ServerState class
    }

    /**
     * Stopping load monitoring is handled in the ServerState class
     */
    private stopLoadMonitoring(): void {
        // This is handled in the ServerState class
    }

    /**
     * Create an adaptive HTTP server actor
     */
    static create(system: ActorSystem, options: AdaptiveServerOptions): ActorRef {
        return system.actorOf(() => new AdaptiveHttpServerActor(system.context, options));
    }
}