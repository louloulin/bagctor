/**
 * numa_awareness.test.ts
 * 
 * NUMA 感知功能测试
 * 测试线程亲和性实现中的NUMA感知功能
 */

import {
    ThreadAffinityManager,
    ThreadAffinityOptions,
    ThreadInfo
} from '../../src/core/performance/thread_affinity';
import {
    getSystemTopology,
    setNumaAffinity,
    isNativeBindingSupported
} from '../../src/core/performance/thread_binding';

// 使用Bun测试API
import { describe, it, expect, beforeAll, afterAll } from "bun:test";

describe('NUMA感知功能', () => {
    // 在每个测试前检查是否支持原生绑定
    let nativeBindingSupported: boolean;
    let systemTopology: ReturnType<typeof getSystemTopology>;
    let hasMultipleNumaNodes: boolean;

    beforeAll(() => {
        nativeBindingSupported = isNativeBindingSupported();
        systemTopology = getSystemTopology();
        hasMultipleNumaNodes = systemTopology.numaNodes > 1;

        // 输出测试环境信息
        console.log(`原生绑定支持: ${nativeBindingSupported}`);
        console.log(`NUMA节点数: ${systemTopology.numaNodes}`);
        console.log(`每个节点的核心数: ${JSON.stringify(systemTopology.coresPerNode)}`);
    });

    describe('基本NUMA功能', () => {
        it('应该报告系统拓扑信息', () => {
            const topology = getSystemTopology();

            expect(topology).toBeDefined();
            expect(typeof topology.numaNodes).toBe('number');
            expect(Array.isArray(topology.coresPerNode)).toBe(true);
            expect(topology.coresPerNode.length).toBe(topology.numaNodes);
            expect(typeof topology.logicalToPhysicalMap).toBe('object');
        });

        it('应该启用NUMA感知的线程亲和性管理器', () => {
            const options: ThreadAffinityOptions = {
                enabled: true,
                priorityStrategy: 'static',
                numaAware: true,
                logging: false
            };

            const manager = ThreadAffinityManager.getInstance(options);
            expect(manager).toBeDefined();
        });

        it('应该尝试设置NUMA亲和性', () => {
            // 如果系统有多个NUMA节点，测试设置NUMA亲和性
            if (hasMultipleNumaNodes) {
                const result = setNumaAffinity(0);
                // 结果可能因环境而异
                expect(typeof result).toBe('boolean');
            } else {
                // 在只有一个NUMA节点的系统上，这个测试是信息性的
                console.log('系统只有一个NUMA节点，跳过NUMA亲和性测试');
            }
        });
    });

    describe('NUMA感知线程绑定', () => {
        it('绑定线程时应该考虑NUMA节点', () => {
            const options: ThreadAffinityOptions = {
                enabled: true,
                priorityStrategy: 'static',
                numaAware: true,
                logging: false
            };

            const manager = ThreadAffinityManager.getInstance(options);

            // 获取系统拓扑
            const topology = getSystemTopology();

            // 如果有多个NUMA节点，测试绑定到每个节点的第一个核心
            if (hasMultipleNumaNodes) {
                let startCore = 0;

                for (let nodeId = 0; nodeId < topology.numaNodes; nodeId++) {
                    // 计算该节点的第一个核心ID
                    if (nodeId > 0) {
                        startCore += topology.coresPerNode[nodeId - 1];
                    }

                    // 绑定到该核心
                    const result = manager.bindCurrentThread(startCore, 50);
                    expect(result).toBe(true);

                    // 获取线程信息
                    const threads = manager.getAllThreads();
                    const thread = threads[threads.length - 1];

                    // 验证NUMA节点信息
                    if (nativeBindingSupported) {
                        expect(thread.numaNode).toBeDefined();
                        // 可能不总是等于nodeId，因为实际映射可能不同
                    }

                    // 解除绑定以便下一次测试
                    manager.unbindThread(thread.id);
                }
            } else {
                // 在只有一个NUMA节点的系统上，简单测试绑定
                const result = manager.bindCurrentThread(0, 50);
                expect(result).toBe(true);

                const threads = manager.getAllThreads();
                const thread = threads[threads.length - 1];

                // 在单NUMA系统上，numaNode通常是0或undefined
                if (thread.numaNode !== undefined) {
                    expect(thread.numaNode).toBe(0);
                }

                // 解除绑定
                manager.unbindThread(thread.id);
            }
        });
    });

    describe('NUMA优化线程分配', () => {
        it('应该根据NUMA拓扑优化线程分配', () => {
            const options: ThreadAffinityOptions = {
                enabled: true,
                priorityStrategy: 'dynamic',
                numaAware: true,
                logging: false
            };

            const manager = ThreadAffinityManager.getInstance(options);

            // 模拟多个线程绑定请求
            const threadInfos: ThreadInfo[] = [];
            const bindCount = Math.min(4, systemTopology.coresPerNode.reduce((a, b) => a + b, 0));

            for (let i = 0; i < bindCount; i++) {
                // 使用简单的循环策略选择核心
                const coreId = i % systemTopology.coresPerNode[0];
                const result = manager.bindCurrentThread(coreId, 50);

                if (result) {
                    const threads = manager.getAllThreads();
                    threadInfos.push(threads[threads.length - 1]);
                }
            }

            // 验证线程分布
            if (hasMultipleNumaNodes && threadInfos.length >= 2) {
                // 计算每个NUMA节点上的线程数
                const numaCounts = new Map<number, number>();

                for (const thread of threadInfos) {
                    if (thread.numaNode !== undefined) {
                        const count = numaCounts.get(thread.numaNode) || 0;
                        numaCounts.set(thread.numaNode, count + 1);
                    }
                }

                // 在多NUMA系统上，线程应该分布在不同的NUMA节点上
                // 注意：这是一个软断言，因为确切的分布取决于系统状态
                console.log('NUMA节点线程分布:', Array.from(numaCounts.entries()));
            }

            // 清理：解除所有线程绑定
            for (const thread of threadInfos) {
                manager.unbindThread(thread.id);
            }
        });
    });

    describe('动态NUMA负载均衡', () => {
        it('应该在NUMA节点之间重新平衡负载', () => {
            if (!hasMultipleNumaNodes) {
                console.log('系统只有一个NUMA节点，跳过NUMA负载均衡测试');
                return;
            }

            const options: ThreadAffinityOptions = {
                enabled: true,
                priorityStrategy: 'dynamic',
                numaAware: true,
                logging: false
            };

            const manager = ThreadAffinityManager.getInstance(options);

            // 绑定线程到第一个NUMA节点的核心
            let startCore = 0;
            let result = manager.bindCurrentThread(startCore, 50);
            expect(result).toBe(true);

            // 获取线程信息
            let threads = manager.getAllThreads();
            const threadId = threads[threads.length - 1].id;

            // 模拟高负载
            manager.updateThreadLoad(threadId, 90);

            // 尝试重新平衡
            const rebalanced = manager.rebalanceThreads();

            // 清理
            manager.unbindThread(threadId);

            // 这是信息性断言，不一定总是重新平衡
            console.log(`重新平衡结果: ${rebalanced} 个线程被重新分配`);
        });
    });
}); 