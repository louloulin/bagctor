/**
 * thread_affinity.test.ts
 * 
 * 线程亲和性(Thread Affinity)的测试文件
 */

import {
    ThreadAffinityManager,
    ThreadInfo,
    bindToCore,
    getAvailableCores
} from '../../src/core/performance/thread_affinity';
import { Worker, isMainThread } from 'worker_threads';
import { join } from 'path';
import { writeFileSync, unlinkSync } from 'fs';

// 使用Bun测试API
import { describe, it, expect, beforeAll, afterAll } from "bun:test";

describe('线程亲和性', () => {
    describe('ThreadAffinityManager', () => {
        it('应该能够获取单例实例', () => {
            const manager1 = ThreadAffinityManager.getInstance();
            const manager2 = ThreadAffinityManager.getInstance();

            expect(manager1).toBeDefined();
            expect(manager2).toBeDefined();
            expect(manager1).toBe(manager2); // 确认是单例
        });

        it('应该能够获取可用的CPU核心数', () => {
            const coreCount = getAvailableCores();

            expect(coreCount).toBeGreaterThan(0);
            expect(Number.isInteger(coreCount)).toBe(true);
        });

        it('应该能够将当前线程绑定到核心（模拟）', () => {
            // 设置threadAffinity为禁用状态，进行测试
            const manager = ThreadAffinityManager['instance']; // 访问私有静态属性

            // 启用线程亲和性选项
            // @ts-ignore - 修改私有字段进行测试
            manager['options'] = { enabled: true, priorityStrategy: 'static', logging: false };

            const coreId = 0;
            const result = bindToCore(coreId);

            expect(result).toBe(true);

            // 获取线程信息
            const threads = manager.getAllThreads();
            const thread = threads.find(t => t.cpuCore === coreId);

            expect(thread).toBeDefined();
            expect(thread?.cpuCore).toBe(coreId);
        });

        it('无法绑定到不存在的核心', () => {
            const invalidCoreId = 99999; // 一个不可能存在的核心ID
            const result = bindToCore(invalidCoreId);

            expect(result).toBe(false);
        });
    });

    describe('Worker线程亲和性', () => {
        // 创建临时的Worker脚本文件
        const workerScriptPath = join(__dirname, 'temp_worker.js');

        beforeAll(() => {
            // 创建临时Worker脚本
            const workerScript = `
                const { parentPort, workerData } = require('worker_threads');
                
                // 这会触发自动注册
                const { registerWorkerAffinity } = require('../../src/core/performance/thread_affinity');
                
                // 向主线程报告
                parentPort.postMessage({
                    type: 'status',
                    affinityCore: workerData._affinityCore
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

        it('应该为Worker传递亲和性设置', (done) => {
            if (!isMainThread) {
                // 跳过，如果在Worker线程中运行测试
                return done();
            }

            // 创建分配到核心0的Worker
            const manager = ThreadAffinityManager.getInstance({
                enabled: true,
                priorityStrategy: 'static',
                logging: false
            });

            const worker = manager.createAffinityWorker(workerScriptPath, 0, { testData: 'test' });

            worker.on('message', (message) => {
                if (message.type === 'status') {
                    expect(message.affinityCore).toBe(0);
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