/**
 * thread_affinity_numa_demo.js
 * 
 * NUMA感知的线程亲和性示例
 * 演示如何利用NUMA感知特性优化多核系统上的性能
 */

const { Worker, isMainThread, parentPort, workerData } = require('worker_threads');
const { cpus } = require('os');
const path = require('path');

// 导入线程亲和性相关模块
// 注意：真实使用场景中，应使用实际的模块路径
// 这里为了演示，我们假设可以直接从src导入
let threadAffinity;
let threadBinding;

try {
    // 试图从编译后的目录导入
    threadAffinity = require('../dist/core/performance/thread_affinity');
    threadBinding = require('../dist/core/performance/thread_binding');
} catch (error) {
    // 如果失败，尝试从源码目录导入
    threadAffinity = require('../src/core/performance/thread_affinity');
    threadBinding = require('../src/core/performance/thread_binding');
}

const {
    ThreadAffinityManager,
    ThreadAffinityOptions,
    createAffinityWorker
} = threadAffinity;

const {
    isNativeBindingSupported,
    getSystemTopology,
    setNumaAffinity,
    bindThreadToCore,
    getCpuUsage
} = threadBinding;

// 检查环境
const nativeBindingSupported = isNativeBindingSupported();
const systemTopology = getSystemTopology();
const numCpus = cpus().length;
const hasMultipleNumaNodes = systemTopology.numaNodes > 1;

console.log('===== NUMA感知线程亲和性演示 =====');
console.log(`原生绑定支持: ${nativeBindingSupported ? '是' : '否'}`);
console.log(`系统CPU核心数: ${numCpus}`);
console.log(`NUMA节点数: ${systemTopology.numaNodes}`);
console.log(`每个节点的核心数: ${JSON.stringify(systemTopology.coresPerNode)}`);
console.log('==================================\n');

