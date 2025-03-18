import {
    BackpressureConfig,
    BackpressureState,
    BackpressureStrategy,
    BackpressureThresholds,
    NodeLoad,
    MessagePriority
} from '../types';
import { log } from '@bactor/core';
import { SystemMetricsCollector } from './system_metrics';

// 重新导出 MessagePriority 枚举以供外部使用
export { MessagePriority };

/**
 * 背压策略管理器 - 实现各种背压策略
 */
export class BackpressureManager {
    private state!: BackpressureState;
    private metricsCollector: SystemMetricsCollector;
    private dropRate: number = 0.0;
    private throttleRate: number = 1.0;
    private bufferSizeLimit: number = 10000;
    private throttledActors: Set<string> = new Set();
    private messageBuffer: Map<MessagePriority, any[]> = new Map();

    constructor(
        private config: BackpressureConfig,
        metricsCollector: SystemMetricsCollector
    ) {
        this.metricsCollector = metricsCollector;
        this.state = {
            isActive: false,
            currentStrategy: BackpressureStrategy.ADAPTIVE,
            metrics: {
                currentQueueSize: 0,
                memoryUsage: 0,
                cpuUsage: 0,
                messageRate: 0,
                droppedMessages: 0,
                throttledActors: 0
            }
        };

        // 初始化消息缓冲区
        this.messageBuffer.set(MessagePriority.HIGH, []);
        this.messageBuffer.set(MessagePriority.MEDIUM, []);
        this.messageBuffer.set(MessagePriority.LOW, []);

        // 启动定期指标收集
        this.startMetricsCollection();
    }

    /**
     * 启动定期指标收集
     */
    private startMetricsCollection(): void {
        this.metricsCollector.startCollection((metrics: NodeLoad) => {
            this.updateState(metrics);
        });
    }

    /**
     * 更新背压状态
     */
    private updateState(metrics: NodeLoad): void {
        const thresholds = this.config.thresholds;
        const currentState = this.evaluateSystemState(metrics, thresholds);

        if (currentState.needsBackpressure && !this.state.isActive) {
            this.activateBackpressure(currentState.recommendedStrategy);
        } else if (!currentState.needsBackpressure && this.state.isActive) {
            this.deactivateBackpressure();
        } else if (this.state.isActive) {
            this.adjustBackpressureStrategy(currentState);
        }

        // 更新指标
        this.state.metrics = {
            ...this.state.metrics,
            cpuUsage: metrics.cpu,
            memoryUsage: metrics.memory,
            messageRate: metrics.messageRate
        };
    }

    /**
     * 评估系统状态
     */
    private evaluateSystemState(metrics: NodeLoad, thresholds: BackpressureThresholds): {
        needsBackpressure: boolean;
        recommendedStrategy: BackpressureStrategy;
        severity: number;
    } {
        const cpuPressure = metrics.cpu / thresholds.cpuUsage;
        const memoryPressure = metrics.memory / thresholds.memoryUsage;
        const messagePressure = metrics.messageRate / thresholds.messageRate;

        const maxPressure = Math.max(cpuPressure, memoryPressure, messagePressure);
        const needsBackpressure = maxPressure > 1;

        let recommendedStrategy: BackpressureStrategy;
        if (maxPressure > 1.5) {
            recommendedStrategy = BackpressureStrategy.DROP;
        } else if (maxPressure > 1.2) {
            recommendedStrategy = BackpressureStrategy.THROTTLE;
        } else {
            recommendedStrategy = BackpressureStrategy.BUFFER;
        }

        return {
            needsBackpressure,
            recommendedStrategy,
            severity: maxPressure
        };
    }

