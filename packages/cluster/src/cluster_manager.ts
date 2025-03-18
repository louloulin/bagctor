import { EventEmitter } from 'events';
import {
    ClusterConfig,
    NodeInfo,
    NodeStatus,
    ClusterEvent,
    ClusterEventType,
    ClusterMetrics,
    ClusterState,
    LoadBalancingConfig,
    PartitionConfig,
    NodeLoad,
    BackpressureConfig,
    BackpressureState,
    BackpressureStrategy,
    RecoveryPolicy,
    Message,
    PID
} from './types';
import { log } from '@bactor/core';
import { v4 as uuidv4 } from 'uuid';
import { PID as CorePID } from '@bactor/core';
import { ConsistentHashActorPlacement } from './actor/consistent_hash_placement';
import { FailureDetectionConsensus } from './utils/consensus';
import { SystemMetricsCollector } from './utils/system_metrics';
import { BackpressureManager } from './utils/backpressure';
import { LibP2pClusterTransport } from './transport/libp2p_cluster_transport';

export class ClusterManager extends EventEmitter {
    private state: ClusterState;
    private config: ClusterConfig;
    private loadBalancingConfig?: LoadBalancingConfig;
    private partitionConfig?: PartitionConfig;
    private backpressureConfig?: BackpressureConfig;
    private backpressureState: BackpressureState;
    private heartbeatInterval: NodeJS.Timer | null = null;
    private loadReportInterval: NodeJS.Timer | null = null;
    private backpressureInterval: NodeJS.Timer | null = null;
    private metrics: ClusterMetrics;
    private nodeId: string;
    private transport: LibP2pClusterTransport | null = null;
    private localNodeId: string;
    private actorPlacement: ConsistentHashActorPlacement;
    private timers: {
        heartbeat: NodeJS.Timeout | null;
        failureDetection: NodeJS.Timeout | null;
        stateSync: NodeJS.Timeout | null;
    } = {
            heartbeat: null,
            failureDetection: null,
            stateSync: null
        };

    constructor(
        config: ClusterConfig,
        loadBalancingConfig?: LoadBalancingConfig,
        partitionConfig?: PartitionConfig,
        backpressureConfig?: BackpressureConfig
    ) {
        super();
        this.config = config;
        this.loadBalancingConfig = loadBalancingConfig;
        this.partitionConfig = partitionConfig;
        this.backpressureConfig = backpressureConfig;
        this.nodeId = uuidv4();
        this.state = this.initializeState();
        this.metrics = this.initializeMetrics();
        this.backpressureState = this.initializeBackpressureState();
        this.localNodeId = this.nodeId;
        this.actorPlacement = this.initializeActorPlacement();
    }

    // 新增方法: 设置传输层
    public setTransport(transport: LibP2pClusterTransport): void {
        this.transport = transport;
    }

    private initializeState(): ClusterState {
        return {
            nodes: new Map(),
            partitions: [],
            term: 0,
            version: 0,
            actors: new Map(),
            load: new Map()
        };
    }

    private initializeMetrics(): ClusterMetrics {
        return {
            activeNodes: 0,
            suspectedNodes: 0,
            deadNodes: 0,
            messagesSent: 0,
            messagesReceived: 0,
            lastGossipTimestamp: Date.now(),
            partitionCount: 0,
            leadershipChanges: 0,
            avgLoadPerNode: {
                cpu: 0,
                memory: 0,
                messageRate: 0,
                actorCount: 0
            }
        };
    }

    private initializeBackpressureState(): BackpressureState {
        return {
            isActive: false,
            currentStrategy: BackpressureStrategy.ADAPTIVE,
            metrics: {
                currentQueueSize: 0,
                memoryUsage: 0,
                cpuUsage: 0,
                messageRate: 0,
                droppedMessages: 0,
                throttledActors: 0
            }
        };
    }

