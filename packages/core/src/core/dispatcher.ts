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
  
  constructor(
    private readonly throughput: number = 300,
    private readonly batchSize: number = 30,
    private readonly windowSize: number = 1000 // 1 second window
  ) {}

  schedule(runner: () => Promise<void>): void {
    this.queue.push(runner);
    this.processQueue();
  }

  private async processQueue(): Promise<void> {
    if (this.processing) return;
    this.processing = true;

    try {
      while (this.queue.length > 0) {
        const now = Date.now();
        const windowElapsed = now - this.windowStartTime;

        // Reset window if needed
        if (windowElapsed >= this.windowSize) {
          this.windowStartTime = now;
          this.processedInWindow = 0;
        }

        // Check if we've hit throughput limit
        if (this.processedInWindow >= this.throughput) {
          // Wait for next window
          const waitTime = this.windowSize - windowElapsed;
          await new Promise(resolve => setTimeout(resolve, waitTime));
          continue;
        }

        // Process batch
        const batchSize = Math.min(
          this.batchSize,
          this.throughput - this.processedInWindow,
          this.queue.length
        );

        const batch = this.queue.splice(0, batchSize);
        const batchPromises = batch.map(runner => runner());
        
        try {
          await Promise.all(batchPromises);
          this.processedInWindow += batchSize;
        } catch (error) {
          console.error('Error processing batch:', error);
        }

        // Small delay between batches
        await new Promise(resolve => setTimeout(resolve, 1));
      }
    } finally {
      this.processing = false;
      
      // If there are still items in queue, schedule next processing
      if (this.queue.length > 0) {
        setTimeout(() => this.processQueue(), 0);
      }
    }
  }
} 