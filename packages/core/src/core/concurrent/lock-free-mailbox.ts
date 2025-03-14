/**
 * 无锁Mailbox实现
 * 
 * 用于Actor系统的高性能消息处理队列，基于无锁队列实现。
 * 提供线程安全的消息收发能力，显著提高高并发环境下的性能。
 */

import { Message } from '@bactor/common';
import { MessageDispatcher, MessageInvoker, IMailbox } from '../types';
import { LockFreeQueue } from './lock-free-queue';

/**
 * 无锁Mailbox配置选项
 */
export interface LockFreeMailboxOptions {
    /** 系统消息队列初始容量 */
    systemQueueCapacity?: number;

    /** 用户消息队列初始容量 */
    userQueueCapacity?: number;

    /** 是否自动调整队列大小 */
    autoResize?: boolean;

    /** 每批次处理的最大消息数 */
    batchSize?: number;

    /** 单次批处理的最大执行时间(ms) */
    maxBatchProcessingTimeMs?: number;

    /** 是否启用调试模式 */
    debug?: boolean;

    /** 消息处理异常回调 */
    onError?: (error: Error, message: Message) => void;
}

/**
 * 无锁Mailbox性能指标
 */
export interface MailboxMetrics {
    /** 系统消息处理数量 */
    systemMessagesProcessed: number;

    /** 用户消息处理数量 */
    userMessagesProcessed: number;

    /** 系统队列当前长度 */
    systemQueueSize: number;

    /** 用户队列当前长度 */
    userQueueSize: number;

    /** 最近一次批处理时间(ms) */
    lastBatchProcessingTimeMs: number;

    /** 平均批处理时间(ms) */
    averageBatchProcessingTimeMs: number;

    /** 处理的批次总数 */
    totalBatchesProcessed: number;

    /** 处理的消息总数 */
    totalMessagesProcessed: number;

    /** 系统队列历史最大长度 */
    peakSystemQueueSize: number;

    /** 用户队列历史最大长度 */
    peakUserQueueSize: number;

    /** 因队列满而拒绝的消息数 */
    rejectedMessages: number;
}

/**
 * 基于无锁队列的高性能Mailbox实现
 */
export class LockFreeMailbox implements IMailbox {
    /** 系统消息队列 */
    private readonly systemMailbox: LockFreeQueue<Message>;

    /** 用户消息队列 */
    private readonly userMailbox: LockFreeQueue<Message>;

    /** 是否正在处理消息 */
    private processing: boolean = false;

    /** 是否已挂起 */
    private suspended: boolean = false;

    /** 处理错误 */
    private error: Error | null = null;

    /** 消息处理器 */
    private invoker: MessageInvoker | null = null;

    /** 调度器 */
    private dispatcher: MessageDispatcher | null = null;

    /** 配置选项 */
    private readonly options: Required<LockFreeMailboxOptions>;

    /** 性能指标 */
    private metrics: MailboxMetrics = {
        systemMessagesProcessed: 0,
        userMessagesProcessed: 0,
        systemQueueSize: 0,
        userQueueSize: 0,
        lastBatchProcessingTimeMs: 0,
        averageBatchProcessingTimeMs: 0,
        totalBatchesProcessed: 0,
        totalMessagesProcessed: 0,
        peakSystemQueueSize: 0,
        peakUserQueueSize: 0,
        rejectedMessages: 0
    };

    /** 是否正在调度处理 */
    private processingScheduled: boolean = false;

    /** 累计处理时间(ms) */
    private totalProcessingTimeMs: number = 0;

    /**
     * 创建无锁Mailbox
     */
    constructor(options?: LockFreeMailboxOptions) {
        // 配置默认选项
        this.options = {
            systemQueueCapacity: 512,
            userQueueCapacity: 2048,
            autoResize: true,
            batchSize: 20,
            maxBatchProcessingTimeMs: 10,
            debug: false,
            onError: null as unknown as (error: Error, message: Message) => void,
            ...options
        };

        // 初始化系统消息队列
        this.systemMailbox = new LockFreeQueue<Message>({
            initialCapacity: this.options.systemQueueCapacity,
            autoResize: this.options.autoResize,
            onOverflow: (message) => {
                this.metrics.rejectedMessages++;
                this.logDebug(`系统消息队列溢出: ${message.type}`);
            }
        });

        // 初始化用户消息队列
        this.userMailbox = new LockFreeQueue<Message>({
            initialCapacity: this.options.userQueueCapacity,
            autoResize: this.options.autoResize,
            onOverflow: (message) => {
                this.metrics.rejectedMessages++;
                this.logDebug(`用户消息队列溢出: ${message.type}`);
            }
        });
    }

    /**
     * 注册消息处理器和调度器
     */
    registerHandlers(invoker: MessageInvoker, dispatcher: MessageDispatcher): void {
        this.invoker = invoker;
        this.dispatcher = dispatcher;
        this.logDebug('已注册消息处理器和调度器');
    }

    /**
     * 启动处理
     */
    start(): void {
        this.suspended = false;
        this.error = null;
        this.scheduleProcessing();
        this.logDebug('Mailbox已启动');
    }

    /**
     * 挂起处理
     */
    suspend(): void {
        this.suspended = true;
        this.logDebug('Mailbox已挂起');
    }

    /**
     * 恢复处理
     */
    resume(): void {
        if (this.suspended) {
            this.suspended = false;
            this.scheduleProcessing();
            this.logDebug('Mailbox已恢复');
        }
    }

    /**
     * 是否已挂起
     */
    isSuspended(): boolean {
        return this.suspended;
    }