    private initializeActorPlacement(): ConsistentHashActorPlacement {
        // Implementation of initializeActorPlacement method
        // This is a placeholder and should be implemented based on your specific requirements
        return new ConsistentHashActorPlacement();
    }

    // 新增方法: 合并远程状态
    public mergeRemoteState(remoteState: ClusterState): void {
        log.debug('Merging remote cluster state');

        try {
            // 合并节点信息
            for (const [nodeId, nodeInfo] of remoteState.nodes.entries()) {
                const existingNode = this.state.nodes.get(nodeId);

                // 如果是新节点或远程版本更新，则更新本地状态
                if (!existingNode || nodeInfo.lastHeartbeat > existingNode.lastHeartbeat) {
                    this.state.nodes.set(nodeId, nodeInfo);
                }
            }

            // 如果远程版本更新，更新分区信息
            if (remoteState.version > this.state.version) {
                this.state.partitions = remoteState.partitions;
                this.state.version = remoteState.version;
            }

            // 如果远程任期更高，更新领导者信息
            if (remoteState.term > this.state.term) {
                this.state.leader = remoteState.leader;
                this.state.term = remoteState.term;

                if (remoteState.leader) {
                    this.emitClusterEvent({
                        type: ClusterEventType.LEADER_ELECTED,
                        nodeId: remoteState.leader,
                        timestamp: Date.now()
                    });
                }
            }

            // 更新指标
            this.updateMetrics();

            // 发出状态更改事件
            this.emitClusterEvent({
                type: ClusterEventType.STATE_CHANGED,
                nodeId: this.nodeId,
                timestamp: Date.now()
            });
        } catch (error) {
            log.error('Error merging remote state', { error });
        }
    }

    // 新增方法: 处理节点离开
    public handleNodeLeave(nodeId: string): void {
        const node = this.state.nodes.get(nodeId);
        if (node) {
            node.status = NodeStatus.LEAVING;
            this.emitClusterEvent({
                type: ClusterEventType.NODE_LEFT,
                nodeId,
                timestamp: Date.now()
            });

            // 从集群状态中移除节点
            this.state.nodes.delete(nodeId);

            // 更新集群指标
            this.updateMetrics();

            // 检查分区状态
            this.checkPartitions();

            // 如果启用了负载均衡，可能需要重新平衡
            this.rebalanceIfNeeded();

            log.info('Node has left the cluster', { nodeId });
        }
    }

    public start(): void {
        this.startHeartbeat();
        this.startLoadReporting();
        this.startBackpressureMonitoring();
        this.joinCluster();
        log.info('Cluster manager started', {
            nodeId: this.nodeId,
            config: this.config
        });
    }

    public stop(): void {
        this.stopHeartbeat();
        this.stopLoadReporting();
        this.stopBackpressureMonitoring();
        this.leaveCluster();
        log.info('Cluster manager stopped', { nodeId: this.nodeId });
    }

    private startHeartbeat(): void {
        this.heartbeatInterval = setInterval(() => {
            this.checkNodeHealth();
            this.gossipState();
        }, this.config.heartbeatInterval);
    }

    private stopHeartbeat(): void {
        if (this.heartbeatInterval) {
            clearInterval(this.heartbeatInterval);
            this.heartbeatInterval = null;
        }
    }

    private startLoadReporting(): void {
        if (this.config.loadReportInterval) {
            this.loadReportInterval = setInterval(() => {
                this.reportLoad();
            }, this.config.loadReportInterval);
        }
    }

    private stopLoadReporting(): void {
        if (this.loadReportInterval) {
            clearInterval(this.loadReportInterval);
            this.loadReportInterval = null;
        }
    }

    private startBackpressureMonitoring(): void {
        if (!this.backpressureConfig?.enabled) return;

        this.backpressureInterval = setInterval(() => {
            this.checkBackpressure();
        }, this.backpressureConfig.samplingInterval);
    }

