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

    constructor(config: BackpressureConfig, metricsCollector: SystemMetricsCollector) {
        this.config = config;
        this.metricsCollector = metricsCollector;

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

        log.info('BackpressureManager initialized', {
            enabled: config.enabled,
            defaultStrategy: config.strategy
        });
    }

    /**
     * 检查是否应该应用背压
     * @returns 是否应该应用背压
     */
    public shouldApplyBackpressure(): boolean {
        if (!this.config.enabled) {
            return false;
        }

        const now = Date.now();

        // 限制检查频率
        if (now - this.lastCheckTime < this.config.samplingInterval) {
            return this.state.isActive;
        }

        this.lastCheckTime = now;

        // 收集当前系统指标
        const metrics = this.collectMetrics();
        this.state.metrics = metrics;

        // 检查是否超过阈值
        const thresholds = this.config.thresholds;
        let shouldActivate = false;
        let triggerReason = '';

        if (metrics.currentQueueSize > thresholds.queueSize) {
            shouldActivate = true;
            triggerReason = 'Queue size threshold exceeded';
        } else if (metrics.memoryUsage > thresholds.memoryUsage) {
            shouldActivate = true;
            triggerReason = 'Memory usage threshold exceeded';
        } else if (metrics.cpuUsage > thresholds.cpuUsage) {
            shouldActivate = true;
            triggerReason = 'CPU usage threshold exceeded';
        } else if (metrics.messageRate > thresholds.messageRate) {
            shouldActivate = true;
            triggerReason = 'Message rate threshold exceeded';
        }

        // 状态变化处理
        if (shouldActivate && !this.state.isActive) {
            this.activateBackpressure(triggerReason);
        } else if (!shouldActivate && this.state.isActive) {
            this.deactivateBackpressure();
        }

        return this.state.isActive;
    }

    /**
     * 获取当前背压策略
     * @returns 当前背压策略
     */
    public getCurrentStrategy(): BackpressureStrategy {
        return this.state.currentStrategy;
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
     * @param config 新的背压配置
     */
    public updateConfig(config: Partial<BackpressureConfig>): void {
        this.config = { ...this.config, ...config };
        log.info('BackpressureManager config updated', { config: this.config });
    }

    /**
     * 通知消息被丢弃
     * @param count 丢弃的消息数量
     */
    public notifyMessagesDropped(count: number = 1): void {
        this.state.metrics.droppedMessages += count;
    }

    /**
     * 通知Actor被限流
     * @param count 限流的Actor数量
     */
    public notifyActorsThrottled(count: number = 1): void {
        this.state.metrics.throttledActors += count;
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
     * 激活背压
     * @param reason 触发原因
     */
    private activateBackpressure(reason: string): void {
        this.state.isActive = true;
        this.state.activationTime = Date.now();
        this.state.triggerReason = reason;

        // 确定要使用的策略
        if (this.config.strategy === BackpressureStrategy.ADAPTIVE) {
            this.state.currentStrategy = this.determineAdaptiveStrategy();
        } else {
            this.state.currentStrategy = this.config.strategy;
        }

        log.warn('Backpressure activated', {
            reason,
            strategy: this.state.currentStrategy,
            metrics: this.state.metrics
        });
    }

    /**
     * 停用背压
     */
    private deactivateBackpressure(): void {
        this.state.isActive = false;
        this.recoveryStartTime = Date.now();

        log.info('Backpressure deactivated', {
            recoveryPolicy: this.config.recoveryPolicy,
            activeTime: this.state.activationTime
                ? Math.floor((Date.now() - this.state.activationTime) / 1000) + 's'
                : 'unknown'
        });

        // 清除激活信息
        this.state.activationTime = undefined;
        this.state.triggerReason = undefined;
    }

    /**
     * 确定自适应策略
     */
    private determineAdaptiveStrategy(): BackpressureStrategy {
        const metrics = this.state.metrics;

        // 根据当前系统情况选择最合适的策略
        if (metrics.memoryUsage > 90) {
            // 内存使用率极高时，应该直接丢弃消息
            return BackpressureStrategy.DROP;
        } else if (metrics.cpuUsage > 85) {
            // CPU使用率高时，应该限流
            return BackpressureStrategy.THROTTLE;
        } else if (metrics.currentQueueSize > this.config.thresholds.queueSize * 1.5) {
            // 队列大小远超阈值时，应该丢弃
            return BackpressureStrategy.DROP;
        } else {
            // 默认使用缓冲策略
            return BackpressureStrategy.BUFFER;
        }
    }

    /**
     * 收集系统指标
     */
    private collectMetrics(): BackpressureMetrics {
        const systemMetrics = this.metricsCollector.collectMetrics();

        return {
            currentQueueSize: this.estimateQueueSize(),
            memoryUsage: systemMetrics.memory,
            cpuUsage: systemMetrics.cpu,
            messageRate: systemMetrics.messageRate,
            droppedMessages: this.state.metrics.droppedMessages,
            throttledActors: this.state.metrics.throttledActors
        };
    }

    /**
     * 估计当前队列大小
     */
    private estimateQueueSize(): number {
        // 在实际实现中，这应该从消息队列系统获取
        // 这里提供一个模拟实现
        return 0;
    }

    /**
     * 估计消息处理速率
     */
    private estimateMessageRate(): number {
        // 在实际实现中，这应该跟踪一段时间内的消息数量
        // 这里提供一个模拟实现
        return 0;
    }

    /**
     * 应用DROP策略
     */
    public applyDropStrategy(): void {
        log.debug('Applying DROP backpressure strategy');
        // 实际实现应该提供消息丢弃的逻辑
    }

    /**
     * 应用THROTTLE策略
     */
    public applyThrottleStrategy(): void {
        log.debug('Applying THROTTLE backpressure strategy');
        // 实际实现应该提供限流的逻辑
    }

    /**
     * 应用BUFFER策略
     */
    public applyBufferStrategy(): void {
        log.debug('Applying BUFFER backpressure strategy');
        // 实际实现应该提供消息缓冲的逻辑
    }
} 