// Worker脚本 - 用于在独立线程中执行任务
// 注意：该文件将在Worker线程中运行

declare var self: Worker;

// 任务执行环境配置
interface TaskContext {
    workerId: string;
    taskId: string;
    taskType: string;
}

// 消息类型
type MessageType =
    | 'INIT'           // 初始化Worker
    | 'EXECUTE_TASK'   // 执行任务
    | 'CANCEL_TASK'    // 取消任务
    | 'TERMINATE'      // 终止Worker
    | 'TASK_RESULT'    // 任务结果
    | 'TASK_ERROR'     // 任务错误
    | 'WORKER_READY'   // Worker就绪
    | 'WORKER_STATS';  // Worker状态统计

// 消息格式
interface WorkerMessage {
    id: string;        // 消息ID
    type: MessageType; // 消息类型
    payload: any;      // 消息载荷
    sender?: any;      // 发送者
    timestamp: number; // 时间戳
}

// 当前Worker上下文
const ctx = {
    workerId: '',
    isInitialized: false,
    activeTasks: new Map<string, {
        startTime: number,
        cancel: () => void
    }>(),
    stats: {
        taskCount: 0,
        successCount: 0,
        errorCount: 0,
        totalProcessingTime: 0,
        peakTaskConcurrency: 0
    }
};

// 发送消息到主线程
function sendMessage(type: MessageType, id: string, payload: any): void {
    self.postMessage({
        id,
        type,
        payload,
        timestamp: Date.now()
    });
}

// 发送错误消息
function sendError(taskId: string, error: any): void {
    sendMessage('TASK_ERROR', taskId, {
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined
    });

    // 更新统计信息
    ctx.stats.errorCount++;
    const taskInfo = ctx.activeTasks.get(taskId);
    if (taskInfo) {
        ctx.activeTasks.delete(taskId);
        const processingTime = Date.now() - taskInfo.startTime;
        ctx.stats.totalProcessingTime += processingTime;
    }
}

// 发送任务结果
function sendResult(taskId: string, result: any): void {
    sendMessage('TASK_RESULT', taskId, result);

    // 更新统计信息
    ctx.stats.successCount++;
    const taskInfo = ctx.activeTasks.get(taskId);
    if (taskInfo) {
        ctx.activeTasks.delete(taskId);
        const processingTime = Date.now() - taskInfo.startTime;
        ctx.stats.totalProcessingTime += processingTime;
    }
}

// 发送Worker就绪状态
function sendReady(): void {
    sendMessage('WORKER_READY', crypto.randomUUID(), {
        workerId: ctx.workerId,
        timestamp: Date.now()
    });
}

// 发送Worker统计信息
function sendStats(): void {
    sendMessage('WORKER_STATS', crypto.randomUUID(), {
        ...ctx.stats,
        activeTaskCount: ctx.activeTasks.size,
        timestamp: Date.now()
    });
}

// 初始化Worker
function initWorker(message: WorkerMessage): void {
    if (ctx.isInitialized) {
        console.warn('Worker already initialized');
        return;
    }

    ctx.workerId = message.payload.workerId;
    ctx.isInitialized = true;

    // 定期发送统计信息
    setInterval(() => {
        sendStats();
    }, 5000);

    // 通知主线程Worker已就绪
    sendReady();
}

// 任务执行器字典
const taskExecutors: Record<string, (taskData: any, context: TaskContext) => Promise<any>> = {
    // CPU密集型任务示例
    'CPU_INTENSIVE': async (data, context) => {
        const { iterations = 1000000 } = data;
        let result = 0;

        // 模拟CPU密集型计算
        for (let i = 0; i < iterations; i++) {
            result += Math.sin(i) * Math.cos(i);
        }

        return { result, iterations };
    },

    // IO密集型任务示例
    'IO_INTENSIVE': async (data, context) => {
        const { delayMs = 100 } = data;

        // 模拟IO操作
        await new Promise(resolve => setTimeout(resolve, delayMs));

        return { completed: true, delayMs };
    },

    // 低延迟任务示例
    'LOW_LATENCY': async (data, context) => {
        // 立即返回结果
        return { timestamp: Date.now(), data };
    },

    // 批处理任务示例
    'BATCH': async (data, context) => {
        const { items = [], processingTimePerItem = 5 } = data;
        const results = [];

        for (const item of items) {
            // 处理每个项目
            await new Promise(resolve => setTimeout(resolve, processingTimePerItem));
            results.push({
                item,
                processed: true,
                timestamp: Date.now()
            });
        }

        return { results, totalItems: items.length };
    },

    // 自定义任务处理
    'CUSTOM': async (data, context) => {
        // 如果有自定义函数代码，则执行它
        if (data.functionCode) {
            try {
                // 注意：eval使用存在安全风险，生产环境应谨慎使用
                const customFunction = new Function('data', 'context', data.functionCode);
                return await customFunction(data, context);
            } catch (error) {
                throw new Error(`Custom function execution error: ${error}`);
            }
        }

        return { success: true, customData: data };
    },
};

// 执行任务
async function executeTask(message: WorkerMessage): Promise<void> {
    if (!ctx.isInitialized) {
        sendError(message.id, new Error('Worker not initialized'));
        return;
    }

    const taskId = message.id;
    const taskType = message.payload.type;
    const taskData = message.payload.data;

    // 创建一个可取消的任务上下文
    let isCancelled = false;
    const taskInfo = {
        startTime: Date.now(),
        cancel: () => { isCancelled = true; }
    };

    // 记录任务开始
    ctx.activeTasks.set(taskId, taskInfo);
    ctx.stats.taskCount++;

    // 更新并发任务峰值
    if (ctx.activeTasks.size > ctx.stats.peakTaskConcurrency) {
        ctx.stats.peakTaskConcurrency = ctx.activeTasks.size;
    }

    // 查找任务执行器
    const executor = taskExecutors[taskType];
    if (!executor) {
        sendError(taskId, new Error(`Unknown task type: ${taskType}`));
        return;
    }

    try {
        // 创建任务上下文
        const taskContext: TaskContext = {
            workerId: ctx.workerId,
            taskId,
            taskType
        };

        // 执行任务
        const result = await executor(taskData, taskContext);

        // 检查任务是否已取消
        if (isCancelled) {
            return;
        }

        // 发送结果
        sendResult(taskId, result);
    } catch (error) {
        // 检查任务是否已取消
        if (isCancelled) {
            return;
        }

        // 发送错误
        sendError(taskId, error);
    }
}

// 取消任务
function cancelTask(message: WorkerMessage): void {
    const taskId = message.payload.taskId;
    const taskInfo = ctx.activeTasks.get(taskId);

    if (taskInfo) {
        taskInfo.cancel();
        ctx.activeTasks.delete(taskId);
    }
}

// 消息处理器
self.onmessage = async (event: MessageEvent) => {
    const message = event.data as WorkerMessage;

    try {
        switch (message.type) {
            case 'INIT':
                initWorker(message);
                break;

            case 'EXECUTE_TASK':
                executeTask(message);
                break;

            case 'CANCEL_TASK':
                cancelTask(message);
                break;

            case 'TERMINATE':
                // 清理资源并终止
                for (const [taskId, taskInfo] of ctx.activeTasks.entries()) {
                    taskInfo.cancel();
                }

                // 发送最终统计信息
                sendStats();
                break;

            default:
                console.warn(`Unknown message type: ${message.type}`);
        }
    } catch (error) {
        console.error('Error processing message:', error);
        if (message.id) {
            sendError(message.id, error);
        }
    }
}; 