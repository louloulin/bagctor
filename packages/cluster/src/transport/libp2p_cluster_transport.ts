import { Libp2pTransportProvider } from '@bactor/remote/src/providers/libp2p';
import { ClusterManager } from '../cluster_manager';
import { ClusterEvent, ClusterState, NodeInfo } from '../types';
import { log } from '@bactor/core';
import { encoder, decoder } from '../utils/encoding';
import { Libp2p, PeerId } from 'libp2p';
import { Message } from '@bactor/core';
import { GossipSub } from '@chainsafe/libp2p-gossipsub';
import { DHT } from '@libp2p/kad-dht';
import { Mplex } from '@libp2p/mplex';
import { Noise } from '@chainsafe/libp2p-noise';
import { TCP } from '@libp2p/tcp';
import { Bootstrap } from '@libp2p/bootstrap';
import { PubSubPeerDiscovery } from '@libp2p/pubsub-peer-discovery';

// 定义集群相关的主题
const TOPICS = {
    GOSSIP: 'bactor-cluster-gossip',
    MEMBERSHIP: 'bactor-cluster-membership',
    HEARTBEAT: 'bactor-cluster-heartbeat',
    LEADER_ELECTION: 'bactor-cluster-leader-election',
    STATE_SYNC: 'bactor-cluster-state-sync'
};

export interface LibP2pClusterOptions {
    localAddress: string;
    seedNodes: string[];
    dhtEnabled?: boolean;
    dhtRandomWalk?: boolean;
    clusterManager: ClusterManager;
    nodeId: string;
}

/**
 * 基于libp2p的集群传输层实现
 */
export class LibP2pClusterTransport {
    private transport: Libp2pTransportProvider;
    private clusterManager: ClusterManager;
    private topicHandlers: Map<string, (message: any) => void>;
    private nodeId: string;
    private isStarted: boolean = false;
    private libp2p: Libp2p | null = null;
    private messageHandlers: Map<string, (message: any) => void> = new Map();
    private gossipSub: GossipSub | null = null;
    private dht: DHT | null = null;

    constructor(private options: LibP2pClusterOptions) {
        this.clusterManager = options.clusterManager;
        this.nodeId = options.nodeId;

        this.transport = new Libp2pTransportProvider({
            localAddress: options.localAddress,
            bootstrapNodes: options.seedNodes,
            dht: {
                enabled: options.dhtEnabled ?? true,
                randomWalk: options.dhtRandomWalk ?? true
            }
        });

        this.topicHandlers = new Map();

        // 初始化消息处理映射
        this.registerMessageHandlers();
    }

    /**
     * 启动传输层
     */
    async start(): Promise<void> {
        try {
            log.info('Starting LibP2pClusterTransport');
            await this.transport.init();
            await this.transport.start();

            // 注册消息处理器
            this.transport.onMessage(this.handleIncomingMessage.bind(this));

            // 订阅集群相关话题
            await this.subscribeToClusterTopics();

            this.isStarted = true;
            log.info('LibP2pClusterTransport started successfully');
        } catch (error) {
            log.error('Failed to start LibP2pClusterTransport', { error });
            throw error;
        }
    }

    /**
     * 停止传输层
     */
    async stop(): Promise<void> {
        try {
            if (!this.isStarted) return;

            await this.transport.stop();
            this.isStarted = false;
            log.info('LibP2pClusterTransport stopped');
        } catch (error) {
            log.error('Failed to stop LibP2pClusterTransport', { error });
            throw error;
        }
    }

    /**
     * 订阅集群相关话题
     */
    private async subscribeToClusterTopics(): Promise<void> {
        try {
            log.debug('Subscribing to cluster topics');

            // 订阅所有集群相关话题
            for (const topic of Object.values(TOPICS)) {
                log.debug(`Subscribing to topic: ${topic}`);
                await this.transport.subscribeToTopic(topic);
            }

            log.debug('Successfully subscribed to all cluster topics');
        } catch (error) {
            log.error('Failed to subscribe to cluster topics', { error });
            throw error;
        }
    }

