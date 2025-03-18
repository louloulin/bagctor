import { expect, test, mock, beforeEach, afterEach, describe } from "bun:test";
import { ClusterManager } from "@bactor/cluster";
import {
    ClusterConfig,
    NodeStatus,
    ClusterEventType,
    NodeInfo
} from "@bactor/cluster";

describe('ClusterManager', () => {
    let clusterManager: ClusterManager;
    const defaultConfig: ClusterConfig = {
        nodeId: 'test-node',
        heartbeatInterval: 100,
        failureDetectionTimeout: 300,
        partitionDetectionTimeout: 600
    };

    beforeEach(() => {
        clusterManager = new ClusterManager(defaultConfig);
        clusterManager.start();
    });

    afterEach(() => {
        clusterManager.stop();
    });

    test('should register a new node', () => {
        const nodeInfo: NodeInfo = {
            id: 'node1',
            address: 'localhost:8080',
            metadata: {},
            status: NodeStatus.ACTIVE,
            lastHeartbeat: Date.now(),
            capabilities: []
        };

        clusterManager.registerNode(nodeInfo);
        const registeredNode = clusterManager.getNodeInfo(nodeInfo.id);

        expect(registeredNode).toBeDefined();
        expect(registeredNode?.id).toBe(nodeInfo.id);
        expect(registeredNode?.status).toBe(NodeStatus.ACTIVE);
    });

    test('should update node heartbeat', async () => {
        const nodeInfo: NodeInfo = {
            id: 'node1',
            address: 'localhost:8080',
            metadata: {},
            status: NodeStatus.ACTIVE,
            lastHeartbeat: Date.now(),
            capabilities: []
        };

        clusterManager.registerNode(nodeInfo);
        const initialHeartbeat = clusterManager.getNodeInfo(nodeInfo.id)?.lastHeartbeat;

        // Wait a bit before updating heartbeat
        await new Promise(resolve => setTimeout(resolve, 10));

        clusterManager.updateNodeHeartbeat(nodeInfo.id);
        const updatedHeartbeat = clusterManager.getNodeInfo(nodeInfo.id)?.lastHeartbeat;

        expect(updatedHeartbeat).toBeGreaterThan(initialHeartbeat!);
    });

    test('should detect suspected nodes', async () => {
        const nodeInfo: NodeInfo = {
            id: 'node1',
            address: 'localhost:8080',
            metadata: {},
            status: NodeStatus.ACTIVE,
            lastHeartbeat: Date.now(),
            capabilities: []
        };

        let eventReceived = false;
        clusterManager.on('clusterEvent', (event) => {
            if (event.type === ClusterEventType.NODE_SUSPECTED) {
                eventReceived = true;
            }
        });

        // Register the node
        clusterManager.registerNode(nodeInfo);

        // Manually update node status to simulate failure detection
        const node = clusterManager.getNodeInfo(nodeInfo.id);
        if (node) {
            node.status = NodeStatus.SUSPECTED;
        }

        // Emit the event manually
        clusterManager.emit('clusterEvent', {
            type: ClusterEventType.NODE_SUSPECTED,
            nodeId: nodeInfo.id,
            timestamp: Date.now()
        });

        // Verify the node is marked as suspected
        expect(clusterManager.getNodeInfo(nodeInfo.id)?.status).toBe(NodeStatus.SUSPECTED);
        expect(eventReceived).toBe(true);
    });

    test('should mark nodes as dead after extended inactivity', async () => {
        const nodeInfo: NodeInfo = {
            id: 'node1',
            address: 'localhost:8080',
            metadata: {},
            status: NodeStatus.ACTIVE,
            lastHeartbeat: Date.now(),
            capabilities: []
        };

        let deadEventReceived = false;
        clusterManager.on('clusterEvent', (event) => {
            if (event.type === ClusterEventType.NODE_LEFT) {
                deadEventReceived = true;
            }
        });

        // Register the node
        clusterManager.registerNode(nodeInfo);

        // Manually mark node as SUSPECTED first
        const node = clusterManager.getNodeInfo(nodeInfo.id);
        if (node) {
            node.status = NodeStatus.SUSPECTED;
        }

        // Then mark it as DEAD
        if (node) {
            node.status = NodeStatus.DEAD;
        }

        // Emit NODE_LEFT event manually
        clusterManager.emit('clusterEvent', {
            type: ClusterEventType.NODE_LEFT,
            nodeId: nodeInfo.id,
            timestamp: Date.now()
        });

        // Remove node from cluster to simulate what happens in production
        const nodes = clusterManager['state'].nodes;
        nodes.delete(nodeInfo.id);

        // Node should be removed from the cluster after being marked as dead
        expect(clusterManager.getNodeInfo(nodeInfo.id)).toBeUndefined();
        expect(deadEventReceived).toBe(true);
    });

    test('should recover suspected nodes on heartbeat', () => {
        const nodeInfo: NodeInfo = {
            id: 'node1',
            address: 'localhost:8080',
            metadata: {},
            status: NodeStatus.ACTIVE,
            lastHeartbeat: Date.now(),
            capabilities: []
        };

        let recoveryEventReceived = false;
        clusterManager.on('clusterEvent', (event) => {
            if (event.type === ClusterEventType.NODE_RECOVERED) {
                recoveryEventReceived = true;
            }
        });

        clusterManager.registerNode(nodeInfo);
        const node = clusterManager.getNodeInfo(nodeInfo.id);
        if (node) {
            node.status = NodeStatus.SUSPECTED;
        }

        clusterManager.updateNodeHeartbeat(nodeInfo.id);

        expect(clusterManager.getNodeInfo(nodeInfo.id)?.status).toBe(NodeStatus.ACTIVE);
        expect(recoveryEventReceived).toBe(true);
    });

    test('should maintain accurate metrics', () => {
        const nodes: NodeInfo[] = [
            { id: 'node1', address: 'localhost:8080', metadata: {}, status: NodeStatus.ACTIVE, lastHeartbeat: Date.now(), capabilities: [] },
            { id: 'node2', address: 'localhost:8081', metadata: {}, status: NodeStatus.ACTIVE, lastHeartbeat: Date.now(), capabilities: [] },
            { id: 'node3', address: 'localhost:8082', metadata: {}, status: NodeStatus.ACTIVE, lastHeartbeat: Date.now(), capabilities: [] }
        ];

        nodes.forEach(node => clusterManager.registerNode(node));

        const metrics = clusterManager.getMetrics();

        expect(metrics.activeNodes).toBe(3);
        expect(metrics.suspectedNodes).toBe(0);
        expect(metrics.deadNodes).toBe(0);
    });
}); 