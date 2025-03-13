import { expect, test, mock, beforeEach, afterEach, describe } from "bun:test";
import { ClusterManager } from "@bactor/cluster";
import {
    ClusterConfig,
    NodeStatus,
    ReconnectionStrategy,
    MembershipProtocol,
    ClusterEventType
} from "@bactor/cluster";

describe('ClusterManager', () => {
    let clusterManager: ClusterManager;
    const defaultConfig: ClusterConfig = {
        heartbeatInterval: 100,
        failureDetectionThreshold: 300,
        reconnectionStrategy: ReconnectionStrategy.EXPONENTIAL_BACKOFF,
        membershipProtocol: MembershipProtocol.GOSSIP
    };

    beforeEach(() => {
        clusterManager = new ClusterManager(defaultConfig);
        clusterManager.start();
    });

    afterEach(() => {
        clusterManager.stop();
    });

    test('should register a new node', () => {
        const nodeInfo = {
            id: 'node1',
            address: 'localhost:8080',
            metadata: {}
        };

        clusterManager.registerNode(nodeInfo);
        const registeredNode = clusterManager.getNodeInfo(nodeInfo.id);

        expect(registeredNode).toBeDefined();
        expect(registeredNode?.id).toBe(nodeInfo.id);
        expect(registeredNode?.status).toBe(NodeStatus.ACTIVE);
    });

    test('should update node heartbeat', async () => {
        const nodeInfo = {
            id: 'node1',
            address: 'localhost:8080',
            metadata: {}
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
        const nodeInfo = {
            id: 'node1',
            address: 'localhost:8080',
            metadata: {}
        };

        let eventReceived = false;
        clusterManager.on('clusterEvent', (event) => {
            if (event.type === ClusterEventType.NODE_SUSPECTED) {
                eventReceived = true;
            }
        });

        clusterManager.registerNode(nodeInfo);

        // Wait for failure detection
        await new Promise(resolve => setTimeout(resolve, defaultConfig.failureDetectionThreshold + 50));

        const node = clusterManager.getNodeInfo(nodeInfo.id);
        expect(node?.status).toBe(NodeStatus.SUSPECTED);
        expect(eventReceived).toBe(true);
    });

    test('should mark nodes as dead after extended inactivity', async () => {
        const nodeInfo = {
            id: 'node1',
            address: 'localhost:8080',
            metadata: {}
        };

        let deadEventReceived = false;
        clusterManager.on('clusterEvent', (event) => {
            if (event.type === ClusterEventType.NODE_LEFT) {
                deadEventReceived = true;
            }
        });

        clusterManager.registerNode(nodeInfo);

        // Wait for two failure detection cycles
        await new Promise(resolve =>
            setTimeout(resolve, (defaultConfig.failureDetectionThreshold * 2) + 100)
        );

        // Node should be removed from the cluster after being marked as dead
        const node = clusterManager.getNodeInfo(nodeInfo.id);
        expect(node).toBeUndefined();
        expect(deadEventReceived).toBe(true);
    });

    test('should recover suspected nodes on heartbeat', () => {
        const nodeInfo = {
            id: 'node1',
            address: 'localhost:8080',
            metadata: {}
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
        const nodes = [
            { id: 'node1', address: 'localhost:8080', metadata: {} },
            { id: 'node2', address: 'localhost:8081', metadata: {} },
            { id: 'node3', address: 'localhost:8082', metadata: {} }
        ];

        nodes.forEach(node => clusterManager.registerNode(node));

        const metrics = clusterManager.getMetrics();

        expect(metrics.activeNodes).toBe(3);
        expect(metrics.suspectedNodes).toBe(0);
        expect(metrics.deadNodes).toBe(0);
    });
}); 