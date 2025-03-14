import { MessageDispatcher } from '../interfaces';
import { AtomicReference } from '../concurrent/atomic-reference';
import { LockFreeMap } from '../concurrent/lock-free-map';
import { ConcurrentSet } from '../concurrent/concurrent-set';

/**
 * 任务类型枚举
 */
export enum TaskType {
    /** CPU密集型任务 */
    CPU_INTENSIVE = 'cpu_intensive',
    /** IO密集型任务 */
    IO_INTENSIVE = 'io_intensive',
    /** 低延迟任务 */
    LOW_LATENCY = 'low_latency',
    /** 批处理任务 */
    BATCH = 'batch',
    /** 默认任务 */
    DEFAULT = 'default'
}

/**
 * 任务优先级
 */
export enum TaskPriority {
    HIGH = 0,
    NORMAL = 1,
    LOW = 2
}

/**
 * 任务描述
 */
export interface Task {
    /** 任务ID */
    id: string;
    /** 任务类型 */
    type: TaskType;
    /** 任务优先级 */
    priority: TaskPriority;
    /** 任务执行函数 */
    execute: () => Promise<void>;
    /** 创建时间 */
    createdAt: number;
    /** 任务元数据 */
    metadata?: Record<string, any>;
}

/**
 * 调度器配置
 */
export interface LayeredDispatcherConfig {
    /** 每个调度层的最大并发数 */
    concurrencyLimits?: Record<TaskType, number>;
    /** 每个任务类型的最大任务队列长度 */
    queueSizeLimits?: Record<TaskType, number>;
    /** 是否启用自适应调度 */
    enableAdaptiveScheduling?: boolean;
    /** 收集性能指标的频率（毫秒） */
    metricsCollectionIntervalMs?: number;
    /** 调度器名称 */
    name?: string;
    /** 是否启用调试模式 */
    debug?: boolean;
}

/**
 * 调度层状态
 */
interface LayerState {
    /** 活跃任务数量 */
    activeTasks: number;
    /** 队列长度 */
    queueLength: number;
    /** 利用率 */
    utilization: number;
    /** 平均处理时间 (ms) */
    avgProcessingTimeMs: number;
}

/**
 * 层内任务队列
 */
class TaskQueue {
    private highPriorityTasks: Task[] = [];
    private normalPriorityTasks: Task[] = [];
    private lowPriorityTasks: Task[] = [];
    private running = true;

    constructor(
        private readonly maxSize: number = 1000,
        private readonly onQueueSizeChanged?: (size: number) => void
    ) { }

    /**
     * 添加任务到队列
     */
    enqueue(task: Task): boolean {
        if (!this.running || this.size() >= this.maxSize) {
            return false;
        }

        switch (task.priority) {
            case TaskPriority.HIGH:
                this.highPriorityTasks.push(task);
                break;
            case TaskPriority.NORMAL:
                this.normalPriorityTasks.push(task);
                break;
            case TaskPriority.LOW:
                this.lowPriorityTasks.push(task);
                break;
        }

        if (this.onQueueSizeChanged) {
            this.onQueueSizeChanged(this.size());
        }

        return true;
    }

    /**
     * 从队列取出下一个任务
     */
    dequeue(): Task | undefined {
        if (!this.running) {
            return undefined;
        }

        let task: Task | undefined;

        if (this.highPriorityTasks.length > 0) {
            task = this.highPriorityTasks.shift();
        } else if (this.normalPriorityTasks.length > 0) {
            task = this.normalPriorityTasks.shift();
        } else if (this.lowPriorityTasks.length > 0) {
            task = this.lowPriorityTasks.shift();
        }

        if (task && this.onQueueSizeChanged) {
            this.onQueueSizeChanged(this.size());
        }

        return task;
    }

    /**
     * 获取队列大小
     */
    size(): number {
        return this.highPriorityTasks.length +
            this.normalPriorityTasks.length +
            this.lowPriorityTasks.length;
    }

