import { Message, IMailbox, MessageInvoker, MessageDispatcher } from './types';
import fastq from 'fastq';
import type { queueAsPromised } from 'fastq';

type MessageTask = {
  message: Message;
  isSystem: boolean;
};

export class DefaultMailbox implements IMailbox {
  private systemQueue: MessageTask[] = [];
  private userQueue: MessageTask[] = [];
  private suspended: boolean = false;
  private processing: boolean = false;

  private invoker?: MessageInvoker;
  private dispatcher?: MessageDispatcher;

  constructor() {}

  registerHandlers(invoker: MessageInvoker, dispatcher: MessageDispatcher): void {
    this.invoker = invoker;
    this.dispatcher = dispatcher;
  }

  postUserMessage(message: Message): void {
    if (!this.suspended) {
      this.userQueue.push({ message, isSystem: false });
      if (!this.processing) {
        setTimeout(() => this.processNextMessage(), 0);
      }
    }
  }

  postSystemMessage(message: Message): void {
    this.systemQueue.push({ message, isSystem: true });
    if (!this.processing) {
      setTimeout(() => this.processNextMessage(), 0);
    }
  }

  start(): void {
    if (!this.processing) {
      setTimeout(() => this.processNextMessage(), 0);
    }
  }

  isSuspended(): boolean {
    return this.suspended;
  }

  private async processNextMessage(): Promise<void> {
    if (this.processing || this.suspended) return;
    this.processing = true;

    try {
      // Process system messages first
      while (this.systemQueue.length > 0 && !this.suspended) {
        const task = this.systemQueue[0]; // Peek at the next message
        try {
          await this.processSystemMessage(task);
          this.systemQueue.shift(); // Remove only after successful processing
        } catch (error) {
          console.error('Error processing system message:', error);
          this.suspended = true;
          break;
        }
      }

      // Then process user messages if not suspended
      while (this.userQueue.length > 0 && !this.suspended) {
        const task = this.userQueue[0]; // Peek at the next message
        try {
          await this.processUserMessage(task);
          this.userQueue.shift(); // Remove only after successful processing
        } catch (error) {
          console.error('Error processing user message:', error);
          // Skip failed message but continue processing
          this.userQueue.shift();
          continue;
        }
      }
    } finally {
      this.processing = false;
      // Schedule next processing cycle if there are messages and not suspended
      if (!this.suspended && (this.systemQueue.length > 0 || this.userQueue.length > 0)) {
        setTimeout(() => this.processNextMessage(), 0);
      }
    }
  }

  private async processSystemMessage(task: MessageTask): Promise<void> {
    if (!this.invoker) return;
    await this.invoker.invokeSystemMessage(task.message);
  }

  private async processUserMessage(task: MessageTask): Promise<void> {
    if (!this.invoker || this.suspended) return;
    await this.invoker.invokeUserMessage(task.message);
  }
}

export class PriorityMailbox implements IMailbox {
  private systemQueue: MessageTask[] = [];
  private highPriorityQueue: MessageTask[] = [];
  private normalPriorityQueue: MessageTask[] = [];
  private lowPriorityQueue: MessageTask[] = [];
  private suspended: boolean = false;
  private processing: boolean = false;

  private invoker?: MessageInvoker;
  private dispatcher?: MessageDispatcher;

  constructor() {}

  registerHandlers(invoker: MessageInvoker, dispatcher: MessageDispatcher): void {
    this.invoker = invoker;
    this.dispatcher = dispatcher;
  }

  postUserMessage(message: Message): void {
    if (this.suspended) return;

    const priority = this.getPriority(message);
    const task = { message, isSystem: false };

    console.log(`[PriorityMailbox] Posting user message: ${message.type} with priority: ${priority}`);
    
    switch (priority) {
      case 'high':
        this.highPriorityQueue.push(task);
        console.log(`[PriorityMailbox] Added to high priority queue. Size: ${this.highPriorityQueue.length}`);
        break;
      case 'normal':
        this.normalPriorityQueue.push(task);
        console.log(`[PriorityMailbox] Added to normal priority queue. Size: ${this.normalPriorityQueue.length}`);
        break;
      case 'low':
        this.lowPriorityQueue.push(task);
        console.log(`[PriorityMailbox] Added to low priority queue. Size: ${this.lowPriorityQueue.length}`);
        break;
      default:
        this.normalPriorityQueue.push(task);
        console.log(`[PriorityMailbox] Added to normal priority queue (default). Size: ${this.normalPriorityQueue.length}`);
    }

    // Schedule processing if not already processing
    if (!this.processing) {
      console.log('[PriorityMailbox] Scheduling message processing');
      setTimeout(() => this.processNextMessage(), 0);
    }
  }

