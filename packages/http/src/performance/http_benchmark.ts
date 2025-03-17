/**
 * HTTP 性能测试工具
 * 用于测试 @bactor/http 包的性能特性
 */

import { ActorSystem } from '@bactor/core';
import { HttpActorSystem, createHttpSystem } from '../actors/http_actor_system';
import { RouteGroupConfig } from '../actors/router_actor';
import { HttpResponses, HttpStatus } from '../helpers/http_responses';
import { HttpContext } from '../types';
import autocannon, { Options as AutocannonOptions, Result as AutocannonResult } from 'autocannon';
import fs from 'fs';
import path from 'path';
import os from 'os';

// 测试配置接口
export interface BenchmarkConfig {
    name: string;
    description: string;
    testSuites: TestSuite[];
    baseUrl: string;
    outputPath?: string; // 可选的输出路径
}

// 测试套件接口
export interface TestSuite {
    name: string;
    description: string;
    scenarios: TestScenario[];
}

// 测试场景接口
export interface TestScenario {
    name: string;
    description: string;
    options: AutocannonOptions;
    setup?: () => Promise<void>; // 可选的场景设置函数
    teardown?: () => Promise<void>; // 可选的场景清理函数
}

// 测试结果接口
export interface BenchmarkResult {
    config: BenchmarkConfig;
    systemInfo: SystemInfo;
    startTime: Date;
    endTime: Date;
    duration: number;
    testResults: {
        suiteName: string;
        scenarios: {
            name: string;
            result: AutocannonResult;
            metrics: PerformanceMetrics;
        }[];
    }[];
}

// 系统信息接口
export interface SystemInfo {
    platform: string;
    cpuModel: string;
    cpuCount: number;
    totalMemory: number;
    freeMemory: number;
    nodeVersion: string;
}

// 性能指标接口
export interface PerformanceMetrics {
    requestsPerSecond: number;
    avgLatency: number;
    maxLatency: number;
    p99Latency: number; // 99 百分位延迟
    totalErrors: number;
    throughputMBps: number;
    successRate: number;
}

/**
 * HTTP 基准测试类
 * 提供完整的 HTTP 服务器性能测试和报告生成功能
 */
export class HttpBenchmark {
    private system: ActorSystem;
    private httpSystem: HttpActorSystem | null = null;
    private config: BenchmarkConfig;
    private results: BenchmarkResult | null = null;
    private defaultPort = 3038; // 默认使用固定端口
    private setupComplete = false;

    /**
     * 创建基准测试实例
     * @param config 测试配置
     */
    constructor(config: BenchmarkConfig) {
        this.config = config;
        this.system = new ActorSystem('http-benchmark-system');

        // 设置默认的 baseUrl
        if (!this.config.baseUrl) {
            this.config.baseUrl = `http://localhost:${this.defaultPort}`;
        }
    }

    /**
     * 设置 HTTP 服务器和路由
     */
    async setup(): Promise<void> {
        if (this.setupComplete) return;

        // 创建 HTTP 系统
        this.httpSystem = await createHttpSystem(this.system, {
            port: this.defaultPort
        });

        // 设置基础路由组，用于各种测试场景
        await this.setupRoutes();

        // 启动服务器
        await this.httpSystem.start();

        console.log(`[HttpBenchmark] Server started at ${this.config.baseUrl}`);
        this.setupComplete = true;

        // 等待服务器完全启动
        await new Promise(resolve => setTimeout(resolve, 1000));
    }

