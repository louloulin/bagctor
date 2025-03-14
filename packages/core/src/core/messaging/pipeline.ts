import { Message, PID } from '../types';
import { ActorSystem } from '../system';
import { MiddlewareChain } from './middleware';
import { log } from '../../utils/logger';

/**
 * 消息目标接口，表示可以接收消息的实体
 */
export interface MessageTarget {
    send(message: Message): Promise<boolean>;
    sendBatch(messages: Message[]): Promise<boolean[]>;
}

/**
 * 本地Actor目标，处理发送到本地Actor的消息
 */
export class LocalActorTarget implements MessageTarget {
    constructor(private readonly system: ActorSystem, private readonly pid: PID) { }

    async send(message: Message): Promise<boolean> {
        try {
            await this.system.send(this.pid, message);
            return true;
        } catch (error) {
            log.error(`Failed to send message to local actor ${this.pid.id}:`, error);
            return false;
        }
    }

    async sendBatch(messages: Message[]): Promise<boolean[]> {
        try {
            // 使用系统现有的批量发送方法
            const targets = messages.map(() => this.pid);

            // 对每个消息单独发送，因为 sendBatch 期望每个目标一条消息
            const promises = messages.map((message) =>
                this.system.send(this.pid, message)
                    .then(() => true)
                    .catch((error) => {
                        log.error(`Failed to send message to ${this.pid.id}:`, error);
                        return false;
                    })
            );

            return Promise.all(promises);
        } catch (error) {
            log.error(`Failed to send batch messages to local actor ${this.pid.id}:`, error);
            // 假定全部失败
            return messages.map(() => false);
        }
    }
}

/**
 * 远程Actor目标，处理发送到远程Actor的消息
 */
export class RemoteActorTarget implements MessageTarget {
    constructor(private readonly system: ActorSystem, private readonly pid: PID) {
        if (!pid.address) {
            throw new Error('Remote actor target requires an address');
        }
    }

    async send(message: Message): Promise<boolean> {
        try {
            await this.system.send(this.pid, message);
            return true;
        } catch (error) {
            log.error(`Failed to send message to remote actor ${this.pid.id}@${this.pid.address}:`, error);
            return false;
        }
    }

    async sendBatch(messages: Message[]): Promise<boolean[]> {
        try {
            // 对每个消息单独发送
            const promises = messages.map((message) =>
                this.system.send(this.pid, message)
                    .then(() => true)
                    .catch((error) => {
                        log.error(`Failed to send message to ${this.pid.id}@${this.pid.address}:`, error);
                        return false;
                    })
            );

            return Promise.all(promises);
        } catch (error) {
            log.error(`Failed to send batch messages to remote actor ${this.pid.id}@${this.pid.address}:`, error);
            // 假定全部失败
            return messages.map(() => false);
        }
    }
}

/**
 * 死信目标，处理无法送达的消息
 */
export class DeadLetterTarget implements MessageTarget {
    constructor(private readonly system: ActorSystem) { }

    async send(message: Message): Promise<boolean> {
        // 将消息发送到死信Actor或记录日志
        log.warn(`Dead letter: Could not deliver message of type ${message.type}`);
        // 实际实现可能会将消息存储到特定地方或通知监控系统
        return false;
    }

    async sendBatch(messages: Message[]): Promise<boolean[]> {
        // 批量处理死信
        for (const message of messages) {
            log.warn(`Dead letter: Could not deliver message of type ${message.type}`);
        }
        // 全部标记为处理失败
        return messages.map(() => false);
    }
}

/**
 * 消息处理管道配置选项
 */
export interface MessagePipelineConfig {
    /** 每批处理的最大消息数 */
    maxBatchSize?: number;
    /** 是否启用批处理优化 */
    enableBatchProcessing?: boolean;
    /** 并行处理的最大批次数 */
    maxConcurrentBatches?: number;
    /** 消息缓冲区大小限制 */
    bufferLimit?: number;
    /** 消息路由超时(ms) */
    routingTimeoutMs?: number;
}

/**
 * 消息处理管道 - 处理消息的路由、中间件处理和批处理
 */
export class MessagePipeline {
    private readonly config: Required<MessagePipelineConfig>;
    private readonly middlewareChain: MiddlewareChain;
    private readonly deadLetterTarget: DeadLetterTarget;

