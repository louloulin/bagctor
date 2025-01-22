import { Message, IMailbox, MessageInvoker, MessageDispatcher } from './types';
import fastq from 'fastq';
import type { queueAsPromised } from 'fastq';

const CONCURRENCY = 1; // Set to 1 to ensure strict message ordering

interface QueuedMessage extends Message {
  isSystem?: boolean;
}

type MessageProcessor = (message: QueuedMessage) => Promise<void>;

class MessageQueue {
  private messages: QueuedMessage[];
  private head: number = 0;
  private tail: number = 0;
  private size: number = 0;
  private readonly capacity: number;
  
  constructor(capacity: number = 10000) {
    this.capacity = capacity;
    this.messages = new Array(capacity);
  }

  push(message: QueuedMessage): boolean {
    if (this.size === this.capacity) {
      return false; // Queue is full
    }

    this.messages[this.tail] = message;
    this.tail = (this.tail + 1) % this.capacity;
    this.size++;
    return true;
  }

  shift(): QueuedMessage | undefined {
    if (this.size === 0) {
      return undefined;
    }

    const message = this.messages[this.head];
    this.messages[this.head] = undefined as any; // Help GC
    this.head = (this.head + 1) % this.capacity;
    this.size--;
    return message;
  }

  clear(): void {
    this.messages = new Array(this.capacity);
    this.head = 0;
    this.tail = 0;
    this.size = 0;
  }

  length(): number {
    return this.size;
  }

  isEmpty(): boolean {
    return this.size === 0;
  }

  isFull(): boolean {
    return this.size === this.capacity;
  }

  // For testing and debugging
  toArray(): QueuedMessage[] {
    const result: QueuedMessage[] = [];
    let current = this.head;
    let count = this.size;
    
    while (count > 0) {
      if (this.messages[current] !== undefined) {
        result.push(this.messages[current]);
      }
      current = (current + 1) % this.capacity;
      count--;
    }
    
    return result;
  }
}

export class DefaultMailbox implements IMailbox {
  private systemMailbox: MessageQueue;
  private userMailbox: MessageQueue;
  private currentMessage?: Message;
  private suspended: boolean = false;
  private invoker?: MessageInvoker;
  private dispatcher?: MessageDispatcher;
  private processing: boolean = false;
  private scheduledProcessing?: Promise<void>;
  private started: boolean = true; // Default mailbox starts processing immediately
  private error: boolean = false;

  constructor() {
    this.systemMailbox = new MessageQueue();
    this.userMailbox = new MessageQueue();
  }

  registerHandlers(invoker: MessageInvoker, dispatcher: MessageDispatcher): void {
    this.invoker = invoker;
    this.dispatcher = dispatcher;
  }

  postSystemMessage(message: Message): void {
    const queuedMessage = { ...message, isSystem: true };
    if (message.type === 'error') {
      // Clear all queues except the current message
      this.systemMailbox.clear();
      this.userMailbox.clear();
      this.error = true;
      this.suspended = true;
    } else if (!this.error) {
      this.systemMailbox.push(queuedMessage);
      if (!this.suspended) {
        this.scheduleProcessing();
      }
    }
  }

  postUserMessage(message: Message): void {
    if (!this.suspended && !this.error) {
      const queuedMessage = { ...message, isSystem: false };
      this.userMailbox.push(queuedMessage);
      this.scheduleProcessing();
    }
  }

  private scheduleProcessing(): void {
    if (!this.processing && this.dispatcher && !this.scheduledProcessing && !this.suspended && !this.error) {
      this.processing = true;
      this.scheduledProcessing = new Promise<void>((resolve) => {
        this.dispatcher!.schedule(async () => {
          try {
            await this.processMessages();
          } finally {
            this.processing = false;
            this.scheduledProcessing = undefined;
            resolve();
            // Schedule next processing if there are more messages
            if (!this.systemMailbox.isEmpty() || !this.userMailbox.isEmpty()) {
              this.scheduleProcessing();
            }
          }
        });
      });
    }
  }

