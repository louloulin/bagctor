import { Message, PID } from '../types';
import { log } from '../../utils/logger';
import { ActorSystem } from '../system';

/**
 * 消息中间件接口，允许拦截和处理消息
 */
export interface MessageMiddleware {
    /**
     * 处理传出消息
     * @returns 处理后的消息，如果返回null则终止消息传递
     */
    onSend?(message: Message, target: PID): Message | null;

    /**
     * 处理传入消息
     * @returns 处理后的消息，如果返回null则终止消息传递
     */
    onReceive?(message: Message, target: PID): Message | null;

    /**
     * 处理死信
     */
    onDeadLetter?(message: Message, target: PID): void;

    /**
     * 处理错误
     */
    onError?(error: Error, message: Message, target: PID): void;
}

/**
 * 日志中间件 - 记录消息传递过程
 */
export class LoggingMiddleware implements MessageMiddleware {
    constructor(private readonly logLevel: 'debug' | 'info' | 'warn' | 'error' = 'info') { }

    onSend(message: Message, target: PID): Message {
        if (this.logLevel === 'debug') {
            log.debug(`[SEND] ${target.id}@${target.address || 'local'} <- ${message.type}`);
        }
        return message;
    }

    onReceive(message: Message, target: PID): Message {
        if (this.logLevel === 'debug') {
            log.debug(`[RECV] ${target.id}@${target.address || 'local'} -> ${message.type}`);
        }
        return message;
    }

    onDeadLetter(message: Message, target: PID): void {
        log.warn(`[DEAD] Could not deliver ${message.type} to ${target.id}@${target.address || 'local'}`);
    }

    onError(error: Error, message: Message, target: PID): void {
        log.error(`[ERROR] Error processing ${message.type} for ${target.id}@${target.address || 'local'}:`, error);
    }
}

/**
 * 指标中间件 - 收集消息处理统计信息
 */
export class MetricsMiddleware implements MessageMiddleware {
    private metrics = {
        messagesSent: 0,
        messagesReceived: 0,
        deadLetters: 0,
        errors: 0,
        messageTypeCount: new Map<string, number>(),
        processingTime: {
            totalMs: 0,
            count: 0,
            avgMs: 0,
            maxMs: 0,
            minMs: Number.MAX_SAFE_INTEGER
        }
    };

    // 记录消息处理开始时间
    private processingStartTimes = new Map<string, number>();

    onSend(message: Message, target: PID): Message {
        this.metrics.messagesSent++;
        this.incrementTypeCount(message.type);

        // 生成消息标识符用于追踪处理时间
        const messageId = `${message.messageId || Math.random().toString(36).substring(2, 15)}-${Date.now()}`;
        const wrappedMessage = { ...message, trackingId: messageId };

        // 记录处理开始时间
        this.processingStartTimes.set(messageId, performance.now());

        return wrappedMessage;
    }

    onReceive(message: Message, target: PID): Message {
        this.metrics.messagesReceived++;

        // 如果消息有追踪ID，记录处理结束时间
        if ((message as any).trackingId) {
            const messageId = (message as any).trackingId;
            const startTime = this.processingStartTimes.get(messageId);

            if (startTime) {
                const processingTime = performance.now() - startTime;
                this.processingStartTimes.delete(messageId);

                // 更新处理时间统计
                this.metrics.processingTime.totalMs += processingTime;
                this.metrics.processingTime.count++;
                this.metrics.processingTime.avgMs = this.metrics.processingTime.totalMs / this.metrics.processingTime.count;
                this.metrics.processingTime.maxMs = Math.max(this.metrics.processingTime.maxMs, processingTime);
                this.metrics.processingTime.minMs = Math.min(this.metrics.processingTime.minMs, processingTime);
            }
        }

        return message;
    }

    onDeadLetter(message: Message, target: PID): void {
        this.metrics.deadLetters++;
    }

    onError(error: Error, message: Message, target: PID): void {
        this.metrics.errors++;
    }

