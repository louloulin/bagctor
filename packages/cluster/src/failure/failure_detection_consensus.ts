import { EventEmitter } from 'events';
import { log } from '@bactor/core';
import { NodeInfo, NodeStatus, NodeState, ConsensusMessage, ConsensusState } from '../types';

export class FailureDetectionConsensus extends EventEmitter {
    private nodeId: string;
    private state: ConsensusState;
    private roundInterval: number;
    private currentRound: number = 0;
    private heartbeatTimeouts: Map<string, number> = new Map();

    constructor(nodeId: string, roundInterval: number = 5000) {
        super();
        this.nodeId = nodeId;
        this.roundInterval = roundInterval;
        this.state = {
            round: 0,
            votes: new Map<string, ConsensusMessage>(),
            confirmedFailures: new Set<string>(),
            partitions: []
        };
        log.info('FailureDetectionConsensus initialized', { nodeId });
    }

    /**
     * 开始新一轮的故障检测共识
     */
    public startConsensusRound(nodes: NodeInfo[]): void {
        this.currentRound++;

        // 清理上一轮的投票
        this.state.votes.clear();

        // 检查每个节点的心跳是否超时
        const now = Date.now();
        const suspectedNodes: NodeInfo[] = [];

        for (const node of nodes) {
            if (node.id === this.nodeId) continue; // 跳过自己

            // 检查心跳超时
            if (node.status === NodeStatus.ACTIVE &&
                now - node.lastHeartbeat > this.roundInterval) {
                suspectedNodes.push(node);
            }
        }

        // 为每个疑似故障的节点发起投票
        for (const node of suspectedNodes) {
            this.castVote(node.id, NodeState.SUSPECTED);
        }

        log.debug('Started consensus round', {
            round: this.currentRound,
            suspectedNodesCount: suspectedNodes.length
        });
    }

    /**
     * 处理收到的投票
     */
    public processVote(voterId: string, vote: any): void {
        // 验证投票消息结构
        const consensusMsg = vote as ConsensusMessage;
        if (!consensusMsg || consensusMsg.type !== 'VOTE' || !consensusMsg.vote) {
            log.warn('Received invalid vote', { voterId, vote });
            return;
        }

        // 存储投票
        this.state.votes.set(voterId, consensusMsg);

        // 检查是否达到法定人数
        this.checkQuorum(consensusMsg.vote.nodeId);

        log.debug('Processed vote', {
            voterId,
            nodeId: consensusMsg.vote.nodeId,
            state: consensusMsg.vote.state
        });
    }

    /**
     * 投票
     */
    private castVote(nodeId: string, state: NodeState): void {
        const consensusMsg: ConsensusMessage = {
            type: 'VOTE',
            voterId: this.nodeId,
            vote: {
                nodeId,
                state,
                timestamp: Date.now()
            }
        };

        // 存储自己的投票
        this.state.votes.set(this.nodeId, consensusMsg);

        // 发出投票事件，让传输层广播
        this.emit('voteCast', {
            nodeId: this.nodeId,
            round: this.currentRound,
            vote: consensusMsg
        });

        log.debug('Cast vote', { nodeId, state });
    }

    /**
     * 检查是否达到法定人数来确认节点状态
     */
    private checkQuorum(nodeId: string): void {
        // 收集针对该节点的所有投票
        const votes: ConsensusMessage[] = [];

        for (const [voterId, vote] of this.state.votes.entries()) {
            if (vote.vote.nodeId === nodeId) {
                votes.push(vote);
            }
        }

        // 计算各种状态的投票数
        const suspectedVotes = votes.filter(v => v.vote.state === NodeState.SUSPECTED).length;
        const deadVotes = votes.filter(v => v.vote.state === NodeState.DEAD).length;

        // 假设法定人数为收到的投票数的多数
        const totalVotes = votes.length;
        const quorum = Math.ceil(totalVotes / 2);

        // 如果多数节点认为该节点已死亡
        if (deadVotes >= quorum) {
            this.confirmNodeFailure(nodeId);
        }
        // 如果多数节点怀疑该节点出故障
        else if (suspectedVotes >= quorum) {
            this.suspectNode(nodeId);
        }
    }

