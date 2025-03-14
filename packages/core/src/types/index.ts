// 导出所有类型定义
export * from '@core/types';

// 扩展NodeJS.Timer类型，添加缺失的[Symbol.dispose]方法，确保与Timeout兼容
declare global {
    namespace NodeJS {
        interface Timer {
            [Symbol.dispose](): void;
        }
    }
}

// 重新导出Actor系统相关类型
export type { ActorSystem } from '@core/system'; 