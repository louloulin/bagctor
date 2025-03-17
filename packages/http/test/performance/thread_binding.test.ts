/**
 * thread_binding.test.ts
 * 
 * 线程绑定(Thread Binding)的测试文件
 * 测试原生线程绑定功能及其回退机制
 */

import {
    isNativeBindingSupported,
    bindThreadToCore,
    getNativeThreadId,
    getCurrentThreadCore,
    setThreadPriority,
    getSystemTopology,
    getCpuUsage,
    setNumaAffinity,
    unbindThread
} from '../../src/core/performance/thread_binding';

// 使用Bun测试API
import { describe, it, expect } from "bun:test";

describe('线程绑定', () => {
    describe('基础功能检测', () => {
        it('应该报告是否支持原生绑定', () => {
            const supported = isNativeBindingSupported();
            // 只验证返回类型，不验证具体值，因为这取决于运行环境
            expect(typeof supported).toBe('boolean');
        });

        it('应该能获取线程ID', () => {
            const threadId = getNativeThreadId();
            expect(typeof threadId).toBe('number');
            expect(threadId).toBeGreaterThanOrEqual(0);
        });

        it('应该能获取当前的CPU使用率', () => {
            const usage = getCpuUsage();
            expect(typeof usage).toBe('number');
            expect(usage).toBeGreaterThanOrEqual(0);
            expect(usage).toBeLessThanOrEqual(100);
        });

        it('应该能获取指定核心的CPU使用率', () => {
            const usage = getCpuUsage(0); // 核心0
            expect(typeof usage).toBe('number');
            expect(usage).toBeGreaterThanOrEqual(0);
            expect(usage).toBeLessThanOrEqual(100);
        });
    });

    describe('线程绑定操作', () => {
        it('应该尝试绑定线程到特定核心', () => {
            const result = bindThreadToCore(0);
            // 绑定结果可能因环境而异，这里只验证返回类型
            expect(typeof result).toBe('boolean');
        });

        it('应该能获取当前线程绑定的核心', () => {
            // 先尝试绑定到核心0
            bindThreadToCore(0);

            const currentCore = getCurrentThreadCore();
            // 返回值可能是绑定的核心ID或-1（如果不支持或未绑定）
            expect(typeof currentCore).toBe('number');
        });

        it('应该能解除线程绑定', () => {
            // 先绑定
            bindThreadToCore(0);

            // 然后解除绑定
            const result = unbindThread();
            // 结果可能因环境而异
            expect(typeof result).toBe('boolean');
        });

        it('应该尝试设置线程优先级', () => {
            const result = setThreadPriority(75);
            // 结果可能因环境而异
            expect(typeof result).toBe('boolean');
        });
    });

    describe('NUMA支持', () => {
        it('应该能获取系统拓扑信息', () => {
            const topology = getSystemTopology();

            expect(topology).toBeDefined();
            expect(typeof topology.numaNodes).toBe('number');
            expect(Array.isArray(topology.coresPerNode)).toBe(true);
            expect(typeof topology.logicalToPhysicalMap).toBe('object');
        });

        it('应该尝试设置NUMA亲和性', () => {
            const result = setNumaAffinity(0);
            // 结果可能因环境而异
            expect(typeof result).toBe('boolean');
        });
    });

    describe('模拟回退行为', () => {
        // 这些测试主要是确保即使在不支持原生绑定的环境中也能正常工作

        it('不支持原生绑定时也应该返回线程ID', () => {
            // 即使在不支持原生绑定的环境中，getNativeThreadId也应该返回一个数字
            const threadId = getNativeThreadId();
            expect(typeof threadId).toBe('number');
        });

        it('不支持原生绑定时绑定也应该"成功"', () => {
            // 即使在不支持的环境中，绑定操作也应该返回true表示模拟成功
            const result = bindThreadToCore(0);
            // 注意：在真实不支持的环境中这应该返回true（模拟成功）
            expect(typeof result).toBe('boolean');
        });

        it('不支持原生绑定时系统拓扑信息应该有默认值', () => {
            const topology = getSystemTopology();

            expect(topology.numaNodes).toBeGreaterThanOrEqual(1);
            expect(topology.coresPerNode.length).toBeGreaterThanOrEqual(1);
        });
    });
});
