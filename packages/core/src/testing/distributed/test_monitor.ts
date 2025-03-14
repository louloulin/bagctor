/**
 * TestMonitor
 * 
 * A utility for collecting, analyzing, and reporting test metrics and events.
 * Used to track message delivery, latency, throughput, and system behavior
 * during distributed tests.
 */

import { EventEmitter } from 'events';
import { log } from '../../utils/logger';
import { Message, PID } from '../../core/types';
import { MessageDelivery } from './network_simulator';
import { TestSystemEvent } from './test_system';

/**
 * Monitor configuration
 */
export interface TestMonitorConfig {
    /** Whether to enable detailed logging */
    verbose?: boolean;

    /** Whether to collect latency metrics */
    collectLatency?: boolean;

    /** Whether to collect throughput metrics */
    collectThroughput?: boolean;

    /** Whether to collect message delivery statistics */
    collectDeliveryStats?: boolean;

    /** Time interval (ms) for sampling metrics */
    samplingInterval?: number;
}

/**
 * Message capture entry
 */
export interface MessageCapture {
    message: Message;
    source?: string | PID;
    target?: string | PID;
    timestamp: number;
    context?: string;
}

/**
 * Latency measurement
 */
export interface LatencyMeasurement {
    messageType: string;
    latencyMs: number;
    source: string;
    target: string;
    timestamp: number;
}

/**
 * Throughput measurement
 */
export interface ThroughputMeasurement {
    messageCount: number;
    timeWindowMs: number;
    messagesPerSecond: number;
    timestamp: number;
    nodeId?: string;
}

/**
 * Delivery statistics
 */
export interface DeliveryStatistics {
    total: number;
    delivered: number;
    dropped: number;
    duplicated: number;
    delayed: number;
    successRate: number;
}

/**
 * The test monitor tracks and analyzes test execution
 */
export class TestMonitor extends EventEmitter {
    private config: Required<TestMonitorConfig>;
    private messages: MessageCapture[] = [];
    private events: TestSystemEvent[] = [];
    private deliveries: MessageDelivery[] = [];
    private latencyMeasurements: LatencyMeasurement[] = [];
    private throughputSamples: ThroughputMeasurement[] = [];
    private messageCountsByType: Map<string, number> = new Map();
    private messageCountsByNode: Map<string, number> = new Map();
    private startTime: number = 0;
    private endTime: number = 0;
    private samplingTimer?: NodeJS.Timeout;

    constructor(config?: TestMonitorConfig) {
        super();

        this.config = {
            verbose: false,
            collectLatency: true,
            collectThroughput: true,
            collectDeliveryStats: true,
            samplingInterval: 1000,
            ...(config || {})
        };

        this.startTime = Date.now();
    }

    /**
     * Start monitoring
     */
    start(): void {
        this.startTime = Date.now();
        this.clear();

        if (this.config.collectThroughput) {
            this.startSampling();
        }

        log.info('[TestMonitor] Monitoring started');
    }

    /**
     * Stop monitoring
     */
    stop(): void {
        this.endTime = Date.now();

        if (this.samplingTimer) {
            clearInterval(this.samplingTimer);
            this.samplingTimer = undefined;
        }

        log.info('[TestMonitor] Monitoring stopped');
    }

    /**
     * Clear all collected data
     */
    clear(): void {
        this.messages = [];
        this.events = [];
        this.deliveries = [];
        this.latencyMeasurements = [];
        this.throughputSamples = [];
        this.messageCountsByType.clear();
        this.messageCountsByNode.clear();
    }

    /**
     * Record a message being sent or received
     */
    captureMessage(
        message: Message,
        context: string,
        source?: string | PID,
        target?: string | PID
    ): void {
        const entry: MessageCapture = {
            message,
            source,
            target,
            timestamp: Date.now(),
            context
        };

        this.messages.push(entry);

        // Track message type counts
        const messageType = this.getMessageType(message);
        const currentCount = this.messageCountsByType.get(messageType) || 0;
        this.messageCountsByType.set(messageType, currentCount + 1);

        // Track node message counts if source is provided
        if (typeof source === 'string') {
            const nodeCount = this.messageCountsByNode.get(source) || 0;
            this.messageCountsByNode.set(source, nodeCount + 1);
        }

        if (this.config.verbose) {
            log.debug(`[TestMonitor] ${context}: ${messageType} from ${this.formatEndpoint(source)} to ${this.formatEndpoint(target)}`);
        }

        this.emit('message.captured', entry);
    }

