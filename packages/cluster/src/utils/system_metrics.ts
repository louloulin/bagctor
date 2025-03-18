import os from 'os';
import { NodeLoad } from '../types';
import { log } from '@bactor/core';

/**
 * 系统指标收集器 - 用于获取真实系统负载而非模拟数据
 */
export class SystemMetricsCollector {
    // 最后一次CPU使用率测量
    private lastCpuUsage: NodeJS.CpuUsage | null = null;
    private lastCpuTimestamp: number = 0;

    // 消息速率计算
    private messageCounter: number = 0;
    private messageRateStart: number = Date.now();
    private messageRateInterval: number = 5000; // 5秒内计算消息速率
    private lastMessageRate: number = 0;

    // Actor计数
    private actorCount: number = 0;

    constructor() {
        // 初始化CPU使用率测量
        this.lastCpuUsage = process.cpuUsage();
        this.lastCpuTimestamp = Date.now();
    }

    /**
     * 重置消息速率计算
     */
    public resetMessageRateCalculation(): void {
        this.messageCounter = 0;
        this.messageRateStart = Date.now();
    }

    /**
     * 记录一条消息
     */
    public recordMessage(): void {
        this.messageCounter++;

        // 如果超过了计算间隔，计算消息速率
        const now = Date.now();
        if (now - this.messageRateStart >= this.messageRateInterval) {
            const elapsedSeconds = (now - this.messageRateStart) / 1000;
            this.lastMessageRate = this.messageCounter / elapsedSeconds;
            this.resetMessageRateCalculation();
        }
    }

    /**
     * 设置当前Actor数量
     */
    public setActorCount(count: number): void {
        this.actorCount = count;
    }

    /**
     * 获取当前Actor数量
     */
    public getActorCount(): number {
        return this.actorCount;
    }

    /**
     * 获取当前CPU使用率（百分比）
     */
    public getCPUUsage(): number {
        const now = Date.now();
        const currentCpuUsage = process.cpuUsage();

        if (!this.lastCpuUsage) {
            this.lastCpuUsage = currentCpuUsage;
            this.lastCpuTimestamp = now;
            return 0;
        }

        // 计算CPU使用时间差值(微秒)
        const userDiff = currentCpuUsage.user - this.lastCpuUsage.user;
        const systemDiff = currentCpuUsage.system - this.lastCpuUsage.system;
        const totalDiff = userDiff + systemDiff;

        // 计算时间差(微秒)
        const elapsedMicros = (now - this.lastCpuTimestamp) * 1000;

        // 计算CPU使用率
        const cpuCount = os.cpus().length;
        const usage = (totalDiff / elapsedMicros) * 100 / cpuCount;

        // 更新上次测量值
        this.lastCpuUsage = currentCpuUsage;
        this.lastCpuTimestamp = now;

        return Math.min(usage, 100); // 确保不超过100%
    }

    /**
     * 获取内存使用率（百分比）
     */
    public getMemoryUsage(): number {
        const used = process.memoryUsage().heapUsed;
        const total = process.memoryUsage().heapTotal;
        return (used / total) * 100;
    }

    /**
     * 获取消息处理速率（消息/秒）
     */
    public getMessageRate(): number {
        return this.lastMessageRate;
    }

    /**
     * 获取完整的节点负载指标
     */
    public getNodeLoad(): NodeLoad {
        try {
            return {
                cpu: this.getCPUUsage(),
                memory: this.getMemoryUsage(),
                messageRate: this.getMessageRate(),
                actorCount: this.actorCount
            };
        } catch (error) {
            log.error('Error collecting system metrics', { error });

            // 返回默认值
            return {
                cpu: 0,
                memory: 0,
                messageRate: 0,
                actorCount: 0
            };
        }
    }

    /**
     * 估算当前消息队列大小
     * 注意：这是一个近似值，实际队列大小应该由实现Actor系统的框架提供
     */
    public estimateQueueSize(): number {
        // 基于消息速率和CPU使用率估算队列长度
        // 当CPU使用率高时，队列会增长更快
        const baseQueueSize = this.lastMessageRate * (this.getCPUUsage() / 50);
        return Math.max(0, Math.round(baseQueueSize));
    }
} 