  private async processMessages(): Promise<void> {
    if (this.suspended || this.error) return;

    try {
      // Process system messages first
      if (!this.systemMailbox.isEmpty()) {
        const message = this.systemMailbox.shift();
        if (message) {
          try {
            await this.processMessage(message);
          } catch (error) {
            console.error('Error processing message:', error);
            this.error = true;
            this.suspended = true;
            // Clear all remaining messages
            this.systemMailbox.clear();
            this.userMailbox.clear();
            return;
          }
        }
      }

      // Then process user messages
      if (!this.suspended && !this.error && !this.userMailbox.isEmpty()) {
        const message = this.userMailbox.shift();
        if (message) {
          try {
            await this.processMessage(message);
          } catch (error) {
            console.error('Error processing message:', error);
            this.error = true;
            this.suspended = true;
            // Clear all remaining messages
            this.systemMailbox.clear();
            this.userMailbox.clear();
            return;
          }
        }
      }
    } catch (error) {
      console.error('Error in message processing loop:', error);
      this.error = true;
      this.suspended = true;
      // Clear all remaining messages
      this.systemMailbox.clear();
      this.userMailbox.clear();
    }
  }

  private async processMessage(message: QueuedMessage): Promise<void> {
    if (!this.invoker || !this.dispatcher || this.suspended || this.error) {
      return;
    }

    try {
      this.currentMessage = message;
      const { isSystem, ...cleanMessage } = message;
      
      if (cleanMessage.type === 'error') {
        this.error = true;
        this.suspended = true;
        // Clear all remaining messages
        this.systemMailbox.clear();
        this.userMailbox.clear();
        throw new Error('System error message received');
      }

      if (isSystem) {
        await this.invoker.invokeSystemMessage(cleanMessage);
      } else {
        await this.invoker.invokeUserMessage(cleanMessage);
      }
    } finally {
      this.currentMessage = undefined;
    }
  }

  start(): void {
    this.suspended = false;
    this.error = false;
    this.scheduleProcessing();
  }
  
  suspend(): void { 
    this.suspended = true; 
  }
  
  resume(): void { 
    if (!this.error) {
      this.suspended = false;
      this.scheduleProcessing();
    }
  }
  
  isSuspended(): boolean { return this.suspended; }
  getCurrentMessage(): Message | undefined { return this.currentMessage; }