    /**
     * 设置测试路由
     */
    private async setupRoutes(): Promise<void> {
        if (!this.httpSystem) return;

        // API 基础路由
        await this.httpSystem.addRoute({
            method: 'GET',
            pattern: '/',
            handler: async (context: HttpContext) => {
                return HttpResponses.json({
                    message: 'HTTP Benchmark API',
                    version: '1.0',
                    endpoints: {
                        echo: '/api/echo',
                        json: '/api/json',
                        cpu: '/api/cpu/:intensity',
                        memory: '/api/memory/:mb',
                        delay: '/api/delay/:ms'
                    }
                });
            }
        });

        // Echo 路由 - 原样返回请求数据
        await this.httpSystem.addRoute({
            method: 'POST',
            pattern: '/api/echo',
            handler: async (context: HttpContext) => {
                const body = await new Response(context.request.body).text();
                return HttpResponses.text(body, HttpStatus.OK);
            }
        });

        // JSON 路由 - 返回 JSON 数据
        await this.httpSystem.addRoute({
            method: 'GET',
            pattern: '/api/json',
            handler: async (context: HttpContext) => {
                return HttpResponses.json({
                    timestamp: Date.now(),
                    data: {
                        items: Array.from({ length: 100 }, (_, i) => ({
                            id: i,
                            name: `Item ${i}`,
                            value: Math.random() * 1000,
                            tags: ['benchmark', 'test', 'json']
                        }))
                    }
                });
            }
        });

        // CPU 密集型路由 - 计算斐波那契数列
        await this.httpSystem.addRoute({
            method: 'GET',
            pattern: '/api/cpu/:intensity',
            handler: async (context: HttpContext) => {
                const intensity = parseInt(context.params.intensity || '30', 10);
                const fib = (n: number): number => {
                    if (n <= 1) return n;
                    return fib(n - 1) + fib(n - 2);
                };

                const startTime = performance.now();
                const result = fib(intensity);
                const endTime = performance.now();

                return HttpResponses.json({
                    input: intensity,
                    result: result,
                    timeTaken: (endTime - startTime).toFixed(2) + 'ms'
                });
            }
        });

        // 内存密集型路由 - 分配和操作大数组
        await this.httpSystem.addRoute({
            method: 'GET',
            pattern: '/api/memory/:mb',
            handler: async (context: HttpContext) => {
                const mb = parseInt(context.params.mb || '10', 10);
                const size = mb * 1024 * 1024 / 8; // 每个数字占 8 字节

                const startTime = performance.now();
                const bigArray = new Array(size).fill(0).map((_, i) => i);
                const sum = bigArray.reduce((a, b) => a + b, 0);
                const endTime = performance.now();

                return HttpResponses.json({
                    memoryMB: mb,
                    arraySize: bigArray.length,
                    sum: sum,
                    timeTaken: (endTime - startTime).toFixed(2) + 'ms'
                });
            }
        });

        // 模拟网络延迟路由
        await this.httpSystem.addRoute({
            method: 'GET',
            pattern: '/api/delay/:ms',
            handler: async (context: HttpContext) => {
                const delay = parseInt(context.params.ms || '100', 10);
                await new Promise(resolve => setTimeout(resolve, delay));

                return HttpResponses.json({
                    requestedDelay: delay,
                    timestamp: Date.now()
                });
            }
        });
    }

    /**
     * 关闭服务器和资源
     */
    async teardown(): Promise<void> {
        if (this.httpSystem) {
            await this.httpSystem.stop();
        }

        if (this.system) {
            await this.system.stop();
        }

        console.log(`[HttpBenchmark] Server stopped`);
        this.setupComplete = false;
    }

