import { log } from '@bactor/core';
import { ClusterManager } from '../cluster_manager';
import { NodeInfo, NodeStatus } from '../types';
import { createHash } from 'crypto';

/**
 * 虚拟节点倍数 - 每个实际节点会映射到这么多个虚拟节点
 */
const VIRTUAL_NODE_COUNT = 200;

/**
 * 一致性哈希的Actor放置策略
 * 负责确定Actor应该放置在哪个节点上
 */
export class ConsistentHashActorPlacement {
    private clusterManager: ClusterManager;
    private virtualNodes: number = 100; // 每个节点的虚拟节点数量
    private hashRing: string[] = []; // 排序后的哈希值
    private nodeToHashes: Map<string, string[]> = new Map(); // 节点ID到哈希值的映射
    private hashToNode: Map<string, string> = new Map(); // 哈希值到节点ID的映射

    constructor(clusterManager: ClusterManager) {
        this.clusterManager = clusterManager;
        this.initializeHashRing();

        log.info('ConsistentHashActorPlacement initialized');
    }

    /**
     * 初始化哈希环
     */
    private initializeHashRing(): void {
        this.hashRing = [];
        this.nodeToHashes.clear();
        this.hashToNode.clear();

        // 获取所有活跃节点
        const activeNodes = this.getActiveNodes();

        // 为每个节点创建虚拟节点并计算哈希值
        for (const node of activeNodes) {
            const hashes: string[] = [];

            for (let i = 0; i < this.virtualNodes; i++) {
                const key = `${node.id}:${i}`;
                const hash = this.hash(key);

                hashes.push(hash);
                this.hashToNode.set(hash, node.id);
            }

            this.nodeToHashes.set(node.id, hashes);
            this.hashRing.push(...hashes);
        }

        // 对哈希环进行排序
        this.hashRing.sort();

        log.debug('Hash ring initialized', {
            activeNodes: activeNodes.length,
            ringSize: this.hashRing.length
        });
    }

    /**
     * 计算哈希值
     * @param key 要哈希的键
     * @returns 哈希值
     */
    private hash(key: string): string {
        return createHash('md5').update(key).digest('hex');
    }

    /**
     * 确定Actor应该放置在哪个节点上
     * @param actorId Actor ID
     * @returns 节点ID，如果没有活跃节点则返回null
     */
    public determineNodeForActor(actorId: string): string | null {
        if (this.hashRing.length === 0) {
            // 如果哈希环为空，重新初始化
            this.initializeHashRing();
        }

        if (this.hashRing.length === 0) {
            // 如果仍然为空，表示没有活跃节点
            log.warn('No active nodes available for actor placement');
            return null;
        }

        // 计算Actor的哈希值
        const hash = this.hash(actorId);

        // 在哈希环上查找第一个大于等于该哈希值的位置
        const index = this.findNextIndex(hash);

        // 获取对应的节点ID
        const nodeId = this.hashToNode.get(this.hashRing[index]);

        log.debug('Actor placement determined', {
            actorId,
            nodeId
        });

        return nodeId || null;
    }

    /**
     * 在有序哈希环上寻找下一个索引
     * @param hash 哈希值
     * @returns 哈希环上的索引
     */
    private findNextIndex(hash: string): number {
        // 二分查找
        let left = 0;
        let right = this.hashRing.length - 1;

        while (left <= right) {
            const mid = Math.floor((left + right) / 2);

            if (this.hashRing[mid] === hash) {
                return mid;
            }

            if (this.hashRing[mid] < hash) {
                left = mid + 1;
            } else {
                right = mid - 1;
            }
        }

        // 如果没有找到，返回下一个位置，可能需要环绕
        return left % this.hashRing.length;
    }

    /**
     * 获取活跃节点
     * @returns 活跃节点列表
     */
    public getActiveNodes(): NodeInfo[] {
        return this.clusterManager.getActiveNodes();
    }

    /**
     * 更新哈希环
     * 当集群成员变化时调用此方法
     */
    public updateHashRing(): void {
        log.debug('Updating hash ring');
        this.initializeHashRing();
    }

    /**
     * 获取一个Actor的备份节点 - 用于Actor状态复制
     * @param actorId Actor ID
     * @param replicaCount 备份数量
     * @returns 备份节点ID数组
     */
    public getReplicaNodesForActor(actorId: string, replicaCount: number): string[] {
        const primaryNode = this.determineNodeForActor(actorId);
        if (!primaryNode) {
            return [];
        }

        const replicas: string[] = [primaryNode];

        // 如果节点数量不足以提供足够的副本，返回所有可用节点
        const availableNodes = this.clusterManager.getAllNodes()
            .filter(node => node.status === NodeStatus.ACTIVE)
            .map(node => node.id);

        if (availableNodes.length <= 1) {
            return replicas;
        }

        // 在哈希环上顺时针查找下一个节点作为副本
        const hash = this.hash(actorId);
        const startIndex = this.findNextIndex(hash);
        if (startIndex === -1) return replicas;

        let currentIndex = (startIndex + 1) % this.hashRing.length;

        // 继续查找直到找到足够的不同节点或遍历完哈希环
        while (replicas.length < replicaCount + 1 && currentIndex !== startIndex) {
            const nodeId = this.hashRing[currentIndex];

            // 确保不重复添加同一个节点
            if (nodeId && !replicas.includes(nodeId)) {
                replicas.push(nodeId);
            }

            currentIndex = (currentIndex + 1) % this.hashRing.length;
        }

        return replicas;
    }

    /**
     * 获取哈希环信息 - 用于调试
     */
    public getHashRingInfo(): any {
        return {
            totalVirtualNodes: this.hashRing.length,
            physicalNodes: Array.from(this.nodeToHashes.keys()),
            distribution: Array.from(this.nodeToHashes.entries()).map(([nodeId, hashes]) => ({
                nodeId,
                virtualNodeCount: hashes.length
            }))
        };
    }
} 