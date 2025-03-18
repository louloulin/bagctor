import { PID } from '@bactor/core';

export interface NodeInfo {
    id: string;
    address: string;
    status: NodeStatus;
    lastHeartbeat: number;
    load: NodeLoad;
    metadata?: Record<string, any>;
    capabilities?: string[];
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
    leader: string | null;
    term: number;
    version: number;
    partitions: string[][];
}

export interface Message {
    type: string;
    nodeId: string;
    timestamp: number;
    state?: ClusterState;
    targetPid?: PID;
    senderPid?: string;
    payload?: any;
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
    localAddress: string;
    seedNodes: string[];
    heartbeatInterval?: number;
    failureDetectionTimeout?: number;
    partitionDetectionTimeout?: number;
    loadReportInterval?: number;
    failureDetectionThreshold?: number;
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