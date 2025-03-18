import { EventEmitter } from 'events';
import { ClusterManager } from './cluster_manager';
import { PID } from '@bactor/core';

export interface NodeInfo {
    id: string;
    address: string;
    status: NodeStatus;
    lastHeartbeat: number;
    metadata: Record<string, any>;
    capabilities: string[];
    load?: NodeLoad;
}

export interface NodeLoad {
    cpu: number;
    memory: number;
    messageRate: number;
    actorCount: number;
}

export interface ActorInfo {
    pid: PID;
    nodeId: string;
}

export interface ClusterState {
    nodes: Map<string, NodeInfo>;
    actors: Map<string, ActorInfo>;
    load: Map<string, NodeLoad>;
    partitions: string[][];
    version: number;
    leader: string | null;
}

export interface Message {
    type: string;
    nodeId: string;
    timestamp: number;
    payload: any;
}

export enum NodeStatus {
    JOINING = 'JOINING',
    ACTIVE = 'ACTIVE',
    SUSPECTED = 'SUSPECTED',
    DEAD = 'DEAD',
    LEAVING = 'LEAVING'
}

export interface ClusterConfig {
    nodeId: string;
    heartbeatInterval: number;
    failureDetectionTimeout: number;
    partitionDetectionTimeout: number;
    bootstrapList?: string[];
    listenAddresses?: string[];
    enableDHT?: boolean;
    enablePubSub?: boolean;
    enableGossip?: boolean;
    backpressureConfig?: BackpressureConfig;
}

export enum ReconnectionStrategy {
    EXPONENTIAL_BACKOFF = 'EXPONENTIAL_BACKOFF',
    LINEAR_BACKOFF = 'LINEAR_BACKOFF',
    IMMEDIATE = 'IMMEDIATE'
}

export enum MembershipProtocol {
    SWIM = 'SWIM',
    GOSSIP = 'GOSSIP',
    HYBRID = 'HYBRID'
}

export enum StateBackend {
    MEMORY = 'MEMORY',
    REDIS = 'REDIS',
    ETCD = 'ETCD'
}

export interface ClusterEvent {
    type: ClusterEventType;
    nodeId: string;
    timestamp: number;
    data?: any;
}

export enum ClusterEventType {
    NODE_JOINED = 'NODE_JOINED',
    NODE_LEFT = 'NODE_LEFT',
    NODE_SUSPECTED = 'NODE_SUSPECTED',
    NODE_RECOVERED = 'NODE_RECOVERED',
    PARTITION_DETECTED = 'PARTITION_DETECTED',
    PARTITION_HEALED = 'PARTITION_HEALED',
    STATE_CHANGED = 'STATE_CHANGED',
    LOAD_CHANGED = 'LOAD_CHANGED'
}

export interface ClusterMetrics {
    activeNodes: number;
    suspectedNodes: number;
    deadNodes: number;
    messagesSent: number;
    messagesReceived: number;
    lastGossipTimestamp: number;
    partitionCount: number;
    leadershipChanges: number;
    avgLoadPerNode: NodeLoad;
}

export interface PartitionConfig {
    strategy: PartitionStrategy;
    replicationFactor: number;
    consistencyLevel: ConsistencyLevel;
}

export enum PartitionStrategy {
    CONSISTENT_HASH = 'CONSISTENT_HASH',
    RANGE = 'RANGE',
    RANDOM = 'RANDOM'
}

export enum ConsistencyLevel {
    ONE = 'ONE',
    QUORUM = 'QUORUM',
    ALL = 'ALL'
}

export interface LoadBalancingConfig {
    strategy: LoadBalancingStrategy;
    thresholds: LoadThresholds;
    rebalanceInterval: number;
}

export enum LoadBalancingStrategy {
    ROUND_ROBIN = 'ROUND_ROBIN',
    LEAST_LOADED = 'LEAST_LOADED',
    CONSISTENT_HASH = 'CONSISTENT_HASH',
    ADAPTIVE = 'ADAPTIVE'
}

export interface LoadThresholds {
    cpu: number;
    memory: number;
    messageRate: number;
    actorCount: number;
}

/**
 * 背压策略枚举
 */
export enum BackpressureStrategy {
    DROP = 'DROP',           // 丢弃消息
    THROTTLE = 'THROTTLE',   // 限流
    BUFFER = 'BUFFER',       // 缓冲
    ADAPTIVE = 'ADAPTIVE'    // 自适应
}

/**
 * 背压配置
 */
export interface BackpressureConfig {
    enabled: boolean;
    strategy: BackpressureStrategy;
    thresholds: BackpressureThresholds;
    recoveryPolicy: RecoveryPolicy;
    samplingInterval: number;
}

/**
 * 背压阈值配置
 */
export interface BackpressureThresholds {
    messageRate: number;
    queueSize: number;
    processingTime: number;
    errorRate: number;
    cpuUsage: number;
    memoryUsage: number;
}

/**
 * 背压状态
 */
export interface BackpressureState {
    isActive: boolean;
    currentStrategy: BackpressureStrategy;
    activationTime?: number;
    triggerReason?: string;
    metrics: BackpressureMetrics;
}

/**
 * 背压指标
 */
export interface BackpressureMetrics {
    currentQueueSize: number;
    memoryUsage: number;
    cpuUsage: number;
    messageRate: number;
    droppedMessages: number;
    throttledActors: number;
}

/**
 * 消息优先级
 */
export enum MessagePriority {
    HIGH = 'HIGH',
    MEDIUM = 'MEDIUM',
    LOW = 'LOW'
}

/**
 * 共识消息类型
 */
export interface ConsensusMessage {
    type: 'VOTE';
    voterId: string;
    vote: {
        nodeId: string;
        state: NodeState;
        timestamp: number;
    };
}

/**
 * 共识状态
 */
export interface ConsensusState {
    round: number;
    votes: Map<string, ConsensusMessage>;
    confirmedFailures: Set<string>;
    partitions: Set<string>[];
}

/**
 * 节点状态
 */
export enum NodeState {
    ALIVE = 'ALIVE',
    SUSPECTED = 'SUSPECTED',
    DEAD = 'DEAD'
}

export enum RecoveryPolicy {
    IMMEDIATE = 'IMMEDIATE',
    GRADUAL = 'GRADUAL',
    EXPONENTIAL = 'EXPONENTIAL'
}

export interface LibP2pClusterOptions {
    clusterManager: ClusterManager;
    nodeId: string;
    bootstrapList?: string[];
    listenAddresses?: string[];
    enableDHT?: boolean;
    enablePubSub?: boolean;
    enableGossip?: boolean;
} 