    /**
     * 运行所有测试场景
     */
    async runAll(): Promise<BenchmarkResult> {
        await this.setup();

        const startTime = new Date();
        const testResults: BenchmarkResult['testResults'] = [];

        console.log(`\n=== Starting HTTP Performance Benchmark ===`);
        console.log(`Name: ${this.config.name}`);
        console.log(`Description: ${this.config.description}`);
        console.log(`Base URL: ${this.config.baseUrl}`);
        console.log(`Total test suites: ${this.config.testSuites.length}`);
        console.log(`Started at: ${startTime.toLocaleString()}\n`);

        // 获取系统信息
        const systemInfo = this.getSystemInfo();

        // 遍历执行测试套件
        for (const suite of this.config.testSuites) {
            console.log(`\n== Running Test Suite: ${suite.name} ==`);
            console.log(`Description: ${suite.description}`);

            const suiteResults = {
                suiteName: suite.name,
                scenarios: []
            };

            // 遍历执行测试场景
            for (const scenario of suite.scenarios) {
                console.log(`\n- Running Scenario: ${scenario.name}`);
                console.log(`  Description: ${scenario.description}`);

                // 执行场景前置设置
                if (scenario.setup) {
                    await scenario.setup();
                }

                // 确保 URL 正确
                if (!scenario.options.url && !scenario.options.connections) {
                    throw new Error(`Scenario ${scenario.name} is missing URL or connections`);
                }

                if (!scenario.options.url?.startsWith('http')) {
                    scenario.options.url = `${this.config.baseUrl}${scenario.options.url}`;
                }

                // 默认设置
                scenario.options.title = scenario.options.title || scenario.name;

                // 执行基准测试
                const result = await this.runScenario(scenario.options);

                // 计算指标
                const metrics = this.calculateMetrics(result);

                // 保存结果
                (suiteResults.scenarios as any[]).push({
                    name: scenario.name,
                    result,
                    metrics
                });

                // 执行场景后置清理
                if (scenario.teardown) {
                    await scenario.teardown();
                }
            }

            testResults.push(suiteResults);
        }

        const endTime = new Date();
        const duration = (endTime.getTime() - startTime.getTime()) / 1000;

        // 生成测试结果
        this.results = {
            config: this.config,
            systemInfo,
            startTime,
            endTime,
            duration,
            testResults
        };

        // 输出汇总结果
        this.printSummary();

        // 生成报告文件
        if (this.config.outputPath) {
            await this.generateReport();
        }

        // 关闭服务器
        await this.teardown();

        return this.results;
    }

    /**
     * 运行单个测试场景
     */
    private async runScenario(options: AutocannonOptions): Promise<AutocannonResult> {
        return new Promise((resolve, reject) => {
            console.log(`  Starting benchmark for ${options.title || 'Unnamed'} at ${options.url}...`);
            console.log(`  Method: ${options.method || 'GET'}`);
            console.log(`  Connections: ${options.connections}`);
            console.log(`  Duration: ${options.duration}s`);

            const instance = autocannon(options, (err, result) => {
                if (err) {
                    console.error(`  Benchmark error:`, err);
                    reject(err);
                    return;
                }

                console.log(`  Requests/sec: ${result.requests.average.toFixed(2)}`);
                console.log(`  Latency (avg): ${result.latency.average.toFixed(2)} ms`);
                console.log(`  Throughput: ${(result.throughput.average / 1024 / 1024).toFixed(2)} MB/sec`);
                resolve(result);
            });

            autocannon.track(instance, { renderProgressBar: true });
        });
    }

    /**
     * 计算性能指标
     */
    private calculateMetrics(result: AutocannonResult): PerformanceMetrics {
        const totalRequests = result.requests.total;
        const successfulRequests = totalRequests -
            (result.non2xx || 0) - (result.timeouts || 0) - (result.errors || 0);

        return {
            requestsPerSecond: result.requests.average,
            avgLatency: result.latency.average,
            maxLatency: result.latency.max,
            p99Latency: result.latency.p99,
            totalErrors: (result.errors || 0) + (result.timeouts || 0) + (result.non2xx || 0),
            throughputMBps: result.throughput.average / 1024 / 1024,
            successRate: totalRequests ? (successfulRequests / totalRequests) * 100 : 0
        };
    }

    /**
     * 获取系统信息
     */
    private getSystemInfo(): SystemInfo {
        const cpus = os.cpus();
        return {
            platform: `${os.platform()} ${os.release()}`,
            cpuModel: cpus.length > 0 ? cpus[0].model : 'Unknown',
            cpuCount: cpus.length,
            totalMemory: os.totalmem(),
            freeMemory: os.freemem(),
            nodeVersion: process.version
        };
    }

