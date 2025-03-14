import { ActorSystem } from '../../../core/system';
import { Message, PID } from '../../../core/types';
import { MetricRegistry, Counter, Gauge, Histogram, Meter } from './collector';
import { log } from '../../../utils/logger';

export interface ActorMetricsConfig {
    enabled: boolean;
    actorCreationEnabled: boolean;
    messageProcessingEnabled: boolean;
    mailboxMetricsEnabled: boolean;
    detailedMetricsEnabled: boolean;
    histogramBuckets: number[];
}

export interface MessageProcessingMetrics {
    processingTime: Histogram;
    messageCount: Counter;
    messageRate: Meter;
    errorCount: Counter;
    bytesProcessed: Counter;
}

export interface SystemMetrics {
    activeActors: Gauge;
    actorCreationRate: Meter;
    messageDeliveryRate: Meter;
    errorRate: Meter;
    deadLetters: Counter;
    restarts: Counter;
}

export interface MailboxMetrics {
    size: Gauge;
    enqueueRate: Meter;
    dequeueRate: Meter;
    processingTime: Histogram;
    waitTime: Histogram;
}

// Actor系统指标收集适配器
export class ActorMetricsCollector {
    private registry: MetricRegistry;
    private config: ActorMetricsConfig;
    private system: ActorSystem;
    private systemMetrics: SystemMetrics;
    private actorMetrics: Map<string, MessageProcessingMetrics> = new Map();
    private mailboxMetrics: Map<string, MailboxMetrics> = new Map();
    private messageStartTimes: Map<string, Map<string, number>> = new Map();
    private messageEnqueueTimes: Map<string, Map<string, number>> = new Map();

    constructor(system: ActorSystem, config: ActorMetricsConfig) {
        this.system = system;
        this.registry = MetricRegistry.getInstance();
        this.config = {
            enabled: true,
            actorCreationEnabled: true,
            messageProcessingEnabled: true,
            mailboxMetricsEnabled: true,
            detailedMetricsEnabled: false,
            histogramBuckets: [
                0.1, 0.5, 1, 5, 10, 25, 50, 100, 250, 500, 1000, 2500, 5000, 10000
            ],
            ...config
        };

        this.systemMetrics = this.initializeSystemMetrics();
        log.info('Actor metrics collector initialized');
    }

    // 启动指标收集
    start(): void {
        if (!this.config.enabled) {
            log.info('Actor metrics collection is disabled');
            return;
        }

        this.attachHooks();
        log.info('Actor metrics collection started');
    }

    // 停止指标收集
    stop(): void {
        if (!this.config.enabled) {
            return;
        }

        // 在这里应该实现移除钩子的逻辑
        log.info('Actor metrics collection stopped');
    }

    // 初始化系统级指标
    private initializeSystemMetrics(): SystemMetrics {
        return {
            activeActors: this.registry.createGauge(
                'bactor_active_actors',
                'Number of active actors in the system',
                { type: 'system' }
            ),
            actorCreationRate: this.registry.createMeter(
                'bactor_actor_creation_rate',
                'Rate of actor creation',
                { type: 'system' }
            ),
            messageDeliveryRate: this.registry.createMeter(
                'bactor_message_delivery_rate',
                'Rate of message delivery',
                { type: 'system' }
            ),
            errorRate: this.registry.createMeter(
                'bactor_error_rate',
                'Rate of errors',
                { type: 'system' }
            ),
            deadLetters: this.registry.createCounter(
                'bactor_dead_letters',
                'Number of dead letters',
                { type: 'system' }
            ),
            restarts: this.registry.createCounter(
                'bactor_restarts',
                'Number of actor restarts',
                { type: 'system' }
            )
        };
    }

    // 获取或创建特定Actor的指标
    private getOrCreateActorMetrics(actorId: string, actorType: string): MessageProcessingMetrics {
        if (this.actorMetrics.has(actorId)) {
            return this.actorMetrics.get(actorId)!;
        }

        const metrics: MessageProcessingMetrics = {
            processingTime: this.registry.createHistogram(
                'bactor_message_processing_time',
                'Time to process a message',
                this.config.histogramBuckets,
                { actorId, actorType, type: 'actor' }
            ),
            messageCount: this.registry.createCounter(
                'bactor_processed_messages',
                'Number of processed messages',
                { actorId, actorType, type: 'actor' }
            ),
            messageRate: this.registry.createMeter(
                'bactor_message_processing_rate',
                'Rate of message processing',
                { actorId, actorType, type: 'actor' }
            ),
            errorCount: this.registry.createCounter(
                'bactor_processing_errors',
                'Number of message processing errors',
                { actorId, actorType, type: 'actor' }
            ),
            bytesProcessed: this.registry.createCounter(
                'bactor_bytes_processed',
                'Number of bytes processed',
                { actorId, actorType, type: 'actor' }
            )
        };

        this.actorMetrics.set(actorId, metrics);
        return metrics;
    }

    // 获取或创建特定Actor的邮箱指标
    private getOrCreateMailboxMetrics(actorId: string, actorType: string): MailboxMetrics {
        if (this.mailboxMetrics.has(actorId)) {
            return this.mailboxMetrics.get(actorId)!;
        }

        const metrics: MailboxMetrics = {
            size: this.registry.createGauge(
                'bactor_mailbox_size',
                'Size of actor mailbox',
                { actorId, actorType, type: 'mailbox' }
            ),
            enqueueRate: this.registry.createMeter(
                'bactor_mailbox_enqueue_rate',
                'Rate of message enqueuing',
                { actorId, actorType, type: 'mailbox' }
            ),
            dequeueRate: this.registry.createMeter(
                'bactor_mailbox_dequeue_rate',
                'Rate of message dequeuing',
                { actorId, actorType, type: 'mailbox' }
            ),
            processingTime: this.registry.createHistogram(
                'bactor_mailbox_processing_time',
                'Time to process a message from mailbox',
                this.config.histogramBuckets,
                { actorId, actorType, type: 'mailbox' }
            ),
            waitTime: this.registry.createHistogram(
                'bactor_mailbox_wait_time',
                'Time a message waits in the mailbox',
                this.config.histogramBuckets,
                { actorId, actorType, type: 'mailbox' }
            )
        };

        this.mailboxMetrics.set(actorId, metrics);
        return metrics;
    }