    private stopBackpressureMonitoring(): void {
        if (this.backpressureInterval) {
            clearInterval(this.backpressureInterval);
            this.backpressureInterval = null;
        }
    }

    private joinCluster(): void {
        const newNode: NodeInfo = {
            id: this.nodeId,
            address: `${process.env.HOST || 'localhost'}:${process.env.PORT || '0'}`,
            status: NodeStatus.JOINING,
            lastHeartbeat: Date.now(),
            metadata: {},
            capabilities: [],
            load: {
                cpu: 0,
                memory: 0,
                messageRate: 0,
                actorCount: 0
            }
        };

        this.state.nodes.set(this.nodeId, newNode);
        this.updateMetrics();
        this.emitClusterEvent({
            type: ClusterEventType.NODE_JOINED,
            nodeId: this.nodeId,
            timestamp: Date.now(),
            data: newNode
        });

        // 如果配置了传输层，使用传输层通知集群
        if (this.transport && typeof this.transport.joinCluster === 'function') {
            this.transport.joinCluster().catch((error: any) => {
                log.error('Failed to join cluster via transport', { error });
            });
        }
    }

    private leaveCluster(): void {
        const node = this.state.nodes.get(this.nodeId);
        if (node) {
            node.status = NodeStatus.LEAVING;
            this.emitClusterEvent({
                type: ClusterEventType.NODE_LEFT,
                nodeId: this.nodeId,
                timestamp: Date.now()
            });
            this.state.nodes.delete(this.nodeId);
            this.updateMetrics();

            // 如果配置了传输层，使用传输层通知集群
            if (this.transport && typeof this.transport.leaveCluster === 'function') {
                this.transport.leaveCluster().catch((error: any) => {
                    log.error('Failed to leave cluster via transport', { error });
                });
            }
        }
    }

    public registerNode(nodeInfo: Omit<NodeInfo, 'status' | 'lastHeartbeat'>): void {
        const node: NodeInfo = {
            ...nodeInfo,
            status: NodeStatus.ACTIVE,
            lastHeartbeat: Date.now()
        };

        this.state.nodes.set(nodeInfo.id, node);
        this.updateMetrics();
        this.emitClusterEvent({
            type: ClusterEventType.NODE_JOINED,
            nodeId: nodeInfo.id,
            timestamp: Date.now(),
            data: node
        });

        this.checkPartitions();
        this.rebalanceIfNeeded();

        log.info('Node registered', { nodeId: nodeInfo.id, address: nodeInfo.address });
    }

    public updateNodeHeartbeat(nodeId: string): void {
        const node = this.state.nodes.get(nodeId);
        if (node) {
            node.lastHeartbeat = Date.now();
            if (node.status === NodeStatus.SUSPECTED) {
                node.status = NodeStatus.ACTIVE;
                this.emitClusterEvent({
                    type: ClusterEventType.NODE_RECOVERED,
                    nodeId,
                    timestamp: Date.now()
                });
                this.checkPartitions();
            }
            this.updateMetrics();
        }
    }

    public updateNodeLoad(nodeId: string, load: NodeLoad): void {
        const node = this.state.nodes.get(nodeId);
        if (node) {
            node.load = load;
            this.emitClusterEvent({
                type: ClusterEventType.LOAD_CHANGED,
                nodeId,
                timestamp: Date.now(),
                data: load
            });
            this.updateMetrics();
            this.rebalanceIfNeeded();
        }
    }

    // 更新gossipState方法，使用传输层实现真正的Gossip通信
    private gossipState(): void {
        // 如果配置了传输层，使用传输层gossip集群状态
        if (this.transport && typeof this.transport.gossipClusterState === 'function') {
            this.transport.gossipClusterState(this.getState()).catch((error: any) => {
                log.error('Failed to gossip state via transport', { error });
            });
        }

        this.metrics.lastGossipTimestamp = Date.now();
    }

