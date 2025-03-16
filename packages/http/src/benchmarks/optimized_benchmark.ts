/**
 * 优化HTTP服务器性能基准测试工具
 * 
 * 用于比较不同类型HTTP服务器的性能：
 * 1. 原始bactor HTTP服务器
 * 2. 优化后的bactor HTTP服务器（使用多反应器、对象池和优化路由器）
 * 3. 原生Bun HTTP服务器
 * 4. Hono.js框架（如果可用）
 */

import { serve } from "bun";
import { ActorSystem } from "@bactor/core";
import { createHttpServer } from "../http_server";
import { OptimizedHttpServerActor } from "../core/server/optimized_http_server";
import { Hono } from "hono";

/**
 * 基准测试配置
 */
interface BenchmarkConfig {
    /**
     * 服务器端口
     */
    port: number;

    /**
     * 基准测试持续时间（秒）
     */
    duration: number;

    /**
     * 并发连接数
     */
    connections: number;

    /**
     * 预热时间（秒）
     */
    warmup?: number;

    /**
     * 要测试的服务器类型
     */
    servers: Array<"bactor" | "optimized" | "bun" | "hono">;

    /**
     * 测试路由数量
     */
    routeCount?: number;

    /**
     * 测试端点
     */
    endpoints?: {
        /**
         * 静态路由
         */
        static?: number;

        /**
         * 参数路由
         */
        params?: number;

        /**
         * 嵌套路由
         */
        nested?: number;
    };

    /**
     * 请求负载大小（字节）
     */
    payloadSize?: number;

    /**
     * 详细模式
     */
    verbose?: boolean;
}

/**
 * 基准测试结果
 */
interface BenchmarkResult {
    /**
     * 服务器类型
     */
    server: string;

    /**
     * 请求数/秒
     */
    rps: number;

    /**
     * 平均延迟（毫秒）
     */
    latency: {
        min: number;
        avg: number;
        max: number;
        p50: number;
        p90: number;
        p99: number;
    };

    /**
     * 状态码分布
     */
    statusCodes: Record<string, number>;

    /**
     * 错误数
     */
    errors: number;

    /**
     * 请求总数
     */
    totalRequests: number;

    /**
     * 测试持续时间（秒）
     */
    duration: number;
}

/**
 * 默认基准测试配置
 */
const DEFAULT_CONFIG: BenchmarkConfig = {
    port: 3000,
    duration: 10,
    connections: 50,
    warmup: 2,
    servers: ["bactor", "optimized", "bun", "hono"],
    routeCount: 100,
    endpoints: {
        static: 50,
        params: 30,
        nested: 20
    },
    payloadSize: 1024,
    verbose: true
};

/**
 * 运行基准测试
 * @param config 基准测试配置
 */
export async function runBenchmark(config: Partial<BenchmarkConfig> = {}): Promise<BenchmarkResult[]> {
    // 合并配置
    const fullConfig: BenchmarkConfig = {
        ...DEFAULT_CONFIG,
        ...config,
        endpoints: {
            ...DEFAULT_CONFIG.endpoints,
            ...config.endpoints
        }
    };

    // 验证配置
    if (fullConfig.servers.length === 0) {
        throw new Error("至少需要指定一个服务器类型进行测试");
    }

    console.log("=".repeat(50));
    console.log(`开始HTTP服务器性能基准测试`);
    console.log(`- 持续时间: ${fullConfig.duration}秒 (预热: ${fullConfig.warmup}秒)`);
    console.log(`- 并发连接: ${fullConfig.connections}`);
    console.log(`- 路由数量: ${fullConfig.routeCount}`);
    console.log(`- 测试服务器: ${fullConfig.servers.join(", ")}`);
    console.log("=".repeat(50));

    const results: BenchmarkResult[] = [];

    // 按顺序测试每个服务器
    for (const serverType of fullConfig.servers) {
        console.log(`\n测试服务器类型: ${serverType}`);
        try {
            const result = await benchmarkServer(serverType, fullConfig);
            results.push(result);
            console.log(`- 结果: ${result.rps.toFixed(2)} 请求/秒, 平均延迟: ${result.latency.avg.toFixed(2)}毫秒`);
        } catch (error) {
            console.error(`测试服务器 ${serverType} 失败:`, error);
        }
    }

    // 打印比较结果
    printComparisonTable(results);

    return results;
}

/**
 * 为特定服务器类型运行基准测试
 * @param serverType 服务器类型
 * @param config 基准测试配置
 */