    /**
     * 注册消息处理器
     */
    private registerMessageHandlers(): void {
        // Gossip消息处理
        this.topicHandlers.set(TOPICS.GOSSIP, (message) => {
            this.handleGossipMessage(message);
        });

        // 成员关系消息处理
        this.topicHandlers.set(TOPICS.MEMBERSHIP, (message) => {
            this.handleMembershipMessage(message);
        });

        // 心跳消息处理
        this.topicHandlers.set(TOPICS.HEARTBEAT, (message) => {
            this.handleHeartbeatMessage(message);
        });

        // 领导者选举消息处理
        this.topicHandlers.set(TOPICS.LEADER_ELECTION, (message) => {
            this.handleLeaderElectionMessage(message);
        });

        // 状态同步消息处理
        this.topicHandlers.set(TOPICS.STATE_SYNC, (message) => {
            this.handleStateSyncMessage(message);
        });
    }

    /**
     * 处理传入的消息
     */
    private async handleIncomingMessage(from: string, data: any): Promise<void> {
        try {
            const message = JSON.parse(data.message);
            const topic = data.topic;

            // 忽略自己发送的消息
            if (message.sender === this.nodeId) {
                return;
            }

            log.debug('Received message', { topic, messageType: message.type, from });

            // 调用对应话题的处理器
            const handler = this.topicHandlers.get(topic);
            if (handler) {
                handler(message);
            } else {
                log.warn('No handler registered for topic', { topic });
            }
        } catch (error) {
            log.error('Error handling incoming message', { error, from });
        }
    }

    /**
     * 发送消息到指定话题
     */
    async sendToTopic(topic: string, message: any): Promise<void> {
        try {
            // 确保消息有发送者ID
            if (!message.sender) {
                message.sender = this.nodeId;
            }

            // 确保消息有时间戳
            if (!message.timestamp) {
                message.timestamp = Date.now();
            }

            log.debug('Sending message to topic', { topic, messageType: message.type });

            await this.transport.send(topic, {
                type: message.type,
                payload: message,
                sender: this.nodeId,
                timestamp: Date.now()
            });
        } catch (error) {
            log.error('Failed to send message to topic', { topic, error });
            throw error;
        }
    }

    /**
     * 广播集群状态
     */
    async gossipClusterState(state: ClusterState): Promise<void> {
        // 序列化集群状态，仅传递增量更新
        const stateUpdate = this.prepareStateUpdate(state);

        log.debug('Gossiping cluster state update');

        // 通过libp2p的gossipsub广播状态
        await this.sendToTopic(TOPICS.GOSSIP, {
            type: 'STATE_UPDATE',
            payload: stateUpdate,
            timestamp: Date.now(),
            sender: this.nodeId
        });
    }

    /**
     * 准备状态更新
     */
    private prepareStateUpdate(state: ClusterState): any {
        // 创建一个简化版的状态用于传输
        // 在实际实现中，应该只传递增量更新以减少网络流量
        const nodesArray = Array.from(state.nodes.entries()).map(([id, node]) => ({
            id,
            address: node.address,
            status: node.status,
            lastHeartbeat: node.lastHeartbeat,
            metadata: node.metadata,
            capabilities: node.capabilities,
            load: node.load
        }));

        return {
            nodes: nodesArray,
            partitions: state.partitions.map(p => Array.from(p)),
            leader: state.leader,
            term: state.term,
            version: state.version
        };
    }

    /**
     * 处理Gossip消息
     */
    private handleGossipMessage(message: any): void {
        if (message.type === 'STATE_UPDATE') {
            log.debug('Received state update via gossip', { from: message.sender });

            const stateUpdate = message.payload;
            this.mergeRemoteState(stateUpdate);
        }
    }