    /**
     * 发送系统消息
     */
    postSystemMessage(message: Message): void {
        const enqueued = this.systemMailbox.enqueue(message);

        if (enqueued) {
            this.updateQueueMetrics();
            this.scheduleProcessing();
        } else {
            this.metrics.rejectedMessages++;
        }
    }

    /**
     * 发送用户消息
     */
    postUserMessage(message: Message): void {
        const enqueued = this.userMailbox.enqueue(message);

        if (enqueued) {
            this.updateQueueMetrics();
            this.scheduleProcessing();
        } else {
            this.metrics.rejectedMessages++;
        }
    }

    /**
     * 获取性能指标
     */
    getMetrics(): MailboxMetrics {
        this.updateQueueMetrics();
        return { ...this.metrics };
    }

    /**
     * 检查是否为空
     */
    private isEmpty(): boolean {
        return this.systemMailbox.isEmpty() && this.userMailbox.isEmpty();
    }

    /**
     * 调度消息处理
     */
    private scheduleProcessing(): void {
        // 检查条件
        if (this.suspended || this.error || this.processing || this.processingScheduled) {
            return;
        }

        // 检查是否有消息需要处理
        if (this.isEmpty()) {
            return;
        }

        this.processingScheduled = true;

        // 使用微任务调度，比Promise更高效
        queueMicrotask(() => {
            this.processingScheduled = false;
            this.processMailbox();
        });
    }

    /**
     * 处理邮箱消息
     */
    private processMailbox(): void {
        // 检查条件
        if (this.processing || this.suspended || this.error || !this.dispatcher) {
            return;
        }

        // 标记为正在处理
        this.processing = true;

        // 使用调度器分配处理任务
        this.dispatcher.schedule(async () => {
            try {
                await this.processNextBatch();
            } catch (error) {
                this.handleError(error as Error);
            } finally {
                // 标记为处理完成
                this.processing = false;

                // 如果还有消息需要处理，继续调度
                if (!this.isEmpty() && !this.suspended && !this.error) {
                    this.scheduleProcessing();
                }
            }
        });
    }

    /**
     * 处理一批消息
     */
    private async processNextBatch(): Promise<void> {
        // 检查条件
        if (this.isEmpty() || this.suspended || this.error || !this.invoker) {
            return;
        }

        const startTime = Date.now();
        let processedCount = 0;

        // 1. 优先处理系统消息
        while (!this.systemMailbox.isEmpty() && processedCount < this.options.batchSize) {
            const message = this.systemMailbox.dequeue();
            if (message) {
                try {
                    await this.invoker.invokeSystemMessage(message);
                    this.metrics.systemMessagesProcessed++;
                    this.metrics.totalMessagesProcessed++;
                } catch (error) {
                    this.handleError(error as Error, message);

                    // 系统消息处理失败，挂起mailbox
                    this.suspended = true;
                    break;
                }

                processedCount++;
            }
        }

        // 2. 如果没有被挂起，处理用户消息
        if (!this.suspended && !this.error) {
            while (!this.userMailbox.isEmpty() && processedCount < this.options.batchSize) {
                const message = this.userMailbox.dequeue();
                if (message) {
                    try {
                        await this.invoker.invokeUserMessage(message);
                        this.metrics.userMessagesProcessed++;
                        this.metrics.totalMessagesProcessed++;
                    } catch (error) {
                        this.handleError(error as Error, message);

                        // 用户消息处理错误，继续处理其他消息
                        continue;
                    }

                    processedCount++;
                }

                // 检查是否超过了批处理时间限制
                if (Date.now() - startTime > this.options.maxBatchProcessingTimeMs) {
                    break;
                }
            }
        }

        // 更新处理时间指标
        const processingTime = Date.now() - startTime;
        this.updateProcessingMetrics(processingTime, processedCount);
    }

    /**
     * 处理错误
     */
    private handleError(error: Error, message?: Message): void {
        this.error = error;

        // 如果有错误回调，调用回调
        if (this.options.onError && message) {
            try {
                this.options.onError(error, message);
            } catch (callbackError) {
                console.error('Error handler threw an exception:', callbackError);
            }
        } else {
            console.error('Error processing message:', error);
        }
    }

    /**
     * 更新队列指标
     */
    private updateQueueMetrics(): void {
        const systemSize = this.systemMailbox.size();
        const userSize = this.userMailbox.size();

        this.metrics.systemQueueSize = systemSize;
        this.metrics.userQueueSize = userSize;

        // 更新峰值
        this.metrics.peakSystemQueueSize = Math.max(this.metrics.peakSystemQueueSize, systemSize);
        this.metrics.peakUserQueueSize = Math.max(this.metrics.peakUserQueueSize, userSize);
    }

    /**
     * 更新处理指标
     */
    private updateProcessingMetrics(processingTimeMs: number, messagesProcessed: number): void {
        // 更新最近一次处理时间
        this.metrics.lastBatchProcessingTimeMs = processingTimeMs;

        // 更新总处理时间和批次计数
        this.totalProcessingTimeMs += processingTimeMs;
        this.metrics.totalBatchesProcessed++;

        // 更新平均处理时间
        if (this.metrics.totalBatchesProcessed > 0) {
            this.metrics.averageBatchProcessingTimeMs =
                this.totalProcessingTimeMs / this.metrics.totalBatchesProcessed;
        }

        // 更新队列指标
        this.updateQueueMetrics();

        // 记录调试信息
        this.logDebug(`批处理完成: ${messagesProcessed}条消息, 耗时${processingTimeMs}ms`);
    }

    /**
     * 记录调试信息
     */
    private logDebug(message: string): void {
        if (this.options.debug) {
            console.debug(`[LockFreeMailbox] ${message}`);
        }
    }
}