    // 为消息生成唯一ID
    private generateMessageId(message: Message, target: PID): string {
        return `${message.type}_${target.id}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }

    // 获取消息大小（粗略估计）
    private getMessageSize(message: Message): number {
        return JSON.stringify(message).length;
    }

    // 记录消息处理开始
    private recordMessageStart(message: Message, target: PID): string {
        if (!this.config.messageProcessingEnabled) return '';

        const messageId = this.generateMessageId(message, target);
        let actorTimes = this.messageStartTimes.get(target.id);

        if (!actorTimes) {
            actorTimes = new Map<string, number>();
            this.messageStartTimes.set(target.id, actorTimes);
        }

        actorTimes.set(messageId, Date.now());
        return messageId;
    }

    // 记录消息处理结束
    private recordMessageEnd(messageId: string, target: PID, error?: Error): void {
        if (!this.config.messageProcessingEnabled || !messageId) return;

        const actorTimes = this.messageStartTimes.get(target.id);
        if (!actorTimes) return;

        const startTime = actorTimes.get(messageId);
        if (startTime) {
            const endTime = Date.now();
            const processingTime = endTime - startTime;

            const actorType = target.address || 'unknown';
            const metrics = this.getOrCreateActorMetrics(target.id, actorType);

            metrics.processingTime.observe(processingTime);
            metrics.messageCount.inc(1);
            metrics.messageRate.mark(1);

            if (error) {
                metrics.errorCount.inc(1);
                this.systemMetrics.errorRate.mark(1);
            }

            actorTimes.delete(messageId);
        }
    }

    // 记录消息入队
    private recordMessageEnqueue(message: Message, target: PID): string {
        if (!this.config.mailboxMetricsEnabled) return '';

        const messageId = this.generateMessageId(message, target);
        let enqueueTimes = this.messageEnqueueTimes.get(target.id);

        if (!enqueueTimes) {
            enqueueTimes = new Map<string, number>();
            this.messageEnqueueTimes.set(target.id, enqueueTimes);
        }

        enqueueTimes.set(messageId, Date.now());

        const actorType = target.address || 'unknown';
        const metrics = this.getOrCreateMailboxMetrics(target.id, actorType);
        metrics.enqueueRate.mark(1);
        metrics.size.inc(1);

        return messageId;
    }

    // 记录消息出队
    private recordMessageDequeue(messageId: string, target: PID): void {
        if (!this.config.mailboxMetricsEnabled || !messageId) return;

        const enqueueTimes = this.messageEnqueueTimes.get(target.id);
        if (!enqueueTimes) return;

        const enqueueTime = enqueueTimes.get(messageId);
        if (enqueueTime) {
            const dequeueTime = Date.now();
            const waitTime = dequeueTime - enqueueTime;

            const actorType = target.address || 'unknown';
            const metrics = this.getOrCreateMailboxMetrics(target.id, actorType);

            metrics.waitTime.observe(waitTime);
            metrics.dequeueRate.mark(1);
            metrics.size.dec(1);

            enqueueTimes.delete(messageId);
        }
    }

    // 附加系统钩子
    private attachHooks(): void {
        if (this.config.actorCreationEnabled) {
            this.system.addActorCreationHook((actor: PID) => {
                this.systemMetrics.activeActors.inc(1);
                this.systemMetrics.actorCreationRate.mark(1);
                log.debug(`Actor created: ${actor.id}`);
                return true;
            });

            this.system.addActorTerminationHook((actor: PID) => {
                this.systemMetrics.activeActors.dec(1);
                log.debug(`Actor terminated: ${actor.id}`);
                return true;
            });
        }

        if (this.config.messageProcessingEnabled) {
            this.system.addMessageInterceptor(async (msg: Message, source: PID, target: PID) => {
                this.systemMetrics.messageDeliveryRate.mark(1);

                const messageId = this.recordMessageStart(msg, target);
                const enqueueId = this.recordMessageEnqueue(msg, target);

                try {
                    // 处理消息大小
                    if (this.config.detailedMetricsEnabled) {
                        const actorType = target.address || 'unknown';
                        const metrics = this.getOrCreateActorMetrics(target.id, actorType);
                        metrics.bytesProcessed.inc(this.getMessageSize(msg));
                    }
                    return true;
                } catch (error) {
                    // 记录错误
                    if (error instanceof Error) {
                        this.recordMessageEnd(messageId, target, error);
                    }
                    return false;
                } finally {
                    // 清理
                    setTimeout(() => {
                        this.recordMessageDequeue(enqueueId, target);
                        this.recordMessageEnd(messageId, target);
                    }, 0);
                }
            });
        }

        // 死信处理
        this.system.addDeadLetterHook((msg: Message, target: PID) => {
            this.systemMetrics.deadLetters.inc(1);
            log.debug(`Dead letter: ${msg.type} for ${target.id}`);
            return true;
        });

        // 重启处理
        this.system.addRestartHook((actor: PID, error: Error) => {
            this.systemMetrics.restarts.inc(1);
            log.debug(`Actor restart: ${actor.id} due to ${error.message}`);
            return true;
        });
    }
} 