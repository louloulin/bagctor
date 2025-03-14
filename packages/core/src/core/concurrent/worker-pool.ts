import { Message, PID } from '../types';
import { nanoid } from 'nanoid';
import { createLogger } from '../../utils/logger';

// 工作线程消息类型
export interface WorkerMessage {
    id: string;        // 消息唯一ID
    type: string;      // 消息类型
    payload: any;      // 消息负载
    sender?: PID;      // 发送者
    recipient?: PID;   // 接收者
    timestamp: number; // 时间戳
}

// Worker池配置
export interface WorkerPoolConfig {
    minWorkers: number;         // 最小工作线程数
    maxWorkers: number;         // 最大工作线程数
    idleTimeoutMs: number;      // 空闲超时时间(ms)
    workerScript: string;       // Worker脚本路径
    taskTimeout?: number;       // 任务超时时间(ms)
    memoryLimit?: number;       // 内存限制(MB)
    useSmol?: boolean;          // 是否使用smol模式
}

// 工作线程状态
export enum WorkerState {
    IDLE = 'idle',
    BUSY = 'busy',
    ERROR = 'error',
    TERMINATED = 'terminated'
}

// 工作线程信息
interface WorkerInfo {
    id: string;                // Worker ID
    worker: Worker;            // Worker实例
    state: WorkerState;        // 状态
    startTime: number;         // 启动时间
    taskCount: number;         // 已处理任务数
    lastActiveTime: number;    // 最后活跃时间
    pendingTasks: Map<string, {
        resolve: (result: any) => void;
        reject: (error: any) => void;
        timeout?: any;           // NodeJS.Timeout
        startTime: number;
    }>;
}

// 任务信息
export interface TaskInfo {
    id: string;                // 任务ID
    type: string;              // 任务类型
    payload: any;              // 任务负载
    sender?: PID;              // 发送者
    priority?: number;         // 优先级
    startTime?: number;        // 开始时间
    endTime?: number;          // 结束时间
    workerId?: string;         // 处理该任务的Worker ID
}

/**
 * Worker池管理器 - 管理一组Worker线程用于执行计算密集型任务
 */
export class WorkerPool {
    private workers: Map<string, WorkerInfo> = new Map();
    private taskQueue: TaskInfo[] = [];
    private config: WorkerPoolConfig;
    private logger: any;
    private isShuttingDown = false;
    private maintenanceInterval?: any; // NodeJS.Timeout
    private metricsCollectionInterval?: any; // NodeJS.Timeout

    // 性能指标
    private metrics = {
        totalTasksQueued: 0,
        totalTasksProcessed: 0,
        totalTasksFailed: 0,
        averageWaitTime: 0,
        averageProcessingTime: 0,
        activeWorkers: 0,
        queuedTasks: 0,
        peakWorkerCount: 0,
        peakQueueSize: 0,
        waitTimeSum: 0,
        processingTimeSum: 0
    };

    constructor(config: WorkerPoolConfig) {
        this.config = {
            minWorkers: Math.max(1, config.minWorkers || 2),
            maxWorkers: Math.max(config.minWorkers || 2, config.maxWorkers || 8),
            idleTimeoutMs: config.idleTimeoutMs || 30000,
            workerScript: config.workerScript,
            taskTimeout: config.taskTimeout || 60000,
            memoryLimit: config.memoryLimit,
            useSmol: config.useSmol || false
        };

        this.logger = createLogger('WorkerPool');

        // 初始化最小数量的Worker
        this.initializeWorkers();

        // 启动维护任务和指标收集
        this.startMaintenanceTask();
        this.startMetricsCollection();
    }

    /**
     * 初始化工作线程池
     */
    private initializeWorkers(): void {
        for (let i = 0; i < this.config.minWorkers; i++) {
            this.createWorker();
        }
    }

