import { Message, PID, Props, ActorContext, ActorState } from './types';

export abstract class Actor {
  public context: ActorContext;
  protected state: ActorState;
  private behaviorMap: Map<string, (message: Message) => Promise<void>> = new Map();
  
  constructor(context: ActorContext) {
    this.context = context;
    this.state = {
      behavior: 'default',
      data: {}
    };
    this.initialize();
  }

  protected abstract behaviors(): void

  protected initialize(): void {
    this.behaviors();
  }

  protected addBehavior(name: string, handler: (message: Message) => Promise<void>): void {
    this.behaviorMap.set(name, handler);
  }

  protected become(behavior: string): void {
    if (this.behaviorMap.has(behavior)) {
      this.state.behavior = behavior;
    } else {
      throw new Error(`Behavior ${behavior} not found`);
    }
  }

  async receive(message: Message): Promise<void> {
    const behavior = this.behaviorMap.get(this.state.behavior);
    if (behavior) {
      await behavior.call(this, message);
    } else {
      throw new Error(`No behavior found for ${this.state.behavior}`);
    }
  }

  protected async send(target: PID, message: Message): Promise<void> {
    await this.context.send(target, message);
  }

  protected async spawn(props: Props): Promise<PID> {
    return await this.context.spawn(props);
  }

  // Lifecycle hooks
  async preStart(): Promise<void> {
    // Initialize actor state
  }

  async postStop(): Promise<void> {
    // Cleanup actor state
  }

  async preRestart(reason: Error): Promise<void> {
    await this.postStop();
  }

  async postRestart(reason: Error): Promise<void> {
    await this.preStart();
  }

  // State management
  protected setState(data: any): void {
    this.state.data = data;
  }

  protected getState(): any {
    return this.state.data;
  }
} 