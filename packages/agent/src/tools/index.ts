/**
 * 工具模块索引
 */
export * from './tool_interface';
export * from './basic_tools';

// 初始化
import { initializeBasicTools } from './basic_tools';

// 导出单例初始化函数
export function initializeTools(): void {
    // 初始化所有内置工具
    initializeBasicTools();

    // 可以在此处添加其他工具集初始化
}

// 导出快捷函数
export { globalToolRegistry as toolRegistry } from './tool_interface'; 