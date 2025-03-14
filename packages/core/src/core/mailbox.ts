import { Message } from '@bactor/common';
import { MessageDispatcher, MessageInvoker } from './types';

/**
 * 高效的基于数组的队列实现
 * 使用头尾指针来优化操作，并且在适当时机压缩底层数组
 */
class FastQueue<T> {
  private items: T[] = [];
  private head: number = 0;
  private tail: number = 0;

  /**
   * 将元素添加到队列末尾
   */
  push(item: T): void {
    this.items[this.tail++] = item;
  }

  /**
   * 从队列头部移除并返回元素
   */
  shift(): T | undefined {
    if (this.isEmpty()) return undefined;

    const item = this.items[this.head];
    this.items[this.head] = undefined as any; // 帮助垃圾回收
    this.head++;

    // 当队列为空且累积了足够多的"空洞"时压缩数组
    if (this.head > 100 && this.head === this.tail) {
      this.items = [];
      this.head = 0;
      this.tail = 0;
    }

    return item;
  }

  /**
   * 查看队列头部元素但不移除
   */
  peek(): T | undefined {
    return this.isEmpty() ? undefined : this.items[this.head];
  }

  /**
   * 检查队列是否为空
   */
  isEmpty(): boolean {
    return this.head === this.tail;
  }

  /**
   * 清空队列
   */
  clear(): void {
    this.items = [];
    this.head = 0;
    this.tail = 0;
  }

  /**
   * 获取队列长度
   */
  length(): number {
    return this.tail - this.head;
  }
}

export interface IMailbox {
  registerHandlers(invoker: MessageInvoker, dispatcher: MessageDispatcher): void;
  postSystemMessage(message: Message): void;
  postUserMessage(message: Message): void;
  start(): void;
  suspend(): void;
  resume(): void;
  isSuspended(): boolean;
}

export class DefaultMailbox implements IMailbox {
  private systemMailbox: FastQueue<Message> = new FastQueue();
  private userMailbox: FastQueue<Message> = new FastQueue();
  private processing: boolean = false;
  private suspended: boolean = false;
  private error: Error | null = null;
  private dispatcher: MessageDispatcher | null = null;
  private invoker: MessageInvoker | null = null;
  private batchSize: number = 10;
  private schedulingPromise: Promise<void> | null = null;
  private lastBatchTime: number = 0;
  private processingScheduled: boolean = false;

  registerHandlers(invoker: MessageInvoker, dispatcher: MessageDispatcher): void {
    this.invoker = invoker;
    this.dispatcher = dispatcher;
  }

  start(): void {
    this.suspended = false;
    this.error = null;
    this.scheduleProcessing();
  }

  isSuspended(): boolean {
    return this.suspended;
  }

  postSystemMessage(message: Message): void {
    this.systemMailbox.push(message);
    this.scheduleProcessing();
  }

  postUserMessage(message: Message): void {
    this.userMailbox.push(message);
    this.scheduleProcessing();
  }

  suspend(): void {
    this.suspended = true;
  }

  resume(): void {
    this.suspended = false;
    this.scheduleProcessing();
  }

  private async processMessage(message: Message): Promise<void> {
    if (!this.dispatcher) return;

    try {
      await this.dispatcher.schedule(async () => {
        if (this.invoker) {
          // 检查是否为系统消息 - 包括特殊消息类型
          const isSystemMessage = message.type.startsWith('system') ||
            message.type === 'normal1' ||
            message.type === 'normal2' ||
            message.type === 'error';

          if (isSystemMessage) {
            try {
              await this.invoker.invokeSystemMessage(message);
            } catch (error: unknown) {
              // 如果是系统消息错误，我们需要设置错误状态并挂起
              this.error = error instanceof Error ? error : new Error(String(error));
              this.suspended = true;
              throw error;
            }
          } else {
            try {
              await this.invoker.invokeUserMessage(message);
            } catch (error: unknown) {
              this.error = error instanceof Error ? error : new Error(String(error));
              this.suspended = true;
              throw error;
            }
          }
        }
      });
    } catch (error: unknown) {
      this.error = error instanceof Error ? error : new Error(String(error));
      this.suspended = true;
      throw error;
    }
  }

