import { ClusterManager } from '../cluster_manager';
import { NodeStatus, ClusterEvent, ClusterEventType } from '../types';
import { log } from '@bactor/core';

/**
 * 实现简化版的分布式共识用于节点故障检测
 */
export class FailureDetectionConsensus {
    private suspectedNodes: Map<string, Set<string>> = new Map();
    private suspicionTimeout: number;
    private quorumSize: number;

    constructor(
        private clusterManager: ClusterManager,
        options: {
            suspicionTimeout?: number;
            quorumSize?: number;
        } = {}
    ) {
        this.suspicionTimeout = options.suspicionTimeout || 5000;
        this.quorumSize = options.quorumSize || 3;
    }

    /**
     * 处理节点怀疑事件
     */
    public async handleNodeSuspicion(suspectedNodeId: string, reporterNodeId: string): Promise<void> {
        // 初始化怀疑集合
        if (!this.suspectedNodes.has(suspectedNodeId)) {
            this.suspectedNodes.set(suspectedNodeId, new Set());
        }

        const reporters = this.suspectedNodes.get(suspectedNodeId)!;
        reporters.add(reporterNodeId);

        // 检查是否达到法定人数
        if (this.hasQuorum(reporters.size)) {
            await this.markNodeAsDead(suspectedNodeId);
        } else {
            // 设置超时，如果在超时时间内没有达到法定人数，重置怀疑状态
            setTimeout(() => {
                if (this.suspectedNodes.has(suspectedNodeId)) {
                    const currentReporters = this.suspectedNodes.get(suspectedNodeId)!;
                    if (!this.hasQuorum(currentReporters.size)) {
                        this.suspectedNodes.delete(suspectedNodeId);
                        log.info(`Suspicion for node ${suspectedNodeId} timed out without quorum`);
                    }
                }
            }, this.suspicionTimeout);
        }
    }

    /**
     * 检查是否达到法定人数
     */
    private hasQuorum(reporterCount: number): boolean {
        const activeNodes = this.clusterManager.getAllNodes()
            .filter(node => node.status === NodeStatus.ACTIVE);
        const quorumSize = Math.floor(activeNodes.length / 2) + 1;
        return reporterCount >= quorumSize;
    }

    /**
     * 将节点标记为死亡
     */
    private async markNodeAsDead(nodeId: string): Promise<void> {
        const event: ClusterEvent = {
            type: ClusterEventType.NODE_SUSPECTED,
            nodeId: nodeId,
            timestamp: Date.now(),
            data: {
                reporters: Array.from(this.suspectedNodes.get(nodeId)!)
            }
        };

        // 通知集群管理器
        await this.clusterManager.handleNodeStatus(nodeId, NodeStatus.DEAD);

        // 清理怀疑记录
        this.suspectedNodes.delete(nodeId);

        log.info(`Node ${nodeId} marked as dead by consensus`, {
            reporters: event.data.reporters
        });
    }

    /**
     * 处理节点恢复
     */
    public async handleNodeRecovery(nodeId: string): Promise<void> {
        // 如果节点被怀疑，清除怀疑状态
        if (this.suspectedNodes.has(nodeId)) {
            this.suspectedNodes.delete(nodeId);
        }

        const event: ClusterEvent = {
            type: ClusterEventType.NODE_RECOVERED,
            nodeId: nodeId,
            timestamp: Date.now()
        };

        // 通知集群管理器
        await this.clusterManager.handleNodeStatus(nodeId, NodeStatus.ACTIVE);

        log.info(`Node ${nodeId} recovered`);
    }

    /**
     * 检测网络分区
     */
    public detectPartitions(): string[][] {
        const nodes = this.clusterManager.getAllNodes();
        const partitions: Set<string>[] = [];
        const visited = new Set<string>();

        for (const node of nodes) {
            if (visited.has(node.id)) continue;

            const partition = new Set<string>();
            this.explorePartition(node.id, partition, visited);
            partitions.push(partition);
        }

        return partitions.map(partition => Array.from(partition));
    }

    /**
     * 探索网络分区（使用DFS）
     */
    private explorePartition(nodeId: string, partition: Set<string>, visited: Set<string>): void {
        visited.add(nodeId);
        partition.add(nodeId);

        const node = this.clusterManager.getAllNodes().find(n => n.id === nodeId);
        if (!node) return;

        // 在实际实现中，这里应该检查节点之间的连接性
        // 这里简化为检查节点状态
        const connectedNodes = this.clusterManager.getAllNodes()
            .filter(n => n.status === NodeStatus.ACTIVE)
            .map(n => n.id);

        for (const connectedNodeId of connectedNodes) {
            if (!visited.has(connectedNodeId)) {
                this.explorePartition(connectedNodeId, partition, visited);
            }
        }
    }
} 