    // 更新发送心跳，利用传输层
    private reportLoad(): void {
        const load = this.calculateNodeLoad();
        this.updateNodeLoad(this.nodeId, load);

        // 如果配置了传输层，使用传输层发送心跳
        if (this.transport && typeof this.transport.sendHeartbeat === 'function') {
            this.transport.sendHeartbeat(load).catch((error: any) => {
                log.error('Failed to send heartbeat via transport', { error });
            });
        }
    }

    private checkNodeHealth(): void {
        const now = Date.now();
        this.state.nodes.forEach((node, nodeId) => {
            const timeSinceLastHeartbeat = now - node.lastHeartbeat;

            if (timeSinceLastHeartbeat > this.config.failureDetectionThreshold) {
                if (node.status === NodeStatus.ACTIVE) {
                    node.status = NodeStatus.SUSPECTED;
                    this.emitClusterEvent({
                        type: ClusterEventType.NODE_SUSPECTED,
                        nodeId,
                        timestamp: now
                    });
                    log.warn('Node suspected down', { nodeId, timeSinceLastHeartbeat });
                    this.checkPartitions();
                } else if (node.status === NodeStatus.SUSPECTED) {
                    node.status = NodeStatus.DEAD;
                    this.emitClusterEvent({
                        type: ClusterEventType.NODE_LEFT,
                        nodeId,
                        timestamp: now
                    });
                    log.error('Node marked as dead', { nodeId, timeSinceLastHeartbeat });
                    this.state.nodes.delete(nodeId);
                    this.checkPartitions();
                    this.rebalanceIfNeeded();
                }
                this.updateMetrics();
            }
        });
    }

    private checkPartitions(): void {
        const activeNodes = this.getActiveNodes();
        const previousPartitionCount = this.state.partitions.length;

        // Simple partition detection based on network topology
        const partitions = this.detectPartitions(activeNodes);
        this.state.partitions = partitions;

        if (partitions.length !== previousPartitionCount) {
            if (partitions.length > previousPartitionCount) {
                this.emitClusterEvent({
                    type: ClusterEventType.PARTITION_DETECTED,
                    nodeId: this.nodeId,
                    timestamp: Date.now(),
                    data: { partitions }
                });
            } else {
                this.emitClusterEvent({
                    type: ClusterEventType.PARTITION_HEALED,
                    nodeId: this.nodeId,
                    timestamp: Date.now(),
                    data: { partitions }
                });
            }
        }
    }

    private detectPartitions(nodes: NodeInfo[]): Set<string>[] {
        // Simplified partition detection
        // In a real implementation, this would use network topology information
        const partitions: Set<string>[] = [];
        const unassigned = new Set(nodes.map(n => n.id));

        while (unassigned.size > 0) {
            const partition = new Set<string>();
            const [first] = unassigned;
            this.findConnectedNodes(first, unassigned, partition);
            partitions.push(partition);
        }

        return partitions;
    }

    private findConnectedNodes(nodeId: string, unassigned: Set<string>, partition: Set<string>): void {
        unassigned.delete(nodeId);
        partition.add(nodeId);

        // 如果配置了传输层，可以使用它来检查实际连接性
        for (const id of unassigned) {
            if (this.areNodesConnected(nodeId, id)) {
                this.findConnectedNodes(id, unassigned, partition);
            }
        }
    }

    private areNodesConnected(node1: string, node2: string): boolean {
        // 简化的连接性检查，使用传输层可以实现真实检查
        return true;
    }

    private rebalanceIfNeeded(): void {
        if (!this.loadBalancingConfig) return;

        const activeNodes = this.getActiveNodes();
        if (activeNodes.length < 2) return;

        const avgLoad = this.calculateAverageLoad(activeNodes);
        const needsRebalancing = this.checkLoadImbalance(activeNodes, avgLoad);

        if (needsRebalancing) {
            this.performRebalancing(activeNodes, avgLoad);
        }
    }