    private incrementTypeCount(type: string): void {
        const count = this.metrics.messageTypeCount.get(type) || 0;
        this.metrics.messageTypeCount.set(type, count + 1);
    }

    /**
     * 获取收集的指标
     */
    getMetrics() {
        return {
            ...this.metrics,
            messageTypeCount: Object.fromEntries(this.metrics.messageTypeCount.entries())
        };
    }

    /**
     * 重置指标
     */
    resetMetrics() {
        this.metrics = {
            messagesSent: 0,
            messagesReceived: 0,
            deadLetters: 0,
            errors: 0,
            messageTypeCount: new Map<string, number>(),
            processingTime: {
                totalMs: 0,
                count: 0,
                avgMs: 0,
                maxMs: 0,
                minMs: Number.MAX_SAFE_INTEGER
            }
        };
        this.processingStartTimes.clear();
    }
}

/**
 * 重试中间件 - 自动重试失败的消息
 */
export class RetryMiddleware implements MessageMiddleware {
    private retries = new Map<string, number>();
    private system: ActorSystem;

    constructor(
        system: ActorSystem,
        private readonly maxRetries: number = 3,
        private readonly retryDelayMs: number = 100,
        private readonly backoffFactor: number = 2
    ) {
        this.system = system;
    }

    onError(error: Error, message: Message, target: PID): void {
        const messageId = message.messageId || '';
        const retryCount = (this.retries.get(messageId) || 0) + 1;

        if (retryCount <= this.maxRetries) {
            // 更新重试计数
            this.retries.set(messageId, retryCount);

            // 计算延迟时间，使用指数退避
            const delay = this.retryDelayMs * Math.pow(this.backoffFactor, retryCount - 1);

            log.info(`[RETRY] Retrying message ${message.type} (${retryCount}/${this.maxRetries}) after ${delay}ms`);

            // 延迟重试
            setTimeout(() => {
                // 使用系统重发消息
                this.system.send(target, {
                    ...message,
                    metadata: {
                        ...(message.metadata || {}),
                        retryCount,
                        originalTimestamp: message.metadata?.originalTimestamp || Date.now()
                    }
                }).catch((retryError: Error) => {
                    log.error(`[RETRY] Failed to retry message ${message.type}:`, retryError);
                });
            }, delay);
        } else {
            log.warn(`[RETRY] Max retries (${this.maxRetries}) reached for message ${message.type}`);
            // 清理重试记录
            this.retries.delete(messageId);
        }
    }
}

/**
 * 中间件链 - 管理多个中间件的执行
 */
export class MiddlewareChain {
    private middlewares: MessageMiddleware[] = [];

    /**
     * 添加中间件到链中
     */
    add(middleware: MessageMiddleware): this {
        this.middlewares.push(middleware);
        return this;
    }

    /**
     * 处理发送消息
     */
    processSend(message: Message, target: PID): Message | null {
        let processedMessage = message;

        for (const middleware of this.middlewares) {
            if (middleware.onSend) {
                const result = middleware.onSend(processedMessage, target);
                if (!result) return null;
                processedMessage = result;
            }
        }

        return processedMessage;
    }

    /**
     * 处理接收消息
     */
    processReceive(message: Message, target: PID): Message | null {
        let processedMessage = message;

        for (const middleware of this.middlewares) {
            if (middleware.onReceive) {
                const result = middleware.onReceive(processedMessage, target);
                if (!result) return null;
                processedMessage = result;
            }
        }

        return processedMessage;
    }

    /**
     * 处理死信
     */
    processDeadLetter(message: Message, target: PID): void {
        for (const middleware of this.middlewares) {
            if (middleware.onDeadLetter) {
                middleware.onDeadLetter(message, target);
            }
        }
    }

    /**
     * 处理错误
     */
    processError(error: Error, message: Message, target: PID): void {
        for (const middleware of this.middlewares) {
            if (middleware.onError) {
                middleware.onError(error, message, target);
            }
        }
    }
} 