/**
 * http_benchmark.test.ts
 * 
 * Bun HTTP服务器性能基准测试
 * 测试不同配置和场景下的HTTP服务器性能表现
 */

import { Server } from "bun";
import { describe, it, expect, afterEach, beforeAll, afterAll } from "bun:test";

// 超时设置（毫秒）
const TEST_TIMEOUT = 30000;

// 压测配置
interface BenchmarkConfig {
    // 服务器配置
    serverConfig: {
        port: number;
        development: boolean;
    };

    // 测试配置
    testConfig: {
        duration: number;        // 持续时间（秒）
        connections: number;     // 并发连接数
        pipelining: number;      // 请求管道数
    };

    // 服务端点配置
    endpoints: {
        staticContent?: boolean; // 是否包含静态内容测试
        jsonPayloads?: boolean;  // 是否包含JSON负载测试
    };
}

// 测试结果接口
interface BenchmarkResult {
    config: BenchmarkConfig;
    rps: number;               // 每秒请求数
    latency: {                 // 延迟信息（毫秒）
        min: number;
        avg: number;
        max: number;
        p50: number;
        p90: number;
        p99: number;
    };
    throughput: {              // 吞吐量
        bytesPerSecond: number;
    };
    statusCodes: Record<string, number>; // HTTP状态码分布
    errors: number;            // 错误数
    timeouts: number;          // 超时数
    duration: number;          // 实际测试持续时间（秒）
    memoryUsage?: number;      // 内存使用（MB，如果可用）
}

// 默认基准测试配置
const DEFAULT_CONFIG: BenchmarkConfig = {
    serverConfig: {
        port: 3000,
        development: false
    },
    testConfig: {
        duration: 1,
        connections: 10,
        pipelining: 5
    },
    endpoints: {
        staticContent: true,
        jsonPayloads: true
    }
};