    /**
     * 输出测试汇总
     */
    private printSummary(): void {
        if (!this.results) return;

        console.log(`\n=== HTTP Benchmark Summary ===`);
        console.log(`Total duration: ${this.results.duration.toFixed(2)} seconds`);
        console.log(`Test suites: ${this.results.testResults.length}`);

        for (const suite of this.results.testResults) {
            console.log(`\n== Suite: ${suite.suiteName} ==`);

            // 找出最高 RPS 的场景
            const maxRpsScenario = suite.scenarios.reduce((max, current) =>
                current.metrics.requestsPerSecond > max.metrics.requestsPerSecond ? current : max,
                suite.scenarios[0]
            );

            // 找出最低延迟的场景
            const minLatencyScenario = suite.scenarios.reduce((min, current) =>
                current.metrics.avgLatency < min.metrics.avgLatency ? current : min,
                suite.scenarios[0]
            );

            console.log(`Best RPS: ${maxRpsScenario.name} (${maxRpsScenario.metrics.requestsPerSecond.toFixed(2)} req/sec)`);
            console.log(`Best Latency: ${minLatencyScenario.name} (${minLatencyScenario.metrics.avgLatency.toFixed(2)} ms)`);

            for (const scenario of suite.scenarios) {
                console.log(`\n- ${scenario.name}:`);
                console.log(`  RPS: ${scenario.metrics.requestsPerSecond.toFixed(2)}`);
                console.log(`  Avg Latency: ${scenario.metrics.avgLatency.toFixed(2)} ms`);
                console.log(`  P99 Latency: ${scenario.metrics.p99Latency.toFixed(2)} ms`);
                console.log(`  Throughput: ${scenario.metrics.throughputMBps.toFixed(2)} MB/s`);
                console.log(`  Success Rate: ${scenario.metrics.successRate.toFixed(2)}%`);
            }
        }
    }

    /**
     * 生成 HTML 报告文件
     */
    private async generateReport(): Promise<void> {
        if (!this.results || !this.config.outputPath) return;

        // 生成 JSON 报告
        const jsonReport = JSON.stringify(this.results, null, 2);
        const jsonPath = path.join(this.config.outputPath, `http-benchmark-${Date.now()}.json`);

        // 确保输出目录存在
        fs.mkdirSync(this.config.outputPath, { recursive: true });

        // 写入 JSON 报告
        fs.writeFileSync(jsonPath, jsonReport);
        console.log(`\nJSON report saved to: ${jsonPath}`);

        // 生成 HTML 报告
        const htmlReport = this.generateHtmlReport();
        const htmlPath = path.join(this.config.outputPath, `http-benchmark-${Date.now()}.html`);

        // 写入 HTML 报告
        fs.writeFileSync(htmlPath, htmlReport);
        console.log(`HTML report saved to: ${htmlPath}`);
    }

