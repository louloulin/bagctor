import { Agent } from '@mastra/core/agent';
import { Mastra } from '@mastra/core';

export interface BagctorDistributionConfig {
    clustered?: boolean;
    serverPort?: number;
    remoteEnabled?: boolean;
    nodeType?: 'primary' | 'worker';
    primaryHost?: string;
    primaryPort?: number;
    workerType?: 'query' | 'tool' | 'memory';
}

export interface BagctorConfig {
    agents?: Record<string, Agent> | Agent[];
    mastra?: Mastra | Mastra[];
    distribution?: BagctorDistributionConfig;
}

export interface WorkflowStep {
    agent: string;
    input: string | ((context: Record<string, any>) => string);
    output: string;
}

export interface WorkflowConfig {
    name: string;
    steps: WorkflowStep[];
    nodeAssignment?: Record<string, string>;
}

export interface TeamConfig {
    name: string;
    agents: string[];
    orchestrationStrategy: 'hierarchical' | 'parallel' | 'sequential';
}

export interface ServeConfig {
    port: number;
    enablePlayground?: boolean;
}

// 分布式智能体交互所需的类型定义

/**
 * 消息类型枚举
 */
export enum MessageType {
    QUERY = 'query',           // 查询消息
    RESPONSE = 'response',     // 响应消息
    TASK = 'task',             // 任务分配
    RESULT = 'result',         // 结果返回
    DELEGATION = 'delegation', // 任务委派
    INTEGRATION = 'integration', // 结果整合
    ERROR = 'error',           // 错误消息
    STATUS = 'status',         // 状态更新
    HEARTBEAT = 'heartbeat'    // 心跳检测
}

/**
 * 智能体消息接口
 */
export interface BagctorMessage {
    id: string;                // 消息唯一ID
    sourceAgent: string;       // 发送消息的智能体ID
    targetAgent: string;       // 接收消息的智能体ID
    content: string;           // 消息内容
    type: MessageType;         // 消息类型
    timestamp: number;         // 时间戳
    metadata?: Record<string, any>; // 可选元数据
}

/**
 * 节点标识符类型
 */
export type NodeIdentifier = string;

/**
 * 智能体上下文接口
 */
export interface AgentContext {
    id: string;                // 上下文ID
    workflowId?: string;       // 相关工作流ID
    agentId: string;           // 智能体ID
    nodeId: NodeIdentifier;    // 节点ID
    state: Record<string, any>; // 上下文状态
    history: BagctorMessage[]; // 消息历史
    createdAt: number;         // 创建时间
    updatedAt: number;         // 更新时间
}

/**
 * 远程智能体接口
 */
export interface RemoteAgentInfo {
    id: string;                // 智能体ID
    name: string;              // 智能体名称
    nodeId: NodeIdentifier;    // 所在节点ID
    status: 'online' | 'offline' | 'busy'; // 状态
    capabilities: string[];    // 能力列表
}

/**
 * 分布式节点接口
 */
export interface DistributedNode {
    id: NodeIdentifier;        // 节点ID
    type: 'primary' | 'worker'; // 节点类型
    host: string;              // 主机地址
    port: number;              // 端口
    status: 'online' | 'offline' | 'error'; // 状态
    agents: string[];          // 托管的智能体列表
    resources: {               // 节点资源信息
        cpu: number;             // CPU使用率
        memory: number;          // 内存使用率
        load: number;            // 负载
    };
} 