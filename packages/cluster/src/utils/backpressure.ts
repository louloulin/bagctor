import { BackpressureStrategy, RecoveryPolicy, BackpressureConfig } from '../types';
import { log } from '@bactor/core';
import { SystemMetricsCollector } from './system_metrics';

/**
 * 消息处理优先级定义
 */
export enum MessagePriority {
    HIGH = 0,
    MEDIUM = 1,
    LOW = 2
}

/**
 * 背压策略管理器 - 实现各种背压策略
 */
export class BackpressureManager {
    private config: BackpressureConfig;
    private metricsCollector: SystemMetricsCollector;
    private isActive: boolean = false;
    private currentStrategy: BackpressureStrategy;
    private throttleRate: number = 1.0; // 限流率 (0-1)
    private dropRate: number = 0.0; // 丢弃率 (0-1)
    private bufferSizeLimit: number = 10000; // 缓冲区大小限制
    private recoveryStartTime: number = 0;
    private recoveryDuration: number = 30000; // 30秒恢复期

    // 跟踪被限流的Actor IDs
    private throttledActors: Set<string> = new Set();
    // 消息优先级队列
    private messageBuffer: Map<MessagePriority, any[]> = new Map();

    constructor(config: BackpressureConfig, metricsCollector: SystemMetricsCollector) {
        this.config = config;
        this.metricsCollector = metricsCollector;
        this.currentStrategy = config.strategy;

        // 初始化消息缓冲区
        this.messageBuffer.set(MessagePriority.HIGH, []);
        this.messageBuffer.set(MessagePriority.MEDIUM, []);
        this.messageBuffer.set(MessagePriority.LOW, []);
    }

    /**
     * 检查是否需要应用背压
     * @returns 是否应用了背压
     */
    public checkAndApplyBackpressure(): boolean {
        const metrics = {
            queueSize: this.metricsCollector.estimateQueueSize(),
            memoryUsage: this.metricsCollector.getMemoryUsage(),
            cpuUsage: this.metricsCollector.getCPUUsage(),
            messageRate: this.metricsCollector.getMessageRate()
        };

        // 检查是否超过了阈值
        const thresholds = this.config.thresholds;
        const thresholdExceeded = (
            metrics.queueSize > thresholds.queueSize ||
            metrics.memoryUsage > thresholds.memoryUsage ||
            metrics.cpuUsage > thresholds.cpuUsage ||
            metrics.messageRate > thresholds.messageRate
        );

        if (thresholdExceeded && !this.isActive) {
            // 激活背压策略
            const reason = this.determineBackpressureReason(metrics, thresholds);
            this.activateBackpressure(reason);
            return true;
        } else if (!thresholdExceeded && this.isActive) {
            // 检查是否可以解除背压
            this.checkDeactivateBackpressure(metrics);
        } else if (this.isActive) {
            // 更新当前策略
            this.updateBackpressureStrategy(metrics);
        }

        return this.isActive;
    }

    /**
     * 确定触发背压的原因
     */
    private determineBackpressureReason(
        metrics: {
            queueSize: number;
            memoryUsage: number;
            cpuUsage: number;
            messageRate: number;
        },
        thresholds: {
            queueSize: number;
            memoryUsage: number;
            cpuUsage: number;
            messageRate: number;
        }
    ): string {
        const reasons = [];

        if (metrics.queueSize > thresholds.queueSize) {
            reasons.push(`Queue size (${metrics.queueSize} > ${thresholds.queueSize})`);
        }
        if (metrics.memoryUsage > thresholds.memoryUsage) {
            reasons.push(`Memory usage (${metrics.memoryUsage.toFixed(1)}% > ${thresholds.memoryUsage}%)`);
        }
        if (metrics.cpuUsage > thresholds.cpuUsage) {
            reasons.push(`CPU usage (${metrics.cpuUsage.toFixed(1)}% > ${thresholds.cpuUsage}%)`);
        }
        if (metrics.messageRate > thresholds.messageRate) {
            reasons.push(`Message rate (${metrics.messageRate.toFixed(1)} > ${thresholds.messageRate} msg/s)`);
        }

        return reasons.join(', ');
    }

    /**
     * 激活背压策略
     */
    private activateBackpressure(reason: string): void {
        this.isActive = true;
        this.currentStrategy = this.determineOptimalStrategy();

        log.warn('Activating backpressure', {
            reason,
            strategy: BackpressureStrategy[this.currentStrategy]
        });

        // 应用选择的策略
        this.applyBackpressureStrategy(this.currentStrategy);
    }

