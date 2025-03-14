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
  private targetInterval: number;
  private processingTimeout: any = null;

  // 用于backpressure监控
  private queueSizeHistory: number[] = [];
  private latencyHistory: number[] = [];
  private lastAdaptiveAdjustment = Date.now();
  private currentThroughput: number;
  private overloadDetected = false;

  // 监控数据
  private totalProcessed = 0;
  private totalLatency = 0;
  private maxQueueSize = 0;
  private adaptiveAdjustments = 0;

  constructor(
    private readonly initialThroughput: number = 300,
    private readonly batchSize: number = 30,
    private readonly windowSize: number = 1000, // 1 second window
    private readonly maxQueueThreshold: number = 1000, // 队列长度阈值，超过此值触发backpressure
    private readonly adaptiveInterval: number = 5000, // 自适应调整间隔（毫秒）
    private readonly adaptiveEnabled: boolean = true,
    private readonly historySize: number = 10, // 历史数据点数量
    private readonly minThroughput: number = 50, // 最小吞吐量
    private readonly maxThroughput: number = 1000 // 最大吞吐量
  ) {
    // 初始化吞吐量
    this.currentThroughput = initialThroughput;

    // 计算任务之间的目标间隔时间
    this.targetInterval = this.windowSize / this.currentThroughput;

    // 初始化历史数据
    for (let i = 0; i < this.historySize; i++) {
      this.queueSizeHistory.push(0);
      this.latencyHistory.push(0);
    }
  }

  schedule(runner: () => Promise<void>): void {
    // 应用backpressure策略
    if (this.queue.length > this.maxQueueThreshold) {
      // 记录过载状态
      this.overloadDetected = true;

      // 可以在此处抛出异常或采取其他措施
      // 现在我们只是记录警告并继续尝试处理
      console.warn(`Backpressure triggered: Queue size (${this.queue.length}) exceeded threshold (${this.maxQueueThreshold})`);

      // 尝试立即调整吞吐量以应对负载
      this.adjustThroughputImmediately();
    }

    // 更新最大队列大小统计
    this.maxQueueSize = Math.max(this.maxQueueSize, this.queue.length);

    // 添加任务到队列
    this.queue.push(runner);

    // 如果未在处理中，启动处理队列
    if (!this.processing) {
      this.processQueue();
    }
  }

  /**
   * 获取调度器当前状态信息
   */
  getStats() {
    return {
      queueSize: this.queue.length,
      currentThroughput: this.currentThroughput,
      processedTotal: this.totalProcessed,
      averageLatency: this.totalProcessed > 0 ? this.totalLatency / this.totalProcessed : 0,
      maxQueueSize: this.maxQueueSize,
      overloadDetected: this.overloadDetected,
      adaptiveAdjustments: this.adaptiveAdjustments
    };
  }

  /**
   * 重置调度器状态
   */
  reset(): void {
    // 清除队列
    this.queue = [];

    // 重置处理状态
    this.processing = false;
    this.processedInWindow = 0;
    this.windowStartTime = Date.now();

    // 重置监控数据
    this.totalProcessed = 0;
    this.totalLatency = 0;
    this.maxQueueSize = 0;
    this.adaptiveAdjustments = 0;
    this.overloadDetected = false;

    // 恢复初始吞吐量
    this.currentThroughput = this.initialThroughput;
    this.targetInterval = this.windowSize / this.currentThroughput;

    // 清除处理超时
    if (this.processingTimeout) {
      clearTimeout(this.processingTimeout);
      this.processingTimeout = null;
    }

    // 重置历史数据
    this.queueSizeHistory = Array(this.historySize).fill(0);
    this.latencyHistory = Array(this.historySize).fill(0);
  }

  /**
   * 紧急情况下立即调整吞吐量
   */
  private adjustThroughputImmediately(): void {
    // 在过载情况下减少吞吐量，否则增加
    if (this.overloadDetected) {
      // 减少吞吐量，最低至minThroughput
      this.currentThroughput = Math.max(this.minThroughput, this.currentThroughput * 0.8);
    } else if (this.queue.length < this.maxQueueThreshold * 0.5) {
      // 队列长度低于阈值的50%时，增加吞吐量，但不超过最大值
      this.currentThroughput = Math.min(this.maxThroughput, this.currentThroughput * 1.2);
    }

    // 重新计算时间间隔
    this.targetInterval = this.windowSize / this.currentThroughput;

    // 记录调整次数
    this.adaptiveAdjustments++;

    // 记录时间
    this.lastAdaptiveAdjustment = Date.now();
  }

  /**
   * 基于历史数据进行自适应调整
   */
  private adaptiveThroughputControl(): void {
    if (!this.adaptiveEnabled) return;

    const now = Date.now();

    // 检查是否到达自适应调整的时间间隔
    if (now - this.lastAdaptiveAdjustment < this.adaptiveInterval) return;

    // 计算队列大小趋势
    const queueSizeTrend = this.calculateTrend(this.queueSizeHistory);

    // 计算延迟趋势
    const latencyTrend = this.calculateTrend(this.latencyHistory);

    // 根据趋势调整吞吐量
    if (queueSizeTrend > 0.2 || latencyTrend > 0.2) {
      // 队列大小或延迟增加趋势明显，减少吞吐量
      this.currentThroughput = Math.max(this.minThroughput, this.currentThroughput * 0.9);
      console.log(`Adaptive control: Decreasing throughput to ${this.currentThroughput}`);
    } else if (queueSizeTrend < -0.2 && latencyTrend < 0.1) {
      // 队列大小减少且延迟没有明显增加，增加吞吐量
      this.currentThroughput = Math.min(this.maxThroughput, this.currentThroughput * 1.1);
      console.log(`Adaptive control: Increasing throughput to ${this.currentThroughput}`);
    }

    // 重新计算时间间隔
    this.targetInterval = this.windowSize / this.currentThroughput;

    // 记录调整次数
    this.adaptiveAdjustments++;

    // 更新调整时间
    this.lastAdaptiveAdjustment = now;
  }

  /**
   * 计算数据趋势（正值表示上升，负值表示下降）
   */
  private calculateTrend(data: number[]): number {
    if (data.length < 2) return 0;

    // 使用简单线性回归计算趋势
    let sumX = 0;
    let sumY = 0;
    let sumXY = 0;
    let sumXX = 0;

    for (let i = 0; i < data.length; i++) {
      sumX += i;
      sumY += data[i];
      sumXY += i * data[i];
      sumXX += i * i;
    }

    const n = data.length;
    const denominator = n * sumXX - sumX * sumX;

    // 避免除以零
    if (denominator === 0) return 0;

    // 计算斜率
    const slope = (n * sumXY - sumX * sumY) / denominator;

    // 归一化斜率
    const averageY = sumY / n;
    if (averageY === 0) return 0;

    return slope / averageY;
  }

  private async processQueue(): Promise<void> {
    // 防止重入
    if (this.processing) return;

    // 清除任何现有的处理超时定时器
    if (this.processingTimeout) {
      clearTimeout(this.processingTimeout);
      this.processingTimeout = null;
    }

    // 设置处理标志
    this.processing = true;

    try {
      // 检查是否需要重置窗口计数器
      const now = Date.now();
      const elapsedTime = now - this.windowStartTime;

      if (elapsedTime >= this.windowSize) {
        // 计算实际吞吐量并记录
        const actualThroughput = (this.processedInWindow / elapsedTime) * 1000;

        // 更新历史数据
        this.updateHistory(this.queue.length, elapsedTime);

        // 重置窗口计数器
        this.processedInWindow = 0;
        this.windowStartTime = now;

        // 执行自适应控制
        this.adaptiveThroughputControl();
      }

      // 获取此批次要处理的任务数
      const tasksToProcess = Math.min(this.batchSize, this.queue.length);

      // 处理批量任务
      if (tasksToProcess > 0) {
        const taskStartTime = Date.now();

        // 获取待处理任务
        const batch = this.queue.splice(0, tasksToProcess);

        // 同时执行所有任务
        await Promise.all(batch.map(async (task) => {
          try {
            await task();

            // 更新计数器
            this.processedInWindow++;
            this.totalProcessed++;

          } catch (error) {
            console.error('Error executing task in ThroughputDispatcher:', error);
          }
        }));

        // 记录任务执行时间
        const taskEndTime = Date.now();
        const taskDuration = taskEndTime - taskStartTime;
        this.totalLatency += taskDuration;

        // 如果处理得太快，需要等待以维持目标吞吐量
        const targetBatchTime = tasksToProcess * this.targetInterval;
        const waitTime = Math.max(0, targetBatchTime - taskDuration);

        if (waitTime > 0) {
          // 延迟下一批次处理，以保持吞吐量
          this.processingTimeout = setTimeout(() => {
            this.processing = false;
            if (this.queue.length > 0) {
              this.processQueue();
            }
          }, waitTime);
        } else {
          // 无需等待，立即处理下一批次
          this.processing = false;
          if (this.queue.length > 0) {
            this.processQueue();
          }
        }
      } else {
        // 队列为空，停止处理
        this.processing = false;
      }
    } catch (error) {
      console.error('Unexpected error in ThroughputDispatcher:', error);
      this.processing = false;

      // 尝试继续处理队列
      if (this.queue.length > 0) {
        this.processingTimeout = setTimeout(() => {
          this.processQueue();
        }, 100); // 出错后稍微延迟
      }
    }
  }

  /**
   * 更新历史数据
   */
  private updateHistory(queueSize: number, latency: number): void {
    // 移除最旧的数据
    this.queueSizeHistory.shift();
    this.latencyHistory.shift();

    // 添加新数据
    this.queueSizeHistory.push(queueSize);
    this.latencyHistory.push(latency);

    // 如果队列大小降到阈值以下，重置过载状态
    if (this.overloadDetected && queueSize < this.maxQueueThreshold * 0.7) {
      this.overloadDetected = false;
    }
  }
} 