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
  // Additional properties for router messages
  index?: number;
  content?: string;
  routee?: PID;
}

export interface PID {
  id: string;
  address?: string;  // Format: "host:port", e.g., "localhost:50051"
}

export interface Props {
  // Class-based actor
  actorClass?: new (context: ActorContext) => Actor;
  // Function-based actor
  producer?: (context: ActorContext) => Actor;
  // Optional configuration
  mailboxType?: new () => IMailbox;
  supervisorStrategy?: SupervisorStrategy;
  dispatcher?: MessageDispatcher;
  address?: string;
  actorContext?: any;
}

export enum SupervisorDirective {
  Resume,
  Restart,
  Stop,
  Escalate
}

export interface SupervisorStrategy {
  handleFailure(supervisor: ActorContext, child: any, error: Error): SupervisorDirective;
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