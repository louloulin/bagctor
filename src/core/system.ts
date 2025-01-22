import { v4 as uuidv4 } from 'uuid';
import { Message, PID, Props, Actor } from './types';
import { ActorContext } from './context';

export class ActorSystem {
  private actors: Map<string, Actor> = new Map();
  private contexts: Map<string, ActorContext> = new Map();
  private deadLetters: Message[] = [];
  
  async spawn(props: Props): Promise<PID> {
    const pid: PID = { id: uuidv4() };
    const context = new ActorContext(pid, this, props.mailboxType, props.supervisorStrategy);
    const actor = new props.actorClass(context);
    
    this.actors.set(pid.id, actor);
    this.contexts.set(pid.id, context);
    
    try {
      await actor.preStart();
    } catch (error) {
      await this.handlePreStartError(pid, error as Error);
      throw error;
    }
    
    return pid;
  }

  async send(pid: PID, message: Message): Promise<void> {
    const actor = this.actors.get(pid.id);
    if (actor) {
      try {
        await actor.receive(message);
      } catch (error) {
        await this.handleActorError(pid, error as Error);
      }
    } else {
      this.deadLetters.push(message);
    }
  }

  async stop(pid: PID): Promise<void> {
    const actor = this.actors.get(pid.id);
    const context = this.contexts.get(pid.id);
    
    if (actor && context) {
      try {
        await context.stopAll(); // Stop all children first
        await actor.postStop();
      } finally {
        this.actors.delete(pid.id);
        this.contexts.delete(pid.id);
      }
    }
  }

  async restart(pid: PID, reason: Error): Promise<void> {
    const actor = this.actors.get(pid.id);
    if (actor) {
      try {
        await actor.preRestart(reason);
        await actor.postRestart(reason);
      } catch (error) {
        await this.handleActorError(pid, error as Error);
      }
    }
  }

  private async handlePreStartError(pid: PID, error: Error): Promise<void> {
    const context = this.contexts.get(pid.id);
    if (context) {
      await context.handleFailure(pid, error);
    }
  }

  private async handleActorError(pid: PID, error: Error): Promise<void> {
    const context = this.contexts.get(pid.id);
    if (context) {
      await context.handleFailure(pid, error);
    }
  }

  getActor(actorId: string): Actor | undefined {
    return this.actors.get(actorId);
  }
} 