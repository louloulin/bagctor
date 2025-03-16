/**
 * load_test_affinity.js
 * 
 * 线程亲和性负载测试工具
 * 
 * 此工具对比有无线程亲和性的情况下系统性能差异
 * 通过运行并发HTTP请求测试吞吐量和延迟
 */

const http = require('http');
const os = require('os');
const {
    ThreadAffinityManager,
    createAffinityWorker
} = require('../src/core/performance/thread_affinity');
const {
    isNativeBindingSupported,
    bindThreadToCore
} = require('../src/core/performance/thread_binding');

// 测试配置
const CONFIG = {
    // 服务器配置
    server: {
        host: 'localhost',
        port: 3000,
        workers: Math.min(os.cpus().length, 8) // 最多8个worker
    },
    // 负载测试参数
    loadTest: {
        concurrency: 200,           // 并发连接数
        requestsPerConnection: 100, // 每个连接的请求数
        warmupRequests: 1000,       // 预热请求数
        requestTimeoutMs: 5000      // 请求超时时间
    },
    // 测试模式
    modes: [
        { name: '无亲和性', affinity: false },
        { name: '有亲和性', affinity: true }
    ]
};

// 性能结果
const results = {
    requestsCompleted: 0,
    requestsFailed: 0,
    totalLatency: 0,
    minLatency: Number.MAX_VALUE,
    maxLatency: 0,
    latencies: [],
    startTime: 0,
    endTime: 0
};

// 清理结果
function resetResults() {
    results.requestsCompleted = 0;
    results.requestsFailed = 0;
    results.totalLatency = 0;
    results.minLatency = Number.MAX_VALUE;
    results.maxLatency = 0;
    results.latencies = [];
    results.startTime = Date.now();
    results.endTime = 0;
}

// 打印结果
function printResults(mode) {
    results.endTime = Date.now();
    const duration = (results.endTime - results.startTime) / 1000;
    const avgLatency = results.totalLatency / results.requestsCompleted;

    // 计算分位数
    results.latencies.sort((a, b) => a - b);
    const p50 = results.latencies[Math.floor(results.latencies.length * 0.5)];
    const p95 = results.latencies[Math.floor(results.latencies.length * 0.95)];
    const p99 = results.latencies[Math.floor(results.latencies.length * 0.99)];

    console.log('\n========================================');
    console.log(`${mode.name} 模式测试结果`);
    console.log('========================================');
    console.log(`总请求数: ${results.requestsCompleted + results.requestsFailed}`);
    console.log(`成功请求: ${results.requestsCompleted}`);
    console.log(`失败请求: ${results.requestsFailed}`);
    console.log(`总持续时间: ${duration.toFixed(2)}秒`);
    console.log(`吞吐量: ${(results.requestsCompleted / duration).toFixed(2)}请求/秒`);
    console.log(`平均延迟: ${avgLatency.toFixed(2)}毫秒`);
    console.log(`最小延迟: ${results.minLatency.toFixed(2)}毫秒`);
    console.log(`最大延迟: ${results.maxLatency.toFixed(2)}毫秒`);
    console.log(`P50延迟: ${p50.toFixed(2)}毫秒`);
    console.log(`P95延迟: ${p95.toFixed(2)}毫秒`);
    console.log(`P99延迟: ${p99.toFixed(2)}毫秒`);
    console.log('========================================\n');

    return {
        mode: mode.name,
        requestsPerSecond: results.requestsCompleted / duration,
        avgLatency,
        p95,
        p99
    };
}

// 发送单个请求
function sendRequest(endpoint = '/') {
    return new Promise((resolve, reject) => {
        const startTime = Date.now();

        const req = http.request({
            hostname: CONFIG.server.host,
            port: CONFIG.server.port,
            path: endpoint,
            method: 'GET',
            timeout: CONFIG.loadTest.requestTimeoutMs
        }, (res) => {
            let data = '';
            res.on('data', (chunk) => {
                data += chunk;
            });

            res.on('end', () => {
                const endTime = Date.now();
                const latency = endTime - startTime;

                // 更新统计
                results.requestsCompleted++;
                results.totalLatency += latency;
                results.minLatency = Math.min(results.minLatency, latency);
                results.maxLatency = Math.max(results.maxLatency, latency);
                results.latencies.push(latency);

                resolve({ status: res.statusCode, latency, data });
            });
        });

        req.on('error', (err) => {
            results.requestsFailed++;
            reject(err);
        });

        req.on('timeout', () => {
            results.requestsFailed++;
            req.destroy();
            reject(new Error('请求超时'));
        });

        req.end();
    });
}

