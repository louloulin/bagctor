import { BenchmarkResult } from './benchmark_system';
import { log } from '../../../utils/logger';

export interface BenchmarkReport {
    summary: {
        totalIterations: number;
        averageThroughput: number;
        averageLatency: number;
        peakThroughput: number;
        peakLatency: number;
        errorRate: number;
    };
    iterations: BenchmarkResult[];
    timestamp: number;
    duration: number;
}

export class ReportGenerator {
    private results: BenchmarkResult[];

    constructor(results: BenchmarkResult[]) {
        this.results = results;
    }

    generateReport(): BenchmarkReport {
        const summary = this.calculateSummary();
        const timestamp = Date.now();
        const duration = this.calculateDuration();

        const report: BenchmarkReport = {
            summary,
            iterations: this.results,
            timestamp,
            duration
        };

        this.logReport(report);
        return report;
    }

    private calculateSummary() {
        const totalIterations = this.results.length;
        const averageThroughput = this.results.reduce((sum, r) => sum + r.throughput, 0) / totalIterations;
        const averageLatency = this.results.reduce((sum, r) => sum + r.latency.avg, 0) / totalIterations;
        const peakThroughput = Math.max(...this.results.map(r => r.throughput));
        const peakLatency = Math.max(...this.results.map(r => r.latency.max));
        const errorRate = this.results.reduce((sum, r) => sum + r.errorRate, 0) / totalIterations;

        return {
            totalIterations,
            averageThroughput,
            averageLatency,
            peakThroughput,
            peakLatency,
            errorRate
        };
    }

    private calculateDuration(): number {
        if (this.results.length < 2) return 0;
        const firstTimestamp = this.results[0].timestamp;
        const lastTimestamp = this.results[this.results.length - 1].timestamp;
        return lastTimestamp - firstTimestamp;
    }

    private logReport(report: BenchmarkReport) {
        log.info('\n=== Performance Test Report ===');
        log.info(`\nSummary:`);
        log.info(`- Total Iterations: ${report.summary.totalIterations}`);
        log.info(`- Average Throughput: ${report.summary.averageThroughput.toFixed(2)} msg/sec`);
        log.info(`- Average Latency: ${report.summary.averageLatency.toFixed(2)} ms`);
        log.info(`- Peak Throughput: ${report.summary.peakThroughput.toFixed(2)} msg/sec`);
        log.info(`- Peak Latency: ${report.summary.peakLatency.toFixed(2)} ms`);
        log.info(`- Error Rate: ${(report.summary.errorRate * 100).toFixed(2)}%`);
        log.info(`- Total Duration: ${(report.duration / 1000).toFixed(2)} seconds`);

        log.info('\nDetailed Results:');
        report.iterations.forEach((result, index) => {
            log.info(`\nIteration ${index + 1}:`);
            log.info(`- Throughput: ${result.throughput.toFixed(2)} msg/sec`);
            log.info(`- Latency (ms):`);
            log.info(`  - Min: ${result.latency.min.toFixed(2)}`);
            log.info(`  - Max: ${result.latency.max.toFixed(2)}`);
            log.info(`  - Avg: ${result.latency.avg.toFixed(2)}`);
            log.info(`  - P95: ${result.latency.p95.toFixed(2)}`);
            log.info(`  - P99: ${result.latency.p99.toFixed(2)}`);
            log.info(`- Error Rate: ${(result.errorRate * 100).toFixed(2)}%`);
            log.info(`- Resource Usage:`);
            log.info(`  - CPU: ${result.resourceUsage.cpu.toFixed(2)}%`);
            log.info(`  - Memory: ${(result.resourceUsage.memory / 1024 / 1024).toFixed(2)} MB`);
        });
    }
} 