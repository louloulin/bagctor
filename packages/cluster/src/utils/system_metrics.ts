import { NodeLoad } from '../types';
import { log } from '@bactor/core';
import * as os from 'os';

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
    private lastCpuTime: number = Date.now();
    private messageCounter: number = 0;
    private messageRateInterval: number = 5000; // 5秒计算一次消息率
    private lastMessageCount: number = 0;
    private lastMessageCountTime: number = Date.now();
    private currentMessageRate: number = 0;
    private actorCount: number = 0;

    constructor() {
        log.info('SystemMetricsCollector initialized');
    }

    /**
     * 收集系统指标
     * @returns 系统指标
     */
    public collectMetrics(): SystemMetrics {
        return {
            cpu: this.getCpuUsage(),
            memory: this.getMemoryUsage(),
            messageRate: this.getMessageRate(),
            actorCount: this.getActorCount(),
            timestamp: Date.now()
        };
    }

    /**
     * 获取系统CPU使用率
     * @returns CPU使用率百分比
     */
    private getCpuUsage(): number {
        try {
            const cpus = os.cpus();
            const now = Date.now();

            // 计算CPU使用时间
            let user = 0;
            let system = 0;
            let idle = 0;

            for (const cpu of cpus) {
                user += cpu.times.user;
                system += cpu.times.sys;
                idle += cpu.times.idle;
            }

            // 如果是第一次运行，只记录值，不计算使用率
            if (this.lastCpuUsage === null) {
                this.lastCpuUsage = { user, system, idle };
                this.lastCpuTime = now;
                return 0;
            }

            // 计算时间差
            const userDiff = user - this.lastCpuUsage.user;
            const systemDiff = system - this.lastCpuUsage.system;
            const idleDiff = idle - this.lastCpuUsage.idle;
            const totalDiff = userDiff + systemDiff + idleDiff;

            // 计算使用率
            const cpuUsage = totalDiff === 0 ? 0 : 100 * (1 - idleDiff / totalDiff);

            // 更新上次值
            this.lastCpuUsage = { user, system, idle };
            this.lastCpuTime = now;

            return Math.min(100, Math.max(0, cpuUsage));
        } catch (error) {
            log.error('Error getting CPU usage', { error });
            return 0;
        }
    }

    /**
     * 获取内存使用率
     * @returns 内存使用率百分比
     */
    private getMemoryUsage(): number {
        try {
            const totalMem = os.totalmem();
            const freeMem = os.freemem();
            const memoryUsage = 100 * (1 - freeMem / totalMem);

            return Math.min(100, Math.max(0, memoryUsage));
        } catch (error) {
            log.error('Error getting memory usage', { error });
            return 0;
        }
    }

    /**
     * 获取消息处理速率
     * @returns 每秒消息数
     */
    private getMessageRate(): number {
        const now = Date.now();

        // 定期更新消息率
        if (now - this.lastMessageCountTime >= this.messageRateInterval) {
            const timeDiffInSeconds = (now - this.lastMessageCountTime) / 1000;
            this.currentMessageRate = (this.messageCounter - this.lastMessageCount) / timeDiffInSeconds;

            // 更新上次值
            this.lastMessageCount = this.messageCounter;
            this.lastMessageCountTime = now;
        }

        return this.currentMessageRate;
    }

    /**
     * 获取Actor数量
     * @returns Actor数量
     */
    private getActorCount(): number {
        return this.actorCount;
    }

    /**
     * 通知消息接收
     * 用于计算消息率
     * @param count 消息数量
     */
    public notifyMessageReceived(count: number = 1): void {
        this.messageCounter += count;
    }

    /**
     * 更新Actor数量
     * @param count Actor数量
     */
    public updateActorCount(count: number): void {
        this.actorCount = count;
    }

    /**
     * 将系统指标转换为NodeLoad格式
     * @returns NodeLoad格式的系统指标
     */
    public getNodeLoad(): NodeLoad {
        const metrics = this.collectMetrics();

        return {
            cpu: metrics.cpu,
            memory: metrics.memory,
            messageRate: metrics.messageRate,
            actorCount: metrics.actorCount
        };
    }

    /**
     * 重置指标收集器
     */
    public reset(): void {
        this.lastCpuUsage = null;
        this.lastCpuTime = Date.now();
        this.messageCounter = 0;
        this.lastMessageCount = 0;
        this.lastMessageCountTime = Date.now();
        this.currentMessageRate = 0;
        this.actorCount = 0;

        log.info('SystemMetricsCollector reset');
    }
} 