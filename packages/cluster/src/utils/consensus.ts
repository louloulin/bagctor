import { NodeInfo, NodeStatus } from '../types';
import { log } from '@bactor/core';

/**
 * 实现简化版的分布式共识用于节点故障检测
 */
export class FailureDetectionConsensus {
    private votingTimeout: number;
    private suspectThreshold: number;
    private deadThreshold: number;
    private suspectVotes: Map<string, Set<string>>;
    private deadVotes: Map<string, Set<string>>;

    /**
     * 创建故障检测共识实例
     * @param votingTimeout 投票超时时间(ms)
     * @param suspectThreshold 判定为可疑节点的投票比例 (0-1)
     * @param deadThreshold 判定为死亡节点的投票比例 (0-1)
     */
    constructor(
        votingTimeout: number = 10000,
        suspectThreshold: number = 0.5,
        deadThreshold: number = 0.7
    ) {
        this.votingTimeout = votingTimeout;
        this.suspectThreshold = suspectThreshold;
        this.deadThreshold = deadThreshold;
        this.suspectVotes = new Map();
        this.deadVotes = new Map();
    }

    /**
     * 添加一个节点对另一个节点的可疑投票
     * @param suspectedNodeId 被怀疑的节点ID
     * @param voterNodeId 投票节点ID
     */
    public voteSuspect(suspectedNodeId: string, voterNodeId: string): void {
        if (!this.suspectVotes.has(suspectedNodeId)) {
            this.suspectVotes.set(suspectedNodeId, new Set());
        }
        this.suspectVotes.get(suspectedNodeId)!.add(voterNodeId);

        log.debug('Node voted suspect', { suspectedNodeId, voterNodeId });
    }

    /**
     * 添加一个节点对另一个节点的死亡投票
     * @param deadNodeId 被认为死亡的节点ID
     * @param voterNodeId 投票节点ID
     */
    public voteDead(deadNodeId: string, voterNodeId: string): void {
        if (!this.deadVotes.has(deadNodeId)) {
            this.deadVotes.set(deadNodeId, new Set());
        }
        this.deadVotes.get(deadNodeId)!.add(voterNodeId);

        log.debug('Node voted dead', { deadNodeId, voterNodeId });
    }

    /**
     * 检查是否有足够的投票将节点标记为可疑
     * @param nodeId 被检查的节点ID
     * @param totalNodes 当前集群中的总节点数
     */
    public hasSuspectConsensus(nodeId: string, totalNodes: number): boolean {
        const votes = this.suspectVotes.get(nodeId)?.size || 0;
        const requiredVotes = Math.ceil(totalNodes * this.suspectThreshold);

        return votes >= requiredVotes;
    }

    /**
     * 检查是否有足够的投票将节点标记为死亡
     * @param nodeId 被检查的节点ID
     * @param totalNodes 当前集群中的总节点数
     */
    public hasDeadConsensus(nodeId: string, totalNodes: number): boolean {
        const votes = this.deadVotes.get(nodeId)?.size || 0;
        const requiredVotes = Math.ceil(totalNodes * this.deadThreshold);

        return votes >= requiredVotes;
    }

    /**
     * 清理指定节点的所有投票
     * @param nodeId 需要清理投票的节点ID
     */
    public clearVotes(nodeId: string): void {
        this.suspectVotes.delete(nodeId);
        this.deadVotes.delete(nodeId);
    }

    /**
     * 判断节点的健康状态
     * @param nodeId 节点ID
     * @param totalNodes 集群总节点数
     * @returns 建议的节点状态
     */
    public determineNodeStatus(nodeId: string, totalNodes: number): NodeStatus {
        if (this.hasDeadConsensus(nodeId, totalNodes)) {
            return NodeStatus.DEAD;
        } else if (this.hasSuspectConsensus(nodeId, totalNodes)) {
            return NodeStatus.SUSPECTED;
        }

        return NodeStatus.ACTIVE;
    }

    /**
     * 定期清理过期的投票
     * @param nodes 当前集群中的所有节点
     */
    public cleanupExpiredVotes(nodes: Map<string, NodeInfo>): void {
        // 获取所有节点ID
        const allNodeIds = new Set(Array.from(nodes.keys()));

        // 清理已不在集群中的节点的投票
        for (const nodeId of this.suspectVotes.keys()) {
            if (!allNodeIds.has(nodeId)) {
                this.suspectVotes.delete(nodeId);
            }
        }

        for (const nodeId of this.deadVotes.keys()) {
            if (!allNodeIds.has(nodeId)) {
                this.deadVotes.delete(nodeId);
            }
        }
    }
} 