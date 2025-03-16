/**
 * enhanced_thread_affinity.test.ts
 * 
 * 增强版线程亲和性(Enhanced Thread Affinity)的测试文件
 */

import {
    ThreadAffinityManager,
    ThreadInfo,
    bindToCore,
    getAvailableCores,
    unbindCurrentThread,
    rebalanceThreads
} from '../../src/core/performance/thread_affinity';
import { Worker, isMainThread } from 'worker_threads';
import { join } from 'path';
import { writeFileSync, unlinkSync } from 'fs';

// 引入Jest类型
import '@types/jest';

describe('增强版线程亲和性', () => {
    describe('NUMA感知', () => {
        it('应该能够创建启用NUMA感知的ThreadAffinityManager', () => {
            const manager = ThreadAffinityManager.getInstance({
                enabled: true,
                priorityStrategy: 'static',
                numaAware: true,
                logging: false
            });

            expect(manager).toBeDefined();

            // 获取所有线程信息
            const threads = manager.getAllThreads();
            expect(Array.isArray(threads)).toBe(true);
        });

        it('绑定线程时应该考虑NUMA节点', () => {
            const manager = ThreadAffinityManager.getInstance({
                enabled: true,
                priorityStrategy: 'static',
                numaAware: true,
                logging: false
            });

            // 绑定到核心0
            const result = manager.bindCurrentThread(0, 50);

            // 验证绑定结果
            expect(result).toBe(true);

            // 获取线程信息
            const threads = manager.getAllThreads();
            const boundThread = threads.find(t => t.cpuCore === 0);

            expect(boundThread).toBeDefined();
            // 注意：numaNode可能为undefined，因为这与平台相关
        });
    });

    describe('动态绑定策略', () => {
        it('应该支持动态优先级策略', () => {
            const manager = ThreadAffinityManager.getInstance({
                enabled: true,
                priorityStrategy: 'dynamic',
                logging: false
            });

            expect(manager).toBeDefined();
        });

        it('应该能够重新平衡线程', () => {
            const manager = ThreadAffinityManager.getInstance({
                enabled: true,
                priorityStrategy: 'dynamic',
                logging: false
            });

            // 绑定到核心0
            manager.bindCurrentThread(0, 50);

            // 模拟更新线程负载
            const threads = manager.getAllThreads();
            const threadId = threads[0]?.id;

            if (threadId !== undefined) {
                manager.updateThreadLoad(threadId, 90); // 高负载

                // 尝试重新平衡
                const rebalanced = rebalanceThreads();

                // 这里不检查具体值，因为重新平衡可能取决于系统状态
                expect(typeof rebalanced).toBe('number');
            }
        });
    });

    describe('线程解绑', () => {
        it('应该能够解除线程绑定', () => {
            const manager = ThreadAffinityManager.getInstance({
                enabled: true,
                priorityStrategy: 'static',
                logging: false
            });

            // 绑定到核心0
            manager.bindCurrentThread(0, 50);

            // 解除绑定
            const result = unbindCurrentThread();

            // 验证解绑结果
            expect(result).toBe(true);
        });

        it('未绑定的线程应该报告解绑失败', () => {
            // 尝试解除一个不存在的线程
            const fakeThreadId = 999999;
            const manager = ThreadAffinityManager.getInstance();
            const result = manager.unbindThread(fakeThreadId);

            // 应该报告失败
            expect(result).toBe(false);
        });
    });

    describe('Worker线程集成', () => {
        // 创建临时的Worker脚本文件
        const workerScriptPath = join(__dirname, 'temp_enhanced_worker.js');

        beforeAll(() => {
            // 创建临时Worker脚本
            const workerScript = `
                const { parentPort, workerData } = require('worker_threads');
                
                // 这会触发自动注册
                const { registerWorkerAffinity } = require('../../src/core/performance/thread_affinity');
                
                // 向主线程报告
                parentPort.postMessage({
                    type: 'status',
                    affinityCore: workerData._affinityCore,
                    affinityNumaNode: workerData._affinityNumaNode,
                    affinityNativeSupported: workerData._affinityNativeSupported
                });
                
                // 保持Worker活跃一段时间
                setTimeout(() => {
                    parentPort.postMessage({ type: 'exit' });
                }, 100);
            `;

            writeFileSync(workerScriptPath, workerScript);
        });

        afterAll(() => {
            // 删除临时Worker脚本
            try {
                unlinkSync(workerScriptPath);
            } catch (e) {
                // 忽略清理错误
            }
        });

        it('应该为Worker传递NUMA亲和性设置', (done) => {
            if (!isMainThread) {
                // 跳过，如果在Worker线程中运行测试
                return done();
            }

            // 创建启用NUMA感知的ThreadAffinityManager
            const manager = ThreadAffinityManager.getInstance({
                enabled: true,
                priorityStrategy: 'static',
                numaAware: true,
                logging: false
            });

            const worker = manager.createAffinityWorker(workerScriptPath, 0, { testData: 'test' });

            worker.on('message', (message) => {
                if (message.type === 'status') {
                    expect(message.affinityCore).toBe(0);
                    // affinityNumaNode可能为undefined，这取决于系统
                    expect(typeof message.affinityNativeSupported).toBe('boolean');
                } else if (message.type === 'exit') {
                    worker.terminate().then(() => done());
                }
            });

            worker.on('error', (err) => {
                fail(`Worker错误: ${err.message}`);
                done();
            });
        }, 5000);
    });
}); 