import { ActorSystem } from '../../../core/system';
import { Message, PID } from '../../../core/types';
import { log } from '../../../utils/logger';

export interface BenchmarkConfig {
    messageCount: number;
    concurrentActors: number;
    messageSize: number;
    warmupIterations: number;
    measurementIterations: number;
    cooldownTime: number;
}

export interface BenchmarkResult {
    throughput: number;  // messages per second
    latency: {
        min: number;
        max: number;
        avg: number;
        p95: number;
        p99: number;
    };
    errorRate: number;
    resourceUsage: {
        cpu: number;
        memory: number;
    };
    timestamp: number;
}

export class BenchmarkSystem {
    private system: ActorSystem;
    private config: BenchmarkConfig;
    private results: BenchmarkResult[] = [];
    private startTime: number = 0;
    private messageCount: number = 0;
    private latencies: number[] = [];

    constructor(system: ActorSystem, config: BenchmarkConfig) {
        this.system = system;
        this.config = config;
    }

    async run(): Promise<BenchmarkResult[]> {
        log.info('Starting benchmark...');

        // Warmup phase
        await this.warmup();

        // Measurement phase
        for (let i = 0; i < this.config.measurementIterations; i++) {
            const result = await this.measure();
            this.results.push(result);

            // Cooldown between iterations
            await new Promise(resolve => setTimeout(resolve, this.config.cooldownTime));
        }

        return this.results;
    }

    private async warmup(): Promise<void> {
        log.info('Warmup phase...');
        for (let i = 0; i < this.config.warmupIterations; i++) {
            await this.measure();
        }
        this.results = []; // Clear warmup results
    }

    private async measure(): Promise<BenchmarkResult> {
        this.startTime = Date.now();
        this.messageCount = 0;
        this.latencies = [];

        // Create test actors
        const actors = await this.createTestActors();

        // Start sending messages
        await this.sendTestMessages(actors);

        // Calculate results
        return this.calculateResults();
    }

    private async createTestActors(): Promise<PID[]> {
        const actors: PID[] = [];
        for (let i = 0; i < this.config.concurrentActors; i++) {
            const actor = await this.system.spawn({
                producer: (context) => ({
                    receive: async (msg: Message) => {
                        const endTime = Date.now();
                        this.latencies.push(endTime - this.startTime);
                        this.messageCount++;
                    }
                })
            });
            actors.push(actor);
        }
        return actors;
    }

    private async sendTestMessages(actors: PID[]): Promise<void> {
        const messageSize = this.config.messageSize;
        const payload = 'x'.repeat(messageSize);

        for (let i = 0; i < this.config.messageCount; i++) {
            const actor = actors[i % actors.length];
            await this.system.send(actor, {
                type: 'benchmark.message',
                payload: { data: payload }
            });
        }
    }

    private calculateResults(): BenchmarkResult {
        const duration = (Date.now() - this.startTime) / 1000; // in seconds
        const throughput = this.messageCount / duration;

        // Calculate latency statistics
        this.latencies.sort((a, b) => a - b);
        const latencyStats = {
            min: this.latencies[0],
            max: this.latencies[this.latencies.length - 1],
            avg: this.latencies.reduce((a, b) => a + b, 0) / this.latencies.length,
            p95: this.latencies[Math.floor(this.latencies.length * 0.95)],
            p99: this.latencies[Math.floor(this.latencies.length * 0.99)]
        };

        return {
            throughput,
            latency: latencyStats,
            errorRate: 0, // TODO: Implement error tracking
            resourceUsage: {
                cpu: 0, // TODO: Implement CPU usage tracking
                memory: 0 // TODO: Implement memory usage tracking
            },
            timestamp: Date.now()
        };
    }
} 