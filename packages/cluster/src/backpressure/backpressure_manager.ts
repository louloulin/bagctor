import { log } from '@bactor/core';
import {
    BackpressureConfig,
    BackpressureStrategy,
    BackpressureState,
    BackpressureMetrics,
    RecoveryPolicy
} from '../types';
import { SystemMetricsCollector, SystemMetrics } from '../utils/system_metrics';

/**
 * 背压管理器
 * 负责检测和管理系统背压
 */
export class BackpressureManager {
    private config: BackpressureConfig;
    private metricsCollector: SystemMetricsCollector;
    private state: BackpressureState;
    private lastCheckTime: number = 0;
    private recoveryStartTime?: number;
    private isActive: boolean = false;
    private currentStrategy: BackpressureStrategy;
    private activationTime?: number;
    private droppedMessages: number = 0;
    private throttledActors: Set<string> = new Set();
    private throttledActorCount: number = 0; // 用于追踪被限流的Actor数量
    private bufferQueue: any[] = [];
    private maxBufferSize: number = 10000;
    private samplingInterval: NodeJS.Timer | null = null;
    private recoveryTimeout: NodeJS.Timer | null = null;

    constructor(config: BackpressureConfig, metricsCollector: SystemMetricsCollector) {
        this.config = config;
        this.metricsCollector = metricsCollector;
        this.currentStrategy = config.strategy;

        // 初始化背压状态
        this.state = {
            isActive: false,
            currentStrategy: config.strategy,
            metrics: {
                currentQueueSize: 0,
                memoryUsage: 0,
                cpuUsage: 0,
                messageRate: 0,
                droppedMessages: 0,
                throttledActors: 0
            }
        };

        // 启动周期性检查
        if (config.enabled) {
            this.startPeriodicCheck(config.samplingInterval);
        }

        log.info('BackpressureManager initialized', {
            enabled: config.enabled,
            strategy: config.strategy,
            thresholds: config.thresholds
        });
    }

    /**
     * 开始周期性检查系统负载
     */
    private startPeriodicCheck(interval: number): void {
        this.samplingInterval = setInterval(() => {
            this.checkBackpressureThresholds();
        }, interval);

        log.debug('Started periodic backpressure check', { interval });
    }

    /**
     * 停止周期性检查
     */
    public stopPeriodicCheck(): void {
        if (this.samplingInterval) {
            clearInterval(this.samplingInterval);
            this.samplingInterval = null;
        }

        if (this.recoveryTimeout) {
            clearTimeout(this.recoveryTimeout);
            this.recoveryTimeout = null;
        }

        log.debug('Stopped periodic backpressure check');
    }

    /**
     * 检查是否超过背压阈值
     */
    private checkBackpressureThresholds(): void {
        if (!this.config.enabled) return;

        const metrics = this.collectCurrentMetrics();
        const thresholds = this.config.thresholds;
        let shouldActivate = false;
        let triggerReason = '';

        // 检查每个阈值
        if (metrics.currentQueueSize > thresholds.queueSize) {
            shouldActivate = true;
            triggerReason = 'Queue size exceeded threshold';
        } else if (metrics.memoryUsage > thresholds.memoryUsage) {
            shouldActivate = true;
            triggerReason = 'Memory usage exceeded threshold';
        } else if (metrics.cpuUsage > thresholds.cpuUsage) {
            shouldActivate = true;
            triggerReason = 'CPU usage exceeded threshold';
        } else if (metrics.messageRate > thresholds.messageRate) {
            shouldActivate = true;
            triggerReason = 'Message rate exceeded threshold';
        }

        // 更新背压状态
        if (shouldActivate && !this.isActive) {
            this.activateBackpressure(triggerReason);
        } else if (!shouldActivate && this.isActive) {
            this.deactivateBackpressure();
        }
    }

    /**
     * 激活背压机制
     */
    private activateBackpressure(reason: string): void {
        this.isActive = true;
        this.activationTime = Date.now();
        this.currentStrategy = this.determineStrategy();

        log.warn('Backpressure activated', {
            reason,
            strategy: this.currentStrategy,
            metrics: this.collectCurrentMetrics()
        });
    }

    /**
     * 停用背压机制
     */
    private deactivateBackpressure(): void {
        this.isActive = false;
        this.activationTime = undefined;

        // 应用恢复策略
        this.applyRecoveryPolicy();

        // 清理背压状态
        this.throttledActors.clear();
        this.throttledActorCount = 0;

        log.info('Backpressure deactivated', {
            metrics: this.collectCurrentMetrics()
        });
    }

    /**
     * 确定当前应该使用的背压策略
     */
    private determineStrategy(): BackpressureStrategy {
        const configStrategy = this.config.strategy;
        if (configStrategy !== BackpressureStrategy.ADAPTIVE) {
            return configStrategy;
        }

        // 对于自适应策略，根据当前负载选择最合适的策略
        const metrics = this.collectCurrentMetrics();

        if (metrics.memoryUsage > 90) {
            // 内存接近极限，选择丢弃策略释放资源
            return BackpressureStrategy.DROP;
        } else if (metrics.cpuUsage > 80) {
            // CPU负载高，选择限流减轻处理压力
            return BackpressureStrategy.THROTTLE;
        } else {
            // 资源允许的情况下，优先选择缓冲
            return BackpressureStrategy.BUFFER;
        }
    }