// 启动负载测试
async function runLoadTest(warmup = false) {
    const connections = [];
    const totalRequests = warmup
        ? CONFIG.loadTest.warmupRequests
        : CONFIG.loadTest.concurrency * CONFIG.loadTest.requestsPerConnection;

    console.log(`开始${warmup ? '预热' : '负载测试'}, 总请求数: ${totalRequests}`);

    // 创建并发连接
    for (let i = 0; i < CONFIG.loadTest.concurrency; i++) {
        const connection = async () => {
            const requestsPerConn = warmup
                ? Math.ceil(CONFIG.loadTest.warmupRequests / CONFIG.loadTest.concurrency)
                : CONFIG.loadTest.requestsPerConnection;

            for (let j = 0; j < requestsPerConn; j++) {
                try {
                    // 随机选择请求类型以模拟不同负载
                    const endpoints = ['/', '/medium', '/heavy'];
                    const endpoint = endpoints[Math.floor(Math.random() * endpoints.length)];

                    await sendRequest(endpoint);

                    // 添加少量随机延迟，避免完全同步的请求
                    if (Math.random() < 0.2) {
                        await new Promise(r => setTimeout(r, Math.random() * 10));
                    }
                } catch (error) {
                    // 失败计数已在sendRequest函数中增加
                    if (!warmup) console.error('请求错误:', error.message);
                }
            }
        };

        connections.push(connection());
    }

    // 等待所有连接完成
    await Promise.all(connections);
}

// 启动测试服务器
async function startServer(mode) {
    return new Promise((resolve, reject) => {
        console.log(`启动服务器 (${mode.name})...`);

        // 启动主进程
        const { fork } = require('child_process');

        const args = [
            '--affinity=' + (mode.affinity ? 'true' : 'false')
        ];

        const serverProcess = fork('./examples/test_server.js', args, {
            stdio: 'inherit'
        });

        // 等待服务器启动
        setTimeout(() => {
            resolve(serverProcess);
        }, 2000);

        serverProcess.on('error', (err) => {
            reject(err);
        });
    });
}

// 关闭服务器
function stopServer(serverProcess) {
    return new Promise((resolve) => {
        console.log('关闭服务器...');
        serverProcess.kill();

        // 等待服务器关闭
        setTimeout(resolve, 1000);
    });
}

// 主测试函数
async function runTest() {
    console.log('==============================================');
    console.log('线程亲和性性能对比测试');
    console.log('==============================================');
    console.log(`CPU核心数: ${os.cpus().length}`);
    console.log(`原生线程绑定支持: ${isNativeBindingSupported() ? '可用' : '不可用'}`);
    console.log(`工作线程数: ${CONFIG.server.workers}`);
    console.log(`并发连接数: ${CONFIG.loadTest.concurrency}`);
    console.log(`每连接请求数: ${CONFIG.loadTest.requestsPerConnection}`);
    console.log('==============================================\n');

    const finalResults = [];

    // 运行每种模式的测试
    for (const mode of CONFIG.modes) {
        // 启动服务器
        const serverProcess = await startServer(mode);

        // 预热
        resetResults();
        await runLoadTest(true);
        console.log(`预热完成，已处理 ${results.requestsCompleted} 请求`);

        // 重置结果并运行实际测试
        resetResults();
        await runLoadTest();

        // 打印并保存结果
        const result = printResults(mode);
        finalResults.push(result);

        // 关闭服务器
        await stopServer(serverProcess);
    }

    // 比较结果
    if (finalResults.length >= 2) {
        const withoutAffinity = finalResults[0];
        const withAffinity = finalResults[1];

        const throughputImprovement = (withAffinity.requestsPerSecond / withoutAffinity.requestsPerSecond - 1) * 100;
        const latencyImprovement = (1 - withAffinity.avgLatency / withoutAffinity.avgLatency) * 100;
        const p99Improvement = (1 - withAffinity.p99 / withoutAffinity.p99) * 100;

        console.log('\n==============================================');
        console.log('性能提升对比');
        console.log('==============================================');
        console.log(`吞吐量提升: ${throughputImprovement.toFixed(2)}%`);
        console.log(`平均延迟降低: ${latencyImprovement.toFixed(2)}%`);
        console.log(`P99延迟降低: ${p99Improvement.toFixed(2)}%`);
        console.log('==============================================');
    }
}

// 运行测试
runTest().catch(console.error); 