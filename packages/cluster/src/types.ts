import { PID } from '@bactor/core';

export interface NodeInfo {
    id: string;
    address: string;
    status: NodeStatus;
    lastHeartbeat: number;
    metadata: Record<string, any>;
    capabilities?: string[];
    load?: NodeLoad;
}

export interface NodeLoad {
    cpu: number;
    memory: number;
    messageRate: number;
    actorCount: number;
}

export enum NodeStatus {
    ACTIVE = 'ACTIVE',
    SUSPECTED = 'SUSPECTED',
    DEAD = 'DEAD',
    JOINING = 'JOINING',
    LEAVING = 'LEAVING',
    MAINTENANCE = 'MAINTENANCE'
}

export interface ClusterConfig {
    heartbeatInterval: number;
    failureDetectionThreshold: number;
    reconnectionStrategy: ReconnectionStrategy;
    membershipProtocol: MembershipProtocol;
    gossipInterval?: number;
    suspicionTimeout?: number;
    syncInterval?: number;
    loadReportInterval?: number;
    stateBackend?: StateBackend;
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
    STATE_CHANGED = 'STATE_CHANGED',
    LEADER_ELECTED = 'LEADER_ELECTED',
    LOAD_CHANGED = 'LOAD_CHANGED',
    PARTITION_DETECTED = 'PARTITION_DETECTED',
    PARTITION_HEALED = 'PARTITION_HEALED'
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

export interface ClusterState {
    nodes: Map<string, NodeInfo>;
    partitions: Set<string>[];
    leader?: string;
    term: number;
    version: number;
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

export interface BackpressureConfig {
    enabled: boolean;
    strategy: BackpressureStrategy;
    thresholds: BackpressureThresholds;
    samplingInterval: number;
    recoveryPolicy: RecoveryPolicy;
}

export interface BackpressureThresholds {
    queueSize: number;
    memoryUsage: number;
    cpuUsage: number;
    messageRate: number;
}

export enum BackpressureStrategy {
    DROP = 'DROP',
    THROTTLE = 'THROTTLE',
    BUFFER = 'BUFFER',
    ADAPTIVE = 'ADAPTIVE'
}

export enum RecoveryPolicy {
    IMMEDIATE = 'IMMEDIATE',
    GRADUAL = 'GRADUAL',
    ADAPTIVE = 'ADAPTIVE'
}

export interface BackpressureState {
    isActive: boolean;
    currentStrategy: BackpressureStrategy;
    triggerReason?: string;
    activationTime?: number;
    metrics: {
        currentQueueSize: number;
        memoryUsage: number;
        cpuUsage: number;
        messageRate: number;
        droppedMessages: number;
        throttledActors: number;
    };
} 