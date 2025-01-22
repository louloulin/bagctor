import { Message, IMailbox, MessageInvoker, MessageDispatcher } from './types';
import fastq from 'fastq';
import type { queueAsPromised } from 'fastq';

const CONCURRENCY = 1; // Set to 1 to ensure strict message ordering

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
  private processing: boolean = false;

  constructor() {
    this.systemMailbox = fastq.promise(this.processMessage.bind(this), 1);
    this.userMailbox = fastq.promise(this.processMessage.bind(this), 1);
  }

  registerHandlers(invoker: MessageInvoker, dispatcher: MessageDispatcher): void {
    this.invoker = invoker;
    this.dispatcher = dispatcher;
    this.scheduleProcessing();
  }

  postSystemMessage(message: Message): void {
    const queuedMessage = { ...message, isSystem: true };
    this.systemMailbox.push(queuedMessage);
    this.scheduleProcessing();
  }

  postUserMessage(message: Message): void {
    if (!this.suspended) {
      const queuedMessage = { ...message, isSystem: false };
      this.userMailbox.push(queuedMessage);
      this.scheduleProcessing();
    }
  }

  private scheduleProcessing(): void {
    if (!this.processing && this.dispatcher) {
      this.processing = true;
      this.dispatcher.schedule(async () => {
        try {
          // Process all system messages first
          if (this.systemMailbox.length() > 0) {
            await this.systemMailbox.drain();
          }

          // Then process user messages if not suspended
          if (!this.suspended) {
            if (this.userMailbox.length() > 0) {
              await this.userMailbox.drain();
            }
          }
        } finally {
          this.processing = false;
          // Schedule next processing if there are more messages
          if (await this.hasMessages()) {
            this.scheduleProcessing();
          }
        }
      });
    }
  }

  private async processMessage(message: QueuedMessage): Promise<void> {
    if (!this.invoker || !this.dispatcher || (this.suspended && !message.isSystem)) {
      return;
    }

    try {
      this.currentMessage = message;
      const { isSystem, ...cleanMessage } = message;
      if (message.isSystem) {
        await this.invoker.invokeSystemMessage(cleanMessage);
      } else {
        await this.invoker.invokeUserMessage(cleanMessage);
      }
    } finally {
      this.currentMessage = undefined;
    }
  }

  start(): void {
    this.scheduleProcessing();
  }
  
  suspend(): void { 
    this.suspended = true; 
  }
  
  resume(): void { 
    this.suspended = false;
    this.scheduleProcessing();
  }
  
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
  private processing: boolean = false;

  constructor() {
    this.systemMailbox = fastq.promise(this.processMessage.bind(this), 1);
    this.highPriorityMailbox = fastq.promise(this.processMessage.bind(this), 1);
    this.normalPriorityMailbox = fastq.promise(this.processMessage.bind(this), 1);
    this.lowPriorityMailbox = fastq.promise(this.processMessage.bind(this), 1);
  }

  registerHandlers(invoker: MessageInvoker, dispatcher: MessageDispatcher): void {
    this.invoker = invoker;
    this.dispatcher = dispatcher;
    this.scheduleProcessing();
  }

  postSystemMessage(message: Message): void {
    const queuedMessage = { ...message, isSystem: true };
    this.systemMailbox.push(queuedMessage);
    this.scheduleProcessing();
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
      this.scheduleProcessing();
    }
  }

  private scheduleProcessing(): void {
    if (!this.processing && this.dispatcher) {
      this.processing = true;
      this.dispatcher.schedule(async () => {
        try {
          // Process all system messages first
          if (this.systemMailbox.length() > 0) {
            await this.systemMailbox.drain();
          }

          // Then process user messages if not suspended
          if (!this.suspended) {
            if (this.highPriorityMailbox.length() > 0) {
              await this.highPriorityMailbox.drain();
            }
            if (this.normalPriorityMailbox.length() > 0) {
              await this.normalPriorityMailbox.drain();
            }
            if (this.lowPriorityMailbox.length() > 0) {
              await this.lowPriorityMailbox.drain();
            }
          }
        } finally {
          this.processing = false;
          // Schedule next processing if there are more messages
          if (await this.hasMessages()) {
            this.scheduleProcessing();
          }
        }
      });
    }
  }

  private async processMessage(message: QueuedMessage): Promise<void> {
    if (!this.invoker || !this.dispatcher || (this.suspended && !message.isSystem)) {
      return;
    }

    try {
      this.currentMessage = message;
      const { isSystem, ...cleanMessage } = message;
      if (message.isSystem) {
        await this.invoker.invokeSystemMessage(cleanMessage);
      } else {
        await this.invoker.invokeUserMessage(cleanMessage);
      }
    } finally {
      this.currentMessage = undefined;
    }
  }

  start(): void {
    this.scheduleProcessing();
  }
  
  suspend(): void { 
    this.suspended = true; 
  }
  
  resume(): void { 
    this.suspended = false;
    this.scheduleProcessing();
  }
  
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