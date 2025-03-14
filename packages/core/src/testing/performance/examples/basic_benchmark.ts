import { describe, expect, test, beforeAll, afterAll } from 'bun:test';
import { ActorSystem } from '../../../../core/system';
import { BenchmarkSystem, BenchmarkConfig } from '../benchmark_system';
import { log } from '../../../../utils/logger';

describe('Actor System Performance Benchmark', () => {
    let system: ActorSystem;
    let benchmark: BenchmarkSystem;

    beforeAll(async () => {
        log.info('Initializing actor system for benchmark...');
        system = new ActorSystem();
        await system.initialize();
    });

    afterAll(async () => {
        log.info('Shutting down actor system...');
        await system.shutdown();
    });

    test('Basic message throughput benchmark', async () => {
        const config: BenchmarkConfig = {
            messageCount: 1000,
            concurrentActors: 10,
            messageSize: 100, // 100 bytes per message
            warmupIterations: 2,
            measurementIterations: 3,
            cooldownTime: 1000 // 1 second cooldown between iterations
        };

        benchmark = new BenchmarkSystem(system, config);
        const results = await benchmark.run();

        // Log benchmark results
        log.info('Benchmark Results:');
        results.forEach((result, index) => {
            log.info(`\nIteration ${index + 1}:`);
            log.info(`- Throughput: ${result.throughput.toFixed(2)} msg/sec`);
            log.info(`- Latency (ms):`);
            log.info(`  - Min: ${result.latency.min.toFixed(2)}`);
            log.info(`  - Max: ${result.latency.max.toFixed(2)}`);
            log.info(`  - Avg: ${result.latency.avg.toFixed(2)}`);
            log.info(`  - P95: ${result.latency.p95.toFixed(2)}`);
            log.info(`  - P99: ${result.latency.p99.toFixed(2)}`);
            log.info(`- Error Rate: ${(result.errorRate * 100).toFixed(2)}%`);
        });

        // Basic assertions
        expect(results.length).toBe(config.measurementIterations);
        results.forEach(result => {
            expect(result.throughput).toBeGreaterThan(0);
            expect(result.latency.min).toBeGreaterThan(0);
            expect(result.latency.max).toBeGreaterThan(result.latency.min);
            expect(result.latency.avg).toBeGreaterThan(result.latency.min);
            expect(result.latency.avg).toBeLessThan(result.latency.max);
        });
    });
}); 