    /**
     * 检查是否可以解除背压
     */
    private checkDeactivateBackpressure(metrics: Record<string, number>): void {
        const thresholds = this.config.thresholds;

        // 使用较低的阈值来防止频繁切换
        const safeToDeactivate = (
            metrics.queueSize < thresholds.queueSize * 0.7 &&
            metrics.memoryUsage < thresholds.memoryUsage * 0.7 &&
            metrics.cpuUsage < thresholds.cpuUsage * 0.7 &&
            metrics.messageRate < thresholds.messageRate * 0.7
        );

        if (safeToDeactivate) {
            this.deactivateBackpressure();
        }
    }

    /**
     * 解除背压策略
     */
    private deactivateBackpressure(): void {
        if (!this.isActive) return;

        log.info('Deactivating backpressure');

        // 启动恢复过程
        this.recoveryStartTime = Date.now();
        this.applyRecoveryPolicy(this.config.recoveryPolicy);

        // 重置背压状态
        this.isActive = false;
        this.throttleRate = 1.0;
        this.dropRate = 0.0;
        this.throttledActors.clear();
    }

    /**
     * 确定最佳背压策略
     */
    private determineOptimalStrategy(): BackpressureStrategy {
        // 如果配置了固定策略，直接使用
        if (this.config.strategy !== BackpressureStrategy.ADAPTIVE) {
            return this.config.strategy;
        }

        // 根据当前负载情况自适应选择策略
        const metrics = {
            queueSize: this.metricsCollector.estimateQueueSize(),
            memoryUsage: this.metricsCollector.getMemoryUsage(),
            cpuUsage: this.metricsCollector.getCPUUsage(),
            messageRate: this.metricsCollector.getMessageRate()
        };

        // 根据不同的指标选择不同的策略
        if (metrics.memoryUsage > 90 || metrics.cpuUsage > 90) {
            // 系统资源严重不足，选择丢弃策略
            return BackpressureStrategy.DROP;
        } else if (metrics.queueSize > this.config.thresholds.queueSize * 2) {
            // 队列过长，也选择丢弃
            return BackpressureStrategy.DROP;
        } else if (metrics.messageRate > this.config.thresholds.messageRate * 1.5) {
            // 消息速率过高，选择限流
            return BackpressureStrategy.THROTTLE;
        } else {
            // 其他情况选择缓冲
            return BackpressureStrategy.BUFFER;
        }
    }

    /**
     * 更新当前背压策略
     */
    private updateBackpressureStrategy(metrics: Record<string, number>): void {
        // 只有在自适应模式下才需要动态更新策略
        if (this.config.strategy !== BackpressureStrategy.ADAPTIVE) {
            return;
        }

        const newStrategy = this.determineOptimalStrategy();
        if (newStrategy !== this.currentStrategy) {
            log.info('Switching backpressure strategy', {
                from: BackpressureStrategy[this.currentStrategy],
                to: BackpressureStrategy[newStrategy]
            });

            this.currentStrategy = newStrategy;
            this.applyBackpressureStrategy(newStrategy);
        }
    }

    /**
     * 应用背压策略
     */
    private applyBackpressureStrategy(strategy: BackpressureStrategy): void {
        switch (strategy) {
            case BackpressureStrategy.DROP:
                this.applyDropStrategy();
                break;
            case BackpressureStrategy.THROTTLE:
                this.applyThrottleStrategy();
                break;
            case BackpressureStrategy.BUFFER:
                this.applyBufferStrategy();
                break;
            case BackpressureStrategy.ADAPTIVE:
                this.applyAdaptiveStrategy();
                break;
        }
    }

    /**
     * 应用丢弃策略
     */
    private applyDropStrategy(): void {
        // 根据系统负载设置丢弃率
        const cpuUsage = this.metricsCollector.getCPUUsage();
        const memUsage = this.metricsCollector.getMemoryUsage();

        // 使用CPU和内存使用率的最大值作为基础
        const baseLevel = Math.max(cpuUsage, memUsage);

        // 将负载转换为丢弃率 (非线性映射，高负载时丢弃更多)
        // 当负载为阈值时，丢弃约10%的消息
        // 当负载为最大值(100%)时，丢弃约90%的消息
        const threshold = this.config.thresholds.cpuUsage;
        if (baseLevel <= threshold) {
            this.dropRate = 0.1; // 最小丢弃率
        } else {
            const excessLoad = (baseLevel - threshold) / (100 - threshold);
            this.dropRate = 0.1 + (0.8 * excessLoad);
        }

        log.debug('Applied DROP strategy', { dropRate: this.dropRate.toFixed(2) });
    }