    // 缓存已解析的目标，提高路由性能
    private readonly targetCache = new Map<string, MessageTarget>();

    // 指标收集
    private metrics = {
        messagesProcessed: 0,
        batchesProcessed: 0,
        routingCacheHits: 0,
        routingCacheMisses: 0,
        deadLetters: 0,
        routingErrors: 0,
        processingTimeMs: 0
    };

    constructor(
        private readonly system: ActorSystem,
        config?: MessagePipelineConfig,
        middlewareChain?: MiddlewareChain
    ) {
        // 默认配置
        this.config = {
            maxBatchSize: 100,
            enableBatchProcessing: true,
            maxConcurrentBatches: 10,
            bufferLimit: 10000,
            routingTimeoutMs: 5000,
            ...config
        };

        this.middlewareChain = middlewareChain || new MiddlewareChain();
        this.deadLetterTarget = new DeadLetterTarget(system);
    }

    /**
     * 发送单个消息到目标
     */
    async send(target: PID, message: Message): Promise<boolean> {
        try {
            const startTime = performance.now();

            // 应用中间件处理
            const processedMessage = this.middlewareChain.processSend(message, target);
            if (!processedMessage) {
                // 消息被中间件拦截
                return false;
            }

            // 查找目标
            const messageTarget = await this.lookupTarget(target);
            if (!messageTarget) {
                this.metrics.deadLetters++;
                this.middlewareChain.processDeadLetter(processedMessage, target);
                return await this.deadLetterTarget.send(processedMessage);
            }

            // 发送消息
            const result = await messageTarget.send(processedMessage);

            // 更新指标
            this.metrics.messagesProcessed++;
            this.metrics.processingTimeMs += performance.now() - startTime;

            return result;
        } catch (error) {
            const e = error instanceof Error ? error : new Error(String(error));
            log.error(`Error sending message to ${target.id}@${target.address || 'local'}:`, e);
            this.middlewareChain.processError(e, message, target);
            this.metrics.routingErrors++;
            return false;
        }
    }

    /**
     * 批量发送消息到多个目标
     */
    async sendBatch(targets: PID[], messages: Message[]): Promise<boolean[]> {
        if (targets.length !== messages.length) {
            throw new Error('Number of targets must match number of messages');
        }

        const startTime = performance.now();

        try {
            // 如果批量小于阈值，直接发送单条消息可能更高效
            if (targets.length <= 5 || !this.config.enableBatchProcessing) {
                const results = await Promise.all(
                    targets.map((target, index) => this.send(target, messages[index]))
                );
                return results;
            }

            // 对消息按目标分组，提高批处理效率
            const batches = this.createTargetBatches(targets, messages);

            // 并行处理批次，但限制并发数
            const results = new Array(targets.length).fill(false);
            const batchPromises: Promise<void>[] = [];

            for (const [targetKey, batch] of batches.entries()) {
                const promise = (async () => {
                    try {
                        const { target, indices, batchMessages } = batch;

                        // 查找目标并发送批量消息
                        const messageTarget = await this.lookupTarget(target);
                        if (!messageTarget) {
                            // 目标未找到，将这批消息全部标记为死信
                            for (let i = 0; i < indices.length; i++) {
                                this.metrics.deadLetters++;
                                this.middlewareChain.processDeadLetter(batchMessages[i], target);
                                await this.deadLetterTarget.send(batchMessages[i]);
                            }
                            return;
                        }

                        // 处理每个消息通过中间件
                        const processedMessages: (Message | null)[] = [];
                        for (let i = 0; i < batchMessages.length; i++) {
                            const processed = this.middlewareChain.processSend(batchMessages[i], target);
                            processedMessages.push(processed);
                        }

                        // 过滤掉被中间件拦截的消息
                        const validMessages: Message[] = [];
                        const validIndices: number[] = [];

                        for (let i = 0; i < processedMessages.length; i++) {
                            if (processedMessages[i]) {
                                validMessages.push(processedMessages[i] as Message);
                                validIndices.push(indices[i]);
                            }
                        }

                        if (validMessages.length > 0) {
                            // 批量发送有效消息
                            const batchResults = await messageTarget.sendBatch(validMessages);

                            // 更新结果
                            for (let i = 0; i < validIndices.length; i++) {
                                results[validIndices[i]] = batchResults[i];
                            }
                        }
                    } catch (error) {
                        const e = error instanceof Error ? error : new Error(String(error));
                        log.error(`Error processing batch:`, e);
                        this.metrics.routingErrors++;
                    }
                })();

                batchPromises.push(promise);

                // 控制并发数
                if (batchPromises.length >= this.config.maxConcurrentBatches) {
                    await Promise.all(batchPromises);
                    batchPromises.length = 0;
                }
            }

            // 等待剩余批次完成
            if (batchPromises.length > 0) {
                await Promise.all(batchPromises);
            }

            // 更新指标
            this.metrics.messagesProcessed += messages.length;
            this.metrics.batchesProcessed++;
            this.metrics.processingTimeMs += performance.now() - startTime;

            return results;
        } catch (error) {
            const e = error instanceof Error ? error : new Error(String(error));
            log.error(`Error in batch send operation:`, e);
            this.metrics.routingErrors++;
            return new Array(targets.length).fill(false);
        }
    }

