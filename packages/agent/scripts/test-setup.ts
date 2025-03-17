/**
 * 为Bun测试提供Jest API兼容层
 */
import { mock, expect } from 'bun:test';

// 创建一个简单的Jest兼容层
(global as any).jest = {
    fn: mock,
    setTimeout: jest.setTimeout,
    fail: (message: string): void => {
        throw new Error(message);
    }
};

// 设置默认的超时时间
jest.setTimeout(5000);

console.log('Jest compatibility layer loaded'); 