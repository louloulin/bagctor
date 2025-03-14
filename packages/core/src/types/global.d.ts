// 扩展NodeJS.Timer类型，添加缺失的[Symbol.dispose]方法
declare namespace NodeJS {
    interface Timer {
        [Symbol.dispose](): void;
    }
}

// 确保TS理解导入模块路径
declare module '@core/*';
declare module '@utils/*';
declare module '@testing/*';
declare module '@monitoring/*'; 