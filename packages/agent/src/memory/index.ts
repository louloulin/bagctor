/**
 * 记忆系统模块索引
 */
export * from './memory_system';

// 创建默认实例
import { MemoryStore } from './memory_system';

// 导出全局实例
export const globalMemoryStore = new MemoryStore(); 