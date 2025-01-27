import { expect, test, mock } from "bun:test";
import { DefaultDispatcher, ThroughputDispatcher } from "../core/dispatcher";

test("DefaultDispatcher should execute tasks immediately", async () => {
  const dispatcher = new DefaultDispatcher();
  const results: number[] = [];
  const startTime = Date.now();

  // Schedule multiple tasks
  dispatcher.schedule(async () => {
    results.push(1);
  });
  dispatcher.schedule(async () => {
    results.push(2);
  });

  // Wait for execution
  await new Promise(resolve => setTimeout(resolve, 50));

  // Verify tasks were executed
  expect(results.length).toBe(2);
  expect(Date.now() - startTime).toBeLessThan(100); // Should complete quickly
});

test("ThroughputDispatcher should respect throughput limits", async () => {
  const dispatcher = new ThroughputDispatcher(3, 2); // max 3 per second
  const results: number[] = [];
  const startTime = Date.now();

  // Schedule more tasks than throughput limit
  for (let i = 0; i < 5; i++) {
    dispatcher.schedule(async () => {
      results.push(Date.now() - startTime);
    });
  }

  // Wait for all tasks to complete
  await new Promise(resolve => setTimeout(resolve, 2000));

  // Verify all tasks were executed
  expect(results.length).toBe(5);

  // Group executions by second
  const executionsBySecond = results.reduce((acc, time) => {
    const second = Math.floor(time / 1000);
    acc[second] = (acc[second] || 0) + 1;
    return acc;
  }, {} as Record<number, number>);

  // Verify throughput limit
  Object.values(executionsBySecond).forEach(count => {
    expect(count).toBeLessThanOrEqual(3); // Should not exceed throughput limit
  });
});

test("ThroughputDispatcher should maintain consistent throughput", async () => {
  const targetThroughput = 10; // tasks per second
  const dispatcher = new ThroughputDispatcher(targetThroughput);
  const executionTimes: number[] = [];
  const startTime = Date.now();
  const duration = 2000; // Test for 2 seconds
  const totalTasks = Math.floor((targetThroughput * duration) / 1000);

  // Schedule tasks with minimal execution time
  const tasks = Array(totalTasks).fill(0).map((_, i) =>
    dispatcher.schedule(async () => {
      executionTimes.push(Date.now() - startTime);
    })
  );

  // Wait for processing
  await new Promise(resolve => setTimeout(resolve, duration + 500));

  // Verify tasks were executed
  expect(executionTimes.length).toBeGreaterThan(0);

  // Wait for a moment to ensure all tasks have completed
  await new Promise(resolve => setTimeout(resolve, 100));

  // Calculate actual throughput
  const validTimes = executionTimes.filter(time => time > 0);
  if (validTimes.length < 2) {
    throw new Error('Not enough valid execution times to calculate throughput');
  }

  const actualDuration = validTimes[validTimes.length - 1] - validTimes[0];
  if (actualDuration <= 0) {
    throw new Error('Invalid duration: tasks executed too quickly to measure throughput');
  }

  const actualThroughput = (validTimes.length / actualDuration) * 1000;

  console.log('\nThroughput test results:');
  console.log('Target throughput:', targetThroughput, 'tasks/second');
  console.log('Actual throughput:', actualThroughput.toFixed(2), 'tasks/second');
  console.log('Test duration:', actualDuration.toFixed(2), 'ms');
  console.log('Tasks executed:', validTimes.length);

  // Group executions by second
  const executionsBySecond = validTimes.reduce((acc, time) => {
    const second = Math.floor(time / 1000);
    acc[second] = (acc[second] || 0) + 1;
    return acc;
  }, {} as Record<number, number>);

  console.log('\nExecution distribution by second:');
  Object.entries(executionsBySecond).forEach(([second, count]) => {
    console.log(`Second ${second}: ${count} tasks`);
  });

  // Verify throughput is within acceptable range (±20%)
  expect(actualThroughput).toBeGreaterThan(targetThroughput * 0.8);
  expect(actualThroughput).toBeLessThan(targetThroughput * 1.2);

  // Verify per-second throughput is also consistent
  Object.entries(executionsBySecond).forEach(([second, count]) => {
    const secondNum = parseInt(second);
    if (secondNum > 0 && secondNum < Math.floor(duration / 1000)) { // Skip first and last seconds
      expect(count).toBeGreaterThan(targetThroughput * 0.8);
      expect(count).toBeLessThan(targetThroughput * 1.2);
    }
  });
});

