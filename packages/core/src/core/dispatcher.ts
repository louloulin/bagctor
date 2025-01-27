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

export class ThreadPoolDispatcher implements MessageDispatcher {
  private workers: Worker[] = [];
  private currentWorker = 0;

  constructor(private threadCount: number = navigator.hardwareConcurrency || 4) {
    // Initialize thread pool
    for (let i = 0; i < threadCount; i++) {
      // In a real implementation, we would create actual worker threads
      this.workers.push(new Worker('./worker.js'));
    }
  }

  schedule(runner: () => Promise<void>): void {
    // Round-robin scheduling
    const worker = this.workers[this.currentWorker];
    this.currentWorker = (this.currentWorker + 1) % this.threadCount;

    // In a real implementation, we would post the task to the worker
    worker.postMessage({
      type: 'EXECUTE',
      runner: runner.toString() // Note: This is simplified
    });
  }
}

export class ThroughputDispatcher implements MessageDispatcher {
  private queue: (() => Promise<void>)[] = [];
  private processing = false;
  private processedInWindow = 0;
  private windowStartTime = Date.now();
  private nextBatchTime = 0;
  private readonly timePerBatch: number;
  private readonly timePerTask: number;
  private batchExecutionPromise: Promise<void> | null = null;

  constructor(
    private readonly throughput: number = 300,
    private readonly batchSize: number = 30,
    private readonly windowSize: number = 1000 // 1 second window
  ) {
    // Pre-calculate timing constants
    this.timePerBatch = (this.windowSize * this.batchSize) / this.throughput;
    this.timePerTask = this.windowSize / this.throughput;
  }

  schedule(runner: () => Promise<void>): void {
    this.queue.push(runner);
    if (!this.processing) {
      this.processQueue();
    }
  }

  private async processQueue(): Promise<void> {
    if (this.processing) return;
    this.processing = true;

    try {
      while (this.queue.length > 0) {
        const now = Date.now();

        // Reset window if needed
        if (now >= this.windowStartTime + this.windowSize) {
          this.windowStartTime = now;
          this.processedInWindow = 0;
          this.nextBatchTime = now;
        }

        // Check if we've hit throughput limit
        if (this.processedInWindow >= this.throughput) {
          const nextWindow = this.windowStartTime + this.windowSize;
          await new Promise(resolve => setTimeout(resolve, nextWindow - now));
          continue;
        }

        // Wait until next batch time if needed
        if (now < this.nextBatchTime) {
          await new Promise(resolve => setTimeout(resolve, this.nextBatchTime - now));
          continue;
        }

        // Take batch of tasks
        const batchSize = Math.min(
          this.batchSize,
          this.throughput - this.processedInWindow,
          this.queue.length
        );

        const batch = this.queue.splice(0, batchSize);
        const batchStartTime = Date.now();

        // Execute batch tasks in parallel with timing control
        const executions = batch.map((runner, index) => {
          const targetStartTime = batchStartTime + (index * this.timePerTask / batchSize);
          return (async () => {
            const now = Date.now();
            if (now < targetStartTime) {
              await new Promise(resolve => setTimeout(resolve, targetStartTime - now));
            }
            return runner();
          })();
        });

        // Wait for all tasks to complete
        await Promise.all(executions);

        // Update state
        this.processedInWindow += batchSize;
        this.nextBatchTime = batchStartTime + this.timePerBatch;

        // Ensure minimum time between batches
        const batchEndTime = Date.now();
        const batchDuration = batchEndTime - batchStartTime;
        if (batchDuration < this.timePerBatch) {
          await new Promise(resolve => setTimeout(resolve, this.timePerBatch - batchDuration));
        }
      }
    } finally {
      this.processing = false;

      // If there are still items in queue, continue processing
      if (this.queue.length > 0) {
        this.processQueue();
      }
    }
  }
} 