async function benchmarkServer(
    serverType: "bactor" | "optimized" | "bun" | "hono",
    config: BenchmarkConfig
): Promise<BenchmarkResult> {
    // 启动服务器
    const server = await startServer(serverType, config);

    try {
        // 等待服务器启动
        await new Promise(resolve => setTimeout(resolve, 1000));

        // 预热
        if (config.warmup > 0) {
            console.log(`预热服务器 ${config.warmup} 秒...`);
            await runLoadTest({
                url: `http://localhost:${config.port}/hello`,
                duration: config.warmup,
                connections: Math.ceil(config.connections / 2)
            });
        }

        // 运行实际基准测试
        console.log(`运行基准测试 ${config.duration} 秒...`);
        const testResult = await runLoadTest({
            url: `http://localhost:${config.port}/hello`,
            duration: config.duration,
            connections: config.connections
        });

        return {
            server: serverType,
            rps: testResult.rps,
            latency: testResult.latency,
            statusCodes: testResult.statusCodes,
            errors: testResult.errors,
            totalRequests: testResult.totalRequests,
            duration: testResult.duration
        };
    } finally {
        // 停止服务器
        await stopServer(server, serverType);
    }
}

/**
 * 启动指定类型的服务器
 * @param serverType 服务器类型
 * @param config 基准测试配置
 */
async function startServer(
    serverType: "bactor" | "optimized" | "bun" | "hono",
    config: BenchmarkConfig
): Promise<any> {
    switch (serverType) {
        case "bactor": {
            // 启动原始bactor HTTP服务器
            const system = new ActorSystem();
            const server = await system.createActor(createHttpServer, {
                port: config.port
            });

            await setupTestRoutes(server, "bactor", config);
            await server.send({ type: "start" });

            return { system, server };
        }

        case "optimized": {
            // 启动优化后的bactor HTTP服务器
            const system = new ActorSystem();
            const server = OptimizedHttpServerActor.create({
                port: config.port,
                reactorPool: {
                    reactorCount: navigator.hardwareConcurrency,
                    balancingStrategy: "least-busy"
                },
                logging: {
                    enabled: config.verbose,
                    level: "info"
                }
            });

            await setupTestRoutes(server, "optimized", config);
            await server.send({ type: "start" });

            return { system, server };
        }

        case "bun": {
            // 启动原生Bun HTTP服务器
            const routes = generateTestRoutes("bun", config);

            const server = serve({
                port: config.port,
                fetch(req) {
                    const url = new URL(req.url);
                    const path = url.pathname;

                    // 找到匹配的路由
                    const route = routes.find(r => {
                        if (typeof r.pattern === "string") {
                            return r.pattern === path;
                        } else {
                            return r.pattern.test(path);
                        }
                    });

                    if (route) {
                        return route.handler(req);
                    }

                    return new Response("Not Found", { status: 404 });
                }
            });

            return server;
        }

        case "hono": {
            // 启动Hono服务器
            const app = new Hono();

            // 设置测试路由
            const staticRoutes = config.endpoints?.static || 0;
            const paramRoutes = config.endpoints?.params || 0;
            const nestedRoutes = config.endpoints?.nested || 0;

            // 添加基本路由
            app.get("/hello", (c) => c.json({ message: "Hello World!" }));

            // 添加静态路由
            for (let i = 0; i < staticRoutes; i++) {
                app.get(`/static${i}`, (c) => c.json({ route: `static${i}` }));
            }

            // 添加参数路由
            for (let i = 0; i < paramRoutes; i++) {
                app.get(`/user/:id${i}`, (c) => {
                    const id = c.req.param(`id${i}`);
                    return c.json({ id, route: `param${i}` });
                });
            }

            // 添加嵌套路由
            for (let i = 0; i < nestedRoutes; i++) {
                app.get(`/api/v1/resource${i}/:id`, (c) => {
                    const id = c.req.param('id');
                    return c.json({ id, resource: `resource${i}` });
                });
            }

            // 启动服务器
            const server = serve({
                port: config.port,
                fetch: app.fetch
            });

            return server;
        }

        default:
            throw new Error(`未知的服务器类型: ${serverType}`);
    }
}

/**
 * 设置测试路由
 * @param server 服务器实例
 * @param serverType 服务器类型
 * @param config 基准测试配置
 */