test("ThroughputDispatcher should process in batches", async () => {
  const dispatcher = new ThroughputDispatcher(10, 2); // batch size 2
  const executionOrder: number[] = [];
  const executionTimes: number[] = [];
  const startTime = Date.now();

  // Schedule tasks
  for (let i = 0; i < 6; i++) {
    dispatcher.schedule(async () => {
      const now = Date.now();
      executionOrder.push(i);
      executionTimes.push(now - startTime);
      console.log(`Task ${i} executed at ${now - startTime}ms`);
      await new Promise(resolve => setTimeout(resolve, 10));
    });
  }

  // Wait for processing
  await new Promise(resolve => setTimeout(resolve, 1000));

  // Verify all tasks were executed
  expect(executionOrder.length).toBe(6);

  // Log all execution times
  console.log('\nExecution times:');
  executionTimes.forEach((time, i) => {
    console.log(`Task ${executionOrder[i]}: ${time}ms`);
  });

  // Group tasks by execution order
  const orderedTimes = executionOrder.map((_, i) => executionTimes[i]);
  const batches = [];

  // Group tasks into batches based on timing
  for (let i = 0; i < orderedTimes.length; i += 2) {
    batches.push(orderedTimes.slice(i, i + 2));
  }

  console.log('\nBatch timing analysis:');
  batches.forEach((batchTimes, i) => {
    const [time1, time2] = batchTimes;
    console.log(`Batch ${i}: ${time1}ms, ${time2}ms (diff: ${Math.abs(time1 - time2)}ms)`);
  });

  // Verify batch execution characteristics
  let lastBatchTime = 0;

  batches.forEach((batchTimes, i) => {
    const batchTime = Math.min(...batchTimes);

    if (i > 0) {
      const timeSinceLastBatch = batchTime - lastBatchTime;
      console.log(`Time since last batch: ${timeSinceLastBatch}ms`);

      // Verify minimum spacing between batches
      // With throughput of 10/sec, we expect ~100ms minimum between batches
      expect(timeSinceLastBatch).toBeGreaterThan(50);
    }

    lastBatchTime = batchTime;
  });

  // Verify overall execution characteristics
  const totalDuration = executionTimes[executionTimes.length - 1] - executionTimes[0];
  const expectedMinDuration = (6 / 10) * 1000; // 6 tasks at 10 tasks/second = 600ms

  console.log(`\nTotal duration: ${totalDuration}ms (expected minimum: ${expectedMinDuration}ms)`);

  // Verify the total duration is reasonable
  expect(totalDuration).toBeGreaterThan(expectedMinDuration * 0.8); // Allow 20% margin
  expect(totalDuration).toBeLessThan(expectedMinDuration * 1.5); // Allow 50% margin for system variations

  // Verify average throughput
  const tasksPerSecond = (executionOrder.length / totalDuration) * 1000;
  console.log(`Average throughput: ${tasksPerSecond.toFixed(2)} tasks/second`);

  // Average throughput should be close to target
  expect(tasksPerSecond).toBeGreaterThan(8); // Allow 20% below target
  expect(tasksPerSecond).toBeLessThan(12); // Allow 20% above target
});

test("ThroughputDispatcher should handle high load efficiently", async () => {
  const dispatcher = new ThroughputDispatcher(100, 10); // 100 tasks/sec, batch size 10
  const executionTimes: number[] = [];
  const startTime = Date.now();
  const totalTasks = 300; // 3 seconds worth of tasks

  // Schedule a large number of tasks
  for (let i = 0; i < totalTasks; i++) {
    dispatcher.schedule(async () => {
      executionTimes.push(Date.now() - startTime);
      await new Promise(resolve => setTimeout(resolve, 1)); // Minimal task duration
    });
  }

  // Wait for processing
  await new Promise(resolve => setTimeout(resolve, 3500)); // Wait a bit longer than theoretical time

  // Verify all tasks were executed
  expect(executionTimes.length).toBe(totalTasks);

  // Group executions by second
  const executionsBySecond = executionTimes.reduce((acc, time) => {
    const second = Math.floor(time / 1000);
    acc[second] = (acc[second] || 0) + 1;
    return acc;
  }, {} as Record<number, number>);

  console.log('\nExecution distribution by second:');
  Object.entries(executionsBySecond).forEach(([second, count]) => {
    console.log(`Second ${second}: ${count} tasks`);
  });

  // Verify throughput for each full second
  Object.entries(executionsBySecond).forEach(([second, count]) => {
    if (parseInt(second) < Math.floor(totalTasks / 100)) { // Only check full seconds
      // Allow 20% variation in per-second throughput
      expect(count).toBeGreaterThan(80); // At least 80% of target throughput
      expect(count).toBeLessThan(120); // No more than 120% of target throughput
    }
  });

  // Calculate overall performance metrics
  const totalDuration = executionTimes[executionTimes.length - 1] - executionTimes[0];
  const actualThroughput = (totalTasks / totalDuration) * 1000;

  console.log('\nOverall performance:');
  console.log('Total duration:', totalDuration.toFixed(2), 'ms');
  console.log('Average throughput:', actualThroughput.toFixed(2), 'tasks/second');

  // Verify overall throughput is within acceptable range
  expect(actualThroughput).toBeGreaterThan(80); // At least 80% of target throughput
  expect(actualThroughput).toBeLessThan(120); // No more than 120% of target throughput
}); 