  async hasMessages(): Promise<boolean> {
    return !this.systemMailbox.isEmpty() || !this.userMailbox.isEmpty();
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
  private systemMailbox: MessageQueue;
  private highPriorityMailbox: MessageQueue;
  private normalPriorityMailbox: MessageQueue;
  private lowPriorityMailbox: MessageQueue;
  private currentMessage?: Message;
  private suspended: boolean = false;
  private invoker?: MessageInvoker;
  private dispatcher?: MessageDispatcher;
  private processing: boolean = false;
  private scheduledProcessing?: Promise<void>;
  private started: boolean = false;
  private error: boolean = false;

  constructor() {
    this.systemMailbox = new MessageQueue();
    this.highPriorityMailbox = new MessageQueue();
    this.normalPriorityMailbox = new MessageQueue();
    this.lowPriorityMailbox = new MessageQueue();
  }

  registerHandlers(invoker: MessageInvoker, dispatcher: MessageDispatcher): void {
    this.invoker = invoker;
    this.dispatcher = dispatcher;
  }

  postSystemMessage(message: Message): void {
    const queuedMessage = { ...message, isSystem: true };
    if (message.type === 'error') {
      // Clear all queues except the current message
      this.systemMailbox.clear();
      this.highPriorityMailbox.clear();
      this.normalPriorityMailbox.clear();
      this.lowPriorityMailbox.clear();
      this.error = true;
      this.suspended = true;
    } else if (!this.error) {
      this.systemMailbox.push(queuedMessage);
      if (this.started && !this.suspended) {
        this.scheduleProcessing();
      }
    }
  }

  postUserMessage(message: Message): void {
    if (!this.suspended && !this.error) {
      const queuedMessage = { ...message, isSystem: false };
      if (message.type.startsWith('$priority.high')) {
        this.highPriorityMailbox.push(queuedMessage);
      } else if (message.type.startsWith('$priority.low')) {
        this.lowPriorityMailbox.push(queuedMessage);
      } else {
        this.normalPriorityMailbox.push(queuedMessage);
      }
      if (this.started) {
        this.scheduleProcessing();
      }
    }
  }

  private scheduleProcessing(): void {
    if (!this.processing && this.dispatcher && !this.scheduledProcessing && !this.suspended && !this.error) {
      this.processing = true;
      this.scheduledProcessing = new Promise<void>((resolve) => {
        this.dispatcher!.schedule(async () => {
          try {
            await this.processMessages();
          } finally {
            this.processing = false;
            this.scheduledProcessing = undefined;
            resolve();
            // Schedule next processing if there are more messages
            if (!this.systemMailbox.isEmpty() || 
                !this.highPriorityMailbox.isEmpty() || 
                !this.normalPriorityMailbox.isEmpty() || 
                !this.lowPriorityMailbox.isEmpty()) {
              this.scheduleProcessing();
            }
          }
        });
      });
    }
  }

  private async processMessages(): Promise<void> {
    if (this.suspended || this.error) return;

    try {
      // Process messages in priority order
      const queues = [
        this.systemMailbox,
        this.highPriorityMailbox,
        this.normalPriorityMailbox,
        this.lowPriorityMailbox
      ];

      for (const queue of queues) {
        // Process all messages in current priority level before moving to next
        while (!queue.isEmpty() && !this.suspended && !this.error) {
          const message = queue.shift();
          if (message) {
            try {
              await this.processMessage(message);
            } catch (error) {
              console.error('Error processing message:', error);
              this.error = true;
              this.suspended = true;
              // Clear all remaining messages
              this.clearAllQueues();
              return;
            }
          }
        }
      }
    } catch (error) {
      console.error('Error in message processing loop:', error);
      this.error = true;
      this.suspended = true;
      // Clear all remaining messages
      this.clearAllQueues();
    }
  }

  private clearAllQueues(): void {
    this.systemMailbox.clear();
    this.highPriorityMailbox.clear();
    this.normalPriorityMailbox.clear();
    this.lowPriorityMailbox.clear();
  }

  private async processMessage(message: QueuedMessage): Promise<void> {
    if (!this.invoker || !this.dispatcher || this.suspended || this.error) {
      return;
    }

    try {
      this.currentMessage = message;
      const { isSystem, ...cleanMessage } = message;
      
      if (cleanMessage.type === 'error') {
        this.error = true;
        this.suspended = true;
        // Clear all remaining messages
        this.clearAllQueues();
        throw new Error('System error message received');
      }

      if (isSystem) {
        await this.invoker.invokeSystemMessage(cleanMessage);
      } else {
        await this.invoker.invokeUserMessage(cleanMessage);
      }
    } finally {
      this.currentMessage = undefined;
    }
  }

  start(): void {
    this.started = true;
    this.suspended = false;
    this.error = false;
    this.scheduleProcessing();
  }
  
  suspend(): void { 
    this.suspended = true; 
  }
  
  resume(): void { 
    if (!this.error) {
      this.suspended = false;
      if (this.started) {
        this.scheduleProcessing();
      }
    }
  }
  
  isSuspended(): boolean { return this.suspended; }
  getCurrentMessage(): Message | undefined { return this.currentMessage; }

  async hasMessages(): Promise<boolean> {
    return !this.systemMailbox.isEmpty() || 
           !this.highPriorityMailbox.isEmpty() || 
           !this.normalPriorityMailbox.isEmpty() || 
           !this.lowPriorityMailbox.isEmpty();
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