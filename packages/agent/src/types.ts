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