    /**
     * 确认节点故障
     */
    private confirmNodeFailure(nodeId: string): void {
        if (this.state.confirmedFailures.has(nodeId)) {
            return; // 已经确认过故障了
        }

        this.state.confirmedFailures.add(nodeId);

        this.emit('nodeFailure', {
            nodeId,
            round: this.currentRound,
            timestamp: Date.now()
        });

        log.info('Node failure confirmed', { nodeId, round: this.currentRound });
    }

    /**
     * 怀疑节点可能出故障
     */
    private suspectNode(nodeId: string): void {
        this.emit('nodeSuspected', {
            nodeId,
            round: this.currentRound,
            timestamp: Date.now()
        });

        log.warn('Node suspected', { nodeId, round: this.currentRound });
    }

    /**
     * 检测网络分区
     */
    public detectPartitions(nodes: NodeInfo[]): void {
        const partitions = this.getPartitionGroups(nodes);

        if (partitions.length > 1) {
            this.state.partitions = partitions;

            this.emit('partitionDetected', {
                groups: partitions,
                timestamp: Date.now()
            });

            log.warn('Network partition detected', {
                partitionCount: partitions.length,
                groups: partitions.map(group => Array.from(group).join(','))
            });
        }
    }

    /**
     * 根据节点的通信状态分组，识别可能的网络分区
     */
    private getPartitionGroups(nodes: NodeInfo[]): Set<string>[] {
        const activeNodes = nodes.filter(n => n.status === NodeStatus.ACTIVE);
        const nodeIds = activeNodes.map(n => n.id);

        // 创建初始分区，每个节点自成一组
        const partitions: Map<string, Set<string>> = new Map();

        for (const nodeId of nodeIds) {
            partitions.set(nodeId, new Set([nodeId]));
        }

        // 合并可以通信的节点组
        for (const [voterNodeId, vote] of this.state.votes.entries()) {
            if (!nodeIds.includes(voterNodeId)) continue;

            const targetNodeId = vote.vote.nodeId;
            if (!nodeIds.includes(targetNodeId)) continue;

            // 如果投票者认为目标节点是活跃的，则它们可以通信
            if (vote.vote.state === NodeState.ALIVE) {
                this.mergePartitions(partitions, voterNodeId, targetNodeId);
            }
        }

        // 转换为数组形式返回
        const result: Set<string>[] = [];
        const added = new Set<string>();

        for (const [nodeId, group] of partitions.entries()) {
            if (!added.has(nodeId)) {
                result.push(group);
                for (const id of group) {
                    added.add(id);
                }
            }
        }

        return result;
    }

    /**
     * 合并两个节点所在的分区
     */
    private mergePartitions(partitions: Map<string, Set<string>>, nodeId1: string, nodeId2: string): void {
        const partition1 = partitions.get(nodeId1);
        const partition2 = partitions.get(nodeId2);

        if (!partition1 || !partition2) return;

        // 如果已经在同一分区，无需操作
        if (partition1 === partition2) return;

        // 合并两个分区
        const mergedPartition = new Set([...partition1, ...partition2]);

        // 更新所有相关节点的分区引用
        for (const nodeId of mergedPartition) {
            partitions.set(nodeId, mergedPartition);
        }
    }

    /**
     * 获取当前确认的故障节点列表
     */
    public getConfirmedFailures(): string[] {
        return Array.from(this.state.confirmedFailures);
    }

    /**
     * 清除确认的故障节点
     */
    public clearConfirmedFailure(nodeId: string): void {
        this.state.confirmedFailures.delete(nodeId);
        log.info('Cleared confirmed failure', { nodeId });
    }

    /**
     * 获取当前的共识状态
     */
    public getConsensusState(): ConsensusState {
        return {
            round: this.currentRound,
            votes: new Map(this.state.votes),
            confirmedFailures: new Set(this.state.confirmedFailures),
            partitions: [...this.state.partitions]
        };
    }

    /**
     * 重置共识状态
     */
    public resetConsensusState(): void {
        this.state.round = 0;
        this.state.votes.clear();
        this.state.confirmedFailures.clear();
        this.state.partitions = [];
        this.currentRound = 0;
        log.info('Consensus state reset');
    }
} 