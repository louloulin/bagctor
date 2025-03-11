/**
 * Core Types for Bactor Agent System
 */

// LLM Service Types
export interface LLMModel {
    provider: string;
    name: string;
    apiKey?: string;
    endpoint?: string;
    options?: Record<string, any>;
}

export interface Message {
    role: 'system' | 'user' | 'assistant' | 'function' | 'tool';
    content: string;
    name?: string;
}

export interface CompleteParams {
    messages: Message[];
    tools?: ToolDefinition[];
    temperature?: number;
    maxTokens?: number;
    stopSequences?: string[];
    options?: Record<string, any>;
}

export interface CompleteResponse {
    text: string;
    toolCalls?: ToolCall[];
    usage?: {
        promptTokens: number;
        completionTokens: number;
        totalTokens: number;
    };
}

export interface StreamOptions {
    temperature?: number;
    maxTokens?: number;
    stopSequences?: string[];
}

export interface ChatOptions extends StreamOptions {
    tools?: ToolDefinition[];
}

// Tool Types
export interface ToolDefinition {
    type: 'function';
    function: {
        name: string;
        description: string;
        parameters: Record<string, any>;
    };
}

export interface ToolCall {
    id: string;
    type: 'function';
    function: {
        name: string;
        arguments: string;
    };
}

export interface ParameterDefinition {
    type: 'string' | 'number' | 'boolean' | 'array' | 'object';
    description: string;
    required: boolean;
    enum?: any[];
}

// Memory Types
export interface MemoryEntry {
    id: string;
    role: 'user' | 'assistant' | 'system' | 'function' | 'tool';
    content: string;
    timestamp: number;
    metadata?: Record<string, any>;
}

export interface RetrieveOptions {
    limit?: number;
    recency?: boolean;
    similarityThreshold?: number;
    filter?: (entry: MemoryEntry) => boolean;
}

// Workflow Types
export interface WorkflowStepConfig {
    id: string;
    execute: (context: StepContext) => Promise<any>;
    description?: string;
    timeout?: number;
    retries?: number;
}

export interface StepContext {
    steps: Record<string, StepState>;
    triggerData: any;
    workflowId?: string;
    parentStepId?: string;
}

export interface StepState {
    status: 'pending' | 'running' | 'success' | 'error';
    output?: any;
    error?: string;
    startTime?: number;
    endTime?: number;
}

export interface WorkflowResult {
    status: 'pending' | 'running' | 'completed' | 'failed';
    steps: Record<string, StepState>;
    output: Record<string, any>;
}

// Performance Optimization Types
export interface CacheConfig {
    enabled: boolean;
    ttl: number; // Time to live in milliseconds
    maxSize?: number; // Maximum number of entries
}

export interface BatchConfig {
    enabled: boolean;
    maxSize: number; // Maximum batch size
    maxDelay: number; // Maximum delay in milliseconds
}

export interface PerformanceConfig {
    cache?: CacheConfig;
    batch?: BatchConfig;
    concurrency?: number; // Maximum number of concurrent operations
}