    /**
     * 创建新的Worker
     */
    private createWorker(): string {
        const workerId = nanoid();
        try {
            const worker = new Worker(this.config.workerScript, {
                type: 'module',
                name: `worker-${workerId}`,
                // @ts-ignore - Bun支持但TypeScript定义中没有的smol选项
                smol: this.config.useSmol
            });

            const workerInfo: WorkerInfo = {
                id: workerId,
                worker,
                state: WorkerState.IDLE,
                startTime: Date.now(),
                taskCount: 0,
                lastActiveTime: Date.now(),
                pendingTasks: new Map()
            };

            // 设置消息处理程序
            worker.onmessage = (event) => this.handleWorkerMessage(workerId, event.data);
            worker.onerror = (error) => this.handleWorkerError(workerId, error);

            // 初始化Worker
            worker.postMessage({
                type: 'INIT',
                id: nanoid(),
                payload: { workerId },
                timestamp: Date.now()
            });

            this.workers.set(workerId, workerInfo);
            this.logger.debug(`Created worker ${workerId}, total workers: ${this.workers.size}`);

            // 更新最大Worker数量指标
            if (this.workers.size > this.metrics.peakWorkerCount) {
                this.metrics.peakWorkerCount = this.workers.size;
            }

            return workerId;
        } catch (error) {
            this.logger.error(`Failed to create worker: ${error}`);
            throw error;
        }
    }

    /**
     * 处理来自Worker的消息
     */
    private handleWorkerMessage(workerId: string, message: WorkerMessage): void {
        const workerInfo = this.workers.get(workerId);
        if (!workerInfo) {
            this.logger.warn(`Received message from unknown worker ${workerId}`);
            return;
        }

        // 更新Worker状态
        workerInfo.lastActiveTime = Date.now();

        // 根据消息类型处理
        switch (message.type) {
            case 'TASK_RESULT':
                this.handleTaskResult(workerId, message);
                break;
            case 'TASK_ERROR':
                this.handleTaskError(workerId, message);
                break;
            case 'WORKER_READY':
                workerInfo.state = WorkerState.IDLE;
                this.processNextTask();
                break;
            case 'WORKER_STATS':
                // 处理Worker统计信息
                break;
            default:
                this.logger.warn(`Unknown message type from worker ${workerId}: ${message.type}`);
        }
    }

    /**
     * 处理Worker错误
     */
    private handleWorkerError(workerId: string, error: ErrorEvent): void {
        const workerInfo = this.workers.get(workerId);
        if (!workerInfo) return;

        this.logger.error(`Worker ${workerId} error: ${error.message}`);
        workerInfo.state = WorkerState.ERROR;

        // 重新分配该Worker的所有待处理任务
        for (const [taskId, task] of workerInfo.pendingTasks.entries()) {
            this.metrics.totalTasksFailed++;
            task.reject(new Error(`Worker error: ${error.message}`));
            workerInfo.pendingTasks.delete(taskId);
        }

        // 终止并替换Worker
        this.terminateWorker(workerId);
        if (!this.isShuttingDown) {
            this.createWorker();
            this.processNextTask();
        }
    }

    /**
     * 处理任务结果
     */
    private handleTaskResult(workerId: string, message: WorkerMessage): void {
        const workerInfo = this.workers.get(workerId);
        if (!workerInfo) return;

        const task = workerInfo.pendingTasks.get(message.id);
        if (!task) {
            this.logger.warn(`Received result for unknown task ${message.id} from worker ${workerId}`);
            return;
        }

        // 清除超时计时器
        if (task.timeout) {
            clearTimeout(task.timeout);
        }

        // 计算处理时间
        const processingTime = Date.now() - task.startTime;
        this.metrics.processingTimeSum += processingTime;
        this.metrics.totalTasksProcessed++;
        this.metrics.averageProcessingTime = this.metrics.processingTimeSum / this.metrics.totalTasksProcessed;

        // 解析任务
        task.resolve(message.payload);
        workerInfo.pendingTasks.delete(message.id);
        workerInfo.taskCount++;

        // 如果Worker没有更多待处理任务，则将其设置为空闲状态
        if (workerInfo.pendingTasks.size === 0) {
            workerInfo.state = WorkerState.IDLE;
            this.processNextTask();
        }
    }