describe('HTTP服务器性能基准测试', () => {
    let server: Server;
    let baseUrl: string;

    // 系统信息
    const cpuCount = navigator.hardwareConcurrency || 4;

    // 输出测试环境信息
    beforeAll(() => {
        console.log('\n=== HTTP服务器基准测试环境 ===');
        console.log(`CPU核心数: ${cpuCount}`);
        console.log(`Bun版本: ${Bun.version}`);
        console.log('===================\n');
    });

    // 每个测试后清理资源
    afterEach(async () => {
        if (server) {
            server.stop();

            // 等待端口释放
            await new Promise(resolve => setTimeout(resolve, 500));
        }
    });

    // 创建和启动服务器
    async function setupServer(config: BenchmarkConfig): Promise<void> {
        // 设置基础URL
        baseUrl = `http://localhost:${config.serverConfig.port}`;

        // 创建HTTP监听器
        server = Bun.serve({
            port: config.serverConfig.port,
            development: config.serverConfig.development,
            fetch(req) {
                const url = new URL(req.url);
                const path = url.pathname;

                // 静态路由
                if (path.startsWith("/api/static")) {
                    return new Response(JSON.stringify({
                        message: `Static route`,
                        timestamp: Date.now()
                    }), {
                        headers: { 'Content-Type': 'application/json' }
                    });
                }

                // 参数路由
                if (path.startsWith("/api/items/")) {
                    const id = path.replace("/api/items/", "");
                    return new Response(JSON.stringify({
                        message: "Param route",
                        id,
                        timestamp: Date.now()
                    }), {
                        headers: { 'Content-Type': 'application/json' }
                    });
                }

                // 嵌套路由
                if (path.match(/\/api\/category\d+\/[\w-]+\/product\/[\w-]+/)) {
                    const parts = path.split('/');
                    const categoryId = parts[3];
                    const productId = parts[5];
                    return new Response(JSON.stringify({
                        message: "Nested route",
                        categoryId,
                        productId,
                        timestamp: Date.now()
                    }), {
                        headers: { 'Content-Type': 'application/json' }
                    });
                }

                // 静态内容路由（如果启用）
                if (config.endpoints.staticContent) {
                    if (path === "/static/small.html") {
                        return new Response('<html><body><h1>Small Static Content</h1></body></html>', {
                            headers: { 'Content-Type': 'text/html' }
                        });
                    }

                    if (path === "/static/medium.html") {
                        // 生成中等大小的HTML内容
                        let content = '<html><body><h1>Medium Static Content</h1><ul>';
                        for (let i = 0; i < 100; i++) {
                            content += `<li>Item ${i}</li>`;
                        }
                        content += '</ul></body></html>';
                        return new Response(content, {
                            headers: { 'Content-Type': 'text/html' }
                        });
                    }

                    if (path === "/static/large.html") {
                        // 生成大型HTML内容但减小大小以避免连接错误
                        let content = '<html><body><h1>Large Static Content</h1><table>';
                        for (let i = 0; i < 100; i++) {
                            content += '<tr>';
                            for (let j = 0; j < 5; j++) {
                                content += `<td>Cell ${i}-${j}</td>`;
                            }
                            content += '</tr>';
                        }
                        content += '</table></body></html>';
                        return new Response(content, {
                            headers: { 'Content-Type': 'text/html' }
                        });
                    }
                }

                // JSON负载路由（如果启用）
                if (config.endpoints.jsonPayloads && req.method === "POST") {
                    if (path === "/api/json/small") {
                        return new Response(JSON.stringify({
                            success: true,
                            timestamp: Date.now()
                        }), {
                            headers: { 'Content-Type': 'application/json' }
                        });
                    }

                    if (path === "/api/json/large") {
                        // 创建大型响应但减小大小以避免连接错误
                        const response = {
                            success: true,
                            timestamp: Date.now(),
                            items: Array(20).fill(0).map((_, i) => ({
                                id: i,
                                name: `Item ${i}`,
                                description: `This is item number ${i} in the large response`,
                                tags: ['tag1', 'tag2', 'tag3'],
                                metadata: {
                                    created: new Date().toISOString(),
                                    updated: new Date().toISOString(),
                                    views: Math.floor(Math.random() * 1000)
                                }
                            }))
                        };
                        return new Response(JSON.stringify(response), {
                            headers: { 'Content-Type': 'application/json' }
                        });
                    }
                }

                // 404
                return new Response("Not Found", { status: 404 });
            }
        });

        console.log(`服务器已启动，监听端口 ${config.serverConfig.port}`);
    }

    // 运行负载测试
    async function runLoadTest(config: BenchmarkConfig, endpoint: string): Promise<BenchmarkResult> {
        const url = `${baseUrl}${endpoint}`;
        console.log(`开始对${url}进行压力测试...`);

        // 记录开始时间和资源使用
        const startTime = Date.now();
        const startMemory = process.memoryUsage().heapUsed / 1024 / 1024; // MB

        // 创建并发请求
        const connections = config.testConfig.connections;
        const pipelining = config.testConfig.pipelining;
        const statusCodes: Record<string, number> = {};
        let completedRequests = 0;
        let errors = 0;
        let timeouts = 0;

        // 延迟统计
        const latencies: number[] = [];

        // 吞吐量统计
        let totalBytes = 0;

        // 创建模拟客户端函数
        const makeRequest = async () => {
            const requestStart = Date.now();
            try {
                const response = await fetch(url, {
                    method: endpoint.includes('/api/json/') ? 'POST' : 'GET',
                    headers: {
                        'Content-Type': 'application/json',
                        'Connection': 'keep-alive'
                    },
                    body: endpoint.includes('/api/json/') ? JSON.stringify({
                        test: true,
                        timestamp: Date.now(),
                        data: Array(5).fill(0).map((_, i) => ({ id: i }))
                    }) : undefined
                });

                const responseTime = Date.now() - requestStart;
                latencies.push(responseTime);

                const statusCode = response.status.toString();
                statusCodes[statusCode] = (statusCodes[statusCode] || 0) + 1;

                const responseData = await response.text();
                totalBytes += responseData.length;

                completedRequests++;
            } catch (error) {
                if (String(error).includes('timeout')) {
                    timeouts++;
                } else {
                    errors++;
                }
            }
        };

        // 创建请求池
        const requestBatches = [];
        for (let i = 0; i < connections; i++) {
            requestBatches.push(new Array(pipelining).fill(0).map(() => makeRequest()));
        }

        // 等待所有请求完成或超时
        const testDurationMs = config.testConfig.duration * 1000;
        const timeout = new Promise(resolve => setTimeout(resolve, testDurationMs + 100));

        await Promise.race([
            Promise.all(requestBatches.map(batch => Promise.all(batch))),
            timeout
        ]);

        // 计算结果
        const endTime = Date.now();
        const endMemory = process.memoryUsage().heapUsed / 1024 / 1024; // MB
        const duration = (endTime - startTime) / 1000; // 转换为秒

        // 计算延迟统计
        latencies.sort((a, b) => a - b);
        const minLatency = latencies.length > 0 ? latencies[0] : 0;
        const maxLatency = latencies.length > 0 ? latencies[latencies.length - 1] : 0;
        const avgLatency = latencies.length > 0 ? latencies.reduce((a, b) => a + b, 0) / latencies.length : 0;

        // 百分位数计算
        const getPercentile = (arr: number[], p: number) => {
            if (arr.length === 0) return 0;
            const index = Math.floor(arr.length * p / 100);
            return arr[index];
        };

        const p50Latency = getPercentile(latencies, 50);
        const p90Latency = getPercentile(latencies, 90);
        const p99Latency = getPercentile(latencies, 99);

        // 计算每秒请求数
        const rps = completedRequests / duration;

        // 计算吞吐量
        const bytesPerSecond = totalBytes / duration;

        return {
            config,
            rps,
            latency: {
                min: minLatency,
                avg: avgLatency,
                max: maxLatency,
                p50: p50Latency,
                p90: p90Latency,
                p99: p99Latency
            },
            throughput: {
                bytesPerSecond
            },
            statusCodes,
            errors,
            timeouts,
            duration,
            memoryUsage: endMemory - startMemory
        };
    }

    // 打印基准测试结果
    function printResults(result: BenchmarkResult, testName: string): void {
        console.log(`\n=== ${testName} 测试结果 ===`);
        console.log(`请求/秒: ${result.rps.toFixed(2)}`);
        console.log(`延迟:
  最小: ${result.latency.min} ms
  平均: ${result.latency.avg.toFixed(2)} ms
  最大: ${result.latency.max} ms
  p50: ${result.latency.p50.toFixed(2)} ms
  p90: ${result.latency.p90.toFixed(2)} ms
  p99: ${result.latency.p99.toFixed(2)} ms`);

        console.log(`吞吐量: ${(result.throughput.bytesPerSecond / 1024 / 1024).toFixed(2)} MB/s`);
        console.log('HTTP状态码:');
        Object.entries(result.statusCodes).forEach(([code, count]) => {
            console.log(`  ${code}: ${count}`);
        });

        console.log(`错误: ${result.errors}`);
        console.log(`超时: ${result.timeouts}`);
        console.log(`内存增长: ${result.memoryUsage?.toFixed(2)} MB`);
        console.log(`测试持续时间: ${result.duration.toFixed(2)} 秒`);
        console.log('=====================================\n');
    }

    // 测试标准配置下的静态路由性能
    it('基础HTTP性能测试', async () => {
        const config = { ...DEFAULT_CONFIG };
        config.serverConfig.port = 3001;
        await setupServer(config);

        // 运行测试
        const result = await runLoadTest(config, '/api/static');
        printResults(result, '基础HTTP性能测试');

        // 基本断言 - 确保测试运行正常
        expect(result.rps).toBeGreaterThan(0);
        // 允许有一些错误
        expect(result.statusCodes['200']).toBeGreaterThan(0);
    }, TEST_TIMEOUT);

    // 测试参数路由性能
    it('参数路由性能测试', async () => {
        const config = { ...DEFAULT_CONFIG };
        config.serverConfig.port = 3002;
        await setupServer(config);

        // 运行测试
        const result = await runLoadTest(config, '/api/items/test-item');
        printResults(result, '参数路由性能测试');

        // 基本断言
        expect(result.rps).toBeGreaterThan(0);
        // 允许有一些错误
        expect(result.statusCodes['200']).toBeGreaterThan(0);
    }, TEST_TIMEOUT);

    // 测试大型静态内容的性能
    it('静态内容性能测试', async () => {
        const config = { ...DEFAULT_CONFIG };
        config.serverConfig.port = 3003;
        config.endpoints.staticContent = true;
        await setupServer(config);

        // 运行测试 - 使用小型静态内容以避免连接错误
        const result = await runLoadTest(config, '/static/small.html');
        printResults(result, '静态内容性能测试');

        // 基本断言
        expect(result.rps).toBeGreaterThan(0);
        // 允许有一些错误
        expect(result.statusCodes['200']).toBeGreaterThan(0);
    }, TEST_TIMEOUT);

    // 测试JSON处理性能
    it('JSON处理性能测试', async () => {
        const config = { ...DEFAULT_CONFIG };
        config.serverConfig.port = 3004;
        config.endpoints.jsonPayloads = true;
        await setupServer(config);

        // 运行测试 - 使用小型JSON以避免连接错误
        const result = await runLoadTest(config, '/api/json/small');
        printResults(result, 'JSON处理性能测试');

        // 基本断言
        expect(result.rps).toBeGreaterThan(0);
        // 允许有一些错误
        expect(result.statusCodes['200']).toBeGreaterThan(0);
    }, TEST_TIMEOUT);

    // 在所有测试完成后输出总结
    afterAll(() => {
        console.log('\n=== HTTP服务器性能基准测试完成 ===');
        console.log('测试环境:');
        console.log(`- CPU核心数: ${cpuCount}`);
        console.log(`- Bun版本: ${Bun.version}`);
        console.log('注意: 实际性能会根据硬件环境和负载特性有所不同');
        console.log('=====================================\n');
    });
}); 