    /**
     * 检查队列是否为空
     */
    isEmpty(): boolean {
        return this.size() === 0;
    }

    /**
     * 关闭队列
     */
    shutdown(): void {
        this.running = false;
    }

    /**
     * 清空队列
     */
    clear(): void {
        this.highPriorityTasks = [];
        this.normalPriorityTasks = [];
        this.lowPriorityTasks = [];

        if (this.onQueueSizeChanged) {
            this.onQueueSizeChanged(0);
        }
    }
}

/**
 * 调度层实现
 */
class DispatchLayer {
    private taskQueue: TaskQueue;
    private activeTasks = 0;
    private state: AtomicReference<LayerState>;
    private processingTimes: number[] = [];
    private readonly maxConcurrency: number;
    private taskIdSet = new ConcurrentSet<string>();
    private shuttingDown = false;

    constructor(
        private readonly type: TaskType,
        private readonly config: LayeredDispatcherConfig,
        private readonly onTaskComplete: (type: TaskType, executionTimeMs: number) => void
    ) {
        this.maxConcurrency = config.concurrencyLimits?.[type] || 10;
        const queueLimit = config.queueSizeLimits?.[type] || 1000;

        this.taskQueue = new TaskQueue(queueLimit, (size) => {
            this.updateState({ queueLength: size });
        });

        this.state = new AtomicReference<LayerState>({
            activeTasks: 0,
            queueLength: 0,
            utilization: 0,
            avgProcessingTimeMs: 0
        });
    }

    /**
     * 提交任务到此调度层
     */
    submit(task: Task): boolean {
        if (this.shuttingDown) {
            return false;
        }

        // 如果任务ID已存在则拒绝
        if (task.id && this.taskIdSet.has(task.id)) {
            return false;
        }

        // 添加到任务队列
        const accepted = this.taskQueue.enqueue(task);

        if (accepted && task.id) {
            this.taskIdSet.add(task.id);
        }

        // 尝试调度
        this.schedule();

        return accepted;
    }

    /**
     * 调度执行任务
     */
    private schedule(): void {
        if (this.shuttingDown) {
            return;
        }

        // 当前活跃任务数小于最大并发数且队列非空时，继续调度
        while (this.activeTasks < this.maxConcurrency && !this.taskQueue.isEmpty()) {
            const task = this.taskQueue.dequeue();

            if (!task) {
                break;
            }

            this.executeTask(task);
        }
    }

    /**
     * 执行任务
     */
    private executeTask(task: Task): void {
        this.activeTasks++;
        this.updateState({ activeTasks: this.activeTasks });

        const startTime = performance.now();

        // 执行任务
        task.execute()
            .then(() => {
                const endTime = performance.now();
                const executionTime = endTime - startTime;

                // 记录处理时间
                this.processingTimes.push(executionTime);
                if (this.processingTimes.length > 100) {
                    this.processingTimes.shift();
                }

                // 计算平均处理时间
                const avgTime = this.processingTimes.reduce((sum, time) => sum + time, 0) /
                    this.processingTimes.length;

                // 更新状态
                this.updateState({ avgProcessingTimeMs: avgTime });

                // 回调通知任务完成
                this.onTaskComplete(this.type, executionTime);
            })
            .catch(error => {
                console.error(`Error executing task in layer ${this.type}:`, error);
            })
            .finally(() => {
                // 从活跃任务集中移除
                if (task.id) {
                    this.taskIdSet.delete(task.id);
                }

                // 减少活跃任务计数
                this.activeTasks--;
                this.updateState({ activeTasks: this.activeTasks });

                // 计算利用率
                this.updateUtilization();

                // 继续调度
                this.schedule();
            });
    }

    /**
     * 更新状态
     */
    private updateState(partialState: Partial<LayerState>): void {
        this.state.updateAndGet(currentState => ({
            ...currentState,
            ...partialState
        }));
    }