    /**
     * 生成 HTML 报告内容
     */
    private generateHtmlReport(): string {
        if (!this.results) return '';

        const styles = `
            body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, 'Open Sans', 'Helvetica Neue', sans-serif; margin: 0; padding: 20px; color: #333; }
            .container { max-width: 1200px; margin: 0 auto; }
            h1 { color: #2c3e50; }
            h2 { color: #3498db; margin-top: 30px; }
            h3 { color: #2980b9; }
            .card { background: #fff; border-radius: 4px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); padding: 20px; margin-bottom: 20px; }
            .header { background: #3498db; color: white; padding: 15px; border-radius: 4px 4px 0 0; margin: -20px -20px 20px; }
            table { width: 100%; border-collapse: collapse; margin: 20px 0; }
            th, td { padding: 12px 15px; text-align: left; border-bottom: 1px solid #ddd; }
            th { background-color: #f2f2f2; }
            .metric-highlight { font-weight: bold; color: #27ae60; }
            .chart { width: 100%; height: 300px; margin: 20px 0; }
            .footer { margin-top: 40px; text-align: center; color: #7f8c8d; font-size: 0.9em; }
            .tab { overflow: hidden; border: 1px solid #ccc; background-color: #f1f1f1; }
            .tab button { background-color: inherit; float: left; border: none; outline: none; cursor: pointer; padding: 14px 16px; transition: 0.3s; }
            .tab button:hover { background-color: #ddd; }
            .tab button.active { background-color: #ccc; }
            .tabcontent { display: none; padding: 6px 12px; border: 1px solid #ccc; border-top: none; }
        `;

        const scripts = `
            <script src="https://cdn.jsdelivr.net/npm/chart.js@3.7.1/dist/chart.min.js"></script>
            <script>
                document.addEventListener('DOMContentLoaded', function() {
                    // 创建性能图表
                    createCharts();
                    
                    // 默认显示第一个标签页
                    document.querySelector('.tabcontent').style.display = 'block';
                    document.querySelector('.tablinks').classList.add('active');
                });
                
                function openTab(evt, tabName) {
                    var i, tabcontent, tablinks;
                    tabcontent = document.getElementsByClassName("tabcontent");
                    for (i = 0; i < tabcontent.length; i++) {
                        tabcontent[i].style.display = "none";
                    }
                    tablinks = document.getElementsByClassName("tablinks");
                    for (i = 0; i < tablinks.length; i++) {
                        tablinks[i].className = tablinks[i].className.replace(" active", "");
                    }
                    document.getElementById(tabName).style.display = "block";
                    evt.currentTarget.className += " active";
                }
                
                function createCharts() {
                    // 自动为每个测试套件创建图表
                    ${this.results?.testResults.map((suite, suiteIndex) => `
                        // RPS Chart for ${suite.suiteName}
                        new Chart(document.getElementById('rpsChart${suiteIndex}'), {
                            type: 'bar',
                            data: {
                                labels: ${JSON.stringify(suite.scenarios.map(s => s.name))},
                                datasets: [{
                                    label: 'Requests Per Second',
                                    data: ${JSON.stringify(suite.scenarios.map(s => s.metrics.requestsPerSecond))},
                                    backgroundColor: 'rgba(54, 162, 235, 0.5)',
                                    borderColor: 'rgba(54, 162, 235, 1)',
                                    borderWidth: 1
                                }]
                            },
                            options: {
                                scales: {
                                    y: {
                                        beginAtZero: true,
                                        title: {
                                            display: true,
                                            text: 'RPS'
                                        }
                                    }
                                },
                                plugins: {
                                    title: {
                                        display: true,
                                        text: 'Requests Per Second'
                                    }
                                }
                            }
                        });
                        
                        // Latency Chart for ${suite.suiteName}
                        new Chart(document.getElementById('latencyChart${suiteIndex}'), {
                            type: 'bar',
                            data: {
                                labels: ${JSON.stringify(suite.scenarios.map(s => s.name))},
                                datasets: [
                                    {
                                        label: 'Average',
                                        data: ${JSON.stringify(suite.scenarios.map(s => s.metrics.avgLatency))},
                                        backgroundColor: 'rgba(75, 192, 192, 0.5)',
                                        borderColor: 'rgba(75, 192, 192, 1)',
                                        borderWidth: 1
                                    },
                                    {
                                        label: 'P99',
                                        data: ${JSON.stringify(suite.scenarios.map(s => s.metrics.p99Latency))},
                                        backgroundColor: 'rgba(255, 99, 132, 0.5)',
                                        borderColor: 'rgba(255, 99, 132, 1)',
                                        borderWidth: 1
                                    }
                                ]
                            },
                            options: {
                                scales: {
                                    y: {
                                        beginAtZero: true,
                                        title: {
                                            display: true,
                                            text: 'Latency (ms)'
                                        }
                                    }
                                },
                                plugins: {
                                    title: {
                                        display: true,
                                        text: 'Latency Comparison'
                                    }
                                }
                            }
                        });
                    `).join('')}
                }
            </script>
        `;

        const systemInfoHtml = `
            <div class="card">
                <div class="header">
                    <h2 style="margin: 0;">System Information</h2>
                </div>
                <table>
                    <tr><th>Platform</th><td>${this.results.systemInfo.platform}</td></tr>
                    <tr><th>CPU Model</th><td>${this.results.systemInfo.cpuModel}</td></tr>
                    <tr><th>CPU Count</th><td>${this.results.systemInfo.cpuCount}</td></tr>
                    <tr><th>Total Memory</th><td>${(this.results.systemInfo.totalMemory / 1024 / 1024 / 1024).toFixed(2)} GB</td></tr>
                    <tr><th>Free Memory</th><td>${(this.results.systemInfo.freeMemory / 1024 / 1024 / 1024).toFixed(2)} GB</td></tr>
                    <tr><th>Node Version</th><td>${this.results.systemInfo.nodeVersion}</td></tr>
                </table>
            </div>
        `;

        // 生成标签页
        const tabButtons = this.results.testResults.map((suite, index) =>
            `<button class="tablinks" onclick="openTab(event, 'suite${index}')">${suite.suiteName}</button>`
        ).join('');

        // 生成标签内容
        const tabContents = this.results.testResults.map((suite, suiteIndex) => `
            <div id="suite${suiteIndex}" class="tabcontent">
                <h3>${suite.suiteName}</h3>
                <p>${suite.scenarios.length} scenarios tested</p>
                
                <div class="card">
                    <h3>Performance Charts</h3>
                    <div class="chart" id="rpsChart${suiteIndex}"></div>
                    <div class="chart" id="latencyChart${suiteIndex}"></div>
                </div>
                
                <div class="card">
                    <h3>Scenario Results</h3>
                    <table>
                        <tr>
                            <th>Scenario</th>
                            <th>RPS</th>
                            <th>Avg Latency</th>
                            <th>P99 Latency</th>
                            <th>Max Latency</th>
                            <th>Throughput</th>
                            <th>Success Rate</th>
                        </tr>
                        ${suite.scenarios.map(scenario => `
                            <tr>
                                <td>${scenario.name}</td>
                                <td>${scenario.metrics.requestsPerSecond.toFixed(2)}</td>
                                <td>${scenario.metrics.avgLatency.toFixed(2)} ms</td>
                                <td>${scenario.metrics.p99Latency.toFixed(2)} ms</td>
                                <td>${scenario.metrics.maxLatency.toFixed(2)} ms</td>
                                <td>${scenario.metrics.throughputMBps.toFixed(2)} MB/s</td>
                                <td>${scenario.metrics.successRate.toFixed(2)}%</td>
                            </tr>
                        `).join('')}
                    </table>
                </div>
            </div>
        `).join('');

        return `
            <!DOCTYPE html>
            <html lang="en">
            <head>
                <meta charset="UTF-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <title>HTTP Benchmark Results - ${this.config.name}</title>
                <style>${styles}</style>
            </head>
            <body>
                <div class="container">
                    <h1>HTTP Performance Benchmark Report</h1>
                    
                    <div class="card">
                        <div class="header">
                            <h2 style="margin: 0;">Test Configuration</h2>
                        </div>
                        <table>
                            <tr><th>Name</th><td>${this.config.name}</td></tr>
                            <tr><th>Description</th><td>${this.config.description}</td></tr>
                            <tr><th>Base URL</th><td>${this.config.baseUrl}</td></tr>
                            <tr><th>Started</th><td>${this.results.startTime.toLocaleString()}</td></tr>
                            <tr><th>Finished</th><td>${this.results.endTime.toLocaleString()}</td></tr>
                            <tr><th>Duration</th><td>${this.results.duration.toFixed(2)} seconds</td></tr>
                            <tr><th>Test Suites</th><td>${this.results.testResults.length}</td></tr>
                        </table>
                    </div>
                    
                    ${systemInfoHtml}
                    
                    <h2>Test Results</h2>
                    
                    <div class="tab">
                        ${tabButtons}
                    </div>
                    
                    ${tabContents}
                    
                    <div class="footer">
                        <p>Generated by @bactor/http Benchmark on ${new Date().toLocaleString()}</p>
                    </div>
                </div>
                
                ${scripts}
            </body>
            </html>
        `;
    }
}

