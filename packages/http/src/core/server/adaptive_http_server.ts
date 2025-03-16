/**
 * AdaptiveHttpServerActor - 自适应HTTP服务器Actor实现
 * 
 * 整合自适应对象池、多反应器和优化路由，自动根据负载调整资源，
 * 提供最佳性能和内存效率的HTTP服务器实现
 */

import { Actor, ActorRef, ActorSystem } from 'bactor';
import { ServerOptions, HttpRequest, HttpResponse, HandlerFunction, MiddlewareFunction } from '../../types';
import { MultiReactorPool } from '../reactor/multi_reactor_pool';
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
import { AdaptivePoolOptions } from '../pool/adaptive_pool';
import { RadixTree } from '../router/radix_tree';

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
}

/**
 * HTTP服务器消息类型
 */
type HttpServerMessage =
    | { type: 'start' }
    | { type: 'stop' }
    | { type: 'status' }
    | { type: 'addRoute', method: string, path: string, handler: HandlerFunction, middleware?: MiddlewareFunction[] }
    | { type: 'getStats' }
    | { type: 'updatePoolConfig', options: AdaptivePoolOptions }
    | { type: 'prepareForTrafficBurst', factor?: number };

/**
 * 自适应HTTP服务器状态接口
 */
interface ServerState {
    running: boolean;
    port: number;
    router: {
        [method: string]: RadixTree<{
            handler: HandlerFunction;
            middleware: MiddlewareFunction[];
        }>;
    };
    options: AdaptiveServerOptions;
    reactorPool: MultiReactorPool;
    stats: {
        requestsProcessed: number;
        requestsPerSecond: number;
        averageResponseTime: number;
        lastTrafficSample: {
            timestamp: number;
            requests: number;
        }[];
    };
}

/**
 * 自适应HTTP服务器Actor
 * 整合自适应对象池、多反应器和优化路由的高性能HTTP服务器
 */
export class AdaptiveHttpServerActor extends Actor<HttpServerMessage> {
    private state: ServerState;
    private server: any; // Bun.Server
    private monitorInterval: number | null = null;

    constructor(system: ActorSystem, options: AdaptiveServerOptions) {
        super(system);

        // 初始化路由表
        const router: ServerState['router'] = {};
        ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'HEAD', 'OPTIONS'].forEach(method => {
            router[method] = new RadixTree<{
                handler: HandlerFunction;
                middleware: MiddlewareFunction[];
            }>();
        });

        // 设置默认值
        const defaultedOptions: AdaptiveServerOptions = {
            port: options.port || 3000,
            hostname: options.hostname || 'localhost',
            tls: options.tls,
            poolOptions: options.poolOptions || {
                adaptiveResizing: true,
                initialSize: 100,
                maxSize: 2000,
                minSize: 50,
            },
            loadMonitorIntervalMs: options.loadMonitorIntervalMs || 5000,
            enableAutoTrafficBurstPreparation: options.enableAutoTrafficBurstPreparation !== false,
            trafficBurstThresholdPercent: options.trafficBurstThresholdPercent || 50,
            trafficSamplingWindowMs: options.trafficSamplingWindowMs || 30000,
            reactorPoolSize: options.reactorPoolSize || 0, // 0 = 使用可用CPU核心数
        };

        // 创建多反应器池
        const reactorPool = new MultiReactorPool({
            size: defaultedOptions.reactorPoolSize === 0
                ? Math.max(1, (Bun as any).threadCount || 4)
                : defaultedOptions.reactorPoolSize,
            strategy: 'round-robin'
        });

        // 初始化状态
        this.state = {
            running: false,
            port: defaultedOptions.port,
            router,
            options: defaultedOptions,
            reactorPool,
            stats: {
                requestsProcessed: 0,
                requestsPerSecond: 0,
                averageResponseTime: 0,
                lastTrafficSample: []
            }
        };

