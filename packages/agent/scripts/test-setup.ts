/**
 * 为Bun测试提供Jest API兼容层
 */
import { mock, expect } from 'bun:test';

// 创建一个简单的Jest兼容层
(global as any).jest = {
    fn: mock,
    setTimeout: (timeout: number): void => {
        // Bun's equivalent to jest.setTimeout
        // This is a no-op in Bun as timeouts are configured differently
    },
    fail: (message: string): void => {
        throw new Error(message);
    }
};

// 设置默认的超时时间
(global as any).jest.setTimeout(5000);

console.log('[测试设置] Jest兼容层已加载'); 