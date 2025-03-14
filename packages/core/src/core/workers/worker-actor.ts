import { Actor } from '../actor';
import { Message, ActorContext, PID } from '../types';
import { WorkerPool, WorkerPoolConfig } from '../concurrent/worker-pool';
import { v4 as uuid } from 'uuid';

// 支持的任务类型
export enum WorkerTaskType {
    CPU_INTENSIVE = 'CPU_INTENSIVE',
    IO_INTENSIVE = 'IO_INTENSIVE',
    LOW_LATENCY = 'LOW_LATENCY',
    BATCH = 'BATCH',
    CUSTOM = 'CUSTOM'
}

// WorkerActor配置
export interface WorkerActorConfig {
    workerPoolConfig?: Partial<WorkerPoolConfig>;
    isolateTasksByType?: boolean; // 是否按任务类型隔离
    defaultTaskTimeout?: number;  // 默认任务超时时间(ms)
}

/**
 * WorkerActor - 使用Worker池处理计算密集型任务的Actor
 * 
 * 此Actor使用多线程Worker池来执行计算密集型任务，避免阻塞主线程
 * 并提供任务优先级、错误处理和监控功能
 */
export class WorkerActor extends Actor {
    private workerPool: WorkerPool;
    private pendingTasks: Map<string, {
        type: string;
        sender?: PID;
        startTime: number;
    }> = new Map();
    private config: WorkerActorConfig;

    constructor(context: ActorContext, config: WorkerActorConfig = {}) {
        super(context);

        this.config = {
            isolateTasksByType: config.isolateTasksByType || false,
            defaultTaskTimeout: config.defaultTaskTimeout || 30000,
            ...config
        };

        // 创建Worker池
        this.workerPool = this.createWorkerPool();
    }

    /**
     * 创建Worker池
     */
    private createWorkerPool(): WorkerPool {
        const defaultConfig: WorkerPoolConfig = {
            minWorkers: 2,
            maxWorkers: Math.max(2, Math.floor(navigator.hardwareConcurrency * 0.75) || 4),
            idleTimeoutMs: 30000,
            workerScript: '/packages/core/src/core/workers/worker.ts', // Worker脚本路径
            taskTimeout: this.config.defaultTaskTimeout,
            useSmol: false
        };

        // 合并默认配置和用户配置
        const workerPoolConfig: WorkerPoolConfig = {
            ...defaultConfig,
            ...(this.config.workerPoolConfig || {})
        };

        return new WorkerPool(workerPoolConfig);
    }

    /**
     * 注册行为
     */
    protected behaviors(): void {
        this.addBehavior('default', this.defaultBehavior.bind(this));
    }

    /**
     * 默认行为
     */
    private async defaultBehavior(message: Message): Promise<void> {
        switch (message.type) {
            case 'EXECUTE_WORKER_TASK':
                await this.handleExecuteTask(message);
                break;

            case 'CANCEL_WORKER_TASK':
                this.handleCancelTask(message);
                break;

            case 'GET_WORKER_METRICS':
                await this.handleGetMetrics(message);
                break;

            case 'SHUTDOWN_WORKER_POOL':
                await this.handleShutdownPool(message);
                break;

            case 'WORKER_TASK_TIMEOUT':
                this.handleTaskTimeout(message);
                break;

            default:
                // 未知消息类型
                if (message.sender) {
                    await this.send(message.sender, {
                        type: 'ERROR',
                        payload: {
                            error: `Unsupported message type: ${message.type}`,
                            originalMessage: message
                        },
                        sender: this.context.self
                    });
                }
        }
    }