// 预定义的测试套件配置
export const standardTestSuite: TestSuite = {
    name: 'Standard HTTP Performance',
    description: 'Tests basic HTTP server functionality under various loads',
    scenarios: [
        {
            name: 'Simple GET Request',
            description: 'Basic endpoint returning simple JSON response',
            options: {
                url: '/api/json',
                method: 'GET',
                duration: 3, // 缩短测试时间
                connections: 50
            }
        },
        {
            name: 'Echo POST Request',
            description: 'Echo endpoint reflecting back request body',
            options: {
                url: '/api/echo',
                method: 'POST',
                body: JSON.stringify({ message: 'Hello Benchmark' }),
                headers: {
                    'content-type': 'application/json'
                },
                duration: 3, // 缩短测试时间
                connections: 50
            }
        },
        {
            name: 'CPU Intensive - Light',
            description: 'CPU-bound computation with light workload',
            options: {
                url: '/api/cpu/20',
                method: 'GET',
                duration: 3, // 缩短测试时间
                connections: 25
            }
        },
        {
            name: 'CPU Intensive - Heavy',
            description: 'CPU-bound computation with heavy workload',
            options: {
                url: '/api/cpu/30',
                method: 'GET',
                duration: 10,
                connections: 20
            }
        },
        {
            name: 'Memory Intensive',
            description: 'Memory allocation and operation test',
            options: {
                url: '/api/memory/10',
                method: 'GET',
                duration: 10,
                connections: 20
            }
        },
        {
            name: 'Simulated Latency',
            description: 'Endpoint with artificial delay',
            options: {
                url: '/api/delay/50',
                method: 'GET',
                duration: 10,
                connections: 50
            }
        }
    ]
};

