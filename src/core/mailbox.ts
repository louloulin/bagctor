import { Message, IMailbox, MessageInvoker, MessageDispatcher } from './types';
import fastq from 'fastq';
import type { queueAsPromised } from 'fastq';

const CONCURRENCY = 1; // Set to 1 to ensure strict message ordering

interface QueuedMessage extends Message {
  isSystem?: boolean;
}

type MessageProcessor = (message: QueuedMessage) => Promise<void>;

export class DefaultMailbox implements IMailbox {
  private systemMailbox: queueAsPromised<QueuedMessage, void>;
  private userMailbox: queueAsPromised<QueuedMessage, void>;
  private currentMessage?: Message;
  private suspended: boolean = false;
  private invoker?: MessageInvoker;
  private dispatcher?: MessageDispatcher;
  private processing: boolean = false;
  private scheduledProcessing?: Promise<void>;

  constructor() {
    this.systemMailbox = fastq.promise(this.processMessage.bind(this), 1);
    this.userMailbox = fastq.promise(this.processMessage.bind(this), 1);
  }

  registerHandlers(invoker: MessageInvoker, dispatcher: MessageDispatcher): void {
    this.invoker = invoker;
    this.dispatcher = dispatcher;
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
    if (!this.processing && this.dispatcher && !this.scheduledProcessing) {
      this.processing = true;
      this.scheduledProcessing = new Promise<void>((resolve) => {
        this.dispatcher!.schedule(async () => {
          try {
            await this.processMessages();
          } finally {
            this.processing = false;
            this.scheduledProcessing = undefined;
            resolve();
          }
        });
      });
    }
  }

  private async processMessages(): Promise<void> {
    try {
      // Process system messages first
      while (this.systemMailbox.length() > 0 && !this.suspended) {
        await this.systemMailbox.drain();
      }

      // Then process user messages
      if (!this.suspended) {
        while (this.userMailbox.length() > 0) {
          await this.userMailbox.drain();
        }
      }
    } catch (error) {
      console.error('Error processing messages:', error);
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
  private systemMailbox: queueAsPromised<QueuedMessage, void>;
  private highPriorityMailbox: queueAsPromised<QueuedMessage, void>;
  private normalPriorityMailbox: queueAsPromised<QueuedMessage, void>;
  private lowPriorityMailbox: queueAsPromised<QueuedMessage, void>;
  private currentMessage?: Message;
  private suspended: boolean = false;
  private invoker?: MessageInvoker;
  private dispatcher?: MessageDispatcher;
  private processing: boolean = false;
  private scheduledProcessing?: Promise<void>;

  constructor() {
    this.systemMailbox = fastq.promise(this.processMessage.bind(this), 1);
    this.highPriorityMailbox = fastq.promise(this.processMessage.bind(this), 1);
    this.normalPriorityMailbox = fastq.promise(this.processMessage.bind(this), 1);
    this.lowPriorityMailbox = fastq.promise(this.processMessage.bind(this), 1);
  }

  registerHandlers(invoker: MessageInvoker, dispatcher: MessageDispatcher): void {
    this.invoker = invoker;
    this.dispatcher = dispatcher;
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
    if (!this.processing && this.dispatcher && !this.scheduledProcessing) {
      this.processing = true;
      this.scheduledProcessing = new Promise<void>((resolve) => {
        this.dispatcher!.schedule(async () => {
          try {
            await this.processMessages();
          } finally {
            this.processing = false;
            this.scheduledProcessing = undefined;
            resolve();
          }
        });
      });
    }
  }

  private async processMessages(): Promise<void> {
    try {
      // Process system messages first
      while (this.systemMailbox.length() > 0 && !this.suspended) {
        await this.systemMailbox.drain();
      }

      if (!this.suspended) {
        // Process high priority messages
        while (this.highPriorityMailbox.length() > 0) {
          await this.highPriorityMailbox.drain();
        }

        // Process normal priority messages
        while (this.normalPriorityMailbox.length() > 0) {
          await this.normalPriorityMailbox.drain();
        }

        // Process low priority messages
        while (this.lowPriorityMailbox.length() > 0) {
          await this.lowPriorityMailbox.drain();
        }
      }
    } catch (error) {
      console.error('Error processing messages:', error);
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