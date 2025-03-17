// 导出核心组件
import { AgentActor } from './core/agentActor';
import { AgentSystem } from './core/agentSystem';
import { AgentMemory, AgentMemoryActor } from './core/agentMemory';
import { AgentRag, RagActor } from './core/agentRag';
import { MastraAdapter } from './core/mastraAdapter';

// 导出工具
import { HttpToolActor, TOOL_NAMES } from './tools';
import { FileToolActor } from './tools/fileTool';

// 导出类型
import {
    AgentActorConfig,
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

import {
    FileOperationParams,
    ReadFileMessage,
    WriteFileMessage,
    ListDirectoryMessage,
    FileResponseMessage,
    FileErrorMessage,
    FileToolMessage
} from './tools/fileTool';

import {
    MemoryItem,
    MemoryQueryOptions,
    MemoryState,
    AddMemoryMessage,
    QueryMemoryMessage,
    MemoryResultMessage,
    MemoryErrorMessage,
    MemoryMessage,
    MemoryResponseMessage
} from './core/agentMemory';

import {
    Document,
    RagQueryParams,
    DocumentAddParams,
    RagActorState,
    RagQueryMessage,
    DocumentAddMessage,
    RagResultMessage,
    RagErrorMessage,
    RagMessage,
    RagResponseMessage
} from './core/agentRag';

// 核心导出
export {
    // 核心组件
    AgentActor,
    AgentSystem,
    AgentMemory,
    AgentMemoryActor,
    AgentRag,
    RagActor,
    MastraAdapter,

    // 工具
    HttpToolActor,
    FileToolActor,
    TOOL_NAMES,

    // Agent Actor 类型
    AgentActorConfig,
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
    HttpToolMessage,

    // File Tool 类型
    FileOperationParams,
    ReadFileMessage,
    WriteFileMessage,
    ListDirectoryMessage,
    FileResponseMessage,
    FileErrorMessage,
    FileToolMessage,

    // Memory 类型
    MemoryItem,
    MemoryQueryOptions,
    MemoryState,
    AddMemoryMessage,
    QueryMemoryMessage,
    MemoryResultMessage,
    MemoryErrorMessage,
    MemoryMessage,
    MemoryResponseMessage,

    // RAG 类型
    Document,
    RagQueryParams,
    DocumentAddParams,
    RagActorState,
    RagQueryMessage,
    DocumentAddMessage,
    RagResultMessage,
    RagErrorMessage,
    RagMessage,
    RagResponseMessage
};

// 类型命名空间 (兼容性)
export namespace Types {
    export type AgentActorConfig = import('./core/agentActor').AgentActorConfig;
    export type AgentSystemConfig = import('./core/agentSystem').AgentSystemConfig;
    export type MemoryItem = import('./core/agentMemory').MemoryItem;
    export type FileOperationParams = import('./tools/fileTool').FileOperationParams;
    export type Document = import('./core/agentRag').Document;
}

/**
 * 创建一个新的代理系统
 * @param config 系统配置
 * @returns AgentSystem实例
 */
export function createAgentSystem(config?: AgentSystemConfig): AgentSystem {
    return new AgentSystem(config);
} 