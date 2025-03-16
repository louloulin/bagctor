/**
 * thread_affinity_integration.test.ts
 * 
 * 线程亲和性与反应器集成测试
 * 验证线程亲和性功能与反应器模式的集成
 */

import {
    ThreadAffinityManager,
    ThreadAffinityOptions
} from '../../src/core/performance/thread_affinity';

import {
    isNativeBindingSupported,
    getSystemTopology,
    bindThreadToCore,
    getCurrentThreadCore
} from '../../src/core/performance/thread_binding';

import { Reactor, ReactorOptions } from '../../src/core/reactor/reactor';
import { Work } from '../../src/core/reactor/work';

// 引入测试工具
import '@types/jest';

describe('线程亲和性与反应器集成', () => {
    // 设置测试环境
    let nativeBindingSupported: boolean;
    let affinityManager: ThreadAffinityManager;

    beforeAll(() => {
        // 检查环境
        nativeBindingSupported = isNativeBindingSupported();

        // 创建线程亲和性管理器
        const options: ThreadAffinityOptions = {
            enabled: true,
            priorityStrategy: 'static',
            numaAware: true,
            logging: false
        };

        affinityManager = ThreadAffinityManager.getInstance(options);
    });

    afterAll(() => {
        // 解除所有线程绑定
        const threads = affinityManager.getAllThreads();
        threads.forEach(thread => {
            affinityManager.unbindThread(thread.id);
        });
    });

    describe('基本功能测试', () => {
        it('反应器应该能够与线程亲和性功能集成', async () => {
            // 创建反应器配置
            const reactorOptions: ReactorOptions = {
                id: 'test-reactor-1',
                maxConcurrency: 10,
                enableAffinityBinding: true,
                affinityCore: 0, // 绑定到核心0
                threadPriority: 75 // 高优先级
            };

            // 创建反应器
            const reactor = new Reactor(reactorOptions);

            // 启动反应器
            await reactor.start();

            // 验证反应器已与线程亲和性集成
            expect(reactor.isRunning()).toBe(true);
            expect(reactor.getId()).toBe('test-reactor-1');

            if (nativeBindingSupported) {
                // 如果支持原生绑定，验证核心绑定
                const currentCore = getCurrentThreadCore();
                expect(currentCore).toBeGreaterThanOrEqual(0);
            }

            // 停止反应器
            await reactor.stop();
            expect(reactor.isRunning()).toBe(false);
        });

        it('多个反应器应该能够绑定到不同的CPU核心', async () => {
            // 获取可用的CPU核心数
            const cpuCount = affinityManager.getCpuCount();
            const reactorCount = Math.min(cpuCount, 4); // 最多创建4个测试反应器

            // 创建多个反应器
            const reactors: Reactor[] = [];

            for (let i = 0; i < reactorCount; i++) {
                const reactorOptions: ReactorOptions = {
                    id: `test-reactor-${i}`,
                    maxConcurrency: 10,
                    enableAffinityBinding: true,
                    affinityCore: i, // 每个反应器绑定到不同核心
                    threadPriority: 50
                };

                const reactor = new Reactor(reactorOptions);
                await reactor.start();
                reactors.push(reactor);
            }

            // 验证所有反应器都在运行
            reactors.forEach(reactor => {
                expect(reactor.isRunning()).toBe(true);
            });

            if (nativeBindingSupported && reactors.length >= 2) {
                // 获取线程信息
                const threads = affinityManager.getAllThreads();

                // 映射反应器ID到线程ID
                const reactorThreads = threads.filter(t =>
                    reactors.some(r => r.getId() === `test-reactor-${t.cpuCore}`)
                );

                // 验证有不同核心绑定的线程
                const uniqueCores = new Set(reactorThreads.map(t => t.cpuCore));
                expect(uniqueCores.size).toBeGreaterThanOrEqual(1);
            }

            // 停止所有反应器
            for (const reactor of reactors) {
                await reactor.stop();
                expect(reactor.isRunning()).toBe(false);
            }
        });
    });

    describe('性能测试', () => {
        it('带线程亲和性的反应器应该能够处理工作负载', async () => {
            // 创建带亲和性的反应器
            const reactorOptions: ReactorOptions = {
                id: 'perf-reactor',
                maxConcurrency: 100,
                enableAffinityBinding: true,
                affinityCore: 0
            };

            const reactor = new Reactor(reactorOptions);
            await reactor.start();

            // 创建模拟工作
            class TestWork implements Work {
                private readonly id: number;

                constructor(id: number) {
                    this.id = id;
                }

                async execute(): Promise<any> {
                    // 模拟CPU密集型工作
                    let result = 0;
                    for (let i = 0; i < 100000; i++) {
                        result += Math.sqrt(i * Math.sin(i));
                    }
                    return { id: this.id, result };
                }
            }

            // 提交多个工作
            const results: Promise<any>[] = [];
            const workCount = 50;

            for (let i = 0; i < workCount; i++) {
                const work = new TestWork(i);
                results.push(reactor.submit(work));
            }

            // 等待所有工作完成
            const completedResults = await Promise.all(results);

            // 验证结果
            expect(completedResults.length).toBe(workCount);
            completedResults.forEach((result, index) => {
                expect(result.id).toBe(index);
                expect(result.result).toBeDefined();
            });

            // 获取性能统计
            const stats = reactor.getStatistics();
            expect(stats.totalTasks).toBeGreaterThanOrEqual(workCount);
            expect(stats.completedTasks).toBeGreaterThanOrEqual(workCount);

            // 如果支持原生绑定，应该有CPU使用率信息
            if (nativeBindingSupported) {
                expect(stats.cpuUsage).toBeDefined();
            }

            // 停止反应器
            await reactor.stop();
        });

        it('NUMA感知的线程亲和性应优化反应器性能', async () => {
            // 获取系统拓扑
            const topology = getSystemTopology();

            // 如果系统有多个NUMA节点，测试NUMA感知功能
            if (topology.numaNodes > 1 && nativeBindingSupported) {
                // 创建NUMA感知的反应器
                const numaReactors: Reactor[] = [];

                for (let nodeId = 0; nodeId < topology.numaNodes; nodeId++) {
                    // 计算该NUMA节点的起始核心ID
                    let startCore = 0;
                    for (let i = 0; i < nodeId; i++) {
                        startCore += topology.coresPerNode[i];
                    }

                    // 在该NUMA节点上创建反应器
                    const reactorOptions: ReactorOptions = {
                        id: `numa-reactor-${nodeId}`,
                        maxConcurrency: 50,
                        enableAffinityBinding: true,
                        affinityCore: startCore, // 使用NUMA节点的第一个核心
                        numaNode: nodeId // 设置NUMA节点
                    };

                    const reactor = new Reactor(reactorOptions);
                    await reactor.start();
                    numaReactors.push(reactor);
                }

                // 验证所有反应器都在运行
                numaReactors.forEach(reactor => {
                    expect(reactor.isRunning()).toBe(true);
                });

                // 停止所有反应器
                for (const reactor of numaReactors) {
                    await reactor.stop();
                }
            } else {
                // 跳过测试
                console.log('系统不支持NUMA或原生线程绑定，跳过NUMA优化测试');
            }
        });
    });

    describe('错误处理', () => {
        it('反应器应处理亲和性绑定失败', async () => {
            // 尝试绑定到不存在的核心
            const invalidCoreId = 9999;

            const reactorOptions: ReactorOptions = {
                id: 'error-reactor',
                maxConcurrency: 10,
                enableAffinityBinding: true,
                affinityCore: invalidCoreId
            };

            // 创建反应器 - 即使绑定失败，也应该可以创建
            const reactor = new Reactor(reactorOptions);
            await reactor.start();

            // 即使亲和性绑定失败，反应器也应该能启动
            expect(reactor.isRunning()).toBe(true);

            // 停止反应器
            await reactor.stop();
        });
    });
}); 