async function setupTestRoutes(
    server: any,
    serverType: "bactor" | "optimized",
    config: BenchmarkConfig
): Promise<void> {
    const staticRoutes = config.endpoints?.static || 0;
    const paramRoutes = config.endpoints?.params || 0;
    const nestedRoutes = config.endpoints?.nested || 0;

    // 添加基本路由
    await server.send({
        type: "add-route",
        config: {
            method: "GET",
            path: "/hello",
            handler: async (ctx: any, req: any, res: any) => {
                res.statusCode = 200;
                res.setHeader("Content-Type", "application/json");
                res.end(JSON.stringify({ message: "Hello World!" }));
            }
        }
    });

    // 批量添加路由
    const routes = [];

    // 添加静态路由
    for (let i = 0; i < staticRoutes; i++) {
        routes.push({
            method: "GET",
            path: `/static${i}`,
            handler: async (ctx: any, req: any, res: any) => {
                res.statusCode = 200;
                res.setHeader("Content-Type", "application/json");
                res.end(JSON.stringify({ route: `static${i}` }));
            }
        });
    }

    // 添加参数路由
    for (let i = 0; i < paramRoutes; i++) {
        routes.push({
            method: "GET",
            path: `/user/:id${i}`,
            handler: async (ctx: any, req: any, res: any) => {
                res.statusCode = 200;
                res.setHeader("Content-Type", "application/json");
                res.end(JSON.stringify({ id: ctx.params[`id${i}`], route: `param${i}` }));
            }
        });
    }

    // 添加嵌套路由
    for (let i = 0; i < nestedRoutes; i++) {
        routes.push({
            method: "GET",
            path: `/api/v1/resource${i}/:id`,
            handler: async (ctx: any, req: any, res: any) => {
                res.statusCode = 200;
                res.setHeader("Content-Type", "application/json");
                res.end(JSON.stringify({ id: ctx.params.id, resource: `resource${i}` }));
            }
        });
    }

    // 批量添加路由
    await server.send({
        type: "add-routes",
        configs: routes
    });
}

/**
 * 生成测试路由（用于原生Bun服务器）
 * @param serverType 服务器类型
 * @param config 基准测试配置
 */
function generateTestRoutes(
    serverType: "bun",
    config: BenchmarkConfig
): Array<{
    pattern: string | RegExp;
    handler: (req: Request) => Response;
}> {
    const routes = [];

    // 基本路由
    routes.push({
        pattern: "/hello",
        handler: () => {
            return Response.json({ message: "Hello World!" });
        }
    });

    const staticRoutes = config.endpoints?.static || 0;
    const paramRoutes = config.endpoints?.params || 0;
    const nestedRoutes = config.endpoints?.nested || 0;

    // 静态路由
    for (let i = 0; i < staticRoutes; i++) {
        routes.push({
            pattern: `/static${i}`,
            handler: () => {
                return Response.json({ route: `static${i}` });
            }
        });
    }

    // 参数路由
    for (let i = 0; i < paramRoutes; i++) {
        routes.push({
            pattern: new RegExp(`^/user/([^/]+)${i}$`),
            handler: (req) => {
                const url = new URL(req.url);
                const id = url.pathname.split('/')[2];
                return Response.json({ id, route: `param${i}` });
            }
        });
    }

    // 嵌套路由
    for (let i = 0; i < nestedRoutes; i++) {
        routes.push({
            pattern: new RegExp(`^/api/v1/resource${i}/([^/]+)$`),
            handler: (req) => {
                const url = new URL(req.url);
                const id = url.pathname.split('/')[4];
                return Response.json({ id, resource: `resource${i}` });
            }
        });
    }

    return routes;
}

/**
 * 停止服务器
 * @param server 服务器实例
 * @param serverType 服务器类型
 */
async function stopServer(server: any, serverType: string): Promise<void> {
    try {
        switch (serverType) {
            case "bactor":
            case "optimized":
                await server.server.send({ type: "stop" });
                await server.system.shutdown();
                break;

            case "bun":
            case "hono":
                server.stop();
                break;
        }

        console.log(`服务器 ${serverType} 已停止`);
    } catch (error) {
        console.error(`停止服务器 ${serverType} 时出错:`, error);
    }
}

/**
 * 运行负载测试
 * @param options 负载测试选项
 */
