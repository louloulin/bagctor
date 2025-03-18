import { PID } from '@bactor/core';
import { ClusterManager } from '../cluster_manager';
import { NodeInfo } from '../types';

/**
 * 用于集群中的Actor引用 - 负责跨集群节点的消息路由
 */
export class ClusterActorRef {
    private location: string | null = null;
    private replicas: string[] = [];

    constructor(
        private pid: PID,
        private clusterManager: ClusterManager
    ) { }

    async send(message: any): Promise<void> {
        // 确定Actor位置
        if (!this.location) {
            this.location = await this.locateActor();
        }

        // 获取目标节点信息
        const targetNode = this.clusterManager.getNode(this.location);
        if (!targetNode) {
            throw new Error(`Target node ${this.location} not found`);
        }

        // 通过集群管理器发送消息
        await this.clusterManager.sendMessage({
            to: this.pid,
            from: this.clusterManager.getSelfNodeId(),
            payload: message,
            targetNode: targetNode
        });
    }

    private async locateActor(): Promise<string> {
        // 使用一致性哈希确定Actor位置
        const placement = this.clusterManager.getActorPlacement();
        const nodeId = placement.determineNodeForActor(this.pid.id);

        if (!nodeId) {
            throw new Error(`Could not determine location for actor ${this.pid.id}`);
        }

        // 获取复制节点
        this.replicas = placement.getReplicaNodesForActor(this.pid.id, 2);

        return nodeId;
    }

    getLocation(): string | null {
        return this.location;
    }

    getReplicas(): string[] {
        return this.replicas;
    }

    async refreshLocation(): Promise<void> {
        this.location = null;
        await this.locateActor();
    }
}

/**
 * 集群Actor引用工厂 - 创建集群感知的Actor引用
 */
export class ClusterActorRefProvider {
    constructor(private clusterManager: ClusterManager) { }

    /**
     * 创建集群感知的Actor引用
     * @param pid Actor标识符
     */
    createRef(pid: PID): ClusterActorRef {
        return new ClusterActorRef(pid, this.clusterManager);
    }
} 