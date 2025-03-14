import { LayeredDispatcher, TaskType, LayeredDispatcherConfig } from './layered-dispatcher';

/**
 * 自适应调度器配置
 */
export interface AdaptiveSchedulerConfig extends LayeredDispatcherConfig {
    /** 适应间隔（毫秒） */
    adaptationIntervalMs?: number;
    /** 最小并发数 */
    minConcurrency?: Record<TaskType, number>;
    /** 最大并发数 */
    maxConcurrency?: Record<TaskType, number>;
    /** 目标CPU利用率，当超过此值时会调整资源分配 */
    targetCpuUtilization?: number;
    /** 资源分配弹性系数 (0-1)，值越大调整越激进 */
    elasticityFactor?: number;
}

/**
 * 系统负载信息
 */
interface SystemLoad {
    /** CPU利用率 (0-1) */
    cpuUtilization: number;
    /** 内存利用率 (0-1) */
    memoryUtilization: number;
    /** 系统平均负载 */
    systemLoadAverage: number;
    /** 当前活动线程数 */
    activeThreadCount: number;
}

/**
 * 完整的自适应调度器配置
 */
interface CompleteAdaptiveConfig {
    concurrencyLimits: Record<TaskType, number>;
    queueSizeLimits: Record<TaskType, number>;
    enableAdaptiveScheduling: boolean;
    adaptationIntervalMs: number;
    minConcurrency: Record<TaskType, number>;
    maxConcurrency: Record<TaskType, number>;
    targetCpuUtilization: number;
    elasticityFactor: number;
    metricsCollectionIntervalMs: number;
    name: string;
    debug: boolean;
}

/**
 * 自适应调度器
 * 
 * 基于系统负载和任务特性动态调整资源分配
 */
export class AdaptiveScheduler extends LayeredDispatcher {
    private adaptationInterval: any = null;
    private readonly adaptiveConfig: CompleteAdaptiveConfig;
    private lastSystemLoad: SystemLoad = {
        cpuUtilization: 0,
        memoryUtilization: 0,
        systemLoadAverage: 0,
        activeThreadCount: 0
    };

    constructor(config: AdaptiveSchedulerConfig) {
        // 确保enableAdaptiveScheduling为true
        const baseConfig: LayeredDispatcherConfig = {
            ...config,
            enableAdaptiveScheduling: true
        };

        super(baseConfig);

        // 设置自适应配置
        this.adaptiveConfig = {
            concurrencyLimits: {
                [TaskType.CPU_INTENSIVE]: 4,
                [TaskType.IO_INTENSIVE]: 20,
                [TaskType.LOW_LATENCY]: 8,
                [TaskType.BATCH]: 2,
                [TaskType.DEFAULT]: 10
            },
            queueSizeLimits: {
                [TaskType.CPU_INTENSIVE]: 500,
                [TaskType.IO_INTENSIVE]: 2000,
                [TaskType.LOW_LATENCY]: 100,
                [TaskType.BATCH]: 5000,
                [TaskType.DEFAULT]: 1000
            },
            enableAdaptiveScheduling: true,
            adaptationIntervalMs: 5000,
            minConcurrency: {
                [TaskType.CPU_INTENSIVE]: 2,
                [TaskType.IO_INTENSIVE]: 5,
                [TaskType.LOW_LATENCY]: 3,
                [TaskType.BATCH]: 1,
                [TaskType.DEFAULT]: 3
            },
            maxConcurrency: {
                [TaskType.CPU_INTENSIVE]: 16,
                [TaskType.IO_INTENSIVE]: 100,
                [TaskType.LOW_LATENCY]: 32,
                [TaskType.BATCH]: 8,
                [TaskType.DEFAULT]: 32
            },
            targetCpuUtilization: 0.7,
            elasticityFactor: 0.3,
            metricsCollectionIntervalMs: 1000,
            name: 'AdaptiveScheduler',
            debug: false
        };

        // 应用自定义配置
        if (config.concurrencyLimits) {
            Object.assign(this.adaptiveConfig.concurrencyLimits, config.concurrencyLimits);
        }
        if (config.queueSizeLimits) {
            Object.assign(this.adaptiveConfig.queueSizeLimits, config.queueSizeLimits);
        }
        if (config.adaptationIntervalMs !== undefined) {
            this.adaptiveConfig.adaptationIntervalMs = config.adaptationIntervalMs;
        }
        if (config.minConcurrency) {
            Object.assign(this.adaptiveConfig.minConcurrency, config.minConcurrency);
        }
        if (config.maxConcurrency) {
            Object.assign(this.adaptiveConfig.maxConcurrency, config.maxConcurrency);
        }
        if (config.targetCpuUtilization !== undefined) {
            this.adaptiveConfig.targetCpuUtilization = config.targetCpuUtilization;
        }
        if (config.elasticityFactor !== undefined) {
            this.adaptiveConfig.elasticityFactor = config.elasticityFactor;
        }
        if (config.debug !== undefined) {
            this.adaptiveConfig.debug = config.debug;
        }
        if (config.name) {
            this.adaptiveConfig.name = config.name;
        }
        if (config.metricsCollectionIntervalMs !== undefined) {
            this.adaptiveConfig.metricsCollectionIntervalMs = config.metricsCollectionIntervalMs;
        }

        // 启动自适应调度
        this.startAdaptation();
    }

