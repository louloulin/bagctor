import { Message, IMailbox, MessageInvoker, MessageDispatcher } from './types';
import fastq from 'fastq';
import type { queueAsPromised } from 'fastq';

const CONCURRENCY = 4; // Number of concurrent workers per queue

interface QueuedMessage extends Message {
  isSystem?: boolean;
}

export class DefaultMailbox implements IMailbox {
  private systemMailbox: queueAsPromised<QueuedMessage>;
  private userMailbox: queueAsPromised<QueuedMessage>;
  private currentMessage?: Message;
  private suspended: boolean = false;
  private invoker?: MessageInvoker;
  private dispatcher?: MessageDispatcher;

  constructor() {
    this.systemMailbox = fastq.promise(this.processMessage.bind(this), CONCURRENCY);
    this.userMailbox = fastq.promise(this.processMessage.bind(this), CONCURRENCY);
  }

  registerHandlers(invoker: MessageInvoker, dispatcher: MessageDispatcher): void {
    this.invoker = invoker;
    this.dispatcher = dispatcher;
  }

  postSystemMessage(message: Message): void {
    const queuedMessage = { ...message, isSystem: true };
    this.systemMailbox.push(queuedMessage);
  }

  postUserMessage(message: Message): void {
    if (!this.suspended) {
      const queuedMessage = { ...message, isSystem: false };
      this.userMailbox.push(queuedMessage);
    }
  }

  private async processMessage(message: QueuedMessage): Promise<void> {
    if (!this.invoker || !this.dispatcher || (this.suspended && !message.isSystem)) {
      return;
    }

    try {
      this.currentMessage = message;
      if (message.isSystem) {
        await this.invoker.invokeSystemMessage(message);
      } else {
        await this.invoker.invokeUserMessage(message);
      }
    } finally {
      this.currentMessage = undefined;
    }
  }

  start(): void {}
  suspend(): void { this.suspended = true; }
  resume(): void { this.suspended = false; }
  isSuspended(): boolean { return this.suspended; }
  getCurrentMessage(): Message | undefined { return this.currentMessage; }

  async hasMessages(): Promise<boolean> {
    return this.systemMailbox.length() > 0 || this.userMailbox.length() > 0;
  }

  async getQueueSizes(): Promise<{ system: number; high: number; normal: number; low: number; }> {
    return {
      system: this.systemMailbox.length(),
      high: 0,
      normal: this.userMailbox.length(),
      low: 0
    };
  }
}

export class PriorityMailbox implements IMailbox {
  private systemMailbox: queueAsPromised<QueuedMessage>;
  private highPriorityMailbox: queueAsPromised<QueuedMessage>;
  private normalPriorityMailbox: queueAsPromised<QueuedMessage>;
  private lowPriorityMailbox: queueAsPromised<QueuedMessage>;
  private currentMessage?: Message;
  private suspended: boolean = false;
  private invoker?: MessageInvoker;
  private dispatcher?: MessageDispatcher;

  constructor() {
    this.systemMailbox = fastq.promise(this.processMessage.bind(this), CONCURRENCY);
    this.highPriorityMailbox = fastq.promise(this.processMessage.bind(this), CONCURRENCY);
    this.normalPriorityMailbox = fastq.promise(this.processMessage.bind(this), CONCURRENCY);
    this.lowPriorityMailbox = fastq.promise(this.processMessage.bind(this), CONCURRENCY);
  }

  registerHandlers(invoker: MessageInvoker, dispatcher: MessageDispatcher): void {
    this.invoker = invoker;
    this.dispatcher = dispatcher;
  }

  postSystemMessage(message: Message): void {
    const queuedMessage = { ...message, isSystem: true };
    this.systemMailbox.push(queuedMessage);
  }

  postUserMessage(message: Message): void {
    if (!this.suspended) {
      const queuedMessage = { ...message, isSystem: false };
      if (message.type.startsWith('$priority.high')) {
        this.highPriorityMailbox.push(queuedMessage);
      } else if (message.type.startsWith('$priority.low')) {
        this.lowPriorityMailbox.push(queuedMessage);
      } else {
        this.normalPriorityMailbox.push(queuedMessage);
      }
    }
  }

  private async processMessage(message: QueuedMessage): Promise<void> {
    if (!this.invoker || !this.dispatcher || (this.suspended && !message.isSystem)) {
      return;
    }

    try {
      this.currentMessage = message;
      if (message.isSystem) {
        await this.invoker.invokeSystemMessage(message);
      } else {
        await this.invoker.invokeUserMessage(message);
      }
    } finally {
      this.currentMessage = undefined;
    }
  }

  start(): void {}
  suspend(): void { this.suspended = true; }
  resume(): void { this.suspended = false; }
  isSuspended(): boolean { return this.suspended; }
  getCurrentMessage(): Message | undefined { return this.currentMessage; }

  async hasMessages(): Promise<boolean> {
    return (
      this.systemMailbox.length() > 0 ||
      this.highPriorityMailbox.length() > 0 ||
      this.normalPriorityMailbox.length() > 0 ||
      this.lowPriorityMailbox.length() > 0
    );
  }

  async getQueueSizes(): Promise<{ system: number; high: number; normal: number; low: number; }> {
    return {
      system: this.systemMailbox.length(),
      high: this.highPriorityMailbox.length(),
      normal: this.normalPriorityMailbox.length(),
      low: this.lowPriorityMailbox.length()
    };
  }
} 