async function runLoadTest(options: {
    url: string;
    duration: number;
    connections: number;
}): Promise<{
    rps: number;
    latency: {
        min: number;
        avg: number;
        max: number;
        p50: number;
        p90: number;
        p99: number;
    };
    statusCodes: Record<string, number>;
    errors: number;
    totalRequests: number;
    duration: number;
}> {
    // 使用wrk、autocannon或其他工具运行负载测试
    // 这里我们使用内置的简单负载测试器
    const startTime = Date.now();
    const endTime = startTime + options.duration * 1000;

    const requests: Promise<{
        duration: number;
        status: number;
        error?: Error;
    }>[] = [];

    const statusCodes: Record<string, number> = {};
    let errors = 0;
    const latencies: number[] = [];

    // 模拟并发连接
    for (let i = 0; i < options.connections; i++) {
        const runConnection = async () => {
            while (Date.now() < endTime) {
                const reqStartTime = performance.now();

                try {
                    const response = await fetch(options.url);
                    const reqEndTime = performance.now();
                    const duration = reqEndTime - reqStartTime;

                    // 记录状态码
                    const status = response.status;
                    statusCodes[status] = (statusCodes[status] || 0) + 1;

                    // 记录延迟
                    latencies.push(duration);

                    requests.push(Promise.resolve({
                        duration,
                        status
                    }));
                } catch (error) {
                    errors++;
                    requests.push(Promise.resolve({
                        duration: performance.now() - reqStartTime,
                        status: 0,
                        error: error as Error
                    }));
                }
            }
        };

        // 启动连接
        runConnection();
    }

    // 等待所有请求完成
    await new Promise(resolve => setTimeout(resolve, options.duration * 1000 + 100));

    const actualDuration = (Date.now() - startTime) / 1000;
    const totalRequests = requests.length;
    const rps = totalRequests / actualDuration;

    // 计算延迟统计
    latencies.sort((a, b) => a - b);
    const min = latencies[0] || 0;
    const max = latencies[latencies.length - 1] || 0;
    const avg = latencies.reduce((sum, val) => sum + val, 0) / (latencies.length || 1);

    // 计算百分位数
    const p50 = latencies[Math.floor(latencies.length * 0.5)] || 0;
    const p90 = latencies[Math.floor(latencies.length * 0.9)] || 0;
    const p99 = latencies[Math.floor(latencies.length * 0.99)] || 0;

    return {
        rps,
        latency: {
            min,
            avg,
            max,
            p50,
            p90,
            p99
        },
        statusCodes,
        errors,
        totalRequests,
        duration: actualDuration
    };
}

/**
 * 打印比较表格
 * @param results 基准测试结果数组
 */
function printComparisonTable(results: BenchmarkResult[]): void {
    if (results.length === 0) {
        return;
    }

    console.log("\n=".repeat(80));
    console.log("性能比较结果");
    console.log("=".repeat(80));

    // 表头
    console.log(
        "服务器类型".padEnd(15),
        "RPS".padEnd(12),
        "平均延迟".padEnd(12),
        "P99延迟".padEnd(12),
        "总请求数".padEnd(12),
        "错误数".padEnd(10)
    );
    console.log("-".repeat(80));

    // 找出最高RPS作为基准
    const maxRps = Math.max(...results.map(r => r.rps));

    // 表内容
    for (const result of results) {
        const rpsRatio = ((result.rps / maxRps) * 100).toFixed(1);

        console.log(
            result.server.padEnd(15),
            `${result.rps.toFixed(2)}`.padEnd(12),
            `${result.latency.avg.toFixed(2)}ms`.padEnd(12),
            `${result.latency.p99.toFixed(2)}ms`.padEnd(12),
            `${result.totalRequests}`.padEnd(12),
            `${result.errors}`.padEnd(10),
            `(${rpsRatio}%)`
        );
    }

    console.log("=".repeat(80));
}

/**
 * 命令行入口
 */
if (import.meta.main) {
    const args = process.argv.slice(2);
    const config: Partial<BenchmarkConfig> = {};

    // 解析命令行参数
    for (let i = 0; i < args.length; i++) {
        const arg = args[i];

        if (arg === "--port" && i + 1 < args.length) {
            config.port = parseInt(args[++i], 10);
        } else if (arg === "--duration" && i + 1 < args.length) {
            config.duration = parseInt(args[++i], 10);
        } else if (arg === "--connections" && i + 1 < args.length) {
            config.connections = parseInt(args[++i], 10);
        } else if (arg === "--servers" && i + 1 < args.length) {
            config.servers = args[++i].split(",") as any[];
        } else if (arg === "--warmup" && i + 1 < args.length) {
            config.warmup = parseInt(args[++i], 10);
        } else if (arg === "--help") {
            console.log(`
使用方法: bun optimized_benchmark.ts [选项]

选项:
  --port NUMBER         服务器端口 (默认: 3000)
  --duration NUMBER     测试持续时间，秒 (默认: 10)
  --connections NUMBER  并发连接数 (默认: 50)
  --warmup NUMBER       预热时间，秒 (默认: 2)
  --servers LIST        要测试的服务器，逗号分隔 (默认: bactor,optimized,bun,hono)
  --help                显示此帮助信息
      `);
            process.exit(0);
        }
    }

    // 运行基准测试
    runBenchmark(config).catch(error => {
        console.error("基准测试失败:", error);
        process.exit(1);
    });
} 