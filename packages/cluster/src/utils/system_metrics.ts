import { NodeLoad } from '../types';
import { log } from '@bactor/core';
import os from 'os';

export interface SystemMetrics {
    cpu: number;
    memory: number;
    messageRate: number;
    actorCount: number;
    timestamp: number;
}

/**
 * 系统指标收集器
 * 负责收集系统CPU、内存等指标
 */
export class SystemMetricsCollector {
    private lastCpuUsage: { user: number; system: number; idle: number } | null = null;
    private lastCpuTime: number = 0;
    private messageCount: number = 0;
    private lastMessageCount: number = 0;
    private lastMessageCountTime: number = Date.now();
    private actorCount: number = 0;
    private collectionInterval: number = 1000; // 1 second

    constructor(collectionInterval: number = 1000) {
        this.collectionInterval = collectionInterval;
        this.lastCpuTime = Date.now();
        this.initCpuUsage();

        log.info('SystemMetricsCollector initialized', { collectionInterval });
    }

    /**
     * 初始化CPU使用情况基线
     */
    private initCpuUsage(): void {
        const cpus = os.cpus();
        const usage = cpus.reduce(
            (acc, cpu) => {
                acc.user += cpu.times.user;
                acc.system += cpu.times.sys;
                acc.idle += cpu.times.idle;
                return acc;
            },
            { user: 0, system: 0, idle: 0 }
        );

        this.lastCpuUsage = usage;
        this.lastCpuTime = Date.now();
    }

    /**
     * 收集当前的系统指标
     */
    public collectMetrics(): NodeLoad {
        const memoryMetrics = this.collectMemoryMetrics();
        const cpuMetrics = this.collectCpuMetrics();
        const messageRate = this.calculateMessageRate();

        const metrics: NodeLoad = {
            cpu: cpuMetrics,
            memory: memoryMetrics,
            messageRate,
            actorCount: this.actorCount
        };

        log.debug('Collected system metrics', { metrics });

        return metrics;
    }

    /**
     * 收集内存使用指标
     */
    private collectMemoryMetrics(): number {
        const totalMem = os.totalmem();
        const freeMem = os.freemem();
        const usedMem = totalMem - freeMem;
        const memoryUsagePercent = (usedMem / totalMem) * 100;

        return Math.round(memoryUsagePercent * 100) / 100; // Round to 2 decimal places
    }

    /**
     * 收集CPU使用指标
     */
    private collectCpuMetrics(): number {
        const cpus = os.cpus();
        const currentTime = Date.now();
        const elapsedTime = currentTime - this.lastCpuTime;

        // 如果时间间隔太短，返回上次的测量结果
        if (elapsedTime < 100) {
            return this.lastCpuUsage ? this.calculateCpuPercent(this.lastCpuUsage) : 0;
        }

        const usage = cpus.reduce(
            (acc, cpu) => {
                acc.user += cpu.times.user;
                acc.system += cpu.times.sys;
                acc.idle += cpu.times.idle;
                return acc;
            },
            { user: 0, system: 0, idle: 0 }
        );

        // 如果是第一次收集，无法计算变化
        if (!this.lastCpuUsage) {
            this.lastCpuUsage = usage;
            this.lastCpuTime = currentTime;
            return 0;
        }

        const cpuPercent = this.calculateCpuPercent(usage);

        // 更新基线以供下次使用
        this.lastCpuUsage = usage;
        this.lastCpuTime = currentTime;

        return cpuPercent;
    }

    /**
     * 计算CPU使用百分比
     */
    private calculateCpuPercent(usage: { user: number; system: number; idle: number }): number {
        if (!this.lastCpuUsage) return 0;

        const userDiff = usage.user - this.lastCpuUsage.user;
        const systemDiff = usage.system - this.lastCpuUsage.system;
        const idleDiff = usage.idle - this.lastCpuUsage.idle;
        const totalDiff = userDiff + systemDiff + idleDiff;

        if (totalDiff === 0) return 0;

        const cpuPercent = ((userDiff + systemDiff) / totalDiff) * 100;
        return Math.round(cpuPercent * 100) / 100; // Round to 2 decimal places
    }

    /**
     * 计算消息处理速率
     */
    private calculateMessageRate(): number {
        const currentTime = Date.now();
        const elapsedTime = (currentTime - this.lastMessageCountTime) / 1000; // Convert to seconds

        if (elapsedTime < 0.1) return 0; // Avoid division by very small numbers

        const messageCountDiff = this.messageCount - this.lastMessageCount;
        const rate = messageCountDiff / elapsedTime;

        // 更新基线以供下次使用
        this.lastMessageCount = this.messageCount;
        this.lastMessageCountTime = currentTime;

        return Math.round(rate);
    }

    /**
     * 记录一条新消息
     */
    public recordMessage(): void {
        this.messageCount++;
    }

    /**
     * 更新Actor数量
     */
    public updateActorCount(count: number): void {
        this.actorCount = count;
    }

    /**
     * 设置Actor数量（别名方法，兼容现有代码）
     */
    public setActorCount(count: number): void {
        this.updateActorCount(count);
    }

    /**
     * 获取当前节点负载
     */
    public getNodeLoad(): NodeLoad {
        return this.collectMetrics();
    }

    /**
     * 估计当前消息队列大小
     */
    public estimateQueueSize(): number {
        // 这里我们使用一个简单的估计方法，
        // 实际应用中应该获取真实的队列大小
        return this.messageCount - this.lastMessageCount;
    }

    /**
     * 重置指标计数器
     */
    public resetCounters(): void {
        this.messageCount = 0;
        this.lastMessageCount = 0;
        this.lastMessageCountTime = Date.now();
        this.initCpuUsage();

        log.debug('System metrics counters reset');
    }

    /**
     * 开始定期收集系统指标
     * @param callback 每次收集完成后的回调函数
     * @returns 计时器标识
     */
    public startCollection(callback: (metrics: NodeLoad) => void): NodeJS.Timer {
        log.info('Starting system metrics collection', { interval: this.collectionInterval });

        const interval = setInterval(() => {
            const metrics = this.collectMetrics();
            callback(metrics);
        }, this.collectionInterval);

        return interval;
    }
} 