    /**
     * 合并远程状态更新
     */
    private mergeRemoteState(stateUpdate: any): void {
        try {
            // 转换回Map结构
            const nodeMap = new Map<string, NodeInfo>();
            for (const node of stateUpdate.nodes) {
                nodeMap.set(node.id, {
                    id: node.id,
                    address: node.address,
                    status: node.status,
                    lastHeartbeat: node.lastHeartbeat,
                    metadata: node.metadata,
                    capabilities: node.capabilities,
                    load: node.load
                });
            }

            // 转换分区信息
            const partitions = stateUpdate.partitions.map((p: any[]) => new Set(p));

            // 创建合并后的状态
            const mergedState: ClusterState = {
                nodes: nodeMap,
                partitions,
                leader: stateUpdate.leader,
                term: stateUpdate.term,
                version: stateUpdate.version
            };

            // 将状态更新应用到集群管理器
            this.clusterManager.mergeRemoteState(mergedState);
        } catch (error) {
            log.error('Failed to merge remote state', { error });
        }
    }

    /**
     * 处理成员关系消息
     */
    private handleMembershipMessage(message: any): void {
        switch (message.type) {
            case 'JOIN':
                this.handleNodeJoin(message);
                break;
            case 'LEAVE':
                this.handleNodeLeave(message);
                break;
            default:
                log.warn('Unknown membership message type', { type: message.type });
        }
    }

    /**
     * 处理节点加入消息
     */
    private handleNodeJoin(message: any): void {
        const nodeInfo = message.payload;
        log.info('Node is attempting to join the cluster', { nodeId: nodeInfo.id });

        // 注册新节点
        this.clusterManager.registerNode({
            id: nodeInfo.id,
            address: nodeInfo.address,
            metadata: nodeInfo.metadata,
            capabilities: nodeInfo.capabilities
        });
    }

    /**
     * 处理节点离开消息
     */
    private handleNodeLeave(message: any): void {
        const nodeId = message.payload.nodeId;
        log.info('Node is leaving the cluster', { nodeId });

        // 处理节点离开
        this.clusterManager.handleNodeLeave(nodeId);
    }

    /**
     * 处理心跳消息
     */
    private handleHeartbeatMessage(message: any): void {
        const heartbeat = message.payload;

        // 更新节点心跳
        this.clusterManager.updateNodeHeartbeat(heartbeat.nodeId);

        // 如果心跳包含负载信息，也更新负载
        if (heartbeat.load) {
            this.clusterManager.updateNodeLoad(heartbeat.nodeId, heartbeat.load);
        }
    }

    /**
     * 处理领导者选举消息
     */
    private handleLeaderElectionMessage(message: any): void {
        // 领导者选举逻辑将在后续实现
        log.debug('Received leader election message', { type: message.type });
    }

    /**
     * 处理状态同步消息
     */
    private handleStateSyncMessage(message: any): void {
        if (message.type === 'STATE_REQUEST') {
            this.handleStateRequest(message);
        } else if (message.type === 'STATE_RESPONSE') {
            this.handleStateResponse(message);
        }
    }

    /**
     * 处理状态请求
     */
    private handleStateRequest(message: any): void {
        log.debug('Received state request', { from: message.sender });

        // 获取当前集群状态
        const currentState = this.clusterManager.getState();
        const stateUpdate = this.prepareStateUpdate(currentState);

        // 回复状态
        this.sendToTopic(TOPICS.STATE_SYNC, {
            type: 'STATE_RESPONSE',
            payload: stateUpdate,
            recipient: message.sender
        });
    }

    /**
     * 处理状态响应
     */
    private handleStateResponse(message: any): void {
        // 只处理发给自己的响应
        if (message.recipient !== this.nodeId) {
            return;
        }

        log.debug('Received state response', { from: message.sender });

        // 合并状态
        this.mergeRemoteState(message.payload);
    }

    /**
     * 发送心跳
     */
    async sendHeartbeat(load?: any): Promise<void> {
        const heartbeat = {
            nodeId: this.nodeId,
            timestamp: Date.now(),
            load
        };

        await this.sendToTopic(TOPICS.HEARTBEAT, {
            type: 'HEARTBEAT',
            payload: heartbeat
        });
    }

    /**
     * 请求集群状态同步
     */
    async requestStateSync(): Promise<void> {
        await this.sendToTopic(TOPICS.STATE_SYNC, {
            type: 'STATE_REQUEST',
            sender: this.nodeId
        });
    }

