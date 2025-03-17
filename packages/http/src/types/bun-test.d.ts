/**
 * Bun测试API的全局类型定义
 */

/// <reference types="bun-types" />

declare global {
    // Bun测试API
    const describe: typeof import('bun:test').describe;
    const it: typeof import('bun:test').it;
    const test: typeof import('bun:test').test;
    const expect: typeof import('bun:test').expect;
    const beforeAll: typeof import('bun:test').beforeAll;
    const afterAll: typeof import('bun:test').afterAll;
    const beforeEach: typeof import('bun:test').beforeEach;
    const afterEach: typeof import('bun:test').afterEach;

    // Jest兼容函数
    namespace jest {
        type Mock<T extends (...args: any[]) => any> = ReturnType<typeof import('bun:test').mock<T>>;

        interface MockInstance {
            fn: <T extends (...args: any[]) => any>(implementation?: T) => Mock<T>;
            setTimeout: (timeout: number) => void;
        }
    }

    const jest: jest.MockInstance;

    // 其他Jest兼容性函数
    function fail(message?: string): never;
}

export { }; 