    /**
     * 查找消息目标，尝试从缓存获取，否则创建新的目标
     */
    private async lookupTarget(target: PID): Promise<MessageTarget | null> {
        const targetKey = `${target.id}@${target.address || 'local'}`;

        // 尝试从缓存获取
        if (this.targetCache.has(targetKey)) {
            this.metrics.routingCacheHits++;
            return this.targetCache.get(targetKey) as MessageTarget;
        }

        this.metrics.routingCacheMisses++;

        // 创建新目标
        try {
            let messageTarget: MessageTarget;

            if (!target.address) {
                // 本地Actor
                messageTarget = new LocalActorTarget(this.system, target);
            } else {
                // 远程Actor
                messageTarget = new RemoteActorTarget(this.system, target);
            }

            // 缓存目标
            this.targetCache.set(targetKey, messageTarget);
            return messageTarget;
        } catch (error) {
            log.error(`Failed to create message target for ${targetKey}:`, error);
            return null;
        }
    }

    /**
     * 将消息按目标分组，优化批处理
     */
    private createTargetBatches(targets: PID[], messages: Message[]): Map<string, TargetBatch> {
        const batches = new Map<string, TargetBatch>();

        for (let i = 0; i < targets.length; i++) {
            const target = targets[i];
            const message = messages[i];
            const targetKey = `${target.id}@${target.address || 'local'}`;

            if (!batches.has(targetKey)) {
                batches.set(targetKey, {
                    target,
                    indices: [],
                    batchMessages: []
                });
            }

            const batch = batches.get(targetKey) as TargetBatch;
            batch.indices.push(i);
            batch.batchMessages.push(message);

            // 如果批次达到最大大小，分割成新的批次
            if (batch.batchMessages.length >= this.config.maxBatchSize) {
                const newBatchKey = `${targetKey}-${Date.now()}`;
                batches.set(newBatchKey, {
                    target,
                    indices: [],
                    batchMessages: []
                });
            }
        }

        return batches;
    }

    /**
     * 创建适当大小的消息块，避免处理过大的批次
     */
    private createChunks<T>(items: T[], chunkSize: number): T[][] {
        const chunks: T[][] = [];
        for (let i = 0; i < items.length; i += chunkSize) {
            chunks.push(items.slice(i, i + chunkSize));
        }
        return chunks;
    }

    /**
     * 获取管道处理指标
     */
    getMetrics() {
        return { ...this.metrics };
    }

    /**
     * 重置指标
     */
    resetMetrics() {
        this.metrics = {
            messagesProcessed: 0,
            batchesProcessed: 0,
            routingCacheHits: 0,
            routingCacheMisses: 0,
            deadLetters: 0,
            routingErrors: 0,
            processingTimeMs: 0
        };
    }

    /**
     * 清空目标缓存
     */
    clearTargetCache() {
        this.targetCache.clear();
    }

    /**
     * 添加中间件到处理链中
     */
    addMiddleware(middleware: any) {
        this.middlewareChain.add(middleware);
        return this;
    }
}

/**
 * 目标批次类型，用于消息批处理
 */
interface TargetBatch {
    target: PID;
    indices: number[];
    batchMessages: Message[];
} 