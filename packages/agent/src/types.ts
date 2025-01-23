import { Message, PID } from '@bactor/core';
import { 
  ArchitectureDesignAction,
  APIDesignAction,
  RequirementAnalysisAction,
  UserStoryCreationAction,
  Action
} from './interfaces/action_types';

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
  payload: AgentPayload;
}

export type AgentPayload = 
  | TaskPayload
  | ResultPayload
  | FeedbackPayload
  | CoordinationPayload
  | ErrorPayload;

export interface TaskPayload {
  type: 'TASK';
  action: ArchitectureDesignAction | APIDesignAction | RequirementAnalysisAction | UserStoryCreationAction;
}

export interface ResultPayload {
  actionId: string;
  result: any;
  metadata?: Record<string, any>;
}

export interface FeedbackPayload {
  targetId: string;
  feedback: string;
  suggestions?: string[];
  score?: number;
}

export interface CoordinationPayload {
  action: string;
  data: any;
}

export interface ErrorPayload {
  actionId: string;
  error: Error;
}

export interface TaskMessage extends AgentMessage {
  type: 'TASK';
  payload: TaskPayload;
}

export interface ResultMessage extends AgentMessage {
  type: 'RESULT';
  payload: ResultPayload;
}

export interface FeedbackMessage extends AgentMessage {
  type: 'FEEDBACK';
  payload: FeedbackPayload;
}

export interface CoordinationMessage extends AgentMessage {
  type: 'COORDINATION';
  payload: CoordinationPayload;
}

// Type guards
export function isTaskPayload(payload: AgentPayload): payload is TaskPayload {
  return 'type' in payload && payload.type === 'TASK' && 'action' in payload;
}

export function isResultPayload(payload: AgentPayload): payload is ResultPayload {
  return 'actionId' in payload && 'result' in payload;
}

export function isFeedbackPayload(payload: AgentPayload): payload is FeedbackPayload {
  return 'targetId' in payload && 'feedback' in payload;
}

export function isCoordinationPayload(payload: AgentPayload): payload is CoordinationPayload {
  return 'action' in payload && 'data' in payload;
}

export function isErrorPayload(payload: AgentPayload): payload is ErrorPayload {
  return 'actionId' in payload && 'error' in payload;
} 