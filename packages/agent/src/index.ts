// 导出核心组件
import { AgentActor } from './core/agentActor';
import { AgentSystem } from './core/agentSystem';

// 导出工具
import { HttpToolActor, TOOL_NAMES } from './tools';

// 导出类型
import {
    AgentActorConfig,
    AgentActorState,
    GenerateMessage,
    ToolCallMessage,
    ToolResultMessage,
    ErrorResponseMessage,
    ResultResponseMessage,
    ExecuteToolMessage,
    AgentMessage,
    ResponseMessage,
    ToolDefinition
} from './core/agentActor';

import {
    AgentSystemConfig
} from './core/agentSystem';

import {
    HttpRequestParams,
    ExecuteHttpRequestMessage,
    HttpResponseMessage,
    HttpErrorMessage,
    HttpToolMessage
} from './tools/httpTool';

// 核心导出
export {
    // 核心组件
    AgentActor,
    AgentSystem,
    HttpToolActor,
    TOOL_NAMES,

    // Agent Actor 类型
    AgentActorConfig,
    AgentActorState,
    GenerateMessage,
    ToolCallMessage,
    ToolResultMessage,
    ErrorResponseMessage,
    ResultResponseMessage,
    ExecuteToolMessage,
    AgentMessage,
    ResponseMessage,
    ToolDefinition,

    // Agent System 类型
    AgentSystemConfig,

    // HTTP Tool 类型
    HttpRequestParams,
    ExecuteHttpRequestMessage,
    HttpResponseMessage,
    HttpErrorMessage,
    HttpToolMessage
};

// 类型命名空间 (兼容性)
export namespace Types {
    export type AgentActorConfig = import('./core/agentActor').AgentActorConfig;
    export type AgentActorState = import('./core/agentActor').AgentActorState;
    export type AgentSystemConfig = import('./core/agentSystem').AgentSystemConfig;
}

/**
 * 创建一个新的代理系统
 * @param config 系统配置
 * @returns AgentSystem实例
 */
export function createAgentSystem(config?: AgentSystemConfig): AgentSystem {
    return new AgentSystem(config);
} 