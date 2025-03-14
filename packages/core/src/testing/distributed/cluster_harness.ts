/**
 * ClusterHarness
 * 
 * A testing utility for simulating a multi-node cluster in tests.
 * It creates multiple virtual nodes within a single process and
 * simulates network communication between them.
 */

import { log } from '../../utils/logger';
import { TestSystem, TestSystemConfig } from './test_system';
import { NetworkSimulator } from './network_simulator';
import { Message, PID } from '../../core/types';

/**
 * Cluster node configuration
 */
export interface ClusterNodeConfig extends TestSystemConfig {
    /** Optional tags to help identify node roles in tests */
    tags?: string[];
}

/**
 * Cluster harness configuration
 */
export interface ClusterHarnessConfig {
    /** Number of nodes to create in the cluster */
    nodeCount: number;

    /** Base node configuration template */
    nodeConfigTemplate?: Partial<ClusterNodeConfig>;

    /** Custom node initialization function */
    nodeInitializer?: (nodeId: string, index: number) => Promise<void>;

    /** Whether to use consistent addressing for PIDs */
    useConsistentAddressing?: boolean;

    /** Whether to use a realistic network simulator */
    simulateNetwork?: boolean;
}

/**
 * A testing harness for distributed actor clusters
 */
export class ClusterHarness {
    private nodes: Map<string, TestSystem> = new Map();
    private networkSimulator?: NetworkSimulator;
    private config: ClusterHarnessConfig;

    constructor(config: ClusterHarnessConfig) {
        this.config = {
            useConsistentAddressing: true,
            simulateNetwork: true,
            ...config
        };

        if (this.config.simulateNetwork) {
            this.networkSimulator = new NetworkSimulator();
        }
    }

    /**
     * Initialize the cluster with the specified number of nodes
     */
    async initialize(): Promise<void> {
        log.info(`[ClusterHarness] Initializing test cluster with ${this.config.nodeCount} nodes`);

        for (let i = 0; i < this.config.nodeCount; i++) {
            const nodeId = `node-${i + 1}`;
            await this.createNode(nodeId, i);
        }

        log.info(`[ClusterHarness] Test cluster initialized with ${this.nodes.size} nodes`);
    }

    /**
     * Create a new node in the cluster
     */
    private async createNode(nodeId: string, index: number): Promise<TestSystem> {
        // Create node configuration
        const nodeConfig: ClusterNodeConfig = {
            nodeId,
            traceEnabled: true,
            ...(this.config.nodeConfigTemplate || {})
        };

        // Create test system for this node
        const system = new TestSystem(nodeConfig);
        this.nodes.set(nodeId, system);

        // Run custom initialization if provided
        if (this.config.nodeInitializer) {
            await this.config.nodeInitializer(nodeId, index);
        }

        log.info(`[ClusterHarness] Created node ${nodeId}`);
        return system;
    }

    /**
     * Get a node by ID
     */
    getNode(nodeId: string): TestSystem | undefined {
        return this.nodes.get(nodeId);
    }

    /**
     * Get all nodes
     */
    getAllNodes(): Map<string, TestSystem> {
        return new Map(this.nodes);
    }

    /**
     * Get the network simulator if it exists
     */
    getNetworkSimulator(): NetworkSimulator | undefined {
        return this.networkSimulator;
    }

    /**
     * Simulate a network partition between node groups
     */
    createPartition(nodeGroups: string[][]): void {
        if (!this.networkSimulator) {
            log.warn('[ClusterHarness] Cannot create partition: network simulation is disabled');
            return;
        }

        this.networkSimulator.createPartition(nodeGroups);

        // Update each node's partition status
        for (const [nodeId, system] of this.nodes.entries()) {
            // Find which group this node belongs to
            let partitionedFrom: string[] = [];

            for (let i = 0; i < nodeGroups.length; i++) {
                const group = nodeGroups[i];
                if (group.includes(nodeId)) {
                    // This node is in this group, so it's partitioned from all other groups
                    for (let j = 0; j < nodeGroups.length; j++) {
                        if (i !== j) {
                            partitionedFrom = [...partitionedFrom, ...nodeGroups[j]];
                        }
                    }
                    break;
                }
            }

            // Update the node's partition config
            system.simulatePartition(partitionedFrom);
        }

        log.info('[ClusterHarness] Created network partition:', nodeGroups);
    }

    /**
     * Heal all network partitions
     */
    healPartitions(): void {
        if (!this.networkSimulator) {
            return;
        }

        this.networkSimulator.healPartitions();

        // Update each node
        for (const system of this.nodes.values()) {
            system.healPartition();
        }

        log.info('[ClusterHarness] Healed all network partitions');
    }

    /**
     * Set global network conditions
     */
    setNetworkConditions(
        latency?: number | [number, number],
        packetLossRate?: number,
        duplicateRate?: number,
        reorderRate?: number
    ): void {
        if (!this.networkSimulator) {
            log.warn('[ClusterHarness] Cannot set network conditions: network simulation is disabled');
            return;
        }

        this.networkSimulator.setGlobalNetworkConditions({
            latency,
            packetLossRate,
            duplicateRate,
            reorderRate
        });
    }

    /**
     * Send a message across the simulated network
     */
    async sendMessage(from: string, to: string | PID, message: Message): Promise<void> {
        const fromNode = this.nodes.get(from);
        if (!fromNode) {
            throw new Error(`Source node not found: ${from}`);
        }

        if (typeof to === 'string') {
            // Sending to a node, not a specific actor
            const toNode = this.nodes.get(to);
            if (!toNode) {
                throw new Error(`Target node not found: ${to}`);
            }

            if (this.networkSimulator && this.config.simulateNetwork) {
                // Use network simulator
                this.networkSimulator.sendMessage(
                    message,
                    from,
                    to,
                    (msg, target) => {
                        // This callback is executed after simulated network delay
                        const targetNode = this.nodes.get(target as string);
                        if (targetNode) {
                            // Broadcast to all actors in the target node
                            targetNode.getActorSystem().broadcast(msg);
                        }
                    }
                );
            } else {
                // Direct delivery
                await toNode.getActorSystem().broadcast(message);
            }
        } else {
            // Sending to a specific actor PID
            if (this.networkSimulator && this.config.simulateNetwork) {
                // Use network simulator
                this.networkSimulator.sendMessage(
                    message,
                    from,
                    to,
                    (msg, target) => {
                        // Determine which node handles this PID
                        const pid = target as PID;
                        fromNode.getActorSystem().send(pid, msg);
                    }
                );
            } else {
                // Direct delivery
                await fromNode.getActorSystem().send(to, message);
            }
        }
    }

    /**
     * Wait for a specific condition to be met
     */
    async waitForCondition(
        condition: () => boolean | Promise<boolean>,
        timeoutMs: number = 5000,
        intervalMs: number = 100
    ): Promise<boolean> {
        const startTime = Date.now();

        while (Date.now() - startTime < timeoutMs) {
            const result = await Promise.resolve(condition());
            if (result) {
                return true;
            }

            // Wait before checking again
            await new Promise(resolve => setTimeout(resolve, intervalMs));
        }

        return false;
    }

    /**
     * Shut down the cluster
     */
    async shutdown(): Promise<void> {
        for (const node of this.nodes.values()) {
            await node.shutdown();
        }

        this.nodes.clear();
        log.info('[ClusterHarness] Cluster harness shut down');
    }
}

/**
 * Create a new cluster harness
 */
export function createClusterHarness(config: ClusterHarnessConfig): ClusterHarness {
    return new ClusterHarness(config);
} 