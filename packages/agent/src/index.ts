// 导出核心组件
import { AgentActor } from './core/agentActor';
import { AgentSystem } from './core/agentSystem';

// 导出工具
import { HttpToolActor, TOOL_NAMES } from './tools';

// 导出所有类型定义
import * as Types from './types';

// 核心导出
export {
    AgentActor,
    AgentSystem,
    HttpToolActor,
    TOOL_NAMES,
    Types
};

/**
 * 创建一个新的代理系统
 * @param config 系统配置
 * @returns AgentSystem实例
 */
export function createAgentSystem(config?: Types.AgentSystemConfig): AgentSystem {
    return new AgentSystem(config);
} 