    /**
     * 处理执行任务请求
     */
    private async handleExecuteTask(message: Message): Promise<void> {
        const { taskType, taskData, priority, timeout } = message.payload || {};
        const sender = message.sender;
        const taskId = uuid();

        // 记录任务信息
        this.pendingTasks.set(taskId, {
            type: taskType,
            sender,
            startTime: Date.now()
        });

        try {
            // 提交任务到Worker池
            const result = await this.workerPool.submitTask(
                taskType,
                taskData,
                {
                    sender: this.context.self,
                    priority,
                    timeout: timeout || this.config.defaultTaskTimeout
                }
            );

            // 任务完成，清理记录
            this.pendingTasks.delete(taskId);

            // 如果有发送者，返回结果
            if (sender) {
                await this.send(sender, {
                    type: 'WORKER_TASK_COMPLETED',
                    payload: {
                        taskId,
                        taskType,
                        result,
                        processingTime: Date.now() - this.pendingTasks.get(taskId)?.startTime!
                    },
                    sender: this.context.self
                });
            }
        } catch (error) {
            // 任务失败，清理记录
            this.pendingTasks.delete(taskId);

            // 如果有发送者，返回错误
            if (sender) {
                await this.send(sender, {
                    type: 'WORKER_TASK_FAILED',
                    payload: {
                        taskId,
                        taskType,
                        error: error instanceof Error ? error.message : String(error),
                        stack: error instanceof Error ? error.stack : undefined
                    },
                    sender: this.context.self
                });
            }
        }
    }

    /**
     * 处理取消任务请求
     */
    private handleCancelTask(message: Message): void {
        const { taskId } = message.payload || {};
        const sender = message.sender;

        // 尝试取消任务
        const cancelled = this.workerPool.cancelTask(taskId);

        // 清理记录
        this.pendingTasks.delete(taskId);

        // 如果有发送者，返回结果
        if (sender) {
            this.send(sender, {
                type: 'WORKER_TASK_CANCELLED',
                payload: {
                    taskId,
                    success: cancelled
                },
                sender: this.context.self
            });
        }
    }

    /**
     * 处理获取指标请求
     */
    private async handleGetMetrics(message: Message): Promise<void> {
        const sender = message.sender;

        // 获取Worker池指标
        const metrics = this.workerPool.getMetrics();

        // 添加Actor特定指标
        const actorMetrics = {
            ...metrics,
            pendingTasks: this.pendingTasks.size,
            oldestPendingTask: this.getOldestPendingTaskAge()
        };

        // 如果有发送者，返回指标
        if (sender) {
            await this.send(sender, {
                type: 'WORKER_METRICS',
                payload: actorMetrics,
                sender: this.context.self
            });
        }
    }

    /**
     * 处理关闭Worker池请求
     */
    private async handleShutdownPool(message: Message): Promise<void> {
        const sender = message.sender;

        try {
            await this.workerPool.shutdown();

            // 如果有发送者，返回结果
            if (sender) {
                await this.send(sender, {
                    type: 'WORKER_POOL_SHUTDOWN',
                    payload: { success: true },
                    sender: this.context.self
                });
            }
        } catch (error) {
            // 如果有发送者，返回错误
            if (sender) {
                await this.send(sender, {
                    type: 'WORKER_POOL_SHUTDOWN',
                    payload: {
                        success: false,
                        error: error instanceof Error ? error.message : String(error)
                    },
                    sender: this.context.self
                });
            }
        }
    }

    /**
     * 处理任务超时
     */
    private handleTaskTimeout(message: Message): void {
        const { taskId } = message.payload || {};

        // 尝试取消任务
        this.workerPool.cancelTask(taskId);

        // 清理记录
        this.pendingTasks.delete(taskId);
    }

    /**
     * 获取最老的待处理任务年龄
     */
    private getOldestPendingTaskAge(): number {
        if (this.pendingTasks.size === 0) {
            return 0;
        }

        let oldestTime = Date.now();
        for (const task of this.pendingTasks.values()) {
            if (task.startTime < oldestTime) {
                oldestTime = task.startTime;
            }
        }

        return Date.now() - oldestTime;
    }

    /**
     * 检查是否支持指定任务类型
     */
    public isSupportedTaskType(taskType: string): boolean {
        return Object.values(WorkerTaskType).includes(taskType as WorkerTaskType);
    }

    /**
     * 在Actor停止前执行清理
     * 由于基类Actor可能没有beforeStop方法，不使用override关键字
     */
    public async beforeStop(): Promise<void> {
        try {
            // 关闭Worker池
            await this.workerPool.shutdown();
        } catch (error) {
            console.error('Error shutting down worker pool:', error);
        }

        // 如果基类有beforeStop方法，则调用它
        if (super.beforeStop) {
            await super.beforeStop();
        }
    }
} 