    /**
     * 处理任务错误
     */
    private handleTaskError(workerId: string, message: WorkerMessage): void {
        const workerInfo = this.workers.get(workerId);
        if (!workerInfo) return;

        const task = workerInfo.pendingTasks.get(message.id);
        if (!task) {
            this.logger.warn(`Received error for unknown task ${message.id} from worker ${workerId}`);
            return;
        }

        // 清除超时计时器
        if (task.timeout) {
            clearTimeout(task.timeout);
        }

        // 更新指标
        this.metrics.totalTasksFailed++;

        // 拒绝任务
        task.reject(new Error(message.payload?.error || 'Task failed'));
        workerInfo.pendingTasks.delete(message.id);

        // 如果Worker没有更多待处理任务，则将其设置为空闲状态
        if (workerInfo.pendingTasks.size === 0) {
            workerInfo.state = WorkerState.IDLE;
            this.processNextTask();
        }
    }

    /**
     * 提交任务到Worker池
     */
    public async submitTask<T = any>(
        type: string,
        payload: any,
        options: {
            sender?: PID,
            priority?: number,
            timeout?: number
        } = {}
    ): Promise<T> {
        if (this.isShuttingDown) {
            throw new Error('Worker pool is shutting down');
        }

        this.metrics.totalTasksQueued++;
        this.metrics.queuedTasks++;

        if (this.metrics.queuedTasks > this.metrics.peakQueueSize) {
            this.metrics.peakQueueSize = this.metrics.queuedTasks;
        }

        // 创建任务
        const taskId = nanoid();
        const task: TaskInfo = {
            id: taskId,
            type,
            payload,
            sender: options.sender,
            priority: options.priority || 0,
            startTime: Date.now()
        };

        // 将任务添加到队列
        this.addTaskToQueue(task);

        // 返回一个Promise，在任务完成时解析
        return new Promise<T>((resolve, reject) => {
            const timeout = options.timeout || this.config.taskTimeout;
            let timeoutId: any;

            // 设置任务超时
            if (timeout) {
                timeoutId = setTimeout(() => {
                    this.metrics.totalTasksFailed++;
                    this.cancelTask(taskId);
                    reject(new Error(`Task ${taskId} timed out after ${timeout}ms`));
                }, timeout);
            }

            // 将任务添加到待处理列表
            const pendingTask = {
                resolve,
                reject,
                timeout: timeoutId,
                startTime: Date.now()
            };

            // 尝试立即处理任务
            this.assignTaskToWorker(task, pendingTask);
        });
    }

    /**
     * 添加任务到队列
     */
    private addTaskToQueue(task: TaskInfo): void {
        // 根据优先级将任务插入队列
        const index = this.taskQueue.findIndex(t => (t.priority || 0) < (task.priority || 0));
        if (index === -1) {
            this.taskQueue.push(task);
        } else {
            this.taskQueue.splice(index, 0, task);
        }

        // 尝试处理下一个任务
        this.processNextTask();
    }

    /**
     * 取消任务
     */
    public cancelTask(taskId: string): boolean {
        // 从队列中移除任务
        const queueIndex = this.taskQueue.findIndex(task => task.id === taskId);
        if (queueIndex !== -1) {
            this.taskQueue.splice(queueIndex, 1);
            this.metrics.queuedTasks--;
            return true;
        }

        // 检查所有Worker中的待处理任务
        for (const [workerId, workerInfo] of this.workers.entries()) {
            if (workerInfo.pendingTasks.has(taskId)) {
                const task = workerInfo.pendingTasks.get(taskId);
                if (task?.timeout) {
                    clearTimeout(task.timeout);
                }
                workerInfo.pendingTasks.delete(taskId);

                // 通知Worker取消任务
                try {
                    workerInfo.worker.postMessage({
                        type: 'CANCEL_TASK',
                        id: nanoid(),
                        payload: { taskId },
                        timestamp: Date.now()
                    });
                } catch (error) {
                    this.logger.warn(`Failed to send cancel message to worker ${workerId}: ${error}`);
                }

                return true;
            }
        }

        return false;
    }

