import { Message } from '@bactor/core';
import { AgentConfig } from '../types';

export interface AgentMessage extends Message {
  timestamp: number;
}

export type Priority = 'high' | 'medium' | 'low';

export interface UserStory {
  id: string;
  title: string;
  description: string;
  priority: Priority;
  acceptanceCriteria: string[];
  dependencies?: string[];
}

export interface RequirementAnalysis {
  userStories: UserStory[];
  marketAnalysis: {
    competitors: string[];
    uniqueSellingPoints: string[];
    targetUsers: string[];
  };
  feasibilityAnalysis: {
    technicalRisks: string[];
    resourceRequirements: string[];
    timeline: string;
  };
}

export interface ProductManagerConfig extends AgentConfig {
  role: 'product_manager';
  capabilities: [
    'requirement_analysis',
    'user_story_creation',
    'market_research',
    'feature_prioritization'
  ];
  parameters: {
    analysisDepth: 'basic' | 'detailed' | 'comprehensive';
    marketFocus: string[];
    prioritizationCriteria: string[];
  };
}

export type ActionStatus = 
  | 'PENDING'
  | 'IN_PROGRESS'
  | 'BLOCKED'
  | 'COMPLETED'
  | 'FAILED';

export interface ActionContext {
  role: string;
  dependencies: string[];
  resources: string[];
  constraints: string[];
  deadline?: Date;
}

export interface Action {
  id: string;
  type: ActionType;
  status: ActionStatus;
  priority: Priority;
  context: ActionContext;
  metadata: Record<string, any>;
  error?: Error;
}

export type ActionType = 
  | 'ANALYZE_REQUIREMENT'
  | 'CREATE_USER_STORY'
  | 'DESIGN_ARCHITECTURE'
  | 'DESIGN_API'
  | 'IMPLEMENT_FEATURE'
  | 'WRITE_TEST'
  | 'REVIEW_CODE'
  | 'UPDATE_DOCUMENT'
  | 'TRACK_PROGRESS'
  | 'MANAGE_RISK';

export interface RequirementAnalysisAction extends Action {
  type: 'ANALYZE_REQUIREMENT';
  input: {
    rawRequirement: string;
    context: string;
    constraints: string[];
  };
  output?: RequirementAnalysis;
}

export interface UserStoryCreationAction extends Action {
  type: 'CREATE_USER_STORY';
  input: {
    requirement: RequirementAnalysis;
    scope: string;
  };
  output?: UserStory[];
}

export interface SystemDesign {
  architecture: {
    components: {
      name: string;
      responsibility: string;
      dependencies: string[];
      apis: APISpec[];
    }[];
    dataFlow: string; // Mermaid diagram
    deployment: string; // Mermaid diagram
  };
  dataStructures: {
    name: string;
    fields: {
      name: string;
      type: string;
      description: string;
    }[];
    relationships: string[]; // Mermaid ER diagram
  }[];
  apis: APISpec[];
}

export interface APISpec {
  endpoint: string;
  method: 'GET' | 'POST' | 'PUT' | 'DELETE';
  parameters: {
    name: string;
    type: string;
    required: boolean;
    description: string;
  }[];
  responses: {
    status: number;
    description: string;
    schema: any;
  }[];
}

export interface ArchitectConfig extends AgentConfig {
  role: 'architect';
  capabilities: [
    'system_design',
    'api_design',
    'data_modeling',
    'security_planning'
  ];
  parameters: {
    architectureStyle: 'microservices' | 'monolithic' | 'serverless';
    securityLevel: 'basic' | 'advanced' | 'enterprise';
    scalabilityRequirements: string[];
  };
}

export interface ArchitectureDesignAction extends Action {
  type: 'DESIGN_ARCHITECTURE';
  input: {
    requirements: RequirementAnalysis;
    userStories: UserStory[];
    constraints: string[];
  };
  output?: SystemDesign;
}

export interface APIDesignAction extends Action {
  type: 'DESIGN_API';
  input: {
    systemDesign: SystemDesign;
    requirements: string[];
  };
  output?: APISpec[];
} 