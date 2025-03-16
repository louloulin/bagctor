/**
 * thread_affinity_demo.js
 * 
 * 线程亲和性功能演示
 * 演示如何在Node.js应用中使用线程亲和性提升性能
 */

const { Worker } = require('worker_threads');
const path = require('path');
const {
    ThreadAffinityManager,
    bindToCore,
    getAvailableCores,
    rebalanceThreads
} = require('../dist/core/performance/thread_affinity');
const {
    isNativeBindingSupported,
    getCpuUsage,
    getSystemTopology
} = require('../dist/core/performance/thread_binding');

// 获取CPU核心数
const cpuCount = getAvailableCores();
console.log(`系统CPU核心数: ${cpuCount}`);

// 检查是否支持原生绑定
const nativeSupported = isNativeBindingSupported();
console.log(`原生线程绑定支持: ${nativeSupported ? '可用' : '不可用'}`);

// 获取系统拓扑信息
const topology = getSystemTopology();
console.log(`NUMA节点数: ${topology.numaNodes}`);
console.log(`每个节点的核心数: ${JSON.stringify(topology.coresPerNode)}`);

// 创建ThreadAffinityManager
const manager = ThreadAffinityManager.getInstance({
    enabled: true,
    priorityStrategy: 'dynamic',
    numaAware: true,
    logging: true
});

// 绑定主线程到核心0
console.log('尝试将主线程绑定到核心0...');
const mainThreadBound = bindToCore(0, 75);
console.log(`主线程绑定结果: ${mainThreadBound ? '成功' : '失败'}`);

// 显示每个CPU核心的使用率
function showCpuUsage() {
    let usageInfo = '';
    for (let i = 0; i < cpuCount; i++) {
        const usage = getCpuUsage(i);
        usageInfo += `核心${i}: ${usage.toFixed(1)}% | `;
    }
    console.log(usageInfo);
}

// 定期显示CPU使用率
const usageInterval = setInterval(showCpuUsage, 2000);

// 创建绑定到不同核心的工作线程
const workers = [];

// 创建临时的Worker脚本
const workerScriptPath = path.join(__dirname, 'temp_worker.js');
const fs = require('fs');

const workerScript = `
const { parentPort, workerData } = require('worker_threads');
const { registerWorkerAffinity } = require('../dist/core/performance/thread_affinity');

// 自动注册Worker亲和性
registerWorkerAffinity();

// 向主线程报告
parentPort.postMessage({
    type: 'ready',
    id: workerData.id,
    affinityCore: workerData._affinityCore
});

// 执行CPU密集型任务模拟工作负载
function doWork(complexity) {
    let result = 0;
    for (let i = 0; i < complexity * 1000000; i++) {
        result += Math.sin(i) * Math.cos(i);
    }
    return result;
}

// 处理消息
parentPort.on('message', (message) => {
    if (message.type === 'work') {
        const startTime = Date.now();
        const result = doWork(message.complexity || 1);
        const endTime = Date.now();
        
        parentPort.postMessage({
            type: 'result',
            id: workerData.id,
            processingTime: endTime - startTime,
            result: result
        });
    } else if (message.type === 'exit') {
        process.exit(0);
    }
});
`;

// 写入临时Worker脚本
fs.writeFileSync(workerScriptPath, workerScript);

// 创建工作线程
function createWorkers() {
    // 根据CPU核心数创建工作线程（主线程已使用核心0）
    for (let i = 1; i < Math.min(cpuCount, 5); i++) {
        console.log(`创建绑定到核心${i}的工作线程`);
        const worker = manager.createAffinityWorker(workerScriptPath, i, { id: i });

        worker.on('message', (message) => {
            if (message.type === 'ready') {
                console.log(`工作线程 ${message.id} 已准备就绪，绑定到核心 ${message.affinityCore}`);

                // 发送工作
                worker.postMessage({
                    type: 'work',
                    complexity: 1 + Math.random() * 2 // 随机工作复杂度
                });
            } else if (message.type === 'result') {
                console.log(`工作线程 ${message.id} 完成工作，耗时: ${message.processingTime}ms`);

                // 更新线程负载信息
                const threads = manager.getAllThreads();
                const threadInfo = threads.find(t => t.cpuCore === i);
                if (threadInfo) {
                    // 根据处理时间更新负载指标 (简单示例)
                    const load = Math.min(message.processingTime / 100, 100);
                    manager.updateThreadLoad(threadInfo.id, load);
                }

                // 延迟后发送更多工作
                setTimeout(() => {
                    worker.postMessage({
                        type: 'work',
                        complexity: 1 + Math.random() * 2
                    });
                }, 500);
            }
        });

        worker.on('error', (err) => {
            console.error(`工作线程 ${i} 出错:`, err);
        });

        workers.push(worker);
    }
}

// 创建工作线程
createWorkers();

// 每5秒尝试重新平衡线程
const rebalanceInterval = setInterval(() => {
    console.log('\n尝试重新平衡线程...');
    const rebalanced = rebalanceThreads();
    console.log(`重新平衡结果: ${rebalanced} 个线程被重新分配`);
}, 5000);

// 10秒后关闭所有工作线程
setTimeout(() => {
    console.log('\n清理资源...');
    clearInterval(usageInterval);
    clearInterval(rebalanceInterval);

    // 关闭所有工作线程
    workers.forEach(worker => {
        worker.postMessage({ type: 'exit' });
    });

    // 删除临时Worker脚本
    setTimeout(() => {
        try {
            fs.unlinkSync(workerScriptPath);
            console.log('临时Worker脚本已删除');
        } catch (e) {
            // 忽略删除错误
        }
        console.log('演示完成');
    }, 1000);
}, 20000);

// 捕获进程退出事件以清理资源
process.on('SIGINT', () => {
    console.log('\n收到中断信号，清理资源...');
    clearInterval(usageInterval);
    clearInterval(rebalanceInterval);

    // 关闭所有工作线程
    workers.forEach(worker => {
        worker.postMessage({ type: 'exit' });
    });

    // 删除临时Worker脚本
    setTimeout(() => {
        try {
            fs.unlinkSync(workerScriptPath);
        } catch (e) {
            // 忽略删除错误
        }
        process.exit(0);
    }, 1000);
}); 