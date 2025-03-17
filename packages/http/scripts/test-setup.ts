/**
 * Bun测试设置脚本 - 提供Jest API兼容性
 */
import { mock, expect } from 'bun:test';

// 为Jest的mock函数创建一个简单的兼容层
(globalThis as any).jest = {
    fn: (impl?: (...args: any[]) => any) => {
        const mockFn = mock(impl || (() => undefined));

        // 为Jest API添加一些常用方法
        mockFn.mockReturnValue = (value: any) => {
            mockFn.mockImplementation(() => value);
            return mockFn;
        };

        mockFn.mockResolvedValue = (value: any) => {
            mockFn.mockImplementation(() => Promise.resolve(value));
            return mockFn;
        };

        return mockFn;
    },

    setTimeout: (ms: number) => {
        console.log(`[Jest兼容] setTimeout(${ms})`);
    }
};

// 添加fail函数
(globalThis as any).fail = (message?: string) => {
    throw new Error(message || 'Test failed');
};

console.log('[测试设置] Jest兼容层已加载'); 