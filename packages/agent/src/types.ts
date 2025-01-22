import { Message, PID } from '@bactor/core';

export interface AgentConfig {
  role: string;
  capabilities: string[];
  model?: string;
  parameters?: Record<string, any>;
}

export interface AgentContext {
  self: PID;
  memory: AgentMemory;
  config: AgentConfig;
}

export interface AgentMemory {
  shortTerm: Map<string, any>;
  longTerm: Map<string, any>;
}

export type MessageType = 
  | 'TASK'
  | 'RESULT'
  | 'FEEDBACK'
  | 'COORDINATION'
  | 'ERROR';

export interface AgentMessage extends Message {
  type: MessageType;
  sender: PID;
  timestamp: number;
  payload: any;
}

export interface TaskMessage extends AgentMessage {
  type: 'TASK';
  payload: {
    description: string;
    requirements: string[];
    context?: any;
    deadline?: number;
  };
}

export interface ResultMessage extends AgentMessage {
  type: 'RESULT';
  payload: {
    taskId: string;
    result: any;
    metadata?: Record<string, any>;
  };
}

export interface FeedbackMessage extends AgentMessage {
  type: 'FEEDBACK';
  payload: {
    targetId: string;
    feedback: string;
    suggestions?: string[];
    score?: number;
  };
}

export interface CoordinationMessage extends AgentMessage {
  type: 'COORDINATION';
  payload: {
    action: string;
    data: any;
  };
} 