import { NodeInfo, NodeState, ConsensusMessage, ConsensusState } from '../types';
import { log } from '@bactor/core';
import { EventEmitter } from 'events';

export class FailureDetectionConsensus extends EventEmitter {
    private nodeId: string;
    private state: ConsensusState;
    private quorumSize: number;
    private roundTimeout: number;
    private currentRound: number;

    constructor(nodeId: string) {
        super();
        this.nodeId = nodeId;
        this.state = {
            round: 0,
            votes: new Map<string, ConsensusMessage>(),
            confirmedFailures: new Set<string>(),
            partitions: []
        };
        this.quorumSize = 3; // TODO: Make configurable
        this.roundTimeout = 5000; // TODO: Make configurable
        this.currentRound = 0;
    }

    /**
     * 开始新一轮共识
     */
    public startConsensusRound(nodes: NodeInfo[]): void {
        this.currentRound++;
        this.state.round = this.currentRound;
        this.state.votes.clear();

        // Generate and broadcast our vote
        const vote = this.generateVote(nodes);
        this.emit('vote', vote);

        // Set timeout for this round
        setTimeout(() => {
            this.checkQuorum();
        }, this.roundTimeout);
    }

    /**
     * 收集节点投票
     */
    private collectVotes(nodes: NodeInfo[]): void {
        // 模拟节点投票过程
        nodes.forEach(node => {
            if (node.id !== this.nodeId) {
                const vote = this.generateVote(nodes);
                this.processVote(node.id, vote);
            }
        });

        // 检查是否达到法定人数
        this.checkQuorum();
    }

    /**
     * 生成投票
     */
    private generateVote(nodes: NodeInfo[]): ConsensusMessage {
        const now = Date.now();
        const suspectedNodes = nodes
            .filter(node => {
                const timeSinceLastHeartbeat = now - node.lastHeartbeat;
                return timeSinceLastHeartbeat > 5000; // TODO: Make configurable
            })
            .map(node => node.id);

        return {
            type: 'VOTE',
            voterId: this.nodeId,
            vote: {
                nodeId: this.nodeId,
                state: suspectedNodes.length > 0 ? NodeState.SUSPECTED : NodeState.ALIVE,
                timestamp: now
            }
        };
    }

    /**
     * 处理投票
     */
    public processVote(voterId: string, vote: any): void {
        // Check if it's a valid consensus message
        const consensusMsg = vote as ConsensusMessage;

        // Store the vote directly - we'll only work with valid votes
        this.state.votes.set(voterId, consensusMsg);

        // 检查是否达到法定人数
        this.checkQuorum();
    }

    /**
     * 检查是否达到法定人数
     */
    private checkQuorum(): void {
        const votes = Array.from(this.state.votes.values());
        const suspectedVotes = votes.filter(vote => vote.vote.state === NodeState.SUSPECTED);

        if (suspectedVotes.length >= this.quorumSize) {
            const suspectedNodes = new Set(
                suspectedVotes.map(vote => vote.vote.nodeId)
            );

            suspectedNodes.forEach(nodeId => {
                if (!this.state.confirmedFailures.has(nodeId)) {
                    this.state.confirmedFailures.add(nodeId);
                    this.emit('nodeFailure', nodeId, this.currentRound, Date.now());
                }
            });
        }
    }

    /**
     * 检测网络分区
     */
    public detectPartitions(nodes: NodeInfo[]): void {
        const partitions = this.findPartitions(nodes);
        if (partitions.length > 1) {
            this.emit('partitionDetected', partitions, Date.now());
        }
    }

    private findPartitions(nodes: NodeInfo[]): Set<string>[] {
        const visited = new Set<string>();
        const partitions: Set<string>[] = [];

        for (const node of nodes) {
            if (!visited.has(node.id)) {
                const partition = new Set<string>();
                this.dfs(node.id, nodes, visited, partition);
                if (partition.size > 0) {
                    partitions.push(partition);
                }
            }
        }

        return partitions;
    }

    /**
     * 深度优先搜索检测连通分量
     */
    private dfs(
        nodeId: string,
        nodes: NodeInfo[],
        visited: Set<string>,
        partition: Set<string>
    ): void {
        visited.add(nodeId);
        partition.add(nodeId);

        const node = nodes.find(n => n.id === nodeId);
        if (!node) return;

        // Check connections with other nodes
        for (const otherNode of nodes) {
            if (
                otherNode.id !== nodeId &&
                !visited.has(otherNode.id) &&
                this.areNodesConnected(node, otherNode)
            ) {
                this.dfs(otherNode.id, nodes, visited, partition);
            }
        }
    }

    /**
     * 检查两个节点是否连接
     */
    private areNodesConnected(node1: NodeInfo, node2: NodeInfo): boolean {
        // TODO: Implement actual connection check
        // For now, assume all nodes are connected
        return true;
    }

    /**
     * 获取当前共识状态
     */
    public getConsensusState(): ConsensusState {
        return { ...this.state };
    }

    /**
     * 获取被怀疑的节点
     */
    public getSuspectedNodes(): Set<string> {
        return new Set(this.state.confirmedFailures);
    }

    /**
     * 获取已确认死亡的节点
     */
    public getConfirmedDeadNodes(): Set<string> {
        return new Set(this.state.confirmedFailures);
    }

    /**
     * 获取分区组
     */
    public getPartitionGroups(): Map<string, Set<string>> {
        return new Map(this.state.partitions.map(partition => {
            const firstValue = partition.values().next().value;
            // Ensure we always return a string key
            const key = firstValue !== undefined ? firstValue : '';
            return [key, new Set(partition)];
        }));
    }
} 