    /**
     * 应用限流策略
     */
    private applyThrottleStrategy(): void {
        // 根据队列大小和消息速率计算限流率
        const queueSize = this.metricsCollector.estimateQueueSize();
        const msgRate = this.metricsCollector.getMessageRate();
        const queueThreshold = this.config.thresholds.queueSize;
        const rateThreshold = this.config.thresholds.messageRate;

        // 计算基于队列的限流率
        let queueBasedRate = 1.0;
        if (queueSize > queueThreshold) {
            queueBasedRate = Math.max(0.1, queueThreshold / queueSize);
        }

        // 计算基于消息速率的限流率
        let rateBasedRate = 1.0;
        if (msgRate > rateThreshold) {
            rateBasedRate = Math.max(0.1, rateThreshold / msgRate);
        }

        // 使用两种限流率的较小值
        this.throttleRate = Math.min(queueBasedRate, rateBasedRate);

        // 根据限流率选择要限流的Actor
        this.selectActorsToThrottle(this.throttleRate);

        log.debug('Applied THROTTLE strategy', {
            throttleRate: this.throttleRate.toFixed(2),
            throttledActors: this.throttledActors.size
        });
    }

    /**
     * 选择要限流的Actor
     */
    private selectActorsToThrottle(throttleRate: number): void {
        // 这里需要实际的Actor系统集成
        // 模拟实现：如果有Actor标识符列表，可以基于限流率选择部分Actor限流
    }

    /**
     * 应用缓冲策略
     */
    private applyBufferStrategy(): void {
        // 计算缓冲区大小限制
        const cpuUsage = this.metricsCollector.getCPUUsage();
        const memUsage = this.metricsCollector.getMemoryUsage();

        // 根据资源使用情况动态调整缓冲区大小
        const resourceUsage = Math.max(cpuUsage, memUsage) / 100;

        // 缓冲区大小随着资源使用率的增加而减小
        this.bufferSizeLimit = Math.floor(10000 * (1 - resourceUsage * 0.8));

        // 确保最小缓冲区大小
        this.bufferSizeLimit = Math.max(1000, this.bufferSizeLimit);

        log.debug('Applied BUFFER strategy', { bufferSizeLimit: this.bufferSizeLimit });
    }

    /**
     * 应用自适应策略
     */
    private applyAdaptiveStrategy(): void {
        // 自适应策略会在运行时动态选择其他三种策略之一
        const optimalStrategy = this.determineOptimalStrategy();
        this.applyBackpressureStrategy(optimalStrategy);
    }

    /**
     * 应用恢复策略
     */
    private applyRecoveryPolicy(policy: RecoveryPolicy): void {
        switch (policy) {
            case RecoveryPolicy.IMMEDIATE:
                this.applyImmediateRecovery();
                break;
            case RecoveryPolicy.GRADUAL:
                this.applyGradualRecovery();
                break;
            case RecoveryPolicy.ADAPTIVE:
            default:
                this.applyAdaptiveRecovery();
                break;
        }
    }

    /**
     * 立即恢复所有消息处理
     */
    private applyImmediateRecovery(): void {
        // 立即处理所有缓冲的消息
        this.processAllBufferedMessages();

        // 立即重置所有背压参数
        this.throttleRate = 1.0;
        this.dropRate = 0.0;
        this.throttledActors.clear();

        log.info('Applied IMMEDIATE recovery policy');
    }

    /**
     * 逐步恢复消息处理
     */
    private applyGradualRecovery(): void {
        // 逐步恢复将在检查背压状态时实现
        log.info('Started GRADUAL recovery process');
    }

    /**
     * 自适应恢复策略
     */
    private applyAdaptiveRecovery(): void {
        // 基于系统指标选择恢复策略
        const queueSize = this.metricsCollector.estimateQueueSize();

        if (queueSize < 100) {
            // 队列很小，可以立即恢复
            this.applyImmediateRecovery();
        } else {
            // 队列较大，逐步恢复
            this.applyGradualRecovery();
        }
    }

