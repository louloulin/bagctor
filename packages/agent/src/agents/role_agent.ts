import { BaseAgent } from '../base_agent';
import { ActorContext, Message } from '@bactor/core';
import { AgentMessage, AgentConfig, isTaskPayload, isCoordinationPayload } from '../types';

export abstract class RoleAgent extends BaseAgent {
  constructor(context: ActorContext, config: AgentConfig) {
    super(context, config);
  }

  protected behaviors(): void {
    // Add role-specific behavior
    this.addBehavior('role_behavior', async (message: Message) => {
      const agentMessage = message as AgentMessage;
      if (isTaskPayload(agentMessage.payload)) {
        await this.handleTask(agentMessage);
      }
    });

    // Add coordination behavior
    this.addBehavior('coordination', async (message: Message) => {
      const agentMessage = message as AgentMessage;
      if (isCoordinationPayload(agentMessage.payload)) {
        await this.handleCoordination(agentMessage);
      }
    });
  }

  protected async handleTask(message: AgentMessage): Promise<void> {
    if (!isTaskPayload(message.payload)) return;
    
    try {
      // Process the task based on role
      const result = await this.processTask(message.payload.action);

      await this.tell(message.sender, {
        type: 'RESULT',
        sender: this.agentContext.self,
        timestamp: Date.now(),
        payload: {
          actionId: message.payload.action.id,
          result
        }
      });

    } catch (error) {
      await this.tell(message.sender, {
        type: 'ERROR',
        sender: this.agentContext.self,
        timestamp: Date.now(),
        payload: {
          actionId: message.payload.action.id,
          error: error instanceof Error ? error : new Error(String(error))
        }
      });
    }
  }

  protected async handleResult(message: AgentMessage): Promise<void> {
    // Default implementation
  }

  protected async handleFeedback(message: AgentMessage): Promise<void> {
    // Default implementation
  }

  protected async handleCoordination(message: AgentMessage): Promise<void> {
    if (!isCoordinationPayload(message.payload)) return;
    const { action, data } = message.payload;

    try {
      // Handle coordination action
      const result = await this.processCoordination(action, data);

      await this.tell(message.sender, {
        type: 'RESULT',
        sender: this.agentContext.self,
        timestamp: Date.now(),
        payload: {
          actionId: data.id,
          result
        }
      });

    } catch (error) {
      await this.tell(message.sender, {
        type: 'ERROR',
        sender: this.agentContext.self,
        timestamp: Date.now(),
        payload: {
          actionId: data.id,
          error: error instanceof Error ? error : new Error(String(error))
        }
      });
    }
  }

  protected abstract processTask(action: any): Promise<any>;

  protected async processCoordination(action: string, data: any): Promise<any> {
    // Default implementation - should be overridden by specific role agents
    throw new Error('processCoordination must be implemented by role agent');
  }
} 