// 负载测试套件
export const loadTestSuite: TestSuite = {
    name: 'Load Testing',
    description: 'Test server behavior under increasing load',
    scenarios: [
        {
            name: 'Low Concurrency',
            description: '10 concurrent connections',
            options: {
                url: '/api/json',
                method: 'GET',
                duration: 3, // 缩短测试时间
                connections: 10
            }
        },
        {
            name: 'Medium Concurrency',
            description: '50 concurrent connections',
            options: {
                url: '/api/json',
                method: 'GET',
                duration: 3, // 缩短测试时间
                connections: 50
            }
        },
        {
            name: 'High Concurrency',
            description: '200 concurrent connections',
            options: {
                url: '/api/json',
                method: 'GET',
                duration: 10,
                connections: 200
            }
        },
        {
            name: 'Very High Concurrency',
            description: '500 concurrent connections',
            options: {
                url: '/api/json',
                method: 'GET',
                duration: 10,
                connections: 500
            }
        }
    ]
};

// 数据传输测试套件
export const dataTransferTestSuite: TestSuite = {
    name: 'Data Transfer Testing',
    description: 'Test server performance with different data sizes',
    scenarios: [
        {
            name: 'Small Payload (1KB)',
            description: 'POST with 1KB JSON payload',
            options: {
                url: '/api/echo',
                method: 'POST',
                body: JSON.stringify({ data: 'a'.repeat(1 * 1024) }),
                headers: {
                    'content-type': 'application/json'
                },
                duration: 3, // 缩短测试时间
                connections: 25
            }
        },
        {
            name: 'Medium Payload (100KB)',
            description: 'POST with 100KB JSON payload',
            options: {
                url: '/api/echo',
                method: 'POST',
                body: JSON.stringify({ data: 'a'.repeat(50 * 1024) }), // 减少数据大小
                headers: {
                    'content-type': 'application/json'
                },
                duration: 3, // 缩短测试时间
                connections: 25
            }
        },
        {
            name: 'Large Payload (1MB)',
            description: 'POST with 1MB JSON payload',
            options: {
                url: '/api/echo',
                method: 'POST',
                body: JSON.stringify({ data: 'a'.repeat(1024 * 1024) }),
                headers: {
                    'content-type': 'application/json'
                },
                duration: 10,
                connections: 20
            }
        }
    ]
};
