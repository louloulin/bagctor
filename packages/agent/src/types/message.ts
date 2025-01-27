import { Message, PID } from '@bactor/core';

export type Priority = 'low' | 'medium' | 'high' | 'critical';

export interface WorkflowStage {
    id: string;
    name: string;
    order: number;
    roles: string[];
    requirements: string[];
}

export interface WorkflowContext {
    id: string;
    name: string;
    currentStage: WorkflowStage;
    history: WorkflowStage[];
    metadata: Record<string, any>;
}

export interface AgentContext extends PID {
    role: string;
    capabilities: string[];
    state: Record<string, any>;
}

export interface MessageContext {
    workflow?: WorkflowContext;
    priority: Priority;
    deadline?: Date;
    dependencies?: string[];
    retries?: number;
    maxRetries?: number;
    tags?: string[];
}

export interface EnhancedMessage extends Message {
    context: MessageContext;
    sender: AgentContext;
    receiver?: AgentContext;
    correlationId?: string;
    causationId?: string;
    metadata: Record<string, any>;
}

export type MessageHandler = (message: EnhancedMessage) => Promise<void>;

export interface MessageFilter {
    priority?: Priority[];
    roles?: string[];
    capabilities?: string[];
    tags?: string[];
    workflow?: string;
    stage?: string;
}

export interface MessageBus {
    subscribe(filter: MessageFilter, handler: MessageHandler): Promise<() => void>;
    publish(message: EnhancedMessage): Promise<void>;
    request(message: EnhancedMessage, timeout?: number): Promise<EnhancedMessage>;
    clear(): void;
    getStats(): { subscriptions: number; pendingRequests: number };
}

// Message type constants
export const MessageTypes = {
    // Actor system related
    ACTOR_STARTED: 'ACTOR_STARTED',
    ACTOR_STOPPED: 'ACTOR_STOPPED',
    ACTOR_ERROR: 'ACTOR_ERROR',
    ACTOR_SUPERVISION: 'ACTOR_SUPERVISION',

    // Task related
    TASK_ASSIGNED: 'TASK_ASSIGNED',
    TASK_STARTED: 'TASK_STARTED',
    TASK_COMPLETED: 'TASK_COMPLETED',
    TASK_FAILED: 'TASK_FAILED',

    // Knowledge related
    KNOWLEDGE_SHARED: 'KNOWLEDGE_SHARED',
    KNOWLEDGE_REQUESTED: 'KNOWLEDGE_REQUESTED',
    KNOWLEDGE_UPDATED: 'KNOWLEDGE_UPDATED',

    // Workflow related
    WORKFLOW_STARTED: 'WORKFLOW_STARTED',
    WORKFLOW_STAGE_CHANGED: 'WORKFLOW_STAGE_CHANGED',
    WORKFLOW_COMPLETED: 'WORKFLOW_COMPLETED',

    // Coordination related
    COORDINATION_REQUEST: 'COORDINATION_REQUEST',
    COORDINATION_RESPONSE: 'COORDINATION_RESPONSE',

    // System related
    SYSTEM_ERROR: 'SYSTEM_ERROR',
    SYSTEM_WARNING: 'SYSTEM_WARNING',
    SYSTEM_INFO: 'SYSTEM_INFO'
} as const;

export type MessageType = typeof MessageTypes[keyof typeof MessageTypes];

// Message payload types
export interface ActorPayload {
    actorId: string;
    type: 'start' | 'stop' | 'error' | 'supervise';
    error?: Error;
    supervisorAction?: 'restart' | 'stop' | 'escalate';
}

export interface TaskPayload {
    taskId: string;
    type: string;
    description: string;
    requirements: string[];
    deadline?: Date;
    priority: Priority;
    assignee?: string;
    status: 'pending' | 'in_progress' | 'completed' | 'failed';
    result?: any;
    error?: Error;
}

export interface KnowledgePayload {
    id: string;
    topic: string;
    content: any;
    metadata: {
        source: string;
        timestamp: number;
        confidence: number;
        tags: string[];
    };
}

export interface WorkflowPayload {
    workflowId: string;
    name: string;
    stage: WorkflowStage;
    data: any;
}

export interface CoordinationPayload {
    type: 'request' | 'response';
    action: string;
    data: any;
}

export interface SystemPayload {
    type: 'error' | 'warning' | 'info';
    code: string;
    message: string;
    details?: any;
}

export type MessagePayload =
    | ActorPayload
    | TaskPayload
    | KnowledgePayload
    | WorkflowPayload
    | CoordinationPayload
    | SystemPayload; 