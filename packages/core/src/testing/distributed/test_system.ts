/**
 * TestSystem
 * 
 * A specialized actor system implementation for testing distributed scenarios.
 * Provides capabilities to:
 * - Create multiple simulated nodes in a single process
 * - Control message delivery between nodes
 * - Simulate network conditions like latency and packet loss
 * - Track and verify message delivery across nodes
 */

import { ActorSystem } from '../../core/system';
import { Props, PID, Message } from '../../core/types';
import { log } from '../../utils/logger';
import { EventEmitter } from 'events';

/**
 * Configuration options for a test system
 */
export interface TestSystemConfig {
    /** Unique identifier for this node in the test cluster */
    nodeId: string;

    /** Optional network simulation configuration */
    networkConfig?: NetworkSimulationConfig;

    /** Whether to enable detailed tracing */
    traceEnabled?: boolean;

    /** Custom test hooks for monitoring */
    testHooks?: TestHooks;
}

/**
 * Network simulation configuration
 */
export interface NetworkSimulationConfig {
    /** Message delivery latency in milliseconds (can be a range) */
    latency?: number | [number, number];

    /** Probability of message loss (0-1) */
    packetLossRate?: number;

    /** Probability of message duplication (0-1) */
    duplicateRate?: number;

    /** Probability of message reordering (0-1) */
    reorderRate?: number;

    /** Network partition simulation */
    partitionConfig?: PartitionConfig;
}

/**
 * Network partition configuration
 */
export interface PartitionConfig {
    /** Whether this node is currently partitioned */
    isPartitioned?: boolean;

    /** List of node IDs that this node cannot communicate with */
    partitionedFrom?: string[];
}

/**
 * Test hooks for monitoring system behavior
 */
export interface TestHooks {
    /** Called when a message is sent */
    onMessageSent?: (message: Message, target: PID) => void;

    /** Called when a message is received */
    onMessageReceived?: (message: Message, target: PID) => void;

    /** Called when an actor is created */
    onActorCreated?: (pid: PID, props: Props) => void;

    /** Called when an actor is stopped */
    onActorStopped?: (pid: PID) => void;

    /** Called when a system event occurs */
    onSystemEvent?: (event: TestSystemEvent) => void;
}

/**
 * Test system events
 */
export interface TestSystemEvent {
    type: 'node.joined' | 'node.left' | 'network.partition' | 'network.heal' | 'message.dropped' | 'message.delayed';
    nodeId: string;
    timestamp: number;
    details?: any;
}

/**
 * A test-specific actor system implementation
 */
export class TestSystem extends EventEmitter {
    private config: TestSystemConfig;
    private systems: Map<string, ActorSystem> = new Map();
    private messageLog: MessageLogEntry[] = [];
    private eventLog: TestSystemEvent[] = [];

    constructor(config: TestSystemConfig) {
        super();
        this.config = {
            traceEnabled: true,
            ...config
        };

        this.setupSystem();

        if (this.config.traceEnabled) {
            log.info(`[TestSystem] Test system created for node ${this.config.nodeId}`);
        }
    }

    /**
     * Set up the test actor system
     */
    private setupSystem(): void {
        // Create the actual actor system for this test node
        const system = new ActorSystem(`test-system-${this.config.nodeId}`);

        // Register our custom middleware
        const middlewareHandler = this.createMessagingMiddleware();
        system.addMessageHandler(async (message: Message) => {
            // We'll need to adapt this to work with the actual system's message handling
            // This is a simplified version
        });

        this.systems.set(this.config.nodeId, system);
    }

    /**
     * Create middleware to intercept messages for simulation purposes
     */
    private createMessagingMiddleware() {
        return {
            intercept: (message: Message, target: PID, next: (msg: Message, target: PID) => void) => {
                // Record message
                this.logMessage(message, target, 'sent');

                // Apply network simulation
                if (this.shouldSimulateNetworkIssue(target)) {
                    // Apply simulated latency, packet loss, etc.
                    this.applyNetworkSimulation(message, target, next);
                } else {
                    // Pass through directly
                    next(message, target);
                }
            }
        };
    }

    /**
     * Determine if we should apply network simulation to this message
     */
    private shouldSimulateNetworkIssue(target: PID): boolean {
        if (!this.config.networkConfig) return false;

        // Check for network partition
        const partitionConfig = this.config.networkConfig.partitionConfig;
        if (partitionConfig?.isPartitioned) {
            // If target is in a different node that we're partitioned from
            const targetNodeId = this.getNodeIdFromPid(target);
            if (targetNodeId && targetNodeId !== this.config.nodeId) {
                if (!partitionConfig.partitionedFrom ||
                    partitionConfig.partitionedFrom.includes(targetNodeId)) {
                    // Target is in a partitioned node
                    this.logEvent({
                        type: 'message.dropped',
                        nodeId: this.config.nodeId,
                        timestamp: Date.now(),
                        details: { reason: 'network_partition', target }
                    });
                    return true;
                }
            }
        }

        return true;
    }