    /**
     * 启动自适应调度
     */
    private startAdaptation(): void {
        if (this.adaptationInterval) {
            clearInterval(this.adaptationInterval);
        }

        this.adaptationInterval = setInterval(() => {
            this.adapt();
        }, this.adaptiveConfig.adaptationIntervalMs);
    }

    /**
     * 停止自适应调度
     */
    private stopAdaptation(): void {
        if (this.adaptationInterval) {
            clearInterval(this.adaptationInterval);
            this.adaptationInterval = null;
        }
    }

    /**
     * 自适应调整资源
     */
    private adapt(): void {
        // 获取系统负载
        const systemLoad = this.getSystemLoad();

        // 获取调度器指标
        const metrics = this.getMetrics();

        // 根据系统负载和任务特性调整资源
        this.adjustResourceAllocation(systemLoad, metrics);

        // 更新上次负载信息
        this.lastSystemLoad = systemLoad;
    }

    /**
     * 获取系统负载
     */
    private getSystemLoad(): SystemLoad {
        // 这里应该使用系统API获取实际负载
        // 在浏览器环境中，可以使用performance API
        // 在Node.js环境中，可以使用os模块
        // 这里只是一个示例实现
        return {
            cpuUtilization: Math.random() * 0.5 + 0.3, // 模拟30%-80%的CPU利用率
            memoryUtilization: Math.random() * 0.4 + 0.2, // 模拟20%-60%的内存利用率
            systemLoadAverage: Math.random() * 2 + 1, // 模拟1-3的系统负载
            activeThreadCount: Math.floor(Math.random() * 20 + 10) // 模拟10-30的活动线程数
        };
    }

    /**
     * 调整资源分配
     */
    private adjustResourceAllocation(systemLoad: SystemLoad, metrics: any): void {
        // 根据CPU利用率调整
        const cpuUtilizationDelta = systemLoad.cpuUtilization - this.adaptiveConfig.targetCpuUtilization;

        // CPU利用率高，减少CPU密集型任务的资源分配，增加IO密集型任务的资源
        if (cpuUtilizationDelta > 0.1) {
            this.adjustLayerConcurrency(TaskType.CPU_INTENSIVE, -1);
            this.adjustLayerConcurrency(TaskType.IO_INTENSIVE, 1);
        }
        // CPU利用率低，增加CPU密集型任务的资源分配
        else if (cpuUtilizationDelta < -0.1) {
            this.adjustLayerConcurrency(TaskType.CPU_INTENSIVE, 1);
        }

        // 根据各层队列长度调整
        for (const type of Object.values(TaskType)) {
            const layerState = metrics.layerStates[type];

            // 队列积压严重，增加并发度
            if (layerState.queueLength > 0 && layerState.queueLength > layerState.activeTasks * 3) {
                this.adjustLayerConcurrency(type, 1);
            }
            // 队列为空但活跃任务很少，减少并发度
            else if (layerState.queueLength === 0 && layerState.activeTasks < 2) {
                this.adjustLayerConcurrency(type, -1);
            }
        }

        // 根据平均处理时间调整低延迟层
        const lowLatencyAvgTime = metrics.avgProcessingTimeByType[TaskType.LOW_LATENCY];
        if (lowLatencyAvgTime > 100) { // 大于100ms认为延迟较高
            this.adjustLayerConcurrency(TaskType.LOW_LATENCY, 1);
        }

        // 批处理任务根据系统整体负载调整
        if (systemLoad.systemLoadAverage > 2) {
            this.adjustLayerConcurrency(TaskType.BATCH, -1);
        } else if (systemLoad.systemLoadAverage < 1 && metrics.layerStates[TaskType.BATCH].queueLength > 0) {
            this.adjustLayerConcurrency(TaskType.BATCH, 1);
        }

        if (this.adaptiveConfig.debug) {
            console.log('System load:', systemLoad);
            console.log('Adjusted concurrency limits:', this.adaptiveConfig.concurrencyLimits);
        }
    }

    /**
     * 调整层的并发度
     */
    private adjustLayerConcurrency(type: TaskType, delta: number): void {
        const current = this.adaptiveConfig.concurrencyLimits[type];
        const min = this.adaptiveConfig.minConcurrency[type];
        const max = this.adaptiveConfig.maxConcurrency[type];

        // 应用弹性因子
        const adjustedDelta = Math.sign(delta) *
            Math.max(1, Math.abs(delta) * this.adaptiveConfig.elasticityFactor * current);

        // 计算新的并发度，确保在最小值和最大值之间
        const newConcurrency = Math.max(min, Math.min(max, current + adjustedDelta));

        this.adaptiveConfig.concurrencyLimits[type] = Math.round(newConcurrency);
    }

    /**
     * 关闭调度器
     */
    override shutdown(): void {
        this.stopAdaptation();
        super.shutdown();
    }
} 