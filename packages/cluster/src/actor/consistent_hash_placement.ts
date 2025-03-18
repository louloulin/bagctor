import { PID } from '@bactor/core';
import { ClusterManager } from '../cluster_manager';
import { log } from '@bactor/core';
import { NodeStatus, NodeInfo } from '../types';
import { createHash } from 'crypto';

/**
 * 虚拟节点倍数 - 每个实际节点会映射到这么多个虚拟节点
 */
const VIRTUAL_NODE_COUNT = 200;

/**
 * 使用一致性哈希实现的Actor放置策略
 * 使用虚拟节点确保更均匀的分布
 */
export class ConsistentHashActorPlacement {
    // 哈希环: 排序后的虚拟节点哈希值 -> 实际节点ID
    private hashRing: Map<number, string> = new Map();
    // 排序后的哈希值数组，用于二分查找
    private sortedHashes: number[] = [];
    // 节点ID到其虚拟节点哈希值的映射
    private nodeToHashes: Map<string, number[]> = new Map();
    private virtualNodesPerNode: number = 100;

    constructor(private clusterManager: ClusterManager) {
        // 初始化哈希环
        this.updateHashRing();

        // 监听集群事件
        clusterManager.on('clusterEvent', (event) => {
            if (
                event.type === 'NODE_JOINED' ||
                event.type === 'NODE_LEFT' ||
                event.type === 'NODE_SUSPECTED' ||
                event.type === 'NODE_RECOVERED'
            ) {
                this.updateHashRing();
            }
        });
    }

    /**
     * 更新哈希环 - 当集群成员变化时调用
     */
    public updateHashRing(): void {
        log.debug('Updating consistent hash ring');

        // 清理现有哈希环
        this.hashRing.clear();
        this.nodeToHashes.clear();

        // 获取活跃节点
        const nodes = this.clusterManager.getAllNodes().filter(
            node => node.status === NodeStatus.ACTIVE
        );

        // 为每个节点创建虚拟节点
        for (const node of nodes) {
            const hashes: number[] = [];

            // 为每个节点创建多个虚拟节点
            for (let i = 0; i < VIRTUAL_NODE_COUNT; i++) {
                const virtualNodeKey = `${node.id}:${i}`;
                const hash = this.hashKey(virtualNodeKey);

                this.hashRing.set(hash, node.id);
                hashes.push(hash);
            }

            this.nodeToHashes.set(node.id, hashes);
        }

        // 更新排序后的哈希值数组
        this.sortedHashes = Array.from(this.hashRing.keys()).sort((a, b) => a - b);

        log.debug('Hash ring updated', {
            nodeCount: nodes.length,
            virtualNodeCount: this.hashRing.size
        });
    }

    /**
     * 确定Actor应该放置在哪个节点上
     * @param actorId Actor标识符
     * @returns 节点ID，如果没有可用节点则返回undefined
     */
    public determineNodeForActor(actorId: string): string | undefined {
        if (this.sortedHashes.length === 0) {
            log.warn('No nodes available in hash ring');
            return undefined;
        }

        // 计算Actor ID的哈希值
        const hash = this.hashKey(actorId);

        // 二分查找找到第一个大于等于hash的索引
        let index = this.findNextIndex(hash);

        // 如果没有找到（hash大于所有值），则回绕到第一个虚拟节点
        if (index === -1) {
            index = 0;
        }

        // 获取虚拟节点对应的实际节点
        const nodeId = this.hashRing.get(this.sortedHashes[index]);

        log.debug('Actor placement determined', { actorId, nodeId });
        return nodeId;
    }

    /**
     * 计算键的哈希值
     * @param key 要哈希的键
     * @returns 32位整数哈希值
     */
    private hashKey(key: string): number {
        const hash = createHash('md5').update(key).digest();
        // 使用前4个字节作为32位整数
        return (hash[0] << 24) | (hash[1] << 16) | (hash[2] << 8) | hash[3];
    }

    /**
     * 二分查找找到第一个大于等于target的元素索引
     * @param target 目标值
     * @returns 索引，如果所有元素都小于target则返回-1
     */
    private findNextIndex(target: number): number {
        let left = 0;
        let right = this.sortedHashes.length - 1;
        let result = -1;

        while (left <= right) {
            const mid = Math.floor((left + right) / 2);
            if (this.sortedHashes[mid] >= target) {
                result = mid;
                right = mid - 1;
            } else {
                left = mid + 1;
            }
        }

        return result;
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
        const hash = this.hashKey(actorId);
        const startIndex = this.findNextIndex(hash);
        if (startIndex === -1) return replicas;

        let currentIndex = (startIndex + 1) % this.sortedHashes.length;

        // 继续查找直到找到足够的不同节点或遍历完哈希环
        while (replicas.length < replicaCount + 1 && currentIndex !== startIndex) {
            const nodeId = this.hashRing.get(this.sortedHashes[currentIndex]);

            // 确保不重复添加同一个节点
            if (nodeId && !replicas.includes(nodeId)) {
                replicas.push(nodeId);
            }

            currentIndex = (currentIndex + 1) % this.sortedHashes.length;
        }

        return replicas;
    }

    /**
     * 获取哈希环信息 - 用于调试
     */
    public getHashRingInfo(): any {
        return {
            totalVirtualNodes: this.sortedHashes.length,
            physicalNodes: Array.from(this.nodeToHashes.keys()),
            distribution: Array.from(this.nodeToHashes.entries()).map(([nodeId, hashes]) => ({
                nodeId,
                virtualNodeCount: hashes.length
            }))
        };
    }
} 