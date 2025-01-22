import { Actor, ActorContext, Message, PID } from '@bactor/core';
import { AgentConfig, AgentContext, AgentMemory, AgentMessage } from './types';

export abstract class BaseAgent extends Actor {
  protected agentContext: AgentContext;
  protected memory: AgentMemory;

  constructor(context: ActorContext, config: AgentConfig) {
    super(context);
    this.memory = {
      shortTerm: new Map(),
      longTerm: new Map()
    };
    this.agentContext = {
      self: context.self,
      memory: this.memory,
      config
    };
  }

  protected initializeBehaviors(): void {
    this.addBehavior('default', async (message: Message) => {
      const agentMessage = message.payload as AgentMessage;
      
      try {
        switch (agentMessage.type) {
          case 'TASK':
            await this.handleTask(agentMessage);
            break;
          case 'RESULT':
            await this.handleResult(agentMessage);
            break;
          case 'FEEDBACK':
            await this.handleFeedback(agentMessage);
            break;
          case 'COORDINATION':
            await this.handleCoordination(agentMessage);
            break;
          case 'ERROR':
            await this.handleError(agentMessage);
            break;
          default:
            throw new Error(`Unknown message type: ${agentMessage.type}`);
        }
      } catch (error) {
        await this.handleError({
          type: 'ERROR',
          sender: this.agentContext.self,
          timestamp: Date.now(),
          payload: error
        });
      }
    });
  }

  // Abstract methods to be implemented by specific agents
  protected abstract handleTask(message: AgentMessage): Promise<void>;
  protected abstract handleResult(message: AgentMessage): Promise<void>;
  protected abstract handleFeedback(message: AgentMessage): Promise<void>;
  protected abstract handleCoordination(message: AgentMessage): Promise<void>;
  
  // Common error handling that can be overridden
  protected async handleError(message: AgentMessage): Promise<void> {
    console.error('Agent error:', message.payload);
    // Notify supervisor or take recovery action
  }

  // Helper methods for memory management
  protected async remember(key: string, value: any, longTerm: boolean = false): Promise<void> {
    const storage = longTerm ? this.memory.longTerm : this.memory.shortTerm;
    storage.set(key, value);
  }

  protected recall(key: string, longTerm: boolean = false): any {
    const storage = longTerm ? this.memory.longTerm : this.memory.shortTerm;
    return storage.get(key);
  }

  protected forget(key: string, longTerm: boolean = false): boolean {
    const storage = longTerm ? this.memory.longTerm : this.memory.shortTerm;
    return storage.delete(key);
  }

  // Helper method to send messages to other agents
  protected async tell(targetId: string | PID, message: AgentMessage): Promise<void> {
    const pid = typeof targetId === 'string' ? { id: targetId } : targetId;
    await this.send(pid, message);
  }
} 