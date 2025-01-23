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
    // Process task based on assistant capabilities
    const response = await this.generateResponse(action);
    return response;
  }

  protected async processCoordination(action: string, data: any): Promise<any> {
    // Process coordination based on assistant capabilities
    const response = await this.coordinateAssistance(action, data);
    return response;
  }

  private async generateResponse(action: Action): Promise<any> {
    // Generate response based on assistant configuration
    const { responseStyle, expertise } = this.config.parameters;
    
    return {
      style: responseStyle,
      expertise: expertise,
      response: `Generated ${responseStyle} response for action ${action.type} using ${expertise.join(', ')}`
    };
  }

  private async coordinateAssistance(action: string, data: any): Promise<any> {
    // Coordinate assistance with other agents
    return {
      action,
      status: 'coordinated',
      response: `Coordinated assistance for ${action}`
    };
  }
} 