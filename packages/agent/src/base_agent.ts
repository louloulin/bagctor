import { Actor, ActorContext, Message, PID } from '@bactor/core';
import { AgentMessage, AgentConfig, AgentContext } from './types';

export abstract class BaseAgent extends Actor {
  protected agentContext: AgentContext;

  constructor(context: ActorContext, config: AgentConfig) {
    super(context);
    this.agentContext = {
      self: context.self,
      memory: {
        shortTerm: new Map(),
        longTerm: new Map()
      },
      config
    };
  }

  protected behaviors(): void {
    // Add base behaviors
    this.addBehavior('task', async (message: Message) => {
      const agentMessage = message as AgentMessage;
      if (agentMessage.type === 'TASK') {
        await this.handleTask(agentMessage);
      }
    });

    this.addBehavior('result', async (message: Message) => {
      const agentMessage = message as AgentMessage;
      if (agentMessage.type === 'RESULT') {
        await this.handleResult(agentMessage);
      }
    });

    this.addBehavior('feedback', async (message: Message) => {
      const agentMessage = message as AgentMessage;
      if (agentMessage.type === 'FEEDBACK') {
        await this.handleFeedback(agentMessage);
      }
    });

    this.addBehavior('coordination', async (message: Message) => {
      const agentMessage = message as AgentMessage;
      if (agentMessage.type === 'COORDINATION') {
        await this.handleCoordination(agentMessage);
      }
    });
  }

  protected async tell(recipient: PID, message: AgentMessage): Promise<void> {
    await this.context.tell(recipient, message);
  }

  protected async handleError(error: unknown): Promise<void> {
    const errorMessage = error instanceof Error ? error : new Error(String(error));
    await this.tell(this.context.self, {
      type: 'ERROR',
      sender: this.context.self,
      timestamp: Date.now(),
      payload: {
        actionId: 'error',
        error: errorMessage
      }
    });
  }

  protected abstract handleTask(message: AgentMessage): Promise<void>;
  protected abstract handleResult(message: AgentMessage): Promise<void>;
  protected abstract handleFeedback(message: AgentMessage): Promise<void>;
  protected abstract handleCoordination(message: AgentMessage): Promise<void>;

  // Helper methods for memory management
  protected async remember(key: string, value: any, longTerm: boolean = false): Promise<void> {
    const storage = longTerm ? this.agentContext.memory.longTerm : this.agentContext.memory.shortTerm;
    storage.set(key, value);
  }

  protected recall(key: string, longTerm: boolean = false): any {
    const storage = longTerm ? this.agentContext.memory.longTerm : this.agentContext.memory.shortTerm;
    return storage.get(key);
  }

  protected forget(key: string, longTerm: boolean = false): boolean {
    const storage = longTerm ? this.agentContext.memory.longTerm : this.agentContext.memory.shortTerm;
    return storage.delete(key);
  }
} 