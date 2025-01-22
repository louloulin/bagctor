import { Message, PID, Props, IMailbox, ActorContext as IActorContext, SupervisorStrategy, SupervisorDirective } from './types';
import { DefaultMailbox } from './mailbox';
import { ActorSystem } from './system';

export class ActorContext implements IActorContext {
  private mailbox: IMailbox;
  private children: Map<string, PID> = new Map();
  private parent?: PID;
  private supervisorStrategy?: SupervisorStrategy;
  
  constructor(
    private pid: PID,
    private system: ActorSystem,
    mailboxType?: new () => IMailbox,
    supervisorStrategy?: SupervisorStrategy
  ) {
    this.mailbox = mailboxType ? new mailboxType() : new DefaultMailbox();
    this.supervisorStrategy = supervisorStrategy;
  }

  getPID(): PID {
    return this.pid;
  }

  getParent(): PID | undefined {
    return this.parent;
  }

  setParent(pid: PID): void {
    this.parent = pid;
  }

  async send(target: PID, message: Message): Promise<void> {
    await this.system.send(target, {
      ...message,
      sender: this.pid
    });
  }

  async spawn(props: Props): Promise<PID> {
    const child = await this.system.spawn({
      ...props,
      supervisorStrategy: props.supervisorStrategy || this.supervisorStrategy
    });
    this.children.set(child.id, child);
    return child;
  }

  async stop(pid: PID): Promise<void> {
    await this.system.stop(pid);
    this.children.delete(pid.id);
  }

  async stopAll(): Promise<void> {
    for (const child of this.children.values()) {
      await this.stop(child);
    }
  }

  async handleFailure(child: PID, error: Error): Promise<void> {
    if (this.supervisorStrategy) {
      const directive = this.supervisorStrategy.handleFailure(this, child, error);
      await this.handleSupervisorDirective(child, directive, error);
    } else if (this.parent) {
      // Escalate to parent if no supervisor strategy
      await this.system.send(this.parent, {
        type: '$system.failure',
        payload: { child, error }
      });
    }
  }

  private async handleSupervisorDirective(
    child: PID,
    directive: SupervisorDirective,
    error: Error
  ): Promise<void> {
    switch (directive) {
      case SupervisorDirective.Resume:
        // Do nothing, let the actor continue
        break;
      case SupervisorDirective.Restart:
        await this.system.restart(child, error);
        break;
      case SupervisorDirective.Stop:
        await this.stop(child);
        break;
      case SupervisorDirective.Escalate:
        if (this.parent) {
          await this.system.send(this.parent, {
            type: '$system.failure',
            payload: { child, error }
          });
        }
        break;
    }
  }
} 