    /**
     * 处理所有缓冲的消息
     */
    private processAllBufferedMessages(): void {
        // 从高优先级到低优先级处理缓冲的消息
        for (const priority of [MessagePriority.HIGH, MessagePriority.MEDIUM, MessagePriority.LOW]) {
            const messages = this.messageBuffer.get(priority) || [];

            // 将消息发送到处理逻辑
            // this.processMessages(messages); // 实际实现需要与Actor系统集成

            // 清空缓冲区
            this.messageBuffer.set(priority, []);
        }
    }

    /**
     * 判断是否应该丢弃消息
     * @param priority 消息优先级
     */
    public shouldDropMessage(priority: MessagePriority = MessagePriority.MEDIUM): boolean {
        if (!this.isActive) return false;

        // 高优先级消息不丢弃
        if (priority === MessagePriority.HIGH) return false;

        // 当前策略不是丢弃策略时不丢弃
        if (this.currentStrategy !== BackpressureStrategy.DROP &&
            this.currentStrategy !== BackpressureStrategy.ADAPTIVE) {
            return false;
        }

        // 根据丢弃率和优先级决定是否丢弃
        // 低优先级消息更容易被丢弃
        const priorityFactor = priority === MessagePriority.LOW ? 1.5 : 1.0;
        const effectiveDropRate = Math.min(1.0, this.dropRate * priorityFactor);

        return Math.random() < effectiveDropRate;
    }

    /**
     * 判断是否应该限流特定Actor
     * @param actorId Actor标识符
     */
    public shouldThrottleActor(actorId: string): boolean {
        if (!this.isActive) return false;

        // 当前策略不是限流策略时不限流
        if (this.currentStrategy !== BackpressureStrategy.THROTTLE &&
            this.currentStrategy !== BackpressureStrategy.ADAPTIVE) {
            return false;
        }

        return this.throttledActors.has(actorId);
    }

    /**
     * 缓冲消息
     * @param message 待缓冲的消息
     * @param priority 消息优先级
     * @returns 是否成功缓冲
     */
    public bufferMessage(message: any, priority: MessagePriority = MessagePriority.MEDIUM): boolean {
        if (!this.isActive) return false;

        // 当前策略不是缓冲策略时不缓冲
        if (this.currentStrategy !== BackpressureStrategy.BUFFER &&
            this.currentStrategy !== BackpressureStrategy.ADAPTIVE) {
            return false;
        }

        // 检查缓冲区是否已满
        const buffer = this.messageBuffer.get(priority) || [];
        if (buffer.length >= this.bufferSizeLimit) {
            // 缓冲区已满，拒绝缓冲
            return false;
        }

        // 添加到缓冲区
        buffer.push(message);
        this.messageBuffer.set(priority, buffer);

        return true;
    }

    /**
     * 获取待处理的缓冲消息
     * @param maxCount 最大消息数
     * @returns 待处理的消息
     */
    public getBufferedMessagesToProcess(maxCount: number): any[] {
        const result: any[] = [];

        // 从高优先级到低优先级获取消息
        for (const priority of [MessagePriority.HIGH, MessagePriority.MEDIUM, MessagePriority.LOW]) {
            const buffer = this.messageBuffer.get(priority) || [];

            // 计算本次可以处理的消息数量
            const countToProcess = Math.min(maxCount - result.length, buffer.length);

            if (countToProcess > 0) {
                // 取出待处理的消息
                const messagesToProcess = buffer.splice(0, countToProcess);
                result.push(...messagesToProcess);

                // 更新缓冲区
                this.messageBuffer.set(priority, buffer);

                // 如果已经达到最大数量，退出循环
                if (result.length >= maxCount) break;
            }
        }

        return result;
    }

    /**
     * 获取当前背压状态
     */
    public getBackpressureState() {
        return {
            isActive: this.isActive,
            currentStrategy: this.currentStrategy,
            metrics: {
                dropRate: this.dropRate,
                throttleRate: this.throttleRate,
                bufferSizeLimit: this.bufferSizeLimit,
                bufferedMessages: this.getTotalBufferedMessages(),
                throttledActors: this.throttledActors.size
            }
        };
    }

    /**
     * 获取所有缓冲消息的总数
     */
    private getTotalBufferedMessages(): number {
        let total = 0;
        for (const priority of [MessagePriority.HIGH, MessagePriority.MEDIUM, MessagePriority.LOW]) {
            total += (this.messageBuffer.get(priority) || []).length;
        }
        return total;
    }
} 