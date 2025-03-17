import { beforeAll, afterAll, beforeEach, afterEach, mock, expect } from "bun:test";
import { log, configureLogger } from "../utils/logger";

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

    spyOn: (obj: any, method: string) => {
        const original = obj[method];
        const mockFn = mock(() => undefined);

        obj[method] = mockFn;

        mockFn.mockRestore = () => {
            obj[method] = original;
        };

        mockFn.mockImplementation = (impl: any) => {
            obj[method] = mock(impl);
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

// 禁用测试期间的常规日志输出
beforeAll(() => {
    // 保存原始日志配置，我们将使用闭包来存储
    let originalLogConfig = { level: "info" }; // 假设默认级别是info

    // 设置更高的日志级别，只显示错误
    configureLogger({ level: "error" });

    // 测试完成后恢复
    afterAll(() => {
        configureLogger(originalLogConfig);
    });
});

// 在每个测试之前清理环境
beforeEach(async () => {
    // 可以添加其他清理逻辑
});

// 在每个测试之后清理
afterEach(async () => {
    // 可以添加其他清理逻辑
}); 