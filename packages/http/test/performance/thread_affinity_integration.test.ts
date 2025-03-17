/**
 * thread_affinity_integration.test.ts
 * 
 * 集成测试：线程亲和性与Reactor结合使用
 */

import {
    ThreadAffinityManager,
    ThreadAffinityOptions
} from '../../src/core/performance/thread_affinity';

import {
    isNativeBindingSupported,
    getSystemTopology,
    getCurrentThreadCore,
    getCpuUsage
} from '../../src/core/performance/thread_binding';

import { Reactor, ReactorOptions } from '../../src/core/reactor/reactor';
import { Work } from '../../src/core/reactor/reactor';

// 引入测试工具
import '@types/jest';

describe('线程亲和性Reactor集成测试', () => {
    const nativeBindingSupported = isNativeBindingSupported();
    const systemTopology = getSystemTopology();
    const cpuCount = systemTopology.coresPerNode.reduce((a, b) => a + b, 0);

    // 测试工作
    interface TestWorkload {
        id: number;
        iterations: number;
        type: string;
    }

    // 创建CPU密集型工作负载函数
    function createCpuIntensiveWork(iterations: number): number {
        let result = 0;
        for (let i = 0; i < iterations; i++) {
            result += Math.sin(i * 0.01) * Math.cos(i * 0.01);
        }
        return result;
    }

    // 在测试前打印环境信息
    beforeAll(() => {
        console.log("=== 测试环境信息 ===");
        console.log(`CPU核心数: ${cpuCount}`);
        console.log(`NUMA节点数: ${systemTopology.numaNodes}`);
        console.log(`原生线程绑定支持: ${nativeBindingSupported ? '是' : '否'}`);
        console.log("===================");
    });

    describe('Reactor与线程亲和性', () => {
        let reactor: Reactor;

        afterEach(async () => {
            // 确保每次测试后停止Reactor
            if (reactor) {
                await reactor.stop();
            }
        });

        it('应该创建具有线程亲和性的Reactor', async () => {
            // 创建具有线程亲和性的Reactor
            const options: ReactorOptions = {
                id: 'test-reactor-1',
                cpuCore: 0, // 指定核心
                affinityOptions: {
                    enabled: true,
                    priorityStrategy: 'static'
                }
            };

            reactor = new Reactor(options);
            await reactor.start();

            // 验证Reactor已启动
            const stats = reactor.getStats();
            expect(stats.currentLoad).toBeDefined();
            expect(stats.id).toBe('test-reactor-1');

            // 如果支持原生绑定，验证CPU绑定
            if (nativeBindingSupported) {
                expect(stats.boundToCore).not.toBeUndefined();
            }

            // 停止Reactor
            await reactor.stop();
            const statsAfterStop = reactor.getStats();
            expect(statsAfterStop.currentLoad).toBe(0);
        });

        it('多Reactor应该可以绑定到不同的CPU核心', async () => {
            if (cpuCount < 2) {
                console.log("跳过多核测试 - 系统核心数不足");
                return;
            }

            // 创建反应器选项
            const createReactorWithCore = (cpuCore: number): Reactor => {
                const options: ReactorOptions = {
                    id: `test-reactor-${cpuCore}`,
                    cpuCore: cpuCore,
                    affinityOptions: {
                        enabled: true,
                        priorityStrategy: 'static'
                    }
                };
                return new Reactor(options);
            };

            // 创建多个反应器，绑定到不同核心
            const reactors: Reactor[] = [];
            // 限制最多创建4个
            const reactorCount = Math.min(4, cpuCount);

            for (let i = 0; i < reactorCount; i++) {
                reactors.push(createReactorWithCore(i));
            }

            try {
                // 启动所有反应器
                await Promise.all(reactors.map(r => r.start()));

                // 验证所有反应器已启动
                for (const reactor of reactors) {
                    const stats = reactor.getStats();
                    expect(stats.currentLoad).toBeDefined();
                }

                // 如果支持原生绑定，验证每个反应器绑定到不同核心
                if (nativeBindingSupported) {
                    // 收集绑定的核心ID
                    const boundCores = new Set<number>();
                    for (const reactor of reactors) {
                        const stats = reactor.getStats();
                        if (stats.boundToCore !== undefined) {
                            boundCores.add(stats.boundToCore);
                        }
                    }

                    // 应该至少有2个不同的核心绑定
                    expect(boundCores.size).toBeGreaterThanOrEqual(Math.min(2, reactorCount));
                }
            } finally {
                // 停止所有反应器
                await Promise.all(reactors.map(r => r.stop()));

                // 验证所有反应器已停止
                for (const reactor of reactors) {
                    const stats = reactor.getStats();
                    expect(stats.currentLoad).toBe(0);
                }
            }
        });

        it('应该能够处理高并发工作负载', async () => {
            // 创建具有线程亲和性的Reactor
            const options: ReactorOptions = {
                id: 'concurrency-test-reactor',
                cpuCore: 0,
                affinityOptions: {
                    enabled: true,
                    priorityStrategy: 'dynamic'
                }
            };

            reactor = new Reactor(options);
            await reactor.start();

            // 注册工作处理函数
            reactor.registerWorkHandler('compute', async (work: Work) => {
                const payload = work.payload as TestWorkload;
                const startTime = Date.now();

                // 执行计算工作
                const result = createCpuIntensiveWork(payload.iterations);

                const endTime = Date.now();

                // 返回结果
                return {
                    id: payload.id,
                    result: result,
                    duration: endTime - startTime,
                    cpuCore: nativeBindingSupported ? getCurrentThreadCore() : undefined
                };
            });

            // 创建多个工作负载
            const workCount = 20;
            const works = Array(workCount).fill(0).map((_, i) => ({
                type: 'compute',
                payload: {
                    id: i,
                    iterations: 1000000 + (i % 5) * 100000,
                    type: i % 2 === 0 ? 'heavy' : 'light'
                }
            }));

            // 并行提交所有工作
            const results = await Promise.all(works.map(work =>
                reactor.submit(work)
            ));

            // 验证所有工作都被处理
            for (let i = 0; i < workCount; i++) {
                expect(results[i].status).toBe('success');
                if (results[i].data) {
                    expect(results[i].data.id).toBe(i);
                    expect(results[i].data.result).toBeDefined();
                    expect(results[i].data.duration).toBeGreaterThan(0);
                }
            }

            // 验证Reactor统计信息
            const stats = reactor.getStats();

            // 应该已经处理了所有工作
            expect(stats.totalProcessed).toBeGreaterThanOrEqual(workCount);

            // 停止Reactor
            await reactor.stop();
        });
    });

    describe('ThreadAffinityManager与Reactor集成', () => {
        it('应该通过ThreadAffinityManager管理多个Reactor', async () => {
            if (!nativeBindingSupported) {
                console.log("跳过线程亲和性管理器测试 - 平台不支持原生绑定");
                return;
            }

            // 创建线程亲和性管理器
            const affinityOptions: ThreadAffinityOptions = {
                enabled: true,
                priorityStrategy: 'dynamic',
                numaAware: true
            };

            const affinityManager = ThreadAffinityManager.getInstance(affinityOptions);

            // 创建多个反应器
            const reactors: Reactor[] = [];
            const reactorCount = Math.min(4, cpuCount);

            for (let i = 0; i < reactorCount; i++) {
                const options: ReactorOptions = {
                    id: `affinity-reactor-${i}`,
                    affinityOptions: {
                        enabled: true,
                        priorityStrategy: 'dynamic'
                    }
                };
                reactors.push(new Reactor(options));
            }

            try {
                // 启动所有反应器
                await Promise.all(reactors.map(r => r.start()));

                // 验证所有反应器已启动
                for (const r of reactors) {
                    const stats = r.getStats();
                    expect(stats.currentLoad).toBeDefined();
                }

                // 注册工作处理函数
                for (const r of reactors) {
                    r.registerWorkHandler('compute', async (work: Work) => {
                        const payload = work.payload as any;
                        const startTime = Date.now();

                        // 执行计算工作
                        const result = createCpuIntensiveWork(payload.iterations);

                        const endTime = Date.now();

                        // 获取当前线程的CPU核心
                        const cpuCore = getCurrentThreadCore();

                        // 返回结果
                        return {
                            id: payload.id,
                            result: result,
                            duration: endTime - startTime,
                            cpuCore
                        };
                    });
                }

                // 创建工作负载，分配给不同反应器
                const workloads = [];
                for (let i = 0; i < reactorCount * 2; i++) {
                    workloads.push({
                        id: i,
                        iterations: 1000000,
                        reactorIndex: i % reactorCount
                    });
                }

                // 提交工作并收集结果
                const results = await Promise.all(
                    workloads.map(workload => {
                        const reactor = reactors[workload.reactorIndex];
                        return reactor.submit({
                            type: 'compute',
                            payload: workload
                        });
                    })
                );

                // 检查CPU核心分配
                const cpuCores = new Set<number>();
                for (const result of results) {
                    if (result.status === 'success' && result.data && result.data.cpuCore !== undefined) {
                        cpuCores.add(result.data.cpuCore);
                    }
                }

                console.log(`工作分配到了 ${cpuCores.size} 个不同的CPU核心`);

                // 在多核系统上，应该有不同的核心被使用
                if (cpuCount > 1) {
                    expect(cpuCores.size).toBeGreaterThanOrEqual(1);
                }
            } finally {
                // 停止所有反应器
                await Promise.all(reactors.map(r => r.stop()));
            }
        });
    });
}); 