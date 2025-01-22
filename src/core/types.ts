// Forward declarations to avoid circular dependencies
export type Actor = any;
export type ActorContext = any;

// Mailbox related interfaces
export interface MessageInvoker {
  invokeSystemMessage(msg: Message): Promise<void>;
  invokeUserMessage(msg: Message): Promise<void>;
}

export interface IMailbox {
  registerHandlers(invoker: MessageInvoker, dispatcher: MessageDispatcher): void;
  postUserMessage(message: Message): void;
  postSystemMessage(message: Message): void;
  start(): void;
  isSuspended(): boolean;
}

export interface MessageDispatcher {
  schedule(runner: () => Promise<void>): void;
}

export interface Message {
  type: string;
  payload?: any;
  sender?: PID;
}

export interface PID {
  id: string;
  address?: string;
}

export interface Props {
  actorClass: new (context: ActorContext) => Actor;
  mailboxType?: new () => IMailbox;
  supervisorStrategy?: SupervisorStrategy;
  initialBehavior?: string;
  dispatcher?: MessageDispatcher;
}

export enum SupervisorDirective {
  Resume,
  Restart,
  Stop,
  Escalate
}

export interface SupervisorStrategy {
  handleFailure(
    supervisor: ActorContext,
    child: PID,
    error: Error
  ): SupervisorDirective;
}

// Actor Lifecycle Events
export interface ActorLifecycleEvent {
  type: 'PreStart' | 'PostStop' | 'PreRestart' | 'PostRestart';
  actor: PID;
}

// Actor State Management
export interface ActorState {
  behavior: string;
  data: any;
} 