    /**
     * 应用恢复策略
     */
    private applyRecoveryPolicy(): void {
        const recoveryPolicy = this.config.recoveryPolicy;

        switch (recoveryPolicy) {
            case RecoveryPolicy.IMMEDIATE:
                // 立即处理所有缓冲的消息
                this.processBufferedMessages(this.bufferQueue.length);
                break;

            case RecoveryPolicy.GRADUAL:
                // 逐步处理缓冲的消息
                this.scheduleGradualRecovery();
                break;

            case RecoveryPolicy.EXPONENTIAL:
                // 以指数增长的速率处理缓冲的消息
                this.scheduleExponentialRecovery();
                break;
        }
    }

    /**
     * 安排渐进式恢复
     */
    private scheduleGradualRecovery(): void {
        const batchSize = Math.ceil(this.bufferQueue.length / 10); // 分10批处理
        let processed = 0;

        const processNextBatch = () => {
            const remaining = this.bufferQueue.length - processed;
            if (remaining <= 0 || !this.config.enabled) return;

            const toProcess = Math.min(batchSize, remaining);
            this.processBufferedMessages(toProcess);
            processed += toProcess;

            // 安排下一批处理
            if (remaining > toProcess) {
                this.recoveryTimeout = setTimeout(processNextBatch, 1000);
            }
        };

        processNextBatch();
    }

    /**
     * 安排指数式恢复
     */
    private scheduleExponentialRecovery(): void {
        let batchSize = 1;

        const processNextBatch = () => {
            if (this.bufferQueue.length === 0 || !this.config.enabled) return;

            const toProcess = Math.min(batchSize, this.bufferQueue.length);
            this.processBufferedMessages(toProcess);

            // 指数增长批量大小
            batchSize *= 2;

            // 安排下一批处理
            if (this.bufferQueue.length > 0) {
                const nextInterval = Math.max(100, 1000 / batchSize); // 最小间隔100ms
                this.recoveryTimeout = setTimeout(processNextBatch, nextInterval);
            }
        };

        processNextBatch();
    }

    /**
     * 处理指定数量的缓冲消息
     */
    private processBufferedMessages(count: number): void {
        if (count <= 0 || this.bufferQueue.length === 0) return;

        const toProcess = Math.min(count, this.bufferQueue.length);
        const messages = this.bufferQueue.splice(0, toProcess);

        log.debug(`Processing ${toProcess} buffered messages`);

        // 在实际实现中，这里会将消息发送到处理流程
        // 此处简化为只记录日志
    }

    /**
     * 处理消息时检查是否应用背压
     */
    public shouldApplyBackpressure(): boolean {
        return this.isActive && this.config.enabled;
    }

    /**
     * 获取当前背压策略
     */
    public getCurrentStrategy(): BackpressureStrategy {
        return this.currentStrategy;
    }

    /**
     * 获取当前背压状态
     * @returns 背压状态
     */
    public getState(): BackpressureState {
        return { ...this.state };
    }

    /**
     * 获取背压配置
     * @returns 背压配置
     */
    public getConfig(): BackpressureConfig {
        return { ...this.config };
    }

    /**
     * 更新背压配置
     */
    public updateConfig(config: Partial<BackpressureConfig>): void {
        // 更新配置参数
        this.config = { ...this.config, ...config };

        // 如果启用状态发生变化，处理相应逻辑
        if (config.enabled !== undefined) {
            if (config.enabled && !this.samplingInterval) {
                this.startPeriodicCheck(this.config.samplingInterval);
            } else if (!config.enabled) {
                this.stopPeriodicCheck();
                this.deactivateBackpressure();
            }
        }

        // 如果采样间隔发生变化，重新启动检查
        if (config.samplingInterval !== undefined && this.config.enabled) {
            this.stopPeriodicCheck();
            this.startPeriodicCheck(config.samplingInterval);
        }

        log.info('BackpressureManager config updated', {
            enabled: this.config.enabled,
            strategy: this.config.strategy,
            thresholds: this.config.thresholds
        });
    }

    /**
     * 通知消息被丢弃
     * @param count 丢弃的消息数量
     */
    public notifyMessagesDropped(count: number = 1): void {
        this.droppedMessages += count;
    }

    /**
     * 通知Actor被限流
     * @param count 限流的Actor数量
     */
    public notifyActorsThrottled(count: number = 1): void {
        this.throttledActorCount += count;
    }

    /**
     * 重置背压状态
     */
    public reset(): void {
        this.state = {
            isActive: false,
            currentStrategy: this.config.strategy,
            metrics: {
                currentQueueSize: 0,
                memoryUsage: 0,
                cpuUsage: 0,
                messageRate: 0,
                droppedMessages: 0,
                throttledActors: 0
            }
        };

        this.lastCheckTime = 0;
        this.recoveryStartTime = undefined;

        log.info('BackpressureManager reset');
    }

    /**
     * 获取当前的背压指标
     */
    public getMetrics(): BackpressureMetrics {
        return this.collectCurrentMetrics();
    }

    /**
     * 收集当前的背压相关指标
     */
    private collectCurrentMetrics(): BackpressureMetrics {
        const nodeLoad = this.metricsCollector.collectMetrics();

        return {
            currentQueueSize: this.bufferQueue.length,
            memoryUsage: nodeLoad.memory,
            cpuUsage: nodeLoad.cpu,
            messageRate: nodeLoad.messageRate,
            droppedMessages: this.droppedMessages,
            throttledActors: this.throttledActorCount
        };
    }

    /**
     * 清理资源
     */
    public dispose(): void {
        this.stopPeriodicCheck();
        this.bufferQueue = [];
        this.throttledActors.clear();
        this.throttledActorCount = 0;
        this.droppedMessages = 0;
        this.isActive = false;
        log.info('BackpressureManager disposed');
    }
} 