import { MessageDispatcher } from './types';
import { log } from '../utils/logger';

export class DefaultDispatcher implements MessageDispatcher {
  schedule(runner: () => Promise<void>): void {
    // Execute immediately in the same thread
    runner().catch(error => {
      log.error('Error in message processing:', error);
    });
  }
}

// 自定义任务类型
interface Task {
  runner: () => Promise<void>;
  id: number;
}

export class ThreadPoolDispatcher implements MessageDispatcher {
  private workers: Worker[] = [];
  private taskQueues: Array<Task[]> = [];
  private activeTaskCounts: number[] = [];
  private nextTaskId: number = 0;
  private isWorkerEnvironment: boolean;

  constructor(threadCount: number = typeof navigator !== 'undefined' ? (navigator.hardwareConcurrency || 4) : 4) {
    this.isWorkerEnvironment = typeof Worker !== 'undefined';

    // 初始化工作线程池和任务队列
    for (let i = 0; i < threadCount; i++) {
      this.taskQueues.push([]);
      this.activeTaskCounts.push(0);

      if (this.isWorkerEnvironment) {
        try {
          // 在浏览器或支持Worker的环境中创建实际的Worker
          const worker = new Worker(new URL('./worker.js', import.meta.url));
          this.workers.push(worker);

          // 配置工作线程消息处理
          worker.addEventListener('message', (e) => {
            if (e.data && e.data.type === 'TASK_COMPLETE') {
              this.onTaskComplete(i, e.data.taskId);
            }
          });
        } catch (error) {
          log.error('Failed to create worker:', error);
          // 降级到单线程模拟模式
          this.isWorkerEnvironment = false;
        }
      }
    }

    // 如果不是Worker环境，使用模拟线程
    if (!this.isWorkerEnvironment) {
      log.warn('Running ThreadPoolDispatcher in single-threaded simulation mode');
      // 初始化任务处理循环
      for (let i = 0; i < threadCount; i++) {
        this.simulateWorker(i);
      }
    }
  }

  schedule(runner: () => Promise<void>): void {
    const taskId = this.nextTaskId++;
    const task: Task = { runner, id: taskId };

    // 找到负载最小的工作线程
    const targetWorkerIndex = this.findLeastBusyWorker();
    this.taskQueues[targetWorkerIndex].push(task);

    // 安排任务执行
    this.scheduleTasksForWorker(targetWorkerIndex);
  }

  private findLeastBusyWorker(): number {
    return this.activeTaskCounts.reduce(
      (minIndex, count, index, array) =>
        count < array[minIndex] ? index : minIndex,
      0
    );
  }

  private scheduleTasksForWorker(workerIndex: number): void {
    const queue = this.taskQueues[workerIndex];

    // 如果队列有任务且工作线程未超载
    if (queue.length > 0 && this.activeTaskCounts[workerIndex] < 5) {
      const task = queue[0]; // 查看但不移除

      // 根据环境执行任务
      if (this.isWorkerEnvironment && this.workers[workerIndex]) {
        this.taskQueues[workerIndex].shift(); // 现在移除任务
        this.activeTaskCounts[workerIndex]++;

        // 发送任务到Worker执行
        this.workers[workerIndex].postMessage({
          type: 'EXECUTE_TASK',
          taskId: task.id,
          taskFunction: task.runner.toString() // 注意：这是简化版，实际需要序列化函数
        });
      } else {
        // 单线程模式下，任务处理在simulateWorker中处理
      }
    }
  }

  private onTaskComplete(workerIndex: number, taskId: number): void {
    this.activeTaskCounts[workerIndex]--;
    // 安排下一个任务
    this.scheduleTasksForWorker(workerIndex);
  }

  private async simulateWorker(workerIndex: number): Promise<void> {
    while (true) {
      // 等待队列中有任务
      while (this.taskQueues[workerIndex].length === 0) {
        await new Promise(resolve => setTimeout(resolve, 10));
      }

      // 处理下一个任务
      if (this.taskQueues[workerIndex].length > 0) {
        const task = this.taskQueues[workerIndex].shift()!;
        this.activeTaskCounts[workerIndex]++;

        try {
          await task.runner();
        } catch (error) {
          log.error(`Error executing task ${task.id} in simulated worker ${workerIndex}:`, error);
        } finally {
          this.activeTaskCounts[workerIndex]--;
          // 不需要显式安排下一个任务，循环会继续
        }
      }
    }
  }
}

export class ThroughputDispatcher implements MessageDispatcher {
  private queue: (() => Promise<void>)[] = [];
  private processing = false;
  private processedInWindow = 0;
  private windowStartTime = Date.now();
  private readonly targetInterval: number;
  private processingTimeout: any = null;

  constructor(
    private readonly throughput: number = 300,
    private readonly batchSize: number = 30,
    private readonly windowSize: number = 1000 // 1 second window
  ) {
    // 计算任务之间的目标间隔时间
    this.targetInterval = this.windowSize / this.throughput;
  }

  schedule(runner: () => Promise<void>): void {
    this.queue.push(runner);

    // 如果未在处理中，启动处理队列
    if (!this.processing) {
      this.processQueue();
    }
  }

  private async processQueue(): Promise<void> {
    // 防止重入
    if (this.processing) return;

    // 清除任何现有的处理超时定时器
    if (this.processingTimeout) {
      clearTimeout(this.processingTimeout);
      this.processingTimeout = null;
    }

    this.processing = true;

    try {
      // 最大处理次数，防止无限循环
      let processCount = 0;
      const maxProcessCount = 1000; // 合理限制循环次数

      while (this.queue.length > 0 && processCount < maxProcessCount) {
        processCount++;
        const now = Date.now();

        // 检查是否需要重置时间窗口
        if (now >= this.windowStartTime + this.windowSize) {
          this.windowStartTime = now;
          this.processedInWindow = 0;
        }

        // 计算当前窗口中还能处理多少任务
        const remainingInWindow = this.throughput - this.processedInWindow;
        if (remainingInWindow <= 0) {
          // 等待到下一个时间窗口
          const waitTime = (this.windowStartTime + this.windowSize) - now;
          if (waitTime > 0) {
            await new Promise(resolve => setTimeout(resolve, waitTime));
          } else {
            // 如果计算出的等待时间不正确，强制重置窗口
            this.windowStartTime = Date.now();
            this.processedInWindow = 0;
          }
          continue;
        }

        // 计算本批次要处理的任务数
        const currentBatchSize = Math.min(
          this.batchSize,
          remainingInWindow,
          this.queue.length
        );

        if (currentBatchSize <= 0) continue;

        // 取出要处理的任务
        const batch = this.queue.splice(0, currentBatchSize);
        const batchStartTime = Date.now();

        // 并行执行任务，但控制启动时间
        const executions = batch.map((runner, index) => {
          return (async () => {
            // 计算这个任务应该在什么时候开始
            const targetStartTime = batchStartTime + (index * this.targetInterval);
            const now = Date.now();

            // 如果还没到开始时间，等待
            if (now < targetStartTime) {
              await new Promise(resolve => setTimeout(resolve, targetStartTime - now));
            }

            // 执行任务
            return runner().catch(error => {
              // 捕获并记录任务执行中的错误
              console.error('Error executing task in ThroughputDispatcher:', error);
            });
          })();
        });

        try {
          // 等待所有任务完成，但设置合理超时
          await Promise.race([
            Promise.all(executions),
            new Promise((_, reject) => setTimeout(() => reject(new Error('Batch execution timeout')), 10000))
          ]);
        } catch (error) {
          console.error('Batch execution error or timeout:', error);
          // 即使批处理超时或出错，仍继续处理队列
        }

        // 更新已处理的任务数
        this.processedInWindow += currentBatchSize;

        // 计算下一批任务的开始时间
        const nextBatchStartTime = batchStartTime + (currentBatchSize * this.targetInterval);
        const timeToNextBatch = nextBatchStartTime - Date.now();

        // 如果需要，等待到下一批次的开始时间，但限制最长等待时间
        if (timeToNextBatch > 0 && timeToNextBatch < 1000) {
          await new Promise(resolve => setTimeout(resolve, timeToNextBatch));
        }
      }

      // 如果达到最大处理次数但队列仍有任务，记录警告
      if (this.queue.length > 0) {
        console.warn(`ThroughputDispatcher reached max process count with ${this.queue.length} tasks remaining`);
      }
    } finally {
      this.processing = false;

      // 如果队列中还有任务，使用setTimeout而非setImmediate继续处理
      if (this.queue.length > 0) {
        this.processingTimeout = setTimeout(() => this.processQueue(), 0);
      }
    }
  }
} 