  postSystemMessage(message: Message): void {
    const task = { message, isSystem: true };
    this.systemQueue.push(task);
    console.log(`[PriorityMailbox] Added system message: ${message.type}. Size: ${this.systemQueue.length}`);

    // Schedule processing if not already processing
    if (!this.processing) {
      console.log('[PriorityMailbox] Scheduling message processing');
      setTimeout(() => this.processNextMessage(), 0);
    }
  }

  start(): void {
    // Schedule initial processing
    if (!this.processing) {
      console.log('[PriorityMailbox] Starting initial processing');
      setTimeout(() => this.processNextMessage(), 0);
    }
  }

  isSuspended(): boolean {
    return this.suspended;
  }

  private async processNextMessage(): Promise<void> {
    if (this.processing || this.suspended) {
      console.log('[PriorityMailbox] Already processing or suspended, skipping');
      return;
    }
    
    this.processing = true;
    console.log('[PriorityMailbox] Starting processing cycle');

    try {
      // Process all messages in priority order
      while (!this.suspended) {
        // Log queue sizes at the start of each cycle
        console.log(`[PriorityMailbox] Queue sizes - System: ${this.systemQueue.length}, High: ${this.highPriorityQueue.length}, Normal: ${this.normalPriorityQueue.length}, Low: ${this.lowPriorityQueue.length}`);

        // Collect all messages to process in this cycle
        const messages: MessageTask[] = [];
        
        // Add system messages first
        messages.push(...this.systemQueue);
        this.systemQueue = [];

        // Then high priority messages
        messages.push(...this.highPriorityQueue);
        this.highPriorityQueue = [];

        // Then normal priority messages
        messages.push(...this.normalPriorityQueue);
        this.normalPriorityQueue = [];

        // Finally low priority messages
        messages.push(...this.lowPriorityQueue);
        this.lowPriorityQueue = [];

        if (messages.length === 0) {
          console.log('[PriorityMailbox] No messages to process');
          break;
        }

        // Process all collected messages
        for (const task of messages) {
          try {
            if (task.isSystem) {
              console.log('[PriorityMailbox] Processing system message:', task.message.type);
              await this.processSystemMessage(task);
              console.log('[PriorityMailbox] Processed system message:', task.message.type);
            } else {
              console.log('[PriorityMailbox] Processing user message:', task.message.type);
              await this.processUserMessage(task);
              console.log('[PriorityMailbox] Processed user message:', task.message.type);
            }
          } catch (error) {
            console.error('[PriorityMailbox] Error processing message:', task.message.type, error);
            if (task.isSystem) {
              this.suspended = true;
              break;
            }
            continue;
          }

          if (this.suspended) break;
        }
      }
    } finally {
      this.processing = false;
      // Schedule next processing cycle if there are messages
      if (!this.suspended && this.hasMessages()) {
        console.log('[PriorityMailbox] Scheduling next processing cycle');
        setTimeout(() => this.processNextMessage(), 0);
      } else {
        console.log('[PriorityMailbox] Processing complete');
      }
    }
  }

  private async processSystemMessage(task: MessageTask): Promise<void> {
    if (!this.invoker) return;
    await this.invoker.invokeSystemMessage(task.message);
  }

  private async processUserMessage(task: MessageTask): Promise<void> {
    if (!this.invoker || this.suspended) return;
    await this.invoker.invokeUserMessage(task.message);
  }

  hasMessages(): boolean {
    return (
      this.systemQueue.length > 0 ||
      (!this.suspended && (
        this.highPriorityQueue.length > 0 ||
        this.normalPriorityQueue.length > 0 ||
        this.lowPriorityQueue.length > 0
      ))
    );
  }

  getQueueSizes(): {
    system: number;
    high: number;
    normal: number;
    low: number;
  } {
    return {
      system: this.systemQueue.length,
      high: this.highPriorityQueue.length,
      normal: this.normalPriorityQueue.length,
      low: this.lowPriorityQueue.length
    };
  }

  private getPriority(message: Message): 'high' | 'normal' | 'low' {
    if (message.type.startsWith('$priority.high')) return 'high';
    if (message.type.startsWith('$priority.low')) return 'low';
    return 'normal';
  }
} 