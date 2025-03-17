/**
 * numa_reactor_demo.js
 * 
 * NUMA感知的Reactor线程亲和性示例
 * 演示如何利用NUMA感知特性优化Reactor模式下的性能
 */

const { Worker, isMainThread, parentPort, workerData } = require('worker_threads');
const { cpus } = require('os');
const path = require('path');

// 导入相关模块
let threadAffinity;
let threadBinding;
let reactorModule;

try {
    // 尝试从编译后的目录导入
    threadAffinity = require('../dist/core/performance/thread_affinity');
    threadBinding = require('../dist/core/performance/thread_binding');
    reactorModule = require('../dist/core/reactor/reactor');
} catch (error) {
    // 如果失败，尝试从源码目录导入
    threadAffinity = require('../src/core/performance/thread_affinity');
    threadBinding = require('../src/core/performance/thread_binding');
    reactorModule = require('../src/core/reactor/reactor');
}

const { Reactor } = reactorModule;
const {
    ThreadAffinityManager,
    ThreadAffinityOptions
} = threadAffinity;

const {
    isNativeBindingSupported,
    getSystemTopology,
    getCpuUsage
} = threadBinding;

// 检查环境
const nativeBindingSupported = isNativeBindingSupported();
const systemTopology = getSystemTopology();
const numCpus = cpus().length;
const hasMultipleNumaNodes = systemTopology.numaNodes > 1;

console.log('===== NUMA感知Reactor示例 =====');
console.log(`原生绑定支持: ${nativeBindingSupported ? '是' : '否'}`);
console.log(`系统CPU核心数: ${numCpus}`);
console.log(`NUMA节点数: ${systemTopology.numaNodes}`);
console.log(`每个节点的核心数: ${JSON.stringify(systemTopology.coresPerNode)}`);
console.log('================================\n');

/**
 * 创建模拟工作负载
 * @param {number} iterations - 迭代次数
 * @returns {number} - 计算结果
 */
function createCpuWork(iterations) {
    let result = 0;
    for (let i = 0; i < iterations; i++) {
        result += Math.sin(i * 0.01) * Math.cos(i * 0.01);
    }
    return result;
}

/**
 * 创建内存工作负载
 * @param {number} dataSize - 数据大小
 * @returns {number} - 处理结果
 */
function createMemoryWork(dataSize) {
    const data = new Array(dataSize);

    // 初始化数组
    for (let i = 0; i < dataSize; i++) {
        data[i] = i * 2;
    }

    // 处理数据
    let sum = 0;
    for (let i = 0; i < dataSize; i++) {
        data[i] = (data[i] * 3) % 997; // 一些随机操作
        sum += data[i];
    }

    return sum;
}

/**
 * 运行带有不同NUMA配置的性能测试
 */