    /**
     * 处理下一个任务
     */
    private processNextTask(): void {
        if (this.taskQueue.length === 0 || this.isShuttingDown) return;

        // 查找空闲的Worker
        const idleWorker = this.findIdleWorker();
        if (idleWorker) {
            // 有空闲Worker，直接分配任务
            const task = this.taskQueue.shift();
            if (task) {
                this.metrics.queuedTasks--;
                const pendingTask = {
                    resolve: () => { }, // 临时占位，实际会在assignTaskToWorker中设置
                    reject: () => { },  // 临时占位，实际会在assignTaskToWorker中设置
                    startTime: Date.now()
                };
                this.assignTaskToWorker(task, pendingTask);
            }
        } else if (this.workers.size < this.config.maxWorkers) {
            // 没有空闲Worker但可以创建新Worker
            this.createWorker();
            // 稍后重试处理任务
            setTimeout(() => this.processNextTask(), 10);
        }
    }

    /**
     * 查找空闲Worker
     */
    private findIdleWorker(): WorkerInfo | null {
        for (const workerInfo of this.workers.values()) {
            if (workerInfo.state === WorkerState.IDLE) {
                return workerInfo;
            }
        }
        return null;
    }

    /**
     * 将任务分配给Worker
     */
    private assignTaskToWorker(task: TaskInfo, pendingTask: any): boolean {
        // 查找空闲Worker
        const idleWorker = this.findIdleWorker();
        if (!idleWorker) {
            // 没有空闲Worker，将任务重新添加到队列
            this.addTaskToQueue(task);
            return false;
        }

        const workerId = idleWorker.id;
        const workerInfo = this.workers.get(workerId)!;

        // 标记Worker为繁忙状态
        workerInfo.state = WorkerState.BUSY;

        // 将任务添加到Worker的待处理列表
        workerInfo.pendingTasks.set(task.id, pendingTask);

        // 计算等待时间
        const waitTime = Date.now() - task.startTime!;
        this.metrics.waitTimeSum += waitTime;
        this.metrics.averageWaitTime = this.metrics.waitTimeSum / this.metrics.totalTasksProcessed;

        // 更新任务信息
        task.workerId = workerId;

        // 发送任务到Worker
        try {
            workerInfo.worker.postMessage({
                type: 'EXECUTE_TASK',
                id: task.id,
                payload: {
                    type: task.type,
                    data: task.payload
                },
                sender: task.sender,
                timestamp: Date.now()
            });
            return true;
        } catch (error) {
            this.logger.error(`Failed to send task ${task.id} to worker ${workerId}: ${error}`);

            // 发送失败，将Worker标记为错误状态
            workerInfo.state = WorkerState.ERROR;
            workerInfo.pendingTasks.delete(task.id);

            // 终止Worker并创建新Worker
            this.terminateWorker(workerId);
            if (!this.isShuttingDown) {
                this.createWorker();
            }

            // 将任务重新添加到队列
            this.addTaskToQueue(task);
            return false;
        }
    }

    /**
     * 终止Worker
     */
    private terminateWorker(workerId: string): void {
        const workerInfo = this.workers.get(workerId);
        if (!workerInfo) return;

        this.logger.debug(`Terminating worker ${workerId}`);

        try {
            workerInfo.worker.terminate();
        } catch (error) {
            this.logger.warn(`Error terminating worker ${workerId}: ${error}`);
        }

        this.workers.delete(workerId);
    }

