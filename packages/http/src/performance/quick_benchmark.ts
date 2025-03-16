/**
 * 快速 HTTP 性能测试
 * 一个简单的服务器性能测试脚本，无需第三方依赖
 */

import { ActorSystem } from '@bactor/core';
import { HttpActorSystem, createHttpSystem } from '../actors/http_actor_system';
import { HttpResponses, HttpStatus } from '../helpers/http_responses';
import { HttpContext } from '../types';

// 测试配置
const TEST_PORT = 3038;
const TEST_DURATION_MS = 5000; // 测试持续时间 (5秒)
const CONCURRENT_REQUESTS = 50; // 降低并发请求数从100到50
const TEST_ENDPOINTS = [
    { name: 'Simple JSON Response', url: '/api/json' },
    { name: 'Echo API (small)', url: '/api/echo', method: 'POST', body: JSON.stringify({ message: 'hello' }) },
    { name: 'CPU Test (light)', url: '/api/cpu/15' }
];

/**
 * 执行单个请求
 */
async function makeRequest(url: string, method: string = 'GET', body?: string): Promise<number> {
    const start = performance.now();

    try {
        const options: RequestInit = { method };
        if (body) {
            options.body = body;
            options.headers = { 'Content-Type': 'application/json' };
        }

        const response = await fetch(url, options);
        if (!response.ok) {
            console.error(`Request to ${url} failed: ${response.status} ${response.statusText}`);
            return -1;
        }

        // 确保读取响应体以完成请求
        await response.text();
    } catch (error) {
        console.error(`Error making request to ${url}:`, error);
        return -1;
    }

    return performance.now() - start;
}

/**
 * 执行并发负载测试
 */
async function runConcurrentTest(
    baseUrl: string,
    path: string,
    concurrency: number,
    durationMs: number,
    method: string = 'GET',
    body?: string
): Promise<{
    requestCount: number,
    successCount: number,
    failCount: number,
    totalTime: number,
    avgResponseTime: number,
    requestsPerSecond: number
}> {
    const fullUrl = `${baseUrl}${path}`;
    const endTime = Date.now() + durationMs;

    let requestCount = 0;
    let successCount = 0;
    let failCount = 0;
    let totalResponseTime = 0;

    const batchSize = concurrency;

    console.log(`Starting test for ${method} ${fullUrl} with ${concurrency} concurrent requests...`);

    while (Date.now() < endTime) {
        const batchPromises = [];

        // 创建一批并发请求
        for (let i = 0; i < batchSize; i++) {
            batchPromises.push(makeRequest(fullUrl, method, body));
        }

        // 等待所有请求完成
        const responseTimes = await Promise.all(batchPromises);

        // 处理结果
        for (const time of responseTimes) {
            requestCount++;
            if (time >= 0) {
                successCount++;
                totalResponseTime += time;
            } else {
                failCount++;
            }
        }
    }

    const avgResponseTime = successCount > 0 ? totalResponseTime / successCount : 0;
    const requestsPerSecond = (successCount / durationMs) * 1000;

    return {
        requestCount,
        successCount,
        failCount,
        totalTime: durationMs,
        avgResponseTime,
        requestsPerSecond
    };
}

/**
 * 设置测试服务器
 */
async function setupTestServer(): Promise<HttpActorSystem> {
    // 创建 Actor 系统
    const system = new ActorSystem('http-benchmark-system');

    // 创建 HTTP 系统
    const httpSystem = await createHttpSystem(system, {
        port: TEST_PORT
    });

    // 添加测试路由

    // 基础 JSON 响应
    await httpSystem.addRoute({
        method: 'GET',
        pattern: '/api/json',
        handler: async (context: HttpContext) => {
            return HttpResponses.json({
                timestamp: Date.now(),
                message: 'Hello from benchmark API',
                items: Array.from({ length: 20 }, (_, i) => ({
                    id: i,
                    name: `Item ${i}`,
                    value: Math.random() * 100
                }))
            });
        }
    });

    // Echo API
    await httpSystem.addRoute({
        method: 'POST',
        pattern: '/api/echo',
        handler: async (context: HttpContext) => {
            const body = await new Response(context.request.body).text();
            return HttpResponses.json({
                echo: JSON.parse(body),
                timestamp: Date.now()
            });
        }
    });

    // CPU 测试
    await httpSystem.addRoute({
        method: 'GET',
        pattern: '/api/cpu/:n',
        handler: async (context: HttpContext) => {
            const n = parseInt(context.params.n || '15');

            // 简单的计算密集型任务 - 斐波那契
            const fib = (num: number): number => {
                if (num <= 1) return num;
                return fib(num - 1) + fib(num - 2);
            };

            const result = fib(n);

            return HttpResponses.json({
                input: n,
                result: result,
                timestamp: Date.now()
            });
        }
    });

    // 启动服务器
    await httpSystem.start();
    console.log(`Test server running on http://localhost:${TEST_PORT}`);

    // 等待服务器启动 - 增加等待时间
    await new Promise(resolve => setTimeout(resolve, 2000));

    return httpSystem;
}

/**
 * 运行所有测试
 */
async function runAllTests(): Promise<void> {
    console.log('=== HTTP Server Quick Performance Test ===');

    const httpSystem = await setupTestServer();

    try {
        const baseUrl = `http://localhost:${TEST_PORT}`;

        console.log('\n=== Testing Server Performance ===');

        // 测试每个端点
        for (const endpoint of TEST_ENDPOINTS) {
            console.log(`\n--- Testing ${endpoint.name} ---`);

            const result = await runConcurrentTest(
                baseUrl,
                endpoint.url,
                CONCURRENT_REQUESTS,
                TEST_DURATION_MS,
                endpoint.method || 'GET',
                endpoint.body
            );

            console.log(`Results for ${endpoint.name}:`);
            console.log(`  Total Requests: ${result.requestCount}`);
            console.log(`  Successful Requests: ${result.successCount}`);
            console.log(`  Failed Requests: ${result.failCount}`);
            console.log(`  Average Response Time: ${result.avgResponseTime.toFixed(2)}ms`);
            console.log(`  Requests Per Second: ${result.requestsPerSecond.toFixed(2)}`);
            console.log(`  Success Rate: ${(result.successCount / result.requestCount * 100).toFixed(2)}%`);
        }

    } finally {
        // 关闭服务器前先等待所有连接完成
        console.log('\nWaiting for connections to complete...');
        await new Promise(resolve => setTimeout(resolve, 1000));

        // 关闭服务器
        console.log('Shutting down test server...');
        await httpSystem.stop();
    }
}

// 运行测试
runAllTests().then(() => {
    console.log('\n=== Performance Test Completed ===');
}).catch(error => {
    console.error('Error in performance test:', error);
}); 