// 主线程代码
if (isMainThread) {
    // 配置线程亲和性管理器 - 启用NUMA感知
    const options = {
        enabled: true,
        priorityStrategy: 'dynamic',
        numaAware: true,
        logging: true
    };

    // 获取线程亲和性管理器实例
    const affinityManager = ThreadAffinityManager.getInstance(options);

    // NUMA感知模式的工作线程数 (每个NUMA节点创建核心数量的一半的工作线程)
    const workersPerNumaNode = [];
    for (let i = 0; i < systemTopology.numaNodes; i++) {
        // 每个NUMA节点使用一半的核心运行工作线程
        workersPerNumaNode.push(Math.max(1, Math.floor(systemTopology.coresPerNode[i] / 2)));
    }

    console.log(`NUMA感知模式: 每个NUMA节点的工作线程数: ${JSON.stringify(workersPerNumaNode)}`);

    // 创建工作线程并按NUMA节点分组
    const workers = [];
    let totalWorkers = 0;

    // 为每个NUMA节点创建工作线程
    let startCoreId = 0;
    for (let numaNode = 0; numaNode < systemTopology.numaNodes; numaNode++) {
        const workerCount = workersPerNumaNode[numaNode];
        console.log(`为NUMA节点 ${numaNode} 创建 ${workerCount} 个工作线程`);

        for (let i = 0; i < workerCount; i++) {
            // 计算此工作线程应绑定的核心ID
            // 对于每个NUMA节点，我们使用该节点的核心
            const coreOffset = i % systemTopology.coresPerNode[numaNode];
            const targetCore = startCoreId + coreOffset;

            // 创建具有亲和性的工作线程
            const worker = createAffinityWorker(
                __filename,
                {
                    workerId: totalWorkers,
                    targetCore,
                    numaNode
                },
                {
                    // 通过这些选项将线程绑定到特定核心和NUMA节点
                    bindToCore: targetCore,
                    priority: 50,
                    numaNode: numaNode
                }
            );

            workers.push(worker);
            totalWorkers++;

            // 设置消息处理程序
            worker.on('message', (message) => {
                console.log(`[主线程] 收到来自工作线程 ${message.workerId} 的消息:`, message);

                // 如果工作线程完成了工作负载
                if (message.type === 'workComplete') {
                    console.log(`[主线程] 工作线程 ${message.workerId} (NUMA节点: ${message.numaNode}, 核心: ${message.cpuCore}) 完成工作负载`);
                    console.log(`[主线程] 处理时间: ${message.duration}ms, CPU使用率: ${message.cpuUsage.toFixed(2)}%`);

                    // 保存工作线程完成信息
                    workerCompletionTimes[worker.threadId] = {
                        numaNode: message.numaNode,
                        duration: message.duration,
                        cpuUsage: message.cpuUsage
                    };
                }

                // 如果所有工作线程都报告完成，显示摘要并退出
                const allComplete = workers.every(w => w.threadId in workerCompletionTimes);
                if (allComplete) {
                    displayPerformanceSummary();
                    setTimeout(() => process.exit(0), 1000);
                }
            });

            // 处理错误和退出
            worker.on('error', (err) => {
                console.error(`[主线程] 工作线程 ${totalWorkers - 1} 错误:`, err);
            });

            worker.on('exit', (code) => {
                console.log(`[主线程] 工作线程 ${totalWorkers - 1} 退出，代码: ${code}`);
            });
        }

        // 更新下一个NUMA节点的起始核心ID
        startCoreId += systemTopology.coresPerNode[numaNode];
    }

    // 跟踪工作线程完成时间
    const workerCompletionTimes = {};

    // 性能摘要函数
    function displayPerformanceSummary() {
        console.log('\n===== 性能摘要 =====');

        // 按NUMA节点分组的性能统计
        const numaStats = {};
        let totalTime = 0;

        workers.forEach(worker => {
            const stats = workerCompletionTimes[worker.threadId];
            if (stats) {
                const numaNode = stats.numaNode;
                if (!numaStats[numaNode]) {
                    numaStats[numaNode] = {
                        count: 0,
                        totalTime: 0,
                        totalCpuUsage: 0
                    };
                }

                numaStats[numaNode].count++;
                numaStats[numaNode].totalTime += stats.duration;
                numaStats[numaNode].totalCpuUsage += stats.cpuUsage;
                totalTime += stats.duration;
            }
        });

        // 显示每个NUMA节点的平均性能
        for (const [node, stats] of Object.entries(numaStats)) {
            const avgTime = stats.totalTime / stats.count;
            const avgCpuUsage = stats.totalCpuUsage / stats.count;
            console.log(`NUMA节点 ${node}: 平均处理时间 ${avgTime.toFixed(2)}ms, 平均CPU使用率 ${avgCpuUsage.toFixed(2)}%`);
        }

        // 计算总体平均值
        const overallAvg = totalTime / workers.length;
        console.log(`整体平均处理时间: ${overallAvg.toFixed(2)}ms`);
        console.log('====================\n');

        console.log('NUMA感知线程亲和性演示完成。');
        console.log('注意: 在真实应用中，NUMA感知可以提供更好的内存访问模式，降低跨NUMA节点访问的延迟。');
    }

    // 延迟一段时间后，让每个工作线程执行一些工作
    setTimeout(() => {
        console.log('[主线程] 向所有工作线程发送工作负载');

        workers.forEach(worker => {
            worker.postMessage({
                type: 'doWork',
                iterations: 10000000, // 调整此值以创建足够的CPU负载
                dataSize: 1000000     // 调整此值以测试内存访问模式
            });
        });
    }, 1000);

} else {
    // 工作线程代码
    const { workerId, targetCore, numaNode } = workerData;

    // 如果这是工作线程，获取线程ID
    const threadId = threadBinding.getNativeThreadId();
    let cpuCore = threadBinding.getCurrentThreadCore();

    // 如果无法通过API获取绑定的核心，使用目标核心
    if (cpuCore === -1) {
        cpuCore = targetCore;
    }

    console.log(`[工作线程 ${workerId}] 启动，线程ID: ${threadId}, 绑定到核心: ${cpuCore}, NUMA节点: ${numaNode}`);

    // 检查线程是否正确绑定
    if (nativeBindingSupported) {
        console.log(`[工作线程 ${workerId}] 绑定状态: ${cpuCore !== -1 ? '已绑定' : '未绑定'}`);
    }

    // 模拟CPU计算和内存访问工作负载
    function simulateWorkload(iterations, dataSize) {
        const startTime = Date.now();

        // 创建一个大型数组模拟内存使用
        const data = new Array(dataSize);

        // 初始化数组
        for (let i = 0; i < dataSize; i++) {
            data[i] = i * 2;
        }

        // 模拟计算密集型工作
        let sum = 0;
        for (let i = 0; i < iterations; i++) {
            // 访问并处理数组中的一些数据，模拟内存访问模式
            const index = i % dataSize;
            data[index] = (data[index] * 7) % 997; // 一些随机计算
            sum += data[index];
        }

        const duration = Date.now() - startTime;
        const cpuUsage = getCpuUsage(cpuCore);

        return {
            sum,
            duration,
            cpuUsage
        };
    }

    // 响应主线程消息
    parentPort.on('message', (message) => {
        if (message.type === 'doWork') {
            console.log(`[工作线程 ${workerId}] 收到工作负载请求: ${message.iterations} 次迭代, 数据大小: ${message.dataSize}`);

            // 执行工作负载
            const result = simulateWorkload(message.iterations, message.dataSize);

            // 向主线程报告结果
            parentPort.postMessage({
                type: 'workComplete',
                workerId,
                threadId,
                cpuCore,
                numaNode,
                duration: result.duration,
                cpuUsage: result.cpuUsage,
                checksum: result.sum % 1000000 // 发送校验和用于验证计算
            });
        }
    });

    // 通知主线程我们已准备好
    parentPort.postMessage({
        type: 'ready',
        workerId,
        threadId,
        cpuCore,
        numaNode
    });
} 