async function runNumaReactorTest() {
    // 创建两种Reactor配置进行比较
    const reactors = [];

    // 1. 创建使用NUMA感知的Reactor
    if (hasMultipleNumaNodes) {
        console.log('创建NUMA感知的Reactor...');

        for (let numaNode = 0; numaNode < systemTopology.numaNodes; numaNode++) {
            // 为每个NUMA节点分配一个独立的Reactor
            // 计算NUMA节点的第一个CPU核心
            let startCoreId = 0;
            for (let i = 0; i < numaNode; i++) {
                startCoreId += systemTopology.coresPerNode[i];
            }

            const numaAwareReactor = new Reactor({
                id: `numa-${numaNode}`,
                affinityOptions: {
                    enabled: true,
                    numaNode: numaNode,
                    targetCore: startCoreId,
                    priority: 75
                }
            });

            reactors.push({
                type: 'numa-aware',
                numaNode,
                reactor: numaAwareReactor
            });
        }
    } else {
        console.log('系统不支持多NUMA节点，仅创建普通亲和性Reactor');

        // 如果系统不支持多NUMA节点，创建常规的亲和性Reactor
        for (let i = 0; i < Math.min(4, numCpus); i++) {
            const affinityReactor = new Reactor({
                id: `affinity-${i}`,
                affinityOptions: {
                    enabled: true,
                    targetCore: i,
                    priority: 75
                }
            });

            reactors.push({
                type: 'affinity',
                coreId: i,
                reactor: affinityReactor
            });
        }
    }

    // 2. 创建不使用亲和性的对照组Reactor
    const nonAffinityReactor = new Reactor({
        id: 'non-affinity',
        affinityOptions: {
            enabled: false
        }
    });

    reactors.push({
        type: 'non-affinity',
        reactor: nonAffinityReactor
    });

    try {
        // 启动所有Reactor
        console.log('启动所有Reactor...');
        await Promise.all(reactors.map(r => r.reactor.start()));

        // 注册工作处理函数
        const workResults = {};

        for (const r of reactors) {
            workResults[r.reactor.id] = [];

            // 注册CPU密集型工作
            r.reactor.registerWorkHandler('cpu-work', async (work) => {
                const startTime = process.hrtime.bigint();
                const result = createCpuWork(work.iterations);
                const endTime = process.hrtime.bigint();
                const duration = Number(endTime - startTime) / 1000000; // 转换为毫秒

                return {
                    type: 'cpu',
                    duration,
                    result,
                    reactorId: r.reactor.id
                };
            });

            // 注册内存密集型工作
            r.reactor.registerWorkHandler('memory-work', async (work) => {
                const startTime = process.hrtime.bigint();
                const result = createMemoryWork(work.dataSize);
                const endTime = process.hrtime.bigint();
                const duration = Number(endTime - startTime) / 1000000; // 转换为毫秒

                return {
                    type: 'memory',
                    duration,
                    result,
                    reactorId: r.reactor.id
                };
            });
        }

        // 执行多次测试以获得稳定结果
        const iterations = 5;

        console.log(`\n执行 ${iterations} 轮测试...\n`);

        for (let i = 0; i < iterations; i++) {
            console.log(`轮次 ${i + 1}/${iterations}`);

            // 1. CPU密集型工作测试
            const cpuPromises = reactors.map(r =>
                r.reactor.submitWork('cpu-work', { iterations: 10000000 })
            );

            const cpuResults = await Promise.all(cpuPromises);
            for (const result of cpuResults) {
                workResults[result.reactorId].push({
                    type: 'cpu',
                    duration: result.duration
                });
            }

            // 2. 内存密集型工作测试
            const memoryPromises = reactors.map(r =>
                r.reactor.submitWork('memory-work', { dataSize: 5000000 })
            );

            const memoryResults = await Promise.all(memoryPromises);
            for (const result of memoryResults) {
                workResults[result.reactorId].push({
                    type: 'memory',
                    duration: result.duration
                });
            }

            // 短暂暂停以允许系统恢复
            await new Promise(resolve => setTimeout(resolve, 500));
        }

        // 计算和显示性能结果
        console.log('\n===== 性能测试结果 =====');

        for (const r of reactors) {
            const results = workResults[r.reactor.id];

            // 计算平均值
            const cpuResults = results.filter(res => res.type === 'cpu');
            const memoryResults = results.filter(res => res.type === 'memory');

            const cpuAvg = cpuResults.reduce((sum, res) => sum + res.duration, 0) / cpuResults.length;
            const memoryAvg = memoryResults.reduce((sum, res) => sum + res.duration, 0) / memoryResults.length;

            console.log(`\nReactor: ${r.reactor.id} (类型: ${r.type})`);
            if (r.numaNode !== undefined) {
                console.log(`NUMA节点: ${r.numaNode}`);
            } else if (r.coreId !== undefined) {
                console.log(`CPU核心: ${r.coreId}`);
            }
            console.log(`CPU密集型工作平均执行时间: ${cpuAvg.toFixed(2)} ms`);
            console.log(`内存密集型工作平均执行时间: ${memoryAvg.toFixed(2)} ms`);

            // 获取Reactor性能统计
            const stats = r.reactor.getStats();
            console.log(`总工作处理数: ${stats.totalWorkProcessed}`);
            if (stats.cpuAffinity) {
                console.log(`CPU使用率: ${stats.cpuAffinity.usage ? stats.cpuAffinity.usage.toFixed(2) : 'N/A'}%`);
                console.log(`绑定状态: ${stats.cpuAffinity.bound ? '已绑定' : '未绑定'}`);
                if (stats.cpuAffinity.bound) {
                    console.log(`绑定到核心: ${stats.cpuAffinity.core}`);
                }
            }
        }

        // 如果有多NUMA节点，比较NUMA感知vs非亲和性
        if (hasMultipleNumaNodes) {
            const numaReactors = reactors.filter(r => r.type === 'numa-aware');
            const nonAffinityReactorResults = workResults[nonAffinityReactor.id];

            const nonAffinityCpuAvg = nonAffinityReactorResults
                .filter(res => res.type === 'cpu')
                .reduce((sum, res) => sum + res.duration, 0) / iterations;

            const nonAffinityMemoryAvg = nonAffinityReactorResults
                .filter(res => res.type === 'memory')
                .reduce((sum, res) => sum + res.duration, 0) / iterations;

            let numaCpuAvg = 0;
            let numaMemoryAvg = 0;

            for (const r of numaReactors) {
                const results = workResults[r.reactor.id];
                numaCpuAvg += results
                    .filter(res => res.type === 'cpu')
                    .reduce((sum, res) => sum + res.duration, 0) / iterations;

                numaMemoryAvg += results
                    .filter(res => res.type === 'memory')
                    .reduce((sum, res) => sum + res.duration, 0) / iterations;
            }

            numaCpuAvg /= numaReactors.length;
            numaMemoryAvg /= numaReactors.length;

            console.log('\n===== NUMA感知 vs 非亲和性比较 =====');
            console.log(`CPU工作负载: NUMA感知=${numaCpuAvg.toFixed(2)}ms, 非亲和=${nonAffinityCpuAvg.toFixed(2)}ms`);
            console.log(`内存工作负载: NUMA感知=${numaMemoryAvg.toFixed(2)}ms, 非亲和=${nonAffinityMemoryAvg.toFixed(2)}ms`);

            const cpuImprovement = ((nonAffinityCpuAvg - numaCpuAvg) / nonAffinityCpuAvg) * 100;
            const memoryImprovement = ((nonAffinityMemoryAvg - numaMemoryAvg) / nonAffinityMemoryAvg) * 100;

            console.log(`CPU性能提升: ${cpuImprovement.toFixed(2)}%`);
            console.log(`内存性能提升: ${memoryImprovement.toFixed(2)}%`);
        } else {
            // 比较亲和性 vs 非亲和性
            const affinityReactors = reactors.filter(r => r.type === 'affinity');
            const nonAffinityReactorResults = workResults[nonAffinityReactor.id];

            const nonAffinityCpuAvg = nonAffinityReactorResults
                .filter(res => res.type === 'cpu')
                .reduce((sum, res) => sum + res.duration, 0) / iterations;

            const nonAffinityMemoryAvg = nonAffinityReactorResults
                .filter(res => res.type === 'memory')
                .reduce((sum, res) => sum + res.duration, 0) / iterations;

            let affinityCpuAvg = 0;
            let affinityMemoryAvg = 0;

            for (const r of affinityReactors) {
                const results = workResults[r.reactor.id];
                affinityCpuAvg += results
                    .filter(res => res.type === 'cpu')
                    .reduce((sum, res) => sum + res.duration, 0) / iterations;

                affinityMemoryAvg += results
                    .filter(res => res.type === 'memory')
                    .reduce((sum, res) => sum + res.duration, 0) / iterations;
            }

            affinityCpuAvg /= affinityReactors.length;
            affinityMemoryAvg /= affinityReactors.length;

            console.log('\n===== 亲和性 vs 非亲和性比较 =====');
            console.log(`CPU工作负载: 亲和性=${affinityCpuAvg.toFixed(2)}ms, 非亲和=${nonAffinityCpuAvg.toFixed(2)}ms`);
            console.log(`内存工作负载: 亲和性=${affinityMemoryAvg.toFixed(2)}ms, 非亲和=${nonAffinityMemoryAvg.toFixed(2)}ms`);

            const cpuImprovement = ((nonAffinityCpuAvg - affinityCpuAvg) / nonAffinityCpuAvg) * 100;
            const memoryImprovement = ((nonAffinityMemoryAvg - affinityMemoryAvg) / nonAffinityMemoryAvg) * 100;

            console.log(`CPU性能提升: ${cpuImprovement.toFixed(2)}%`);
            console.log(`内存性能提升: ${memoryImprovement.toFixed(2)}%`);
        }
    } finally {
        // 停止所有Reactor
        console.log('\n停止所有Reactor...');
        await Promise.all(reactors.map(r => r.reactor.stop()));
    }
}

// 执行测试
runNumaReactorTest().catch(err => {
    console.error('测试执行错误:', err);
    process.exit(1);
}); 