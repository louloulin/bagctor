import { RoleAgent } from './role_agent';
import { ActorContext } from '@bactor/core';
import { AgentMessage, AgentConfig } from '../types';
import { Action } from '../interfaces/action_types';

export interface AssistantConfig extends AgentConfig {
  role: 'assistant';
  capabilities: string[];
  parameters: {
    responseStyle: 'concise' | 'detailed';
    expertise: string[];
    contextMemory: number;
  };
}

export class AssistantAgent extends RoleAgent {
  private config: AssistantConfig;

  constructor(context: ActorContext, config: AssistantConfig) {
    super(context, config);
    this.config = config;
  }

  protected async processTask(action: Action): Promise<any> {
    switch (action.type) {
      case 'PROCESS_MESSAGE':
        return this.handleMessage(action);
      case 'DELEGATE_TASK':
        return this.delegateTask(action);
      case 'RETRIEVE_DOCS':
        return this.retrieveDocs(action);
      default:
        throw new Error(`Unsupported task type: ${action.type}`);
    }
  }

  protected async processCoordination(action: string, data: any): Promise<any> {
    switch (action) {
      case 'UPDATE_CONTEXT':
        return this.updateContext(data);
      default:
        throw new Error(`Unknown coordination action: ${action}`);
    }
  }

  private async handleMessage(action: Action): Promise<any> {
    if (!action.metadata?.message) {
      throw new Error('Invalid message format: missing message content');
    }

    const { message, context } = action.metadata;
    const { responseStyle, expertise } = this.config.parameters;

    // Generate response based on message and context
    const response = {
      reply: `Here's a ${responseStyle} response about ${message} using ${expertise.join(', ')}`,
      suggestions: [
        'Consider using TypeScript for type safety',
        'Follow React best practices',
        'Add proper error handling'
      ],
      codeSnippets: [
        {
          language: 'typescript',
          code: `
function ExampleComponent({ prop }: { prop: string }) {
  return <div>{prop}</div>;
}
          `
        }
      ]
    };

    return response;
  }

  private async delegateTask(action: Action): Promise<any> {
    if (!action.metadata?.task) {
      throw new Error('Invalid task format: missing task specification');
    }

    const { task } = action.metadata;
    return {
      delegatedTo: 'skill_agent',
      taskId: `${task.type}-${Date.now()}`,
      status: 'delegated'
    };
  }

  private async retrieveDocs(action: Action): Promise<any> {
    if (!action.metadata?.query) {
      throw new Error('Invalid docs request: missing query');
    }

    const { query, filters } = action.metadata;
    return {
      documents: [
        {
          title: 'React Hooks Overview',
          content: 'Hooks are a new addition in React 16.8...',
          relevance: 0.95
        },
        {
          title: 'Component Lifecycle',
          content: 'Understanding component lifecycle is crucial...',
          relevance: 0.85
        }
      ],
      totalResults: 2,
      searchMetadata: {
        query,
        filters,
        timestamp: Date.now()
      }
    };
  }

  private async updateContext(data: any): Promise<any> {
    // Update conversation context
    return {
      status: 'success',
      updatedContext: {
        ...data,
        lastUpdated: Date.now()
      }
    };
  }
} 