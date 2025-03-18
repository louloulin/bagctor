import { EventEmitter } from 'events';
import { PID } from '@bactor/core';
import { log } from '@bactor/core';
import { v4 as uuidv4 } from 'uuid';
import { ConsistentHashActorPlacement } from './actor/consistent_hash_placement';
import { FailureDetectionConsensus } from './failure/failure_detection_consensus';
import { LibP2pClusterTransport } from './transport/libp2p_cluster_transport';
import { SystemMetricsCollector } from './utils/system_metrics';
import { BackpressureManager } from './backpressure/backpressure_manager';
import {
    ClusterConfig,
    ClusterState,
    NodeInfo,
    NodeStatus,
    NodeLoad,
    ActorInfo,
    ClusterEventType,
    Message,
    BackpressureConfig,
    LibP2pClusterOptions,
    BackpressureStrategy,
    LoadBalancingConfig,
    PartitionConfig,
    BackpressureState,
    ClusterMetrics,
    ClusterEvent,
    RecoveryPolicy,
    BackpressureMetrics
} from './types';

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
    private metricsCollector: SystemMetricsCollector;
    private backpressureManager: BackpressureManager;
    private failureDetection: FailureDetectionConsensus;

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
        this.backpressureConfig = backpressureConfig || {
            enabled: true,
            strategy: BackpressureStrategy.ADAPTIVE,
            thresholds: {
                queueSize: 1000,
                memoryUsage: 80,
                cpuUsage: 80,
                messageRate: 1000,
                processingTime: 100,
                errorRate: 0.1
            },
            recoveryPolicy: RecoveryPolicy.GRADUAL,
            samplingInterval: 1000
        };
        this.nodeId = config.nodeId || uuidv4();
        this.state = this.initializeState();
        this.metrics = this.initializeMetrics();
        this.backpressureState = this.initializeBackpressureState();
        this.localNodeId = this.nodeId;
        this.actorPlacement = this.initializeActorPlacement();

        // Initialize system metrics collector
        this.metricsCollector = new SystemMetricsCollector();

        // Initialize backpressure manager
        this.backpressureManager = new BackpressureManager(this.backpressureConfig, this.metricsCollector);

        // Initialize failure detection
        this.failureDetection = new FailureDetectionConsensus(this.nodeId);
        this.setupFailureDetectionEvents();

        // Initialize transport layer
        this.transport = new LibP2pClusterTransport({
            clusterManager: this,
            nodeId: this.nodeId,
            bootstrapList: config.bootstrapList,
            listenAddresses: config.listenAddresses,
            enableDHT: config.enableDHT,
            enablePubSub: config.enablePubSub,
            enableGossip: config.enableGossip
        });
        this.setupTransportEvents();

        // Start periodic tasks
        this.startPeriodicTasks();
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
            load: new Map(),
            leader: null
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
        return new ConsistentHashActorPlacement(this);
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
        if (this.heartbeatInterval) {
            log.warn('Cluster already started');
            return;
        }

        log.info('Starting cluster node', { nodeId: this.nodeId });

        // Start transport layer
        if (this.transport) {
            this.transport.start();
        }

        // ... rest of method ...
    }

    async stop(): Promise<void> {
        log.info('Stopping cluster node', { nodeId: this.nodeId });

        // Stop transport layer
        if (this.transport) {
            this.transport.stop();
        }

        // ... rest of method ...
    }

    private startPeriodicTasks(): void {
        // 定期发送心跳
        this.timers.heartbeat = setInterval(() => {
            this.sendHeartbeat();
        }, this.config.heartbeatInterval || 1000) as unknown as NodeJS.Timeout;

        // 定期检测故障
        this.timers.failureDetection = setInterval(() => {
            this.detectFailures();
        }, this.config.failureDetectionTimeout || 5000) as unknown as NodeJS.Timeout;

        // 定期检测分区
        this.timers.stateSync = setInterval(() => {
            this.detectPartitions();
        }, this.config.partitionDetectionTimeout || 10000) as unknown as NodeJS.Timeout;
    }

    private stopPeriodicTasks(): void {
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

    private sendHeartbeat(): void {
        const heartbeat: Message = {
            type: 'HEARTBEAT',
            nodeId: this.nodeId,
            timestamp: Date.now(),
            payload: {
                term: this.state.term,
                load: this.getNodeLoad(this.nodeId),
                actorCount: this.state.actors.size
            }
        };

        // Broadcast heartbeat to all nodes
        if (this.transport) {
            this.transport.broadcast(heartbeat);
        }
    }

    private detectFailures(): void {
        const nodes = Array.from(this.state.nodes.values());
        this.failureDetection.startConsensusRound(nodes);
    }

    private detectPartitions(): void {
        const nodes = Array.from(this.state.nodes.values());
        this.failureDetection.detectPartitions(nodes);
    }

    private handlePartitionDetected(groups: Set<string>[], timestamp: number): void {
        this.state.partitions = groups.map(group => Array.from(group));
        this.state.version++;

        this.emit('clusterEvent', {
            type: ClusterEventType.PARTITION_DETECTED,
            nodeId: this.nodeId,
            timestamp,
            data: { groups: this.state.partitions }
        });
    }

    private handleMessage(message: Message): void {
        if (!message) return;

        switch (message.type) {
            case 'HEARTBEAT':
                this.handleHeartbeat(message);
                break;
            case 'LOAD_REPORT':
                this.handleLoadReport(message);
                break;
            case 'VOTE':
                this.handleVote(message);
                break;
            case 'STATE_SYNC':
                this.handleStateSync(message);
                break;
        }
    }

    private handleHeartbeat(message: Message): void {
        const node = this.state.nodes.get(message.nodeId);
        if (node) {
            node.lastHeartbeat = message.timestamp;
            node.status = NodeStatus.ACTIVE;
            node.load = message.payload as NodeLoad;
        }
    }

    private handleLoadReport(message: Message): void {
        this.state.load.set(message.nodeId, message.payload as NodeLoad);
    }

    private handleVote(message: Message): void {
        this.failureDetection.processVote(message.nodeId, message.payload);
    }

    private handleStateSync(message: Message): void {
        if (message.payload.version > this.state.version) {
            this.state = message.payload;
            this.emit('clusterEvent', {
                type: ClusterEventType.STATE_CHANGED,
                nodeId: this.nodeId,
                timestamp: Date.now()
            });
        }
    }

    private handleNodeJoined(nodeInfo: NodeInfo): void {
        this.state.nodes.set(nodeInfo.id, nodeInfo);
        this.state.version++;

        this.emit('clusterEvent', {
            type: ClusterEventType.NODE_JOINED,
            nodeId: nodeInfo.id,
            timestamp: Date.now()
        });
    }

    private handleNodeLeft(nodeId: string): void {
        const node = this.state.nodes.get(nodeId);
        if (node) {
            node.status = NodeStatus.LEAVING;
            this.state.version++;

            this.emit('clusterEvent', {
                type: ClusterEventType.NODE_LEFT,
                nodeId,
                timestamp: Date.now()
            });
        }
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
            nodeId: message.from,
            timestamp: Date.now(),
            payload: {
                to: message.to,
                from: message.from,
                data: message.payload
            }
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
        if (nodeId) {
            this.state.actors.set(actorId, { pid, nodeId });
        }
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

    /**
     * 设置故障检测事件处理
     */
    private setupFailureDetectionEvents(): void {
        this.failureDetection.on('nodeFailure', ({ nodeId, round, timestamp }) => {
            this.handleNodeFailure(nodeId, round, timestamp);
        });

        this.failureDetection.on('partitionDetected', ({ groups, timestamp }) => {
            this.handlePartitionDetected(groups, timestamp);
        });
    }

    /**
     * 设置传输层事件处理
     */
    private setupTransportEvents(): void {
        if (!this.transport) {
            log.warn('Transport layer not available, skipping event setup');
            return;
        }

        this.transport.on('message', (message) => {
            this.handleMessage(message);
        });

        this.transport.on('nodeJoined', (nodeInfo) => {
            this.handleNodeJoined(nodeInfo);
        });

        this.transport.on('nodeLeft', (nodeId) => {
            this.handleNodeLeft(nodeId);
        });
    }

    /**
     * 获取Actor信息
     */
    public getActorInfo(pid: PID): ActorInfo | undefined {
        return this.state.actors.get(pid.toString());
    }

    /**
     * 获取所有Actor
     */
    public getAllActors(): ActorInfo[] {
        return Array.from(this.state.actors.values());
    }

    /**
     * 获取所有节点负载
     */
    public getAllNodeLoads(): Map<string, NodeLoad> {
        return new Map(this.state.load);
    }

    /**
     * 检查是否需要应用背压
     */
    public shouldApplyBackpressure(): boolean {
        return this.backpressureManager.shouldApplyBackpressure();
    }

    /**
     * 获取当前背压策略
     */
    public getCurrentBackpressureStrategy(): BackpressureStrategy {
        return this.backpressureManager.getCurrentStrategy();
    }

    private handleNodeFailure(nodeId: string, round: number, timestamp: number): void {
        const node = this.state.nodes.get(nodeId);
        if (node && node.status !== NodeStatus.DEAD) {
            node.status = NodeStatus.DEAD;
            this.state.version++;

            this.emit('clusterEvent', {
                type: ClusterEventType.NODE_SUSPECTED,
                nodeId,
                timestamp
            });
        }
    }

    private checkPartitions(): void {
        const nodes = Array.from(this.state.nodes.values());
        this.failureDetection.detectPartitions(nodes);
    }

    private rebalanceIfNeeded(): void {
        if (!this.loadBalancingConfig) return;

        const nodes = this.getActiveNodes();
        const avgLoad = this.calculateAverageLoad(nodes);
        const threshold = this.loadBalancingConfig.thresholds;

        // Check if rebalancing is needed based on load thresholds
        const needsRebalancing = nodes.some(node => {
            const load = node.load;
            if (!load) return false;

            return (
                load.cpu > threshold.cpu ||
                load.memory > threshold.memory ||
                load.messageRate > threshold.messageRate ||
                load.actorCount > threshold.actorCount
            );
        });

        if (needsRebalancing) {
            this.rebalanceActors();
        }
    }

    private calculateAverageLoad(nodes: NodeInfo[]): NodeLoad {
        const activeNodes = nodes.filter(n => n.status === NodeStatus.ACTIVE && n.load);
        if (activeNodes.length === 0) {
            return {
                cpu: 0,
                memory: 0,
                messageRate: 0,
                actorCount: 0
            };
        }

        const totalLoad = activeNodes.reduce(
            (acc, node) => {
                if (!node.load) return acc;
                return {
                    cpu: acc.cpu + node.load.cpu,
                    memory: acc.memory + node.load.memory,
                    messageRate: acc.messageRate + node.load.messageRate,
                    actorCount: acc.actorCount + node.load.actorCount
                };
            },
            { cpu: 0, memory: 0, messageRate: 0, actorCount: 0 }
        );

        return {
            cpu: totalLoad.cpu / activeNodes.length,
            memory: totalLoad.memory / activeNodes.length,
            messageRate: totalLoad.messageRate / activeNodes.length,
            actorCount: totalLoad.actorCount / activeNodes.length
        };
    }

    private rebalanceActors(): void {
        // Implement actor rebalancing logic
        log.info('Rebalancing actors across cluster nodes');
        // TODO: Implement actual rebalancing logic
    }

    // Fix RecoveryPolicy usage if it doesn't have ADAPTIVE
    private getBackpressureConfig(): BackpressureConfig {
        if (this.backpressureConfig) {
            return this.backpressureConfig;
        }

        return {
            enabled: true,
            strategy: BackpressureStrategy.ADAPTIVE,
            thresholds: {
                messageRate: 1000,
                queueSize: 1000,
                processingTime: 100,
                errorRate: 0.1,
                cpuUsage: 80,
                memoryUsage: 80
            },
            recoveryPolicy: RecoveryPolicy.GRADUAL,
            samplingInterval: 1000
        };
    }

    /**
     * 处理节点状态变更
     * @param nodeId 节点ID
     * @param status 新的节点状态
     */
    public async handleNodeStatus(nodeId: string, status: NodeStatus): Promise<void> {
        const node = this.getNode(nodeId);
        if (!node) {
            log.warn(`无法处理未知节点的状态变更`, { nodeId, status });
            return;
        }

        log.info(`处理节点状态变更`, { nodeId, oldStatus: node.status, newStatus: status });

        // 更新节点状态
        node.status = status;

        // 根据状态发出不同的事件
        switch (status) {
            case NodeStatus.ACTIVE:
                this.emitClusterEvent({
                    type: ClusterEventType.NODE_RECOVERED,
                    nodeId,
                    timestamp: Date.now()
                });
                break;
            case NodeStatus.SUSPECTED:
                this.emitClusterEvent({
                    type: ClusterEventType.NODE_SUSPECTED,
                    nodeId,
                    timestamp: Date.now()
                });
                break;
            case NodeStatus.DEAD:
                this.handleNodeFailure(nodeId, 0, Date.now());
                break;
            case NodeStatus.LEAVING:
                this.handleNodeLeave(nodeId);
                break;
        }

        // 更新集群状态版本
        this.state.version++;

        // 可能需要重新平衡Actor分配
        if ([NodeStatus.ACTIVE, NodeStatus.DEAD].includes(status)) {
            this.rebalanceIfNeeded();
        }

        // 同步状态到其它节点
        if (this.transport) {
            await this.transport.broadcastStateUpdate(this.state);
        }
    }
} 