    /**
     * 启动维护任务
     */
    private startMaintenanceTask(): void {
        this.maintenanceInterval = setInterval(() => {
            this.performMaintenance();
        }, 5000); // 每5秒执行一次维护
    }

    /**
     * 执行维护任务
     */
    private performMaintenance(): void {
        if (this.isShuttingDown) return;

        const now = Date.now();

        // 检查空闲Worker是否超时
        if (this.workers.size > this.config.minWorkers) {
            for (const [workerId, workerInfo] of this.workers.entries()) {
                if (
                    workerInfo.state === WorkerState.IDLE &&
                    now - workerInfo.lastActiveTime > this.config.idleTimeoutMs &&
                    this.workers.size > this.config.minWorkers
                ) {
                    this.terminateWorker(workerId);
                }
            }
        }

        // 检查是否需要扩展Worker池
        if (
            this.taskQueue.length > 0 &&
            this.workers.size < this.config.maxWorkers
        ) {
            // 基于队列大小和当前Worker数量决定要创建的新Worker数量
            const activeWorkers = [...this.workers.values()].filter(
                w => w.state !== WorkerState.TERMINATED && w.state !== WorkerState.ERROR
            ).length;

            const targetWorkers = Math.min(
                this.config.maxWorkers,
                Math.ceil(activeWorkers * 1.5) // 尝试增加50%的Worker
            );

            for (let i = activeWorkers; i < targetWorkers; i++) {
                this.createWorker();
            }
        }
    }

    /**
     * 启动指标收集
     */
    private startMetricsCollection(): void {
        this.metricsCollectionInterval = setInterval(() => {
            // 更新活动Worker数量
            this.metrics.activeWorkers = [...this.workers.values()].filter(
                w => w.state === WorkerState.BUSY
            ).length;
        }, 1000); // 每秒收集一次指标
    }

    /**
     * 获取Worker池指标
     */
    public getMetrics(): any {
        return {
            ...this.metrics,
            currentWorkers: this.workers.size,
            idleWorkers: [...this.workers.values()].filter(w => w.state === WorkerState.IDLE).length,
            busyWorkers: [...this.workers.values()].filter(w => w.state === WorkerState.BUSY).length,
            errorWorkers: [...this.workers.values()].filter(w => w.state === WorkerState.ERROR).length,
            currentQueueSize: this.taskQueue.length
        };
    }

    /**
     * 关闭Worker池
     */
    public async shutdown(): Promise<void> {
        if (this.isShuttingDown) return;

        this.isShuttingDown = true;
        this.logger.info('Shutting down worker pool...');

        // 清除定时器
        if (this.maintenanceInterval) {
            clearTimeout(this.maintenanceInterval);
        }

        if (this.metricsCollectionInterval) {
            clearTimeout(this.metricsCollectionInterval);
        }

        // 标记所有待处理任务为失败
        for (const task of this.taskQueue) {
            this.metrics.totalTasksFailed++;
        }
        this.taskQueue = [];

        // 终止所有Worker
        const terminationPromises: Promise<void>[] = [];

        for (const [workerId, workerInfo] of this.workers.entries()) {
            // 处理Worker的所有待处理任务
            for (const [taskId, task] of workerInfo.pendingTasks.entries()) {
                if (task.timeout) {
                    clearTimeout(task.timeout);
                }
                task.reject(new Error('Worker pool shutting down'));
            }

            // 终止Worker
            terminationPromises.push(
                new Promise<void>((resolve) => {
                    try {
                        workerInfo.worker.addEventListener('error', () => resolve());
                        workerInfo.worker.terminate();
                        resolve();
                    } catch (error) {
                        resolve();
                    }
                })
            );
        }

        // 等待所有Worker终止
        await Promise.all(terminationPromises);
        this.workers.clear();

        this.logger.info('Worker pool shutdown complete');
    }
} 