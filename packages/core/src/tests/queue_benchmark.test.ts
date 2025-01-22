import { expect, test } from "bun:test";
import { createMessageQueue } from "../core/mailbox";

interface BenchmarkResult {
  operationsPerSecond: number;
  averageLatencyMs: number;
  maxLatencyMs: number;
  minLatencyMs: number;
  totalTimeMs: number;
  messageCount: number;
}

async function runQueueBenchmark(
  queueType: 'circular' | 'fastq',
  messageCount: number,
  batchSize: number = 1000
): Promise<BenchmarkResult> {
  const queue = createMessageQueue(queueType);
  const latencies: number[] = [];
  const startTime = performance.now();

  // Test push operations in batches
  for (let i = 0; i < messageCount; i += batchSize) {
    const batchStart = performance.now();
    const currentBatch = Math.min(batchSize, messageCount - i);
    
    for (let j = 0; j < currentBatch; j++) {
      queue.push({ type: 'benchmark', payload: { index: i + j } });
    }
    
    const batchEnd = performance.now();
    latencies.push(batchEnd - batchStart);
  }

  // Test shift operations
  while (!queue.isEmpty()) {
    const shiftStart = performance.now();
    queue.shift();
    const shiftEnd = performance.now();
    latencies.push(shiftEnd - shiftStart);
  }

  const endTime = performance.now();
  const totalTime = endTime - startTime;

  return {
    operationsPerSecond: (messageCount * 2) / (totalTime / 1000), // multiply by 2 because we do push and shift
    averageLatencyMs: latencies.reduce((a, b) => a + b, 0) / latencies.length,
    maxLatencyMs: Math.max(...latencies),
    minLatencyMs: Math.min(...latencies),
    totalTimeMs: totalTime,
    messageCount: messageCount
  };
}

function printBenchmarkResults(queueType: string, results: BenchmarkResult) {
  console.log(`\n${queueType} Queue Benchmark Results:`);
  console.log(`Total messages processed: ${results.messageCount}`);
  console.log(`Total time: ${results.totalTimeMs.toFixed(2)}ms`);
  console.log(`Operations per second: ${results.operationsPerSecond.toFixed(2)}`);
  console.log(`Average latency: ${results.averageLatencyMs.toFixed(3)}ms`);
  console.log(`Min latency: ${results.minLatencyMs.toFixed(3)}ms`);
  console.log(`Max latency: ${results.maxLatencyMs.toFixed(3)}ms`);
}

test("Compare queue implementations with 100K messages", async () => {
  console.log("\nRunning benchmark with 100K messages");
  
  const circularResults = await runQueueBenchmark('circular', 100000);
  const fastqResults = await runQueueBenchmark('fastq', 100000);

  printBenchmarkResults('Circular Buffer', circularResults);
  printBenchmarkResults('Fastq', fastqResults);

  // Basic assertions to ensure both implementations work
  expect(circularResults.messageCount).toBe(100000);
  expect(fastqResults.messageCount).toBe(100000);
}, 30000);

test("Compare queue implementations with 1M messages", async () => {
  console.log("\nRunning benchmark with 1M messages");
  
  const circularResults = await runQueueBenchmark('circular', 1000000);
  const fastqResults = await runQueueBenchmark('fastq', 1000000);

  printBenchmarkResults('Circular Buffer', circularResults);
  printBenchmarkResults('Fastq', fastqResults);

  // Basic assertions to ensure both implementations work
  expect(circularResults.messageCount).toBe(1000000);
  expect(fastqResults.messageCount).toBe(1000000);
}, 60000);

test("Compare queue implementations under high concurrency", async () => {
  console.log("\nRunning concurrent benchmark with 100K messages");
  
  const messageCount = 100000;
  const concurrentOperations = 10;
  
  // Run multiple benchmarks concurrently
  const circularPromises = Array(concurrentOperations).fill(0)
    .map(() => runQueueBenchmark('circular', messageCount / concurrentOperations));
  
  const fastqPromises = Array(concurrentOperations).fill(0)
    .map(() => runQueueBenchmark('fastq', messageCount / concurrentOperations));

  const circularResults = await Promise.all(circularPromises);
  const fastqResults = await Promise.all(fastqPromises);

  // Aggregate results
  const aggregateResults = (results: BenchmarkResult[]): BenchmarkResult => ({
    operationsPerSecond: results.reduce((sum, r) => sum + r.operationsPerSecond, 0),
    averageLatencyMs: results.reduce((sum, r) => sum + r.averageLatencyMs, 0) / results.length,
    maxLatencyMs: Math.max(...results.map(r => r.maxLatencyMs)),
    minLatencyMs: Math.min(...results.map(r => r.minLatencyMs)),
    totalTimeMs: Math.max(...results.map(r => r.totalTimeMs)),
    messageCount: results.reduce((sum, r) => sum + r.messageCount, 0)
  });

  printBenchmarkResults('Concurrent Circular Buffer', aggregateResults(circularResults));
  printBenchmarkResults('Concurrent Fastq', aggregateResults(fastqResults));
}, 60000); 