    /**
     * Apply network simulation effects to message delivery
     */
    private applyNetworkSimulation(
        message: Message,
        target: PID,
        next: (msg: Message, target: PID) => void
    ): void {
        const config = this.config.networkConfig!;

        // Simulate packet loss
        if (config.packetLossRate && Math.random() < config.packetLossRate) {
            this.logEvent({
                type: 'message.dropped',
                nodeId: this.config.nodeId,
                timestamp: Date.now(),
                details: { reason: 'packet_loss', message, target }
            });
            return; // Message is lost
        }

        // Simulate latency
        let latency = 0;
        if (config.latency) {
            if (Array.isArray(config.latency)) {
                // Random latency within range
                const [min, max] = config.latency;
                latency = Math.floor(Math.random() * (max - min + 1) + min);
            } else {
                latency = config.latency;
            }

            this.logEvent({
                type: 'message.delayed',
                nodeId: this.config.nodeId,
                timestamp: Date.now(),
                details: { latency, message, target }
            });
        }

        // Apply the latency
        setTimeout(() => {
            // Check for duplication
            if (config.duplicateRate && Math.random() < config.duplicateRate) {
                // Send duplicate
                setTimeout(() => {
                    next({ ...message }, target);
                }, Math.floor(latency / 2));
            }

            // Deliver the original message
            next(message, target);
        }, latency);
    }

    /**
     * Extract node ID from a PID
     */
    private getNodeIdFromPid(pid: PID): string | null {
        // This would depend on your PID format
        // For example, if PIDs have a format like "node1/actor1"
        if (typeof pid.id === 'string' && pid.id.includes('/')) {
            return pid.id.split('/')[0];
        }
        return null;
    }

    /**
     * Log a message for testing purposes
     */
    private logMessage(message: Message, target: PID, direction: 'sent' | 'received'): void {
        if (!this.config.traceEnabled) return;

        const entry: MessageLogEntry = {
            message,
            target,
            direction,
            timestamp: Date.now(),
            nodeId: this.config.nodeId
        };

        this.messageLog.push(entry);

        // Notify hooks if available
        if (direction === 'sent' && this.config.testHooks?.onMessageSent) {
            this.config.testHooks.onMessageSent(message, target);
        } else if (direction === 'received' && this.config.testHooks?.onMessageReceived) {
            this.config.testHooks.onMessageReceived(message, target);
        }
    }

    /**
     * Log a system event
     */
    private logEvent(event: TestSystemEvent): void {
        this.eventLog.push(event);
        this.emit('system.event', event);

        if (this.config.testHooks?.onSystemEvent) {
            this.config.testHooks.onSystemEvent(event);
        }
    }

    /**
     * Get the underlying actor system
     */
    getActorSystem(): ActorSystem {
        return this.systems.get(this.config.nodeId)!;
    }

    /**
     * Get all message logs
     */
    getMessageLog(): MessageLogEntry[] {
        return [...this.messageLog];
    }

    /**
     * Get all system events
     */
    getEventLog(): TestSystemEvent[] {
        return [...this.eventLog];
    }

    /**
     * Simulate a network partition
     */
    simulatePartition(partitionedNodes: string[]): void {
        if (!this.config.networkConfig) {
            this.config.networkConfig = {};
        }

        if (!this.config.networkConfig.partitionConfig) {
            this.config.networkConfig.partitionConfig = {
                isPartitioned: true,
                partitionedFrom: []
            };
        }

        this.config.networkConfig.partitionConfig.isPartitioned = true;
        this.config.networkConfig.partitionConfig.partitionedFrom = partitionedNodes;

        this.logEvent({
            type: 'network.partition',
            nodeId: this.config.nodeId,
            timestamp: Date.now(),
            details: { partitionedFrom: partitionedNodes }
        });
    }

    /**
     * Heal a network partition
     */
    healPartition(): void {
        if (this.config.networkConfig?.partitionConfig) {
            this.config.networkConfig.partitionConfig.isPartitioned = false;
            this.config.networkConfig.partitionConfig.partitionedFrom = [];

            this.logEvent({
                type: 'network.heal',
                nodeId: this.config.nodeId,
                timestamp: Date.now()
            });
        }
    }

    /**
     * Set network conditions
     */
    setNetworkConditions(config: Partial<NetworkSimulationConfig>): void {
        this.config.networkConfig = {
            ...this.config.networkConfig,
            ...config
        };
    }

    /**
     * Shutdown the test system
     */
    async shutdown(): Promise<void> {
        for (const system of this.systems.values()) {
            await system.shutdown();
        }

        this.systems.clear();
        log.info(`[TestSystem] Test system for node ${this.config.nodeId} shut down`);
    }
}

/**
 * Message log entry for test analysis
 */
export interface MessageLogEntry {
    message: Message;
    target: PID;
    direction: 'sent' | 'received';
    timestamp: number;
    nodeId: string;
}

/**
 * Create a test system for testing
 */
export function createTestSystem(config: TestSystemConfig): TestSystem {
    return new TestSystem(config);
} 