    /**
     * Record a system event
     */
    captureEvent(event: TestSystemEvent): void {
        this.events.push(event);

        if (this.config.verbose) {
            log.debug(`[TestMonitor] Event: ${event.type} on ${event.nodeId} at ${new Date(event.timestamp).toISOString()}`);
        }

        this.emit('event.captured', event);
    }

    /**
     * Record a message delivery
     */
    captureDelivery(delivery: MessageDelivery): void {
        this.deliveries.push(delivery);

        if (this.config.collectLatency && 'delay' in (delivery as any)) {
            const delayedDelivery = delivery as any;
            if (typeof delayedDelivery.delay === 'number') {
                this.recordLatency(
                    this.getMessageType(delivery.message),
                    delayedDelivery.delay,
                    String(delivery.sender),
                    String(typeof delivery.target === 'string' ? delivery.target : delivery.target.id)
                );
            }
        }

        this.emit('delivery.captured', delivery);
    }

    /**
     * Record a latency measurement
     */
    recordLatency(
        messageType: string,
        latencyMs: number,
        source: string,
        target: string
    ): void {
        if (!this.config.collectLatency) return;

        const measurement: LatencyMeasurement = {
            messageType,
            latencyMs,
            source,
            target,
            timestamp: Date.now()
        };

        this.latencyMeasurements.push(measurement);
        this.emit('latency.measured', measurement);
    }

    /**
     * Start sampling throughput metrics
     */
    private startSampling(): void {
        // Stop any existing timer
        if (this.samplingTimer) {
            clearInterval(this.samplingTimer);
        }

        // Initialize counters
        const lastCounts = new Map<string, number>();
        const lastSampleTime = Date.now();

        // Set up periodic sampling
        this.samplingTimer = setInterval(() => {
            const now = Date.now();
            const timeWindow = now - lastSampleTime;

            // Calculate global throughput
            const totalMessages = this.messages.length;
            const lastTotalCount = lastCounts.get('total') || 0;
            const messagesDelta = totalMessages - lastTotalCount;

            const throughput: ThroughputMeasurement = {
                messageCount: messagesDelta,
                timeWindowMs: timeWindow,
                messagesPerSecond: (messagesDelta / timeWindow) * 1000,
                timestamp: now
            };

            this.throughputSamples.push(throughput);
            lastCounts.set('total', totalMessages);

            // Calculate per-node throughput
            for (const [nodeId, count] of this.messageCountsByNode.entries()) {
                const lastNodeCount = lastCounts.get(nodeId) || 0;
                const nodeDelta = count - lastNodeCount;

                const nodeThroughput: ThroughputMeasurement = {
                    messageCount: nodeDelta,
                    timeWindowMs: timeWindow,
                    messagesPerSecond: (nodeDelta / timeWindow) * 1000,
                    timestamp: now,
                    nodeId
                };

                this.throughputSamples.push(nodeThroughput);
                lastCounts.set(nodeId, count);
            }

            this.emit('throughput.sampled', throughput);
        }, this.config.samplingInterval) as unknown as NodeJS.Timeout;
    }

    /**
     * Get a friendly string representation of a message source or target
     */
    private formatEndpoint(endpoint?: string | PID): string {
        if (!endpoint) return 'unknown';
        if (typeof endpoint === 'string') return endpoint;
        return `${endpoint.id}`;
    }

    /**
     * Extract message type from a message
     */
    private getMessageType(message: Message): string {
        if (!message) return 'unknown';
        return message.type || 'untyped';
    }

    /**
     * Get all captured messages
     */
    getMessages(): MessageCapture[] {
        return [...this.messages];
    }

    /**
     * Get all captured events
     */
    getEvents(): TestSystemEvent[] {
        return [...this.events];
    }