    private calculateAverageLoad(nodes: NodeInfo[]): NodeLoad {
        const total = nodes.reduce((acc, node) => {
            if (!node.load) return acc;
            return {
                cpu: acc.cpu + node.load.cpu,
                memory: acc.memory + node.load.memory,
                messageRate: acc.messageRate + node.load.messageRate,
                actorCount: acc.actorCount + node.load.actorCount
            };
        }, { cpu: 0, memory: 0, messageRate: 0, actorCount: 0 });

        const count = nodes.length;
        return {
            cpu: total.cpu / count,
            memory: total.memory / count,
            messageRate: total.messageRate / count,
            actorCount: total.actorCount / count
        };
    }

    private checkLoadImbalance(nodes: NodeInfo[], avgLoad: NodeLoad): boolean {
        const config = this.loadBalancingConfig;
        if (!config?.thresholds) return false;

        return nodes.some(node => {
            if (!node.load) return false;
            const { thresholds } = config;

            return (
                Math.abs(node.load.cpu - avgLoad.cpu) > thresholds.cpu ||
                Math.abs(node.load.memory - avgLoad.memory) > thresholds.memory ||
                Math.abs(node.load.messageRate - avgLoad.messageRate) > thresholds.messageRate ||
                Math.abs(node.load.actorCount - avgLoad.actorCount) > thresholds.actorCount
            );
        });
    }

    private performRebalancing(nodes: NodeInfo[], avgLoad: NodeLoad): void {
        // Implement rebalancing logic based on loadBalancingConfig.strategy
        log.info('Performing cluster rebalancing', {
            strategy: this.loadBalancingConfig?.strategy,
            avgLoad
        });
    }

    private calculateNodeLoad(): NodeLoad {
        // 实际实现应该使用系统监控来获取真实数据
        // 这里仍使用模拟数据，后续可改进
        return {
            cpu: Math.random() * 100,
            memory: Math.random() * 100,
            messageRate: Math.random() * 1000,
            actorCount: Math.floor(Math.random() * 100)
        };
    }

    public getNodeInfo(nodeId: string): NodeInfo | undefined {
        return this.state.nodes.get(nodeId);
    }

    public getAllNodes(): NodeInfo[] {
        return Array.from(this.state.nodes.values());
    }

    public getActiveNodes(): NodeInfo[] {
        return this.getAllNodes().filter(node => node.status === NodeStatus.ACTIVE);
    }

    public getMetrics(): ClusterMetrics {
        return { ...this.metrics };
    }

    public getState(): ClusterState {
        return {
            nodes: new Map(this.state.nodes),
            partitions: [...this.state.partitions],
            leader: this.state.leader,
            term: this.state.term,
            version: this.state.version,
            actors: new Map(this.state.actors),
            load: new Map(this.state.load)
        };
    }

    private updateMetrics(): void {
        const nodes = this.getAllNodes();
        this.metrics.activeNodes = nodes.filter(n => n.status === NodeStatus.ACTIVE).length;
        this.metrics.suspectedNodes = nodes.filter(n => n.status === NodeStatus.SUSPECTED).length;
        this.metrics.deadNodes = nodes.filter(n => n.status === NodeStatus.DEAD).length;
        this.metrics.partitionCount = this.state.partitions.length;
        this.metrics.avgLoadPerNode = this.calculateAverageLoad(nodes);
    }

    private emitClusterEvent(event: ClusterEvent): void {
        this.emit('clusterEvent', event);
        log.debug('Cluster event emitted', { event });
    }