    /**
     * 更新利用率
     */
    private updateUtilization(): void {
        const utilization = this.maxConcurrency > 0 ?
            this.activeTasks / this.maxConcurrency : 0;

        this.updateState({ utilization });
    }

    /**
     * 获取当前状态
     */
    getState(): LayerState {
        return this.state.get();
    }

    /**
     * 关闭调度层
     */
    shutdown(): void {
        this.shuttingDown = true;
        this.taskQueue.shutdown();
    }
}

/**
 * 多层调度器指标
 */
export interface LayeredDispatcherMetrics {
    /** 各层状态 */
    layerStates: Record<TaskType, LayerState>;
    /** 总任务提交数 */
    totalTasksSubmitted: number;
    /** 已完成任务数 */
    totalTasksCompleted: number;
    /** 被拒绝任务数 */
    totalTasksRejected: number;
    /** 各任务类型平均处理时间 */
    avgProcessingTimeByType: Record<TaskType, number>;
    /** 各任务类型总任务数 */
    taskCountByType: Record<TaskType, number>;
}

/**
 * 多层调度器
 * 
 * 根据任务特性将任务分配到不同的调度层，
 * 每一层有独立的资源配额和执行策略。
 */
export class LayeredDispatcher implements MessageDispatcher {
    private layers: Record<TaskType, DispatchLayer>;
    private metrics: LayeredDispatcherMetrics;
    private metricsCollectionInterval: any = null;
    private taskClassifier: (task: Omit<Task, 'type'>) => TaskType;
    private taskIdCounter = 0;
    private isShutdown = false;

    constructor(
        private readonly config: LayeredDispatcherConfig = {}
    ) {
        // 初始化各层调度器
        this.layers = {
            [TaskType.CPU_INTENSIVE]: new DispatchLayer(
                TaskType.CPU_INTENSIVE,
                config,
                this.handleTaskCompletion.bind(this)
            ),
            [TaskType.IO_INTENSIVE]: new DispatchLayer(
                TaskType.IO_INTENSIVE,
                config,
                this.handleTaskCompletion.bind(this)
            ),
            [TaskType.LOW_LATENCY]: new DispatchLayer(
                TaskType.LOW_LATENCY,
                config,
                this.handleTaskCompletion.bind(this)
            ),
            [TaskType.BATCH]: new DispatchLayer(
                TaskType.BATCH,
                config,
                this.handleTaskCompletion.bind(this)
            ),
            [TaskType.DEFAULT]: new DispatchLayer(
                TaskType.DEFAULT,
                config,
                this.handleTaskCompletion.bind(this)
            )
        };

        // 初始化指标
        this.metrics = {
            layerStates: {
                [TaskType.CPU_INTENSIVE]: this.layers[TaskType.CPU_INTENSIVE].getState(),
                [TaskType.IO_INTENSIVE]: this.layers[TaskType.IO_INTENSIVE].getState(),
                [TaskType.LOW_LATENCY]: this.layers[TaskType.LOW_LATENCY].getState(),
                [TaskType.BATCH]: this.layers[TaskType.BATCH].getState(),
                [TaskType.DEFAULT]: this.layers[TaskType.DEFAULT].getState()
            },
            totalTasksSubmitted: 0,
            totalTasksCompleted: 0,
            totalTasksRejected: 0,
            avgProcessingTimeByType: {
                [TaskType.CPU_INTENSIVE]: 0,
                [TaskType.IO_INTENSIVE]: 0,
                [TaskType.LOW_LATENCY]: 0,
                [TaskType.BATCH]: 0,
                [TaskType.DEFAULT]: 0
            },
            taskCountByType: {
                [TaskType.CPU_INTENSIVE]: 0,
                [TaskType.IO_INTENSIVE]: 0,
                [TaskType.LOW_LATENCY]: 0,
                [TaskType.BATCH]: 0,
                [TaskType.DEFAULT]: 0
            }
        };

        // 设置默认任务分类器
        this.taskClassifier = this.defaultTaskClassifier;

        // 启动指标收集
        if (config.metricsCollectionIntervalMs) {
            this.startMetricsCollection(config.metricsCollectionIntervalMs);
        }
    }