    /**
     * Get all captured message deliveries
     */
    getDeliveries(): MessageDelivery[] {
        return [...this.deliveries];
    }

    /**
     * Get all latency measurements
     */
    getLatencyMeasurements(): LatencyMeasurement[] {
        return [...this.latencyMeasurements];
    }

    /**
     * Get all throughput samples
     */
    getThroughputSamples(): ThroughputMeasurement[] {
        return [...this.throughputSamples];
    }

    /**
     * Get message counts by type
     */
    getMessageCountsByType(): Map<string, number> {
        return new Map(this.messageCountsByType);
    }

    /**
     * Get message counts by node
     */
    getMessageCountsByNode(): Map<string, number> {
        return new Map(this.messageCountsByNode);
    }

    /**
     * Get delivery statistics
     */
    getDeliveryStatistics(): DeliveryStatistics {
        const total = this.deliveries.length;
        const delivered = this.deliveries.filter(d =>
            'reason' in (d as any) && (d as any).reason !== 'dropped'
        ).length;
        const dropped = this.events.filter(e => e.type === 'message.dropped').length;
        const duplicated = this.events.filter(e => (e.type as string) === 'message.duplicated').length;
        const delayed = this.events.filter(e => e.type === 'message.delayed').length;

        return {
            total,
            delivered,
            dropped,
            duplicated,
            delayed,
            successRate: total > 0 ? delivered / total : 1
        };
    }

    /**
     * Get latency statistics
     */
    getLatencyStatistics(): Record<string, { min: number; max: number; avg: number; p95: number; p99: number }> {
        const statsByType: Record<string, number[]> = {};

        // Group by message type
        for (const measurement of this.latencyMeasurements) {
            if (!statsByType[measurement.messageType]) {
                statsByType[measurement.messageType] = [];
            }
            statsByType[measurement.messageType].push(measurement.latencyMs);
        }

        // Calculate statistics for each type
        const result: Record<string, { min: number; max: number; avg: number; p95: number; p99: number }> = {};

        for (const [type, latencies] of Object.entries(statsByType)) {
            if (latencies.length === 0) continue;

            // Sort for percentiles
            latencies.sort((a, b) => a - b);

            const min = latencies[0];
            const max = latencies[latencies.length - 1];
            const avg = latencies.reduce((sum, val) => sum + val, 0) / latencies.length;
            const p95 = latencies[Math.floor(latencies.length * 0.95)];
            const p99 = latencies[Math.floor(latencies.length * 0.99)];

            result[type] = { min, max, avg, p95, p99 };
        }

        return result;
    }

    /**
     * Generate a test report
     */
    generateReport(): TestReport {
        const duration = (this.endTime || Date.now()) - this.startTime;

        return {
            duration,
            messageCount: this.messages.length,
            eventCount: this.events.length,
            deliveryCount: this.deliveries.length,
            messageCountsByType: Object.fromEntries(this.messageCountsByType),
            messageCountsByNode: Object.fromEntries(this.messageCountsByNode),
            deliveryStats: this.getDeliveryStatistics(),
            latencyStats: this.getLatencyStatistics(),
            throughputAvg: this.calculateAverageThroughput()
        };
    }

    /**
     * Calculate average throughput over the entire test
     */
    private calculateAverageThroughput(): number {
        const duration = (this.endTime || Date.now()) - this.startTime;
        if (duration <= 0) return 0;

        return (this.messages.length / duration) * 1000; // messages per second
    }
}

/**
 * Test report containing summary statistics
 */
export interface TestReport {
    duration: number;
    messageCount: number;
    eventCount: number;
    deliveryCount: number;
    messageCountsByType: Record<string, number>;
    messageCountsByNode: Record<string, number>;
    deliveryStats: DeliveryStatistics;
    latencyStats: Record<string, { min: number; max: number; avg: number; p95: number; p99: number }>;
    throughputAvg: number;
}

/**
 * Create a new test monitor
 */
export function createTestMonitor(config?: TestMonitorConfig): TestMonitor {
    return new TestMonitor(config);
} 