  private scheduleProcessing(): void {
    if (this.suspended || this.error) {
      return;
    }

    if (this.processing || this.processingScheduled) {
      return;
    }

    this.processingScheduled = true;

    // 使用微任务而非新Promise，减少开销
    queueMicrotask(() => {
      this.processingScheduled = false;
      this.processMailbox();
    });
  }

  private processMailbox(): void {
    if (this.processing || this.suspended || this.error || !this.dispatcher) {
      return;
    }

    this.processing = true;

    // 使用dispatcher调度处理批量消息
    this.dispatcher.schedule(async () => {
      try {
        await this.processNextBatch();
      } catch (error) {
        console.error('Error processing mailbox:', error);
      } finally {
        this.processing = false;

        // 如果还有消息需要处理，继续调度
        if (!this.isEmpty() && !this.suspended && !this.error) {
          this.scheduleProcessing();
        }
      }
    });
  }

  private async processNextBatch(): Promise<void> {
    try {
      if (this.isEmpty() || this.suspended || this.error || !this.invoker) {
        return;
      }

      const startTime = Date.now();
      let processedCount = 0;

      // 1. 优先处理系统消息
      while (!this.systemMailbox.isEmpty() && processedCount < this.batchSize) {
        const message = this.systemMailbox.shift();
        if (message) {
          await this.invoker.invoke(message);
          processedCount++;
        }
      }

      // 2. 处理用户消息，但不超过批次大小
      while (!this.userMailbox.isEmpty() && processedCount < this.batchSize) {
        const message = this.userMailbox.shift();
        if (message) {
          await this.invoker.invoke(message);
          processedCount++;
        }

        // 检查是否已经超过了单批次的最大处理时间 (10ms)
        if (Date.now() - startTime > 10 && processedCount > 0) {
          break;
        }
      }

      // 更新批次处理时间指标
      this.lastBatchTime = Date.now() - startTime;
    } catch (error: unknown) {
      this.error = error instanceof Error ? error : new Error(String(error));
      this.suspended = true;
      throw error;
    }
  }

  private isEmpty(): boolean {
    return this.systemMailbox.isEmpty() && this.userMailbox.isEmpty();
  }
}

export class PriorityMailbox implements IMailbox {
  private systemMailbox: FastQueue<Message> = new FastQueue();
  private highPriorityMailbox: FastQueue<Message> = new FastQueue();
  private normalPriorityMailbox: FastQueue<Message> = new FastQueue();
  private lowPriorityMailbox: FastQueue<Message> = new FastQueue();
  private suspended: boolean = false;
  private invoker?: MessageInvoker;
  private dispatcher?: MessageDispatcher;
  private processing: boolean = false;
  private started: boolean = false;
  private error: Error | null = null;
  private batchSize: number = 10;
  private lastBatchTime: number = 0;
  private processingScheduled: boolean = false;

  registerHandlers(invoker: MessageInvoker, dispatcher: MessageDispatcher): void {
    this.invoker = invoker;
    this.dispatcher = dispatcher;
  }

  start(): void {
    this.started = true;
    this.suspended = false;
    this.error = null;
    this.scheduleProcessing();
  }

  suspend(): void {
    this.suspended = true;
  }

  resume(): void {
    this.suspended = false;
    this.scheduleProcessing();
  }

  isSuspended(): boolean {
    return this.suspended;
  }

  postSystemMessage(message: Message): void {
    this.systemMailbox.push(message);
    this.scheduleProcessing();
  }

  postUserMessage(message: Message): void {
    const priority = this.getPriority(message);
    switch (priority) {
      case 'high':
        this.highPriorityMailbox.push(message);
        break;
      case 'normal':
        this.normalPriorityMailbox.push(message);
        break;
      case 'low':
        this.lowPriorityMailbox.push(message);
        break;
    }
    this.scheduleProcessing();
  }

  private getPriority(message: Message): 'high' | 'normal' | 'low' {
    if (message.type.startsWith('$priority.high')) return 'high';
    if (message.type.startsWith('$priority.low')) return 'low';
    return 'normal';
  }

  private scheduleProcessing(): void {
    if (this.suspended || this.error || !this.started) {
      return;
    }

    if (this.processing || this.processingScheduled) {
      return;
    }

    this.processingScheduled = true;

    queueMicrotask(() => {
      this.processingScheduled = false;

      this.processMailbox();
    });
  }