        // 配置对象池
        if (options.poolOptions) {
            reconfigureHttpPools(options.poolOptions);
        }
    }

    /**
     * 处理Actor消息
     */
    receive(message: HttpServerMessage, sender: ActorRef): void {
        switch (message.type) {
            case 'start':
                this.startServer();
                break;
            case 'stop':
                this.stopServer();
                break;
            case 'status':
                // 返回服务器状态
                sender.tell({
                    running: this.state.running,
                    port: this.state.port,
                    stats: this.state.stats
                });
                break;
            case 'addRoute':
                this.addRoute(message.method, message.path, message.handler, message.middleware);
                break;
            case 'getStats':
                // 返回服务器和对象池统计信息
                sender.tell({
                    server: this.state.stats,
                    pools: getAllPoolStats()
                });
                break;
            case 'updatePoolConfig':
                reconfigureHttpPools(message.options);
                break;
            case 'prepareForTrafficBurst':
                preparePoolsForTrafficBurst(message.factor || 2.0);
                break;
            default:
                console.warn(`未知消息类型: ${(message as any).type}`);
        }
    }

    /**
     * 启动HTTP服务器
     */
    private startServer(): void {
        if (this.state.running) {
            console.warn('服务器已经在运行');
            return;
        }

        const options = this.state.options;

        // 创建服务器
        this.server = (Bun as any).serve({
            port: options.port,
            hostname: options.hostname,
            tls: options.tls,
            fetch: (req: Request) => this.handleRequest(req)
        });

        this.state.running = true;
        console.log(`自适应HTTP服务器在 ${options.hostname}:${options.port} 上启动`);

        // 启动负载监控
        this.startLoadMonitoring();
    }

    /**
     * 停止HTTP服务器
     */
    private stopServer(): void {
        if (!this.state.running) {
            console.warn('服务器没有运行');
            return;
        }

        if (this.server) {
            this.server.stop();
            this.server = null;
        }

        this.state.running = false;
        console.log('自适应HTTP服务器已停止');

        // 停止负载监控
        this.stopLoadMonitoring();
    }

    /**
     * 添加路由
     */
    private addRoute(method: string, path: string, handler: HandlerFunction, middleware: MiddlewareFunction[] = []): void {
        method = method.toUpperCase();
        if (!this.state.router[method]) {
            this.state.router[method] = new RadixTree<{
                handler: HandlerFunction;
                middleware: MiddlewareFunction[];
            }>();
        }

        this.state.router[method].insert(path, { handler, middleware });
        console.log(`添加路由: ${method} ${path}`);
    }

    /**
     * 处理HTTP请求
     */
    private async handleRequest(request: Request): Promise<Response> {
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
            const routeTree = this.state.router[method];
            if (!routeTree) {
                // 方法不支持
                return this.createMethodNotAllowedResponse();
            }

            const match = routeTree.lookup(path);
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
     * 创建405响应
     */
    private createMethodNotAllowedResponse(): Response {
        return new Response('Method Not Allowed', {
            status: 405,
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
        this.state.stats.requestsProcessed++;

        const now = Date.now();
        this.state.stats.lastTrafficSample.push({
            timestamp: now,
            requests: this.state.stats.requestsProcessed
        });

        // 移除采样窗口之外的样本
        const windowStart = now - this.state.options.trafficSamplingWindowMs!;
        this.state.stats.lastTrafficSample = this.state.stats.lastTrafficSample.filter(
            sample => sample.timestamp >= windowStart
        );

        // 检查是否需要准备流量突发
        if (this.state.options.enableAutoTrafficBurstPreparation) {
            this.checkForTrafficBurst();
        }
    }

    /**
     * 检查流量突发情况
     */
    private checkForTrafficBurst(): void {
        const samples = this.state.stats.lastTrafficSample;
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

        if (growthPercent >= this.state.options.trafficBurstThresholdPercent!) {
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
        this.state.stats.averageResponseTime = (alpha * responseTime) +
            ((1 - alpha) * this.state.stats.averageResponseTime);

        // 更新每秒请求数
        const samples = this.state.stats.lastTrafficSample;
        if (samples.length >= 2) {
            const firstSample = samples[0];
            const lastSample = samples[samples.length - 1];

            const requestDiff = lastSample.requests - firstSample.requests;
            const timeDiffSeconds = (lastSample.timestamp - firstSample.timestamp) / 1000;

            if (timeDiffSeconds > 0) {
                this.state.stats.requestsPerSecond = requestDiff / timeDiffSeconds;
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
            const serverStats = this.state.stats;

            // 输出监控信息
            if (this.state.options.debug) {
                console.log('----- 自适应HTTP服务器监控 -----');
                console.log(`请求/秒: ${serverStats.requestsPerSecond.toFixed(2)}`);
                console.log(`平均响应时间: ${serverStats.averageResponseTime.toFixed(2)}ms`);
                console.log('对象池状态:');
                console.log(`  请求池: ${poolStats.requestPool.active}/${poolStats.requestPool.size} 活跃, ${poolStats.requestPool.waiting} 等待`);
                console.log(`  响应池: ${poolStats.responsePool.active}/${poolStats.responsePool.size} 活跃`);
                console.log(`  上下文池: ${poolStats.contextPool.active}/${poolStats.contextPool.size} 活跃`);
                console.log('----------------------------');
            }

        }, this.state.options.loadMonitorIntervalMs);
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
 * 创建自适应HTTP服务器Actor
 */
export function createAdaptiveHttpServer(system: ActorSystem, options: AdaptiveServerOptions): ActorRef {
    return system.actorOf(() => new AdaptiveHttpServerActor(system, options));
} 