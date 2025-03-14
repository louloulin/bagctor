/**
 * NetworkSimulator
 * 
 * A utility for simulating various network conditions in tests:
 * - Latency/delays
 * - Packet loss
 * - Network partitions
 * - Message reordering
 * - Message duplication
 */

import { EventEmitter } from 'events';
import { log } from '../../utils/logger';
import { Message, PID } from '../../core/types';

/**
 * Network condition configuration
 */
export interface NetworkConditionConfig {
    /** Message delivery latency in milliseconds (can be a range) */
    latency?: number | [number, number];

    /** Probability of message loss (0-1) */
    packetLossRate?: number;

    /** Probability of message duplication (0-1) */
    duplicateRate?: number;

    /** Probability of message reordering (0-1) */
    reorderRate?: number;
}

/**
 * Message delivery information
 */
export interface MessageDelivery {
    message: Message;
    sender: string;
    target: string | PID;
    timestamp: number;
}

/**
 * Network partition configuration
 */
export interface NetworkPartitionConfig {
    /** Lists of nodes that are partitioned from each other */
    partitions: string[][];
}

/**
 * Network simulator provides a centralized way to simulate network conditions
 * between multiple test nodes.
 */
export class NetworkSimulator extends EventEmitter {
    private nodeConditions: Map<string, NetworkConditionConfig> = new Map();
    private globalConditions: NetworkConditionConfig = {};
    private partitionConfig?: NetworkPartitionConfig;
    private messageLog: MessageDelivery[] = [];
    private messageQueue: Map<string, (() => void)[]> = new Map();

    /**
     * Create a new network simulator
     */
    constructor() {
        super();
    }

    /**
     * Set network conditions globally for all nodes
     */
    setGlobalNetworkConditions(config: NetworkConditionConfig): void {
        this.globalConditions = { ...config };
        log.info('[NetworkSimulator] Set global network conditions:', config);
    }

    /**
     * Set network conditions for a specific node
     */
    setNodeNetworkConditions(nodeId: string, config: NetworkConditionConfig): void {
        this.nodeConditions.set(nodeId, { ...config });
        log.info(`[NetworkSimulator] Set network conditions for node ${nodeId}:`, config);
    }

    /**
     * Create a network partition between nodes
     */
    createPartition(partitions: string[][]): void {
        this.partitionConfig = { partitions };
        log.info('[NetworkSimulator] Created network partition:', partitions);
        this.emit('partition.created', partitions);
    }

    /**
     * Heal all network partitions
     */
    healPartitions(): void {
        this.partitionConfig = undefined;
        log.info('[NetworkSimulator] Healed all network partitions');
        this.emit('partition.healed');
    }

    /**
     * Check if two nodes are partitioned from each other
     */
    areNodesPartitioned(nodeA: string, nodeB: string): boolean {
        if (!this.partitionConfig) return false;

        // Check if nodes are in different partitions
        for (const partition of this.partitionConfig.partitions) {
            const aInPartition = partition.includes(nodeA);
            const bInPartition = partition.includes(nodeB);

            // If one is in this partition and the other is not
            if (aInPartition !== bInPartition) {
                return true;
            }
        }

        return false;
    }

    /**
     * Simulate sending a message through the network
     */
    sendMessage(
        message: Message,
        from: string,
        to: string | PID,
        deliverCallback: (message: Message, to: string | PID) => void
    ): void {
        const toNodeId = typeof to === 'string' ? to : this.extractNodeId(to);

        // Log the message
        const delivery: MessageDelivery = {
            message,
            sender: from,
            target: to,
            timestamp: Date.now()
        };
        this.messageLog.push(delivery);

        // Check for network partition
        if (this.partitionConfig && toNodeId && this.areNodesPartitioned(from, toNodeId)) {
            log.debug(`[NetworkSimulator] Message dropped due to network partition: ${from} -> ${toNodeId}`);
            this.emit('message.dropped', { message, reason: 'partition', from, to });
            return;
        }

        // Get the network conditions
        const nodeConditions = this.nodeConditions.get(from) || {};
        const conditions = {
            ...this.globalConditions,
            ...nodeConditions
        };

        // Check for packet loss
        if (conditions.packetLossRate && Math.random() < conditions.packetLossRate) {
            log.debug(`[NetworkSimulator] Message dropped due to packet loss: ${from} -> ${toNodeId}`);
            this.emit('message.dropped', { message, reason: 'packet_loss', from, to });
            return;
        }

        // Calculate delay
        let delay = 0;
        if (conditions.latency) {
            if (Array.isArray(conditions.latency)) {
                const [min, max] = conditions.latency;
                delay = Math.floor(Math.random() * (max - min + 1) + min);
            } else {
                delay = conditions.latency;
            }
        }

        // Check for message reordering
        if (conditions.reorderRate && Math.random() < conditions.reorderRate) {
            // Add some randomness to the delay to cause reordering
            delay += Math.floor(Math.random() * 100);
        }

        // Simulate network delay
        setTimeout(() => {
            // Check for duplication
            if (conditions.duplicateRate && Math.random() < conditions.duplicateRate) {
                // Send a duplicate with slight delay
                setTimeout(() => {
                    deliverCallback({ ...message }, to);
                    this.emit('message.duplicated', { message, from, to });
                }, Math.floor(delay / 2));
            }

            // Deliver the original message
            deliverCallback(message, to);
            this.emit('message.delivered', { message, from, to, delay });
        }, delay);
    }

    /**
     * Extract the node ID from a PID
     */
    private extractNodeId(pid: PID): string {
        // This would depend on your PID format
        if (typeof pid.id === 'string' && pid.id.includes('/')) {
            return pid.id.split('/')[0];
        }
        return '';
    }

    /**
     * Get the message log
     */
    getMessageLog(): MessageDelivery[] {
        return [...this.messageLog];
    }

    /**
     * Clear all network conditions and partitions
     */
    reset(): void {
        this.nodeConditions.clear();
        this.globalConditions = {};
        this.partitionConfig = undefined;
        this.messageLog = [];
        log.info('[NetworkSimulator] Reset network simulator');
        this.emit('simulator.reset');
    }
}

/**
 * Create a new network simulator
 */
export function createNetworkSimulator(): NetworkSimulator {
    return new NetworkSimulator();
} 