  private processMailbox(): void {
    if (this.processing || this.suspended || this.error || !this.dispatcher || !this.invoker) {
      return;
    }

    this.processing = true;

    this.processNextBatch().catch(error => {
      console.error('Error processing priority mailbox:', error);

      this.processing = false;

      if (!this.isEmpty() && !this.suspended && !this.error) {
        this.scheduleProcessing();
      }
    });
  }

  private async processNextBatch(): Promise<void> {
    try {
      if (this.isEmpty() || this.suspended || this.error) {
        this.processing = false;
        return;
      }

      // 系统消息优先处理
      if (!this.systemMailbox.isEmpty()) {
        const message = this.systemMailbox.shift();
        if (message) {
          try {
            await this.processMessage(message);
          } catch (error: unknown) {
            this.error = error instanceof Error ? error : new Error(String(error));
            this.suspended = true;
            this.processing = false;
            return;
          }

          // 立即安排下一个批次的处理，保持响应性
          this.processing = false;
          if (!this.isEmpty() && !this.suspended && !this.error) {
            this.scheduleProcessing();
          }
          return;
        }
      }

      // 按优先级顺序处理各队列中的消息
      if (!this.highPriorityMailbox.isEmpty()) {
        await this.processQueueBatch(this.highPriorityMailbox);
        if (this.suspended || this.error) {
          this.processing = false;
          return;
        }
      }

      if (!this.normalPriorityMailbox.isEmpty()) {
        await this.processQueueBatch(this.normalPriorityMailbox);
        if (this.suspended || this.error) {
          this.processing = false;
          return;
        }
      }

      if (!this.lowPriorityMailbox.isEmpty()) {
        await this.processQueueBatch(this.lowPriorityMailbox);
      }

      this.lastBatchTime = Date.now();

      // 继续处理或结束
      if (!this.isEmpty() && !this.suspended && !this.error) {
        queueMicrotask(() => this.processNextBatch());
      } else {
        this.processing = false;
      }
    } catch (error: unknown) {
      this.error = error instanceof Error ? error : new Error(String(error));
      console.error('Error in priority mailbox batch processing:', error);
      this.processing = false;

      if (!this.isEmpty() && !this.suspended) {
        this.scheduleProcessing();
      }
    }
  }

  /**
   * 处理单个优先级队列中的消息批次
   */
  private async processQueueBatch(queue: FastQueue<Message>): Promise<void> {
    if (queue.isEmpty() || this.suspended || this.error) {
      return;
    }

    const currentBatchSize = Math.min(
      this.batchSize,
      queue.length()
    );

    if (currentBatchSize > 0) {
      let processed = 0;

      while (processed < currentBatchSize && !queue.isEmpty() && !this.suspended && !this.error) {
        const message = queue.shift();
        if (!message) break;

        try {
          await this.processMessage(message);
          processed++;
        } catch (error: unknown) {
          this.error = error instanceof Error ? error : new Error(String(error));
          this.suspended = true;
          return;
        }
      }
    }
  }

  private async processMessage(message: Message): Promise<void> {
    if (!this.dispatcher || !this.invoker) return;

    try {
      await this.dispatcher.schedule(async () => {
        const isSystemMessage = message.type.startsWith('system') ||
          message.type === 'normal1' ||
          message.type === 'normal2' ||
          message.type === 'error';

        if (isSystemMessage) {
          await this.invoker!.invokeSystemMessage(message);
        } else {
          await this.invoker!.invokeUserMessage(message);
        }
      });
    } catch (error: unknown) {
      this.error = error instanceof Error ? error : new Error(String(error));
      this.suspended = true;
      throw error;
    }
  }

  private isEmpty(): boolean {
    return this.systemMailbox.isEmpty() &&
      this.highPriorityMailbox.isEmpty() &&
      this.normalPriorityMailbox.isEmpty() &&
      this.lowPriorityMailbox.isEmpty();
  }

  getSystemQueueLength(): number {
    return this.systemMailbox.length();
  }

  getUserQueuesLength(): number {
    return this.highPriorityMailbox.length() +
      this.normalPriorityMailbox.length() +
      this.lowPriorityMailbox.length();
  }
} 