    /**
     * 提交任务执行
     */
    schedule(task: () => Promise<void>): void {
        if (this.isShutdown) {
            return;
        }

        // 包装为Task对象
        const taskObj: Omit<Task, 'type'> = {
            id: `task-${++this.taskIdCounter}`,
            execute: task,
            priority: TaskPriority.NORMAL,
            createdAt: Date.now()
        };

        // 使用分类器确定任务类型
        const taskType = this.taskClassifier(taskObj);

        // 创建完整任务
        const fullTask: Task = {
            ...taskObj,
            type: taskType
        };

        // 提交到对应调度层
        const submitted = this.layers[taskType].submit(fullTask);

        // 更新指标
        this.metrics.totalTasksSubmitted++;

        if (submitted) {
            this.metrics.taskCountByType[taskType]++;
        } else {
            this.metrics.totalTasksRejected++;
        }
    }

    /**
     * 处理任务完成回调
     */
    private handleTaskCompletion(type: TaskType, executionTimeMs: number): void {
        // 更新指标
        this.metrics.totalTasksCompleted++;

        // 更新平均处理时间 (指数移动平均)
        const alpha = 0.1; // 平滑因子
        const currentAvg = this.metrics.avgProcessingTimeByType[type];
        const newAvg = currentAvg === 0 ?
            executionTimeMs :
            (1 - alpha) * currentAvg + alpha * executionTimeMs;

        this.metrics.avgProcessingTimeByType[type] = newAvg;

        // 更新层状态
        this.updateLayerStates();
    }

    /**
     * 更新所有层的状态
     */
    private updateLayerStates(): void {
        for (const type of Object.values(TaskType)) {
            this.metrics.layerStates[type] = this.layers[type].getState();
        }
    }

    /**
     * 启动指标收集
     */
    private startMetricsCollection(intervalMs: number): void {
        this.metricsCollectionInterval = setInterval(() => {
            this.updateLayerStates();

            if (this.config.debug) {
                console.log('LayeredDispatcher Metrics:', JSON.stringify(this.getMetrics(), null, 2));
            }
        }, intervalMs);
    }

    /**
     * 停止指标收集
     */
    private stopMetricsCollection(): void {
        if (this.metricsCollectionInterval) {
            clearInterval(this.metricsCollectionInterval);
            this.metricsCollectionInterval = null;
        }
    }

    /**
     * 获取调度器指标
     */
    getMetrics(): LayeredDispatcherMetrics {
        this.updateLayerStates();
        return { ...this.metrics };
    }

    /**
     * 设置自定义任务分类器
     */
    setTaskClassifier(classifier: (task: Omit<Task, 'type'>) => TaskType): void {
        this.taskClassifier = classifier;
    }

    /**
     * 默认任务分类器
     * 基于任务元数据和启发式规则分类
     */
    private defaultTaskClassifier(task: Omit<Task, 'type'>): TaskType {
        // 从元数据中获取任务类型提示
        const typeHint = task.metadata?.type as TaskType;
        if (typeHint && Object.values(TaskType).includes(typeHint)) {
            return typeHint;
        }

        // 基于优先级的启发式分类
        if (task.priority === TaskPriority.HIGH) {
            return TaskType.LOW_LATENCY;
        }

        if (task.priority === TaskPriority.LOW) {
            return TaskType.BATCH;
        }

        // 默认任务类型
        return TaskType.DEFAULT;
    }

    /**
     * 关闭调度器
     */
    shutdown(): void {
        if (this.isShutdown) {
            return;
        }

        this.isShutdown = true;
        this.stopMetricsCollection();

        // 关闭所有调度层
        for (const layer of Object.values(this.layers)) {
            layer.shutdown();
        }
    }
} 