    /**
     * 加入集群
     */
    async joinCluster(metadata: Record<string, any> = {}): Promise<void> {
        const nodeInfo = {
            id: this.nodeId,
            address: this.transport.getLocalAddress(),
            metadata,
            capabilities: [],
            timestamp: Date.now()
        };

        log.info('Joining cluster', { nodeId: this.nodeId });

        // 先请求集群状态以获取最新信息
        await this.requestStateSync();

        // 发送加入消息
        await this.sendToTopic(TOPICS.MEMBERSHIP, {
            type: 'JOIN',
            payload: nodeInfo
        });
    }

    /**
     * 离开集群
     */
    async leaveCluster(): Promise<void> {
        log.info('Leaving cluster', { nodeId: this.nodeId });

        await this.sendToTopic(TOPICS.MEMBERSHIP, {
            type: 'LEAVE',
            payload: {
                nodeId: this.nodeId,
                timestamp: Date.now()
            }
        });
    }

    /**
     * 获取连接的节点
     */
    async getConnectedPeers(): Promise<string[]> {
        const peers = await this.transport.getConnectedPeers();
        return peers;
    }

    /**
     * 获取本地地址
     */
    getLocalAddress(): string {
        return this.transport.getLocalAddress();
    }

    async init(): Promise<void> {
        // 创建 libp2p 节点
        this.libp2p = await this.createLibp2pNode();

        // 初始化传输层
        await this.transport.init();

        // 设置消息处理器
        this.setupMessageHandlers();
    }

    async sendToNode(nodeId: string, message: Message): Promise<void> {
        if (!this.libp2p) {
            throw new Error('Libp2p not initialized');
        }

        try {
            // 解析节点ID为PeerId
            const peerId = await this.resolvePeerId(nodeId);

            // 创建流并发送消息
            const { stream } = await this.libp2p.dialProtocol(peerId, '/bactor/cluster/1.0.0');

            // 发送消息
            await stream.sink([Buffer.from(JSON.stringify(message))]);

            // 关闭流
            await stream.close();
        } catch (error) {
            log.error(`Failed to send message to node ${nodeId}:`, error);
            throw error;
        }
    }

    private async createLibp2pNode(): Promise<Libp2p> {
        // 创建 libp2p 节点配置
        const config = {
            addresses: {
                listen: ['/ip4/0.0.0.0/tcp/0']
            },
            transports: [
                new TCP(),
                new Mplex(),
                new Noise()
            ],
            peerDiscovery: [
                new Bootstrap({
                    list: this.transport.getBootstrapNodes()
                }),
                new PubSubPeerDiscovery({
                    interval: 1000,
                    topics: ['bactor-cluster-discovery']
                })
            ],
            services: {
                dht: new DHT({
                    clientMode: false,
                    protocol: '/bactor/dht/1.0.0'
                }),
                pubsub: new GossipSub({
                    emitSelf: false,
                    allowPublishToZeroPeers: true
                })
            }
        };

        // 创建并返回 libp2p 节点
        return await Libp2p.create(config);
    }

    private async resolvePeerId(nodeId: string): Promise<PeerId> {
        // 从DHT中查找节点信息
        const peerInfo = await this.dht?.findPeer(nodeId);
        if (!peerInfo) {
            throw new Error(`Peer not found: ${nodeId}`);
        }
        return peerInfo.id;
    }

    private setupMessageHandlers(): void {
        // 注册消息处理器
        this.messageHandlers.set('HEARTBEAT', this.handleHeartbeat.bind(this));
        this.messageHandlers.set('STATE_UPDATE', this.handleStateUpdate.bind(this));
        this.messageHandlers.set('NODE_STATUS', this.handleNodeStatus.bind(this));
    }

    private async handleHeartbeat(data: any): Promise<void> {
        await this.clusterManager.handleHeartbeat(data.nodeId, data.timestamp);
    }

    private async handleStateUpdate(data: any): Promise<void> {
        await this.clusterManager.handleStateUpdate(data.state);
    }

    private async handleNodeStatus(data: any): Promise<void> {
        await this.clusterManager.handleNodeStatus(data.nodeId, data.status);
    }
} 