/**
 * thread_affinity_reactor.js
 * 
 * 线程亲和性与反应器模式集成示例
 * 
 * 本示例演示如何将线程亲和性功能与多反应器模式集成，
 * 实现高性能的HTTP请求处理
 */

const os = require('os');
const { Worker } = require('worker_threads');
const {
    ThreadAffinityManager,
    createAffinityWorker
} = require('../src/core/performance/thread_affinity');
const {
    getSystemTopology,
    isNativeBindingSupported
} = require('../src/core/performance/thread_binding');

// 显示环境信息
console.log(`CPU核心数: ${os.cpus().length}`);
console.log(`原生线程绑定支持: ${isNativeBindingSupported() ? '可用' : '不可用'}`);

// 获取系统拓扑信息
const topology = getSystemTopology();
console.log(`NUMA节点数: ${topology.numaNodes}`);
console.log(`每个节点的核心分布: ${JSON.stringify(topology.coresPerNode)}`);

// 创建线程亲和性管理器
const affinityManager = ThreadAffinityManager.getInstance({
    enabled: true,
    priorityStrategy: 'dynamic',
    numaAware: true,
    logging: true
});

// 反应器Worker数量
const REACTOR_COUNT = Math.min(os.cpus().length, 8);
console.log(`创建 ${REACTOR_COUNT} 个反应器Worker`);

// 存储Worker引用
const reactorWorkers = [];

// 性能统计
const performanceStats = {
    totalRequests: 0,
    requestsPerReactor: Array(REACTOR_COUNT).fill(0),
    cpuUsagePerReactor: Array(REACTOR_COUNT).fill(0)
};

// 创建多个反应器Worker
for (let i = 0; i < REACTOR_COUNT; i++) {
    // 为每个反应器分配一个专用CPU核心
    // 注意：在真实环境中，应该考虑NUMA拓扑和系统负载
    const reactorWorker = createAffinityWorker('./reactor_worker.js', i, {
        reactorId: i,
        // 传递额外配置
        config: {
            port: 3000 + i,
            maxConnections: 1000,
            keepAliveTimeout: 5000
        }
    });

    // 处理来自Worker的消息
    reactorWorker.on('message', (message) => {
        if (message.type === 'stats') {
            // 更新性能统计
            performanceStats.requestsPerReactor[i] = message.requestsHandled;
            performanceStats.totalRequests += message.newRequests || 0;
            performanceStats.cpuUsagePerReactor[i] = message.cpuUsage || 0;

            // 更新线程负载信息
            const threads = affinityManager.getAllThreads();
            const workerThread = threads.find(t => t.cpuCore === i);
            if (workerThread) {
                affinityManager.updateThreadLoad(workerThread.id, message.cpuUsage || 0);
            }

            // 打印Worker状态
            console.log(`Reactor ${i} (核心 ${i}): 已处理 ${message.requestsHandled} 请求, CPU使用率: ${message.cpuUsage.toFixed(1)}%`);
        } else if (message.type === 'ready') {
            console.log(`Reactor ${i} 已就绪，监听端口 ${3000 + i}`);
        } else if (message.type === 'error') {
            console.error(`Reactor ${i} 错误:`, message.error);
        }
    });

    // 存储Worker引用
    reactorWorkers.push(reactorWorker);
}

// 启动性能监控
setInterval(() => {
    console.log('\n--- 性能统计 ---');
    console.log(`总处理请求数: ${performanceStats.totalRequests}`);

    let totalCpuUsage = 0;
    performanceStats.cpuUsagePerReactor.forEach((usage, i) => {
        totalCpuUsage += usage;
        console.log(`Reactor ${i}: ${performanceStats.requestsPerReactor[i]} 请求, CPU: ${usage.toFixed(1)}%`);
    });

    console.log(`平均CPU使用率: ${(totalCpuUsage / REACTOR_COUNT).toFixed(1)}%`);

    // 获取线程信息
    const threads = affinityManager.getAllThreads();
    console.log(`管理的线程数: ${threads.length}`);

    // 每30秒尝试重新平衡
    if (Math.random() < 0.3) {
        const rebalanced = affinityManager.rebalanceThreads();
        if (rebalanced > 0) {
            console.log(`已重新平衡 ${rebalanced} 个线程的分配`);
        }
    }
}, 10000);

// 优雅退出
process.on('SIGINT', () => {
    console.log('正在关闭反应器...');

    // 向所有Worker发送终止信号
    for (const worker of reactorWorkers) {
        worker.postMessage({ type: 'shutdown' });
    }

    // 等待所有Worker终止
    setTimeout(() => {
        console.log('所有反应器已关闭');
        process.exit(0);
    }, 1000);
});

console.log('主服务器已启动，按 Ctrl+C 退出'); 