    /**
     * 激活背压机制
     */
    private activateBackpressure(strategy: BackpressureStrategy): void {
        this.state.isActive = true;
        this.state.currentStrategy = strategy;
        this.state.activationTime = Date.now();

        log.warn('Activating backpressure', {
            strategy,
            metrics: this.state.metrics
        });

        // 应用选定的策略
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
     * 停用背压机制
     */
    private deactivateBackpressure(): void {
        this.state.isActive = false;
        this.state.currentStrategy = BackpressureStrategy.ADAPTIVE;
        this.state.activationTime = undefined;

        log.info('Deactivating backpressure', {
            metrics: this.state.metrics
        });
    }

    /**
     * 调整背压策略
     */
    private adjustBackpressureStrategy(currentState: {
        recommendedStrategy: BackpressureStrategy;
        severity: number
    }): void {
        if (this.state.currentStrategy !== currentState.recommendedStrategy) {
            log.info('Adjusting backpressure strategy', {
                from: this.state.currentStrategy,
                to: currentState.recommendedStrategy,
                severity: currentState.severity
            });

            this.state.currentStrategy = currentState.recommendedStrategy;
            this.activateBackpressure(currentState.recommendedStrategy);
        }
    }

    /**
     * 应用丢弃策略
     */
    private applyDropStrategy(): void {
        // 实现消息丢弃逻辑
        // 可以根据优先级或其他规则决定丢弃哪些消息
        this.state.metrics.droppedMessages++;
    }

    /**
     * 应用限流策略
     */
    private applyThrottleStrategy(): void {
        // 实现消息限流逻辑
        // 可以通过令牌桶或漏桶算法实现
        this.state.metrics.throttledActors++;
    }

    /**
     * 应用缓冲策略
     */
    private applyBufferStrategy(): void {
        // 实现消息缓冲逻辑
        // 可以使用优先级队列或其他缓冲机制
    }

    /**
     * 应用自适应策略
     */
    private applyAdaptiveStrategy(): void {
        // 根据系统状态动态选择最适合的策略
        const metrics = this.state.metrics;
        if (metrics.cpuUsage > 0.9 || metrics.memoryUsage > 0.9) {
            this.applyDropStrategy();
        } else if (metrics.messageRate > this.config.thresholds.messageRate) {
            this.applyThrottleStrategy();
        } else {
            this.applyBufferStrategy();
        }
    }

    /**
     * 获取当前背压状态
     */
    public getState(): BackpressureState {
        return { ...this.state };
    }

    /**
     * 检查是否需要应用背压
     */
    public shouldApplyBackpressure(): boolean {
        return this.state.isActive;
    }

    /**
     * 获取当前策略
     */
    public getCurrentStrategy(): BackpressureStrategy {
        return this.state.currentStrategy;
    }

    /**
     * 判断是否应该丢弃消息
     * @param priority 消息优先级
     */
    public shouldDropMessage(priority: MessagePriority = MessagePriority.MEDIUM): boolean {
        if (!this.state.isActive) return false;

        // 高优先级消息不丢弃
        if (priority === MessagePriority.HIGH) return false;

        // 当前策略不是丢弃策略时不丢弃
        if (this.state.currentStrategy !== BackpressureStrategy.DROP &&
            this.state.currentStrategy !== BackpressureStrategy.ADAPTIVE) {
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
        if (!this.state.isActive) return false;

        // 当前策略不是限流策略时不限流
        if (this.state.currentStrategy !== BackpressureStrategy.THROTTLE &&
            this.state.currentStrategy !== BackpressureStrategy.ADAPTIVE) {
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
        if (!this.state.isActive) return false;

        // 当前策略不是缓冲策略时不缓冲
        if (this.state.currentStrategy !== BackpressureStrategy.BUFFER &&
            this.state.currentStrategy !== BackpressureStrategy.ADAPTIVE) {
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
            isActive: this.state.isActive,
            currentStrategy: this.state.currentStrategy,
            metrics: {
                dropRate: this.dropRate,
                throttleRate: this.throttleRate,
                bufferSizeLimit: this.bufferSizeLimit,
                bufferedMessages: this.getTotalBufferedMessages(),
                throttledActors: this.state.metrics.throttledActors
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