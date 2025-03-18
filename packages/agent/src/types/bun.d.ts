// 基本的 Bun 类型声明
declare var Bun: {
    version: string;
    spawn: (command: string[], options?: any) => any;
    sleep: (ms: number) => Promise<void>;
    file: (path: string) => any;
    write: (path: string, data: any) => Promise<void>;
    serve: (options: any) => any;
    // 添加更多 Bun 相关的类型定义
};

// 解决文档类型引用问题
declare module 'docs' {
    const content: any;
    export default content;
}

// 解决 bun:test 模块引用问题
declare module 'bun:test' {
    export const describe: (name: string, fn: () => void) => void;
    export const it: (name: string, fn: () => void | Promise<void>) => void;
    export const test: (name: string, fn: () => void | Promise<void>) => void;
    export const beforeAll: (fn: () => void | Promise<void>) => void;
    export const afterAll: (fn: () => void | Promise<void>) => void;
    export const beforeEach: (fn: () => void | Promise<void>) => void;
    export const afterEach: (fn: () => void | Promise<void>) => void;
    export const expect: <T>(value: T) => any;
} 