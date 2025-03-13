import { PID, Message } from '@bactor/common';

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

// Re-export Message and PID from common
export { Message, PID };

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

// Concrete implementation for runtime use
export const Props = {
  create: (options: Partial<Props> = {}): Props => {
    return {
      ...options
    };
  }
};

export enum SupervisorDirective {
  Resume,
  Restart,
  Stop,
  Escalate
}

export type SupervisorStrategy = any;

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