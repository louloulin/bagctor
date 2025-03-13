import { MessageEnvelope } from '../messaging/types';
import { BackpressureController, BackpressureConfig, BackpressureStrategy } from './types';
import { BackpressureError, BackpressureTimeoutError } from './backpressure_error';
import { log } from '../../utils/logger';
import { EventEmitter } from 'events';

/**
 * 默认背压控制器实现
 */
export class DefaultBackpressureController extends EventEmitter implements BackpressureController {
    private messageQueue: MessageEnvelope[] = [];
    private activeMessages = new Set<string>();
    private backpressureActive = false;
    private waiters: Array<{ resolve: Function, reject: Function, timeout?: NodeJS.Timeout }> = [];

    // 计算水位线阈值
    private highWatermarkThreshold: number;
    private lowWatermarkThreshold: number;

    constructor(private config: BackpressureConfig) {
        super();

        // 验证配置
        this.validateConfig();

        // 计算水位线阈值
        this.highWatermarkThreshold = Math.floor(this.config.maxQueueSize * this.config.highWatermark);
        this.lowWatermarkThreshold = Math.floor(this.config.maxQueueSize * this.config.lowWatermark);

        log.debug('Backpressure controller initialized', {
            maxQueueSize: this.config.maxQueueSize,
            highWatermark: this.highWatermarkThreshold,
            lowWatermark: this.lowWatermarkThreshold,
            strategy: this.config.strategy
        });
    }

    /**
     * 提交消息到控制器
     * @param message 要处理的消息
     * @returns 如果消息被接受则返回 true，被拒绝则返回 false
     */
    async submit(message: MessageEnvelope): Promise<boolean> {
        const queueSize = this.getQueueSize();

        // 检查队列是否已满
        if (queueSize >= this.config.maxQueueSize) {
            return this.handleFullQueue(message);
        }

        // 检查是否需要激活背压
        if (!this.backpressureActive && queueSize >= this.highWatermarkThreshold) {
            this.activateBackpressure();
        }

        // 添加消息到队列
        this.messageQueue.push(message);

        log.debug('Message submitted to backpressure controller', {
            messageId: message.id,
            queueSize: this.getQueueSize()
        });

        // 通知等待者有新消息
        this.notifyWaiters();

        return true;
    }

    /**
     * 获取下一个要处理的消息
     * @returns 下一个消息，如果队列为空则返回 null
     */
    async next(): Promise<MessageEnvelope | null> {
        if (this.messageQueue.length === 0) {
            return null;
        }

        const message = this.messageQueue.shift()!;
        this.activeMessages.add(message.id);

        // 检查背压状态
        this.checkBackpressureStatus();

        log.debug('Message retrieved from backpressure controller', {
            messageId: message.id,
            queueSize: this.getQueueSize()
        });

        return message;
    }

    /**
     * 标记一个消息处理完成
     * @param messageId 处理完成的消息ID
     */
    complete(messageId: string): void {
        if (this.activeMessages.has(messageId)) {
            this.activeMessages.delete(messageId);

            log.debug('Message completed', {
                messageId,
                activeCount: this.activeMessages.size
            });
        }
    }

    /**
     * 获取当前队列大小
     */
    getQueueSize(): number {
        return this.messageQueue.length + this.activeMessages.size;
    }

    /**
     * 检查背压是否激活
     */
    isBackpressureActive(): boolean {
        return this.backpressureActive;
    }

    /**
     * 获取队列使用率（0-1）
     */
    getQueueUtilization(): number {
        return this.getQueueSize() / this.config.maxQueueSize;
    }

    /**
     * 等待队列有空间
     * @param timeoutMs 等待超时时间（毫秒）
     * @returns 完成Promise
     */
    private waitForSpace(timeoutMs?: number): Promise<void> {
        return new Promise<void>((resolve, reject) => {
            const waiter = { resolve, reject };

            // 如果设置了超时
            if (timeoutMs) {
                const timeout = setTimeout(() => {
                    // 移除等待者
                    const index = this.waiters.indexOf(waiter);
                    if (index !== -1) {
                        this.waiters.splice(index, 1);
                    }

                    // 拒绝Promise
                    reject(new BackpressureTimeoutError(
                        `Wait for queue space timed out after ${timeoutMs}ms`,
                        this.getQueueSize(),
                        this.config.maxQueueSize,
                        timeoutMs
                    ));
                }, timeoutMs);

                // 添加超时标识
                (waiter as any).timeout = timeout;
            }

            // 添加到等待列表
            this.waiters.push(waiter as any);
        });
    }

    /**
     * 通知等待者有空间了
     */
    private notifyWaiters(): void {
        if (this.waiters.length === 0) {
            return;
        }

        // 检查队列是否有空间
        if (this.getQueueSize() < this.config.maxQueueSize) {
            const waiter = this.waiters.shift();
            if (waiter) {
                // 清除超时
                if (waiter.timeout) {
                    clearTimeout(waiter.timeout);
                }

                // 解决Promise
                waiter.resolve();
            }
        }
    }

    /**
     * 处理队列已满的情况
     * @param message 要处理的消息
     * @returns 如果消息被接受则返回 true，被拒绝则返回 false
     */
    private async handleFullQueue(message: MessageEnvelope): Promise<boolean> {
        log.warn('Queue is full, applying backpressure strategy', {
            strategy: this.config.strategy,
            queueSize: this.getQueueSize(),
            maxQueueSize: this.config.maxQueueSize
        });

        switch (this.config.strategy) {
            case BackpressureStrategy.DROP_NEW:
                // 丢弃新消息
                log.warn('Dropping new message due to backpressure', { messageId: message.id });
                this.emit('message:dropped', message, 'backpressure:drop_new');
                return false;

            case BackpressureStrategy.DROP_OLD:
                // 丢弃最旧的消息以腾出空间
                const oldestMessage = this.messageQueue.shift();
                if (oldestMessage) {
                    log.warn('Dropping oldest message due to backpressure', { messageId: oldestMessage.id });
                    this.emit('message:dropped', oldestMessage, 'backpressure:drop_old');
                }

                // 添加新消息
                this.messageQueue.push(message);
                return true;

            case BackpressureStrategy.THROW:
                // 抛出异常
                throw new BackpressureError(
                    `Queue is full (size: ${this.getQueueSize()}, max: ${this.config.maxQueueSize})`,
                    this.getQueueSize(),
                    this.config.maxQueueSize
                );

            case BackpressureStrategy.WAIT:
                // 等待队列有空间
                try {
                    await this.waitForSpace(this.config.waitTimeout);

                    // 等待成功，添加消息
                    this.messageQueue.push(message);
                    return true;
                } catch (error) {
                    if (error instanceof BackpressureTimeoutError) {
                        log.warn('Wait for queue space timed out', { messageId: message.id });
                        this.emit('message:dropped', message, 'backpressure:wait_timeout');
                    } else {
                        log.error('Error while waiting for queue space', { error });
                    }
                    return false;
                }

            default:
                // 未知策略，拒绝消息
                log.error('Unknown backpressure strategy', { strategy: this.config.strategy });
                return false;
        }
    }

    /**
     * 激活背压
     */
    private activateBackpressure(): void {
        if (!this.backpressureActive) {
            this.backpressureActive = true;

            log.warn('Backpressure activated', {
                queueSize: this.getQueueSize(),
                highWatermark: this.highWatermarkThreshold
            });

            this.emit('backpressure:activated', {
                queueSize: this.getQueueSize(),
                maxQueueSize: this.config.maxQueueSize,
                utilization: this.getQueueUtilization()
            });
        }
    }

    /**
     * 停用背压
     */
    private deactivateBackpressure(): void {
        if (this.backpressureActive) {
            this.backpressureActive = false;

            log.info('Backpressure deactivated', {
                queueSize: this.getQueueSize(),
                lowWatermark: this.lowWatermarkThreshold
            });

            this.emit('backpressure:deactivated', {
                queueSize: this.getQueueSize(),
                maxQueueSize: this.config.maxQueueSize,
                utilization: this.getQueueUtilization()
            });
        }
    }

    /**
     * 检查背压状态
     */
    private checkBackpressureStatus(): void {
        const queueSize = this.getQueueSize();

        // 如果背压已激活且队列大小低于低水位线，停用背压
        if (this.backpressureActive && queueSize <= this.lowWatermarkThreshold) {
            this.deactivateBackpressure();
        }
        // 如果背压未激活且队列大小高于高水位线，激活背压
        else if (!this.backpressureActive && queueSize >= this.highWatermarkThreshold) {
            this.activateBackpressure();
        }
    }

    /**
     * 验证配置
     */
    private validateConfig(): void {
        if (this.config.maxQueueSize <= 0) {
            throw new Error('maxQueueSize must be greater than 0');
        }

        if (this.config.highWatermark <= 0 || this.config.highWatermark > 1) {
            throw new Error('highWatermark must be between 0 and 1');
        }

        if (this.config.lowWatermark <= 0 || this.config.lowWatermark > 1) {
            throw new Error('lowWatermark must be between 0 and 1');
        }

        if (this.config.lowWatermark >= this.config.highWatermark) {
            throw new Error('lowWatermark must be less than highWatermark');
        }

        if (
            this.config.strategy === BackpressureStrategy.WAIT &&
            this.config.waitTimeout !== undefined &&
            this.config.waitTimeout <= 0
        ) {
            throw new Error('waitTimeout must be greater than 0');
        }
    }
} 