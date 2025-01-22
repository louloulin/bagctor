import { expect, test, mock } from "bun:test";
import { DefaultDispatcher, ThroughputDispatcher } from "../core/dispatcher";

test("DefaultDispatcher should execute tasks immediately", async () => {
  const dispatcher = new DefaultDispatcher();
  const results: number[] = [];

  // Schedule multiple tasks
  dispatcher.schedule(async () => {
    results.push(1);
  });
  dispatcher.schedule(async () => {
    results.push(2);
  });

  // Wait for execution
  await new Promise(resolve => setTimeout(resolve, 50));

  expect(results).toEqual([1, 2]);
});

test("ThroughputDispatcher should respect throughput limits", async () => {
  const dispatcher = new ThroughputDispatcher(3, 2); // max 3 per second, batch size 2
  const results: number[] = [];
  const startTime = Date.now();

  // Schedule more tasks than throughput limit
  for (let i = 0; i < 5; i++) {
    dispatcher.schedule(async () => {
      await new Promise(resolve => setTimeout(resolve, 10)); // Add small delay
      results.push(i);
    });
  }

  // Wait for first batch
  await new Promise(resolve => setTimeout(resolve, 100));
  const firstBatchTime = Date.now();
  const firstBatch = [...results];

  // Wait for second batch
  await new Promise(resolve => setTimeout(resolve, 1000));
  const secondBatch = results.slice(firstBatch.length);

  // Verify timing and batches
  expect(firstBatch.length).toBeLessThanOrEqual(3); // First batch should not exceed throughput
  expect(results.length).toBe(5); // All tasks should complete eventually
  expect(firstBatchTime - startTime).toBeLessThan(200); // First batch should complete quickly
});

test("ThroughputDispatcher should process in batches", async () => {
  const dispatcher = new ThroughputDispatcher(10, 2); // batch size 2
  const executionOrder: number[] = [];
  const executionTimes: number[] = [];
  const startTime = Date.now();

  // Schedule tasks
  for (let i = 0; i < 6; i++) {
    dispatcher.schedule(async () => {
      executionOrder.push(i);
      executionTimes.push(Date.now() - startTime);
      await new Promise(resolve => setTimeout(resolve, 10));
    });
  }

  // Wait for processing
  await new Promise(resolve => setTimeout(resolve, 200));

  // Verify all tasks were executed
  expect(executionOrder.length).toBe(6);

  // Analyze batch timing
  const batches = [
    executionTimes.slice(0, 2),
    executionTimes.slice(2, 4),
    executionTimes.slice(4, 6)
  ];

  // Tasks within same batch should have similar timing
  batches.forEach(batchTimes => {
    const [time1, time2] = batchTimes;
    expect(Math.abs(time1 - time2)).toBeLessThan(20); // Tasks in same batch should start within 20ms
  });
}); 