    private checkBackpressure(): void {
        if (!this.backpressureConfig?.enabled) return;

        const currentMetrics = this.collectBackpressureMetrics();
        const thresholds = this.backpressureConfig.thresholds;
        let shouldActivate = false;
        let triggerReason = '';

        // Check each threshold
        if (currentMetrics.currentQueueSize > thresholds.queueSize) {
            shouldActivate = true;
            triggerReason = 'Queue size exceeded threshold';
        } else if (currentMetrics.memoryUsage > thresholds.memoryUsage) {
            shouldActivate = true;
            triggerReason = 'Memory usage exceeded threshold';
        } else if (currentMetrics.cpuUsage > thresholds.cpuUsage) {
            shouldActivate = true;
            triggerReason = 'CPU usage exceeded threshold';
        } else if (currentMetrics.messageRate > thresholds.messageRate) {
            shouldActivate = true;
            triggerReason = 'Message rate exceeded threshold';
        }

        if (shouldActivate && !this.backpressureState.isActive) {
            this.activateBackpressure(triggerReason);
        } else if (!shouldActivate && this.backpressureState.isActive) {
            this.deactivateBackpressure();
        }

        // Update metrics
        this.backpressureState.metrics = currentMetrics;
    }

    private activateBackpressure(reason: string): void {
        this.backpressureState.isActive = true;
        this.backpressureState.triggerReason = reason;
        this.backpressureState.activationTime = Date.now();

        const strategy = this.determineBackpressureStrategy();
        this.backpressureState.currentStrategy = strategy;

        this.applyBackpressureStrategy(strategy);

        log.warn('Backpressure activated', {
            reason,
            strategy,
            metrics: this.backpressureState.metrics
        });

        this.emit('backpressureActivated', {
            nodeId: this.nodeId,
            reason,
            strategy,
            metrics: this.backpressureState.metrics
        });
    }

    private deactivateBackpressure(): void {
        const recoveryPolicy = this.backpressureConfig?.recoveryPolicy || RecoveryPolicy.GRADUAL;
        this.applyRecoveryPolicy(recoveryPolicy);

        this.backpressureState.isActive = false;
        this.backpressureState.triggerReason = undefined;
        this.backpressureState.activationTime = undefined;

        log.info('Backpressure deactivated', {
            recoveryPolicy,
            metrics: this.backpressureState.metrics
        });

        this.emit('backpressureDeactivated', {
            nodeId: this.nodeId,
            recoveryPolicy,
            metrics: this.backpressureState.metrics
        });
    }

    private determineBackpressureStrategy(): BackpressureStrategy {
        if (!this.backpressureConfig) return BackpressureStrategy.ADAPTIVE;

        const { strategy } = this.backpressureConfig;
        if (strategy !== BackpressureStrategy.ADAPTIVE) {
            return strategy;
        }

        // Implement adaptive strategy selection based on current conditions
        const metrics = this.backpressureState.metrics;
        if (metrics.memoryUsage > 90) {
            return BackpressureStrategy.DROP;
        } else if (metrics.cpuUsage > 80) {
            return BackpressureStrategy.THROTTLE;
        } else {
            return BackpressureStrategy.BUFFER;
        }
    }

    private applyBackpressureStrategy(strategy: BackpressureStrategy): void {
        switch (strategy) {
            case BackpressureStrategy.DROP:
                this.applyDropStrategy();
                break;
            case BackpressureStrategy.THROTTLE:
                this.applyThrottleStrategy();
                break;
            case BackpressureStrategy.BUFFER:
                this.applyBufferStrategy();
                break;
            case BackpressureStrategy.ADAPTIVE:
                this.applyAdaptiveStrategy();
                break;
        }
    }

    private applyDropStrategy(): void {
        // Implement message dropping logic
        log.info('Applying DROP backpressure strategy');
    }

    private applyThrottleStrategy(): void {
        // Implement actor throttling logic
        log.info('Applying THROTTLE backpressure strategy');
    }

    private applyBufferStrategy(): void {
        // Implement message buffering logic
        log.info('Applying BUFFER backpressure strategy');
    }

    private applyAdaptiveStrategy(): void {
        // Implement adaptive control logic
        log.info('Applying ADAPTIVE backpressure strategy');
    }

    private applyRecoveryPolicy(policy: RecoveryPolicy): void {
        switch (policy) {
            case RecoveryPolicy.IMMEDIATE:
                this.applyImmediateRecovery();
                break;
            case RecoveryPolicy.GRADUAL:
                this.applyGradualRecovery();
                break;
            case RecoveryPolicy.ADAPTIVE:
                this.applyAdaptiveRecovery();
                break;
        }
    }

    private applyImmediateRecovery(): void {
        // Implement immediate recovery logic
        log.info('Applying IMMEDIATE recovery policy');
    }

    private applyGradualRecovery(): void {
        // Implement gradual recovery logic
        log.info('Applying GRADUAL recovery policy');
    }

    private applyAdaptiveRecovery(): void {
        // Implement adaptive recovery logic
        log.info('Applying ADAPTIVE recovery policy');
    }

    private collectBackpressureMetrics(): BackpressureState['metrics'] {
        // Implement actual metrics collection
        return {
            currentQueueSize: this.estimateQueueSize(),
            memoryUsage: this.getMemoryUsage(),
            cpuUsage: this.getCPUUsage(),
            messageRate: this.getMessageRate(),
            droppedMessages: this.backpressureState.metrics.droppedMessages,
            throttledActors: this.backpressureState.metrics.throttledActors
        };
    }

    private estimateQueueSize(): number {
        // Implement queue size estimation
        return 0;
    }

    private getMemoryUsage(): number {
        // Get actual memory usage percentage
        const used = process.memoryUsage();
        return (used.heapUsed / used.heapTotal) * 100;
    }

    private getCPUUsage(): number {
        // Implement CPU usage calculation
        return 0;
    }

    private getMessageRate(): number {
        // Implement message rate calculation
        return 0;
    }

    public getBackpressureState(): BackpressureState {
        return { ...this.backpressureState };
    }

    getNode(nodeId: string): NodeInfo | undefined {
        return this.state.nodes.get(nodeId);
    }

    getSelfNodeId(): string {
        return this.nodeId;
    }

    getActorPlacement(): ConsistentHashActorPlacement {
        return this.actorPlacement;
    }

    async sendMessage(message: {
        to: PID;
        from: string;
        payload: any;
        targetNode: NodeInfo;
    }): Promise<void> {
        const transport = this.getTransport();
        if (!transport) {
            throw new Error('No transport available for cluster communication');
        }

        await transport.sendToNode(message.targetNode.id, {
            type: 'ACTOR_MESSAGE',
            targetPid: message.to,
            senderPid: message.from,
            payload: message.payload,
            timestamp: Date.now()
        });
    }

    private clearTimers(): void {
        if (this.timers.heartbeat) {
            clearInterval(this.timers.heartbeat);
            this.timers.heartbeat = null;
        }
        if (this.timers.failureDetection) {
            clearInterval(this.timers.failureDetection);
            this.timers.failureDetection = null;
        }
        if (this.timers.stateSync) {
            clearInterval(this.timers.stateSync);
            this.timers.stateSync = null;
        }
    }

    getTransport(): LibP2pClusterTransport | null {
        return this.transport;
    }

    async registerActor(actorId: string, pid: PID): Promise<void> {
        const nodeId = this.actorPlacement.determineNodeForActor(actorId);
        this.state.actors.set(actorId, { pid, nodeId });
    }

    async unregisterActor(actorId: string): Promise<void> {
        this.state.actors.delete(actorId);
    }

    async getActorLocation(actorId: string): Promise<string | null> {
        const actorInfo = this.state.actors.get(actorId);
        return actorInfo?.nodeId || null;
    }

    async updateNodeLoad(load: NodeLoad): Promise<void> {
        const node = this.state.nodes.get(this.nodeId);
        if (node) {
            node.load = load;
            this.state.load.set(this.nodeId, load);
        }
    }

    getNodeLoad(nodeId: string): NodeLoad | null {
        return this.state.load.get(nodeId) || null;
    }
} 