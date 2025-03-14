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
  createdAt: number;
}

export class ThreadPoolDispatcher implements MessageDispatcher {
  private workers: Worker[] = [];
  private taskQueues: Array<Task[]> = [];
  private activeTaskCounts: number[] = [];
  private nextTaskId: number = 0;
  private isWorkerEnvironment: boolean;
  private taskResolutionMap: Map<number, (result: any) => void> = new Map();
  private taskRejectionMap: Map<number, (error: any) => void> = new Map();
  private maxConcurrentTasksPerWorker: number;
  private metrics = {
    tasksScheduled: 0,
    tasksCompleted: 0,
    tasksFailed: 0,
    avgTaskDuration: 0,
    totalTaskDuration: 0,
    // 添加更多指标以支持自适应调度
    workerUtilization: new Array<number>(),
    queueWaitTimes: new Array<number>(),
    taskLatencies: new Array<number>(),
    lastAdaptiveAdjustment: Date.now()
  };

  constructor(
    private threadCount: number = typeof navigator !== 'undefined' ? (navigator.hardwareConcurrency || 4) : 4,
    maxConcurrentTasksPerWorker: number = 5
  ) {
    this.isWorkerEnvironment = typeof Worker !== 'undefined';
    this.maxConcurrentTasksPerWorker = maxConcurrentTasksPerWorker;

    // 初始化指标跟踪数组
    this.metrics.workerUtilization = new Array(threadCount).fill(0);

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
              this.onTaskComplete(i, e.data.taskId, e.data.success, e.data.result, e.data.error, e.data.executionTime);
            } else if (e.data && e.data.type === 'WORKER_READY') {
              // Worker初始化完成
              console.log(`Worker ${i} is ready`);
            }
          });
        } catch (error) {
          console.error('Failed to create worker:', error);
          // 降级到单线程模拟模式
          this.isWorkerEnvironment = false;
        }
      }
    }

    // 如果不是Worker环境，使用模拟线程
    if (!this.isWorkerEnvironment) {
      console.warn('Running ThreadPoolDispatcher in single-threaded simulation mode');
      // 初始化任务处理循环
      for (let i = 0; i < threadCount; i++) {
        this.simulateWorker(i);
      }
    }

    // 启动自适应调度优化器
    this.startAdaptiveScheduling();
  }

  /**
   * 调度任务执行
   * 优化版：返回Promise以支持任务完成通知
   */
  schedule(runner: () => Promise<void>): void {
    this.metrics.tasksScheduled++;
    const taskId = this.nextTaskId++;

    // 找到最佳工作线程 - 组合负载和队列长度考虑
    const workerIndex = this.findOptimalWorker();

    // 创建任务对象
    const task: Task = {
      runner,
      id: taskId,
      createdAt: Date.now()
    };

    // 将任务添加到队列
    this.taskQueues[workerIndex].push(task);

    // 触发任务调度
    this.scheduleTasksForWorker(workerIndex);
  }

  /**
   * 查找负载最小的工作线程
   */
  private findLeastBusyWorker(): number {
    // 使用reduce找到活跃任务数最少的工作线程
    return this.activeTaskCounts.reduce(
      (minIndex, count, index, array) =>
        count < array[minIndex] ? index : minIndex,
      0
    );
  }

  /**
   * 查找最优的工作线程
   * 考虑活跃任务数和队列长度的综合评分
   */
  private findOptimalWorker(): number {
    // 如果有闲置工作线程，优先使用
    const idleWorkerIndex = this.activeTaskCounts.findIndex(count => count === 0);
    if (idleWorkerIndex >= 0) {
      return idleWorkerIndex;
    }

    // 否则，计算综合评分（活跃任务数 * 权重 + 队列长度 * (1-权重)）
    const ACTIVE_TASK_WEIGHT = 0.7; // 活跃任务数权重
    const scores = this.activeTaskCounts.map((count, index) => {
      const queueLength = this.taskQueues[index].length;
      return count * ACTIVE_TASK_WEIGHT + queueLength * (1 - ACTIVE_TASK_WEIGHT);
    });

    // 返回评分最低的工作线程索引
    return scores.reduce(
      (minIndex, score, index, array) =>
        score < array[minIndex] ? index : minIndex,
      0
    );
  }

  /**
   * 为特定工作线程调度指定任务
   */
  private scheduleTaskForWorker(workerIndex: number, taskId: number): void {
    // 查找指定的任务
    const taskIndex = this.taskQueues[workerIndex].findIndex(t => t.id === taskId);
    if (taskIndex === -1) return;

    // 从队列中移除任务
    const task = this.taskQueues[workerIndex].splice(taskIndex, 1)[0];
    this.activeTaskCounts[workerIndex]++;

    // 记录等待时间
    const waitTime = Date.now() - task.createdAt;
    this.metrics.queueWaitTimes.push(waitTime);

    // 限制历史数据长度
    if (this.metrics.queueWaitTimes.length > 100) {
      this.metrics.queueWaitTimes.shift();
    }

    const startTime = Date.now();

    if (this.isWorkerEnvironment && this.workers[workerIndex]) {
      // 在真实Worker中执行
      const worker = this.workers[workerIndex];
      const taskFunction = task.runner.toString();
      worker.postMessage({
        type: 'EXECUTE_TASK',
        taskId: task.id,
        taskFunction,
        startTime
      });
    } else {
      // 在模拟模式下执行
      task.runner()
        .then(result => {
          const executionTime = Date.now() - startTime;
          this.onTaskComplete(workerIndex, task.id, true, result, null, executionTime);
        })
        .catch(error => {
          const executionTime = Date.now() - startTime;
          this.onTaskComplete(workerIndex, task.id, false, null, error, executionTime);
        });
    }
  }

  /**
   * 为指定工作线程调度任务
   */
  private scheduleTasksForWorker(workerIndex: number): void {
    const queue = this.taskQueues[workerIndex];

    // 如果队列为空或工作线程已满载，直接返回
    if (queue.length === 0 ||
      this.activeTaskCounts[workerIndex] >= this.maxConcurrentTasksPerWorker) {
      return;
    }

    const task = queue.shift()!;
    this.activeTaskCounts[workerIndex]++;

    const startTime = Date.now();

    if (this.isWorkerEnvironment && this.workers[workerIndex]) {
      // 在真实Worker中执行
      const worker = this.workers[workerIndex];
      const taskFunction = task.runner.toString();
      worker.postMessage({
        type: 'EXECUTE_TASK',
        taskId: task.id,
        taskFunction,
        startTime
      });
    } else {
      // 在模拟模式下执行
      task.runner()
        .then(result => {
          const executionTime = Date.now() - startTime;
          this.onTaskComplete(workerIndex, task.id, true, result, null, executionTime);
        })
        .catch(error => {
          const executionTime = Date.now() - startTime;
          this.onTaskComplete(workerIndex, task.id, false, null, error, executionTime);
        });
    }
  }

  /**
   * 处理任务完成事件
   */
  private onTaskComplete(
    workerIndex: number,
    taskId: number,
    success: boolean = true,
    result: any = null,
    error: any = null,
    executionTime: number = 0
  ): void {
    this.activeTaskCounts[workerIndex]--;

    // 更新性能指标
    if (success) {
      this.metrics.tasksCompleted++;
      if (this.taskResolutionMap.has(taskId)) {
        this.taskResolutionMap.get(taskId)!(result);
        this.taskResolutionMap.delete(taskId);
      }
    } else {
      this.metrics.tasksFailed++;
      console.error('Task failed:', error);
      if (this.taskRejectionMap.has(taskId)) {
        this.taskRejectionMap.get(taskId)!(error);
        this.taskRejectionMap.delete(taskId);
      }
    }

    // 记录执行时间
    if (executionTime > 0) {
      this.metrics.taskLatencies.push(executionTime);
      // 限制历史数据长度
      if (this.metrics.taskLatencies.length > 100) {
        this.metrics.taskLatencies.shift();
      }

      // 更新平均执行时间
      const totalExecutionTime = this.metrics.totalTaskDuration + executionTime;
      const totalTasks = this.metrics.tasksCompleted + this.metrics.tasksFailed;
      this.metrics.totalTaskDuration = totalExecutionTime;
      this.metrics.avgTaskDuration = totalTasks > 0 ? totalExecutionTime / totalTasks : 0;
    }

    // 更新工作线程利用率
    this.metrics.workerUtilization[workerIndex] = this.activeTaskCounts[workerIndex] / this.maxConcurrentTasksPerWorker;

    // 调度下一个任务
    this.scheduleTasksForWorker(workerIndex);
  }

  /**
   * 在单线程环境中模拟Worker
   */
  private async simulateWorker(workerIndex: number): Promise<void> {
    while (true) {
      // 检查队列中是否有任务
      if (this.taskQueues[workerIndex].length > 0 &&
        this.activeTaskCounts[workerIndex] < this.maxConcurrentTasksPerWorker) {
        this.scheduleTasksForWorker(workerIndex);
      }

      // 暂停一小段时间，避免过度占用CPU
      await new Promise(resolve => setTimeout(resolve, 5));
    }
  }

  /**
   * 启动自适应调度优化
   */
  private startAdaptiveScheduling(): void {
    // 每10秒进行一次调度参数调整
    setInterval(() => {
      this.adaptSchedulingParameters();
    }, 10000);
  }

  /**
   * 自适应调整调度参数
   */
  private adaptSchedulingParameters(): void {
    // 当前时间
    const now = Date.now();

    // 计算自上次调整以来的时间
    const timeSinceLastAdjustment = now - this.metrics.lastAdaptiveAdjustment;
    if (timeSinceLastAdjustment < 5000) {
      return; // 至少间隔5秒才进行调整
    }

    // 分析队列等待时间
    const avgWaitTime = this.metrics.queueWaitTimes.length > 0
      ? this.metrics.queueWaitTimes.reduce((sum, time) => sum + time, 0) / this.metrics.queueWaitTimes.length
      : 0;

    // 分析任务执行时间
    const avgTaskLatency = this.metrics.taskLatencies.length > 0
      ? this.metrics.taskLatencies.reduce((sum, time) => sum + time, 0) / this.metrics.taskLatencies.length
      : 0;

    // 计算工作线程平均利用率
    const avgUtilization = this.metrics.workerUtilization.reduce((sum, util) => sum + util, 0) / this.threadCount;

    // 根据指标调整maxConcurrentTasksPerWorker
    if (avgUtilization > 0.8 && avgWaitTime > 100) {
      // 工作线程过载，减少每个工作线程的并发任务数
      this.maxConcurrentTasksPerWorker = Math.max(1, this.maxConcurrentTasksPerWorker - 1);
    } else if (avgUtilization < 0.5 && avgWaitTime < 20) {
      // 工作线程负载低，增加每个工作线程的并发任务数
      this.maxConcurrentTasksPerWorker++;
    }

    // 更新调整时间
    this.metrics.lastAdaptiveAdjustment = now;
  }

  /**
   * 获取调度器指标
   */
  getMetrics() {
    // 计算当前队列中的任务总数
    const queuedTasks = this.taskQueues.reduce((sum, queue) => sum + queue.length, 0);

    return {
      ...this.metrics,
      activeWorkers: this.threadCount,
      queueLengths: this.taskQueues.map(q => q.length),
      activeTasks: this.activeTaskCounts,
      totalQueued: queuedTasks,
      totalActive: this.activeTaskCounts.reduce((sum, count) => sum + count, 0),
      maxConcurrentTasksPerWorker: this.maxConcurrentTasksPerWorker,
      avgWaitTime: this.metrics.queueWaitTimes.length > 0
        ? this.metrics.queueWaitTimes.reduce((sum, time) => sum + time, 0) / this.metrics.queueWaitTimes.length
        : 0,
      avgTaskLatency: this.metrics.taskLatencies.length > 0
        ? this.metrics.taskLatencies.reduce((sum, time) => sum + time, 0) / this.metrics.taskLatencies.length
        : 0,
      avgUtilization: this.metrics.workerUtilization.reduce((sum, util) => sum + util, 0) / this.threadCount
    };
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