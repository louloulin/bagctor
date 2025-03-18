/**
 * 简化的集群示例
 * 
 * 这个示例使用直接的ClusterManager实例而不是LibP2pClusterSystem
 * 来避免libp2p传输层的初始化问题。示例展示了集群节点间的通信。
 */

import { Message, Props, PID } from '../core/types';
import { ActorContext } from '../core/context';
import { Actor } from '../core/actor';
import { ActorSystem } from '../core/system';
import {
    ClusterManager,
    NodeInfo,
    NodeStatus,
    ClusterConfig,
    NodeLoad,
    ClusterEventType
} from '@bactor/cluster';
import { v4 as uuid } from 'uuid';
import { setTimeout as sleep } from 'node:timers/promises';

// 设置测试环境标志避免网络错误
process.env.NODE_ENV = 'test';

// 更大规模集群测试
const NODES_COUNT = 50;
const BASE_PORT = 40000;

// 消息类型常量
const MessageTypes = {
    HELLO: 'HELLO',
    PING: 'PING',
    PONG: 'PONG',
    DATA: 'DATA',
    STATUS: 'STATUS'
};

// 优化连接拓扑 - 根据节点数量调整
function getOptimalConnectionsPerNode(totalNodes: number): number {
    // 对于大型网络，使用对数比例连接
    // 经验公式: min(3 + ln(n/10), n/4)
    if (totalNodes <= 10) return 3;
    const logScale = 3 + Math.log(totalNodes / 10);
    const maxConnections = Math.floor(totalNodes / 4);
    return Math.min(Math.floor(logScale), maxConnections);
}

/**
 * 简单的节点服务Actor类 - 优化消息处理
 */
class NodeServiceActor extends Actor {
    private nodeId: string;
    private stats = {
        messagesReceived: 0,
        messagesSent: 0,
        lastMessageTime: 0,
        processingTime: 0,
        messageTypes: {} as Record<string, number>,
        errors: 0
    };

    constructor(context: ActorContext) {
        super(context);
        this.nodeId = '';
    }

    protected behaviors(): void {
        this.addBehavior('default', async (message: Message) => {
            try {
                const startTime = Date.now();

                // 初始化
                if (message.type === 'INIT') {
                    this.nodeId = message.payload.nodeId;
                    // 减少输出频率
                    if (this.nodeId.includes('0') || this.nodeId === 'seed') {
                        console.log(`[Node ${this.nodeId}] Service initialized at ${this.context.self.id}`);
                    }
                    return;
                }

                // 更新统计信息
                this.stats.messagesReceived++;
                this.stats.lastMessageTime = Date.now();
                this.stats.messageTypes[message.type] = (this.stats.messageTypes[message.type] || 0) + 1;

                // 处理HELLO消息
                if (message.type === MessageTypes.HELLO) {
                    // 减少日志输出量，只有关键节点才输出详细日志
                    if (this.nodeId === 'seed' || parseInt(this.nodeId.split('-')[1] || '0') % 10 === 0) {
                        console.log(`[Node ${this.nodeId}] Received HELLO from ${message.payload?.sourceNodeId || 'unknown'}`);
                    }

                    // 发送响应
                    if (message.sender) {
                        await this.context.send(message.sender, {
                            type: MessageTypes.HELLO,
                            payload: {
                                sourceNodeId: this.nodeId,
                                message: `Hello from ${this.nodeId}!`,
                                timestamp: Date.now()
                            },
                            sender: this.context.self
                        });
                        this.stats.messagesSent++;
                    }
                    return;
                }

                // 处理PING消息
                if (message.type === MessageTypes.PING) {
                    // 减少日志输出
                    if (this.nodeId === 'seed' || parseInt(this.nodeId.split('-')[1] || '0') % 10 === 0) {
                        console.log(`[Node ${this.nodeId}] Received PING from ${message.payload?.sourceNodeId || 'unknown'}`);
                    }

                    // 发送PONG响应
                    if (message.sender) {
                        await this.context.send(message.sender, {
                            type: MessageTypes.PONG,
                            payload: {
                                sourceNodeId: this.nodeId,
                                originalTimestamp: message.payload?.timestamp,
                                timestamp: Date.now()
                            },
                            sender: this.context.self
                        });
                        this.stats.messagesSent++;
                    }
                    return;
                }

                // 处理PONG消息
                if (message.type === MessageTypes.PONG) {
                    const roundtripTime = Date.now() - (message.payload?.originalTimestamp || 0);
                    // 减少日志输出
                    if (this.nodeId === 'seed' || parseInt(this.nodeId.split('-')[1] || '0') % 10 === 0) {
                        console.log(`[Node ${this.nodeId}] Received PONG from ${message.payload?.sourceNodeId || 'unknown'}, RTT: ${roundtripTime}ms`);
                    }
                    return;
                }

                // 处理DATA消息
                if (message.type === MessageTypes.DATA) {
                    // 减少日志输出
                    if (this.nodeId === 'seed' || parseInt(this.nodeId.split('-')[1] || '0') % 10 === 0) {
                        console.log(`[Node ${this.nodeId}] Received DATA from ${message.payload?.sourceNodeId || 'unknown'}`);
                    }
                    return;
                }

                // 处理STATUS请求
                if (message.type === MessageTypes.STATUS) {
                    return {
                        nodeId: this.nodeId,
                        stats: this.stats,
                        timestamp: Date.now()
                    };
                }

                // 计算处理时间
                this.stats.processingTime += (Date.now() - startTime);
            } catch (error) {
                console.error(`Error in NodeServiceActor: ${error}`);
                this.stats.errors++;
            }
        });
    }
}

/**
 * 简单的集群节点，只使用ClusterManager
 */
class SimpleClusterNode {
    private readonly _nodeId: string;
    private readonly port: number;
    private readonly address: string;
    private actorSystem!: ActorSystem;
    private clusterManager!: ClusterManager;
    private _servicePid!: PID;

    constructor(nodeId: string, port: number) {
        this._nodeId = nodeId;
        this.port = port;
        this.address = `/ip4/127.0.0.1/tcp/${port}`;
    }

    async start(): Promise<void> {
        console.log(`Starting node ${this._nodeId} on port ${this.port}...`);

        // 创建ActorSystem
        this.actorSystem = new ActorSystem();
        await this.actorSystem.start();

        // 创建ClusterManager
        const config: ClusterConfig = {
            nodeId: this._nodeId,
            heartbeatInterval: 1000, // 减少心跳间隔
            failureDetectionTimeout: 3000, // 减少超时时间
            partitionDetectionTimeout: 5000 // 减少分区检测超时
        };

        this.clusterManager = new ClusterManager(config);

        // 注册自身节点信息
        const nodeInfo: NodeInfo = {
            id: this._nodeId,
            address: this.address,
            status: NodeStatus.ACTIVE,
            lastHeartbeat: Date.now(),
            metadata: {
                region: 'test-region',
                zone: 'test-zone',
                group: this._nodeId.startsWith('worker') ? 'worker' : 'master' // 添加分组信息
            },
            capabilities: ['test'],
            load: {
                cpu: 20 + Math.floor(Math.random() * 30),
                memory: 30 + Math.floor(Math.random() * 40),
                messageRate: 100,
                actorCount: 1
            }
        };

        // 启动集群管理器
        this.clusterManager.start();

        // 注册节点
        this.clusterManager.registerNode(nodeInfo);

        // 创建服务Actor
        const serviceProps: Props = {
            producer: (context: ActorContext) => new NodeServiceActor(context)
        };

        this._servicePid = await this.actorSystem.spawn(serviceProps);

        // 初始化服务Actor
        await this.actorSystem.send(this._servicePid, {
            type: 'INIT',
            payload: {
                nodeId: this._nodeId
            }
        });

        // 注册Actor到集群
        await this.clusterManager.registerActor(`service-${this._nodeId}`, this._servicePid);

        console.log(`Node ${this._nodeId} started successfully`);
    }

    // 连接到另一个节点
    connectToNode(remoteNode: SimpleClusterNode): void {
        const remoteNodeInfo = remoteNode.getNodeInfo();
        if (remoteNodeInfo) {
            this.clusterManager.registerNode(remoteNodeInfo);
            console.log(`Node ${this._nodeId} connected to ${remoteNodeInfo.id}`);
        }
    }

    // 获取节点信息
    getNodeInfo(): NodeInfo | undefined {
        return this.clusterManager.getNodeInfo(this._nodeId);
    }

    // 获取活跃节点列表
    getActiveNodes(): NodeInfo[] {
        return this.clusterManager.getActiveNodes();
    }

    // 发送消息到另一个节点的Actor
    async sendMessage(targetNode: SimpleClusterNode, messageType: string, payload: any): Promise<void> {
        try {
            console.log(`[Node ${this._nodeId}] Sending ${messageType} to ${targetNode.nodeId}...`);

            await this.actorSystem.send(targetNode.servicePid, {
                type: messageType,
                payload: {
                    sourceNodeId: this._nodeId,
                    ...payload,
                    timestamp: Date.now()
                },
                sender: this._servicePid
            });
        } catch (error) {
            console.error(`[Node ${this._nodeId}] Failed to send message to ${targetNode.nodeId}:`, error);
        }
    }

    // 获取节点状态
    async getStatus(): Promise<any> {
        try {
            return await this.actorSystem.request(this._servicePid, {
                type: MessageTypes.STATUS
            });
        } catch (error) {
            console.error(`[Node ${this._nodeId}] Failed to get status:`, error);
            return null;
        }
    }

    // 停止节点
    async stop(): Promise<void> {
        try {
            await this.actorSystem.shutdown();
            await this.clusterManager.stop();
            console.log(`Node ${this._nodeId} stopped`);
        } catch (error) {
            console.error(`[Node ${this._nodeId}] Error during shutdown:`, error);
        }
    }

    // 获取集群管理器
    getClusterManager(): ClusterManager {
        return this.clusterManager;
    }

    // 获取属性
    get nodeId(): string {
        return this._nodeId;
    }

    get servicePid(): PID {
        return this._servicePid;
    }
}

/**
 * 并行创建多个节点以提高效率 - 增加偏移量参数
 */
async function createMultipleNodes(
    count: number,
    startPort: number,
    prefix: string = 'node',
    startIndex: number = 1
): Promise<SimpleClusterNode[]> {
    console.log(`Creating ${count} nodes (${prefix}-${startIndex} to ${prefix}-${startIndex + count - 1})...`);

    const nodes: SimpleClusterNode[] = [];
    const startTime = Date.now();

    // 并行创建节点
    const promises = [];
    for (let i = 0; i < count; i++) {
        const nodeId = `${prefix}-${startIndex + i}`;
        const node = new SimpleClusterNode(nodeId, startPort + i);
        nodes.push(node);
        promises.push(node.start().catch(error => {
            console.error(`Error starting node ${nodeId}:`, error);
            throw error;
        }));
    }

    // 等待所有节点启动完成
    await Promise.allSettled(promises);

    const duration = Date.now() - startTime;
    console.log(`${count} nodes created in ${duration}ms (avg ${Math.round(duration / count)}ms per node)`);

    return nodes;
}

/**
 * 构建可扩展的网络拓扑
 * 使用更高效的算法连接节点
 */
function buildScalableNetworkTopology(nodes: SimpleClusterNode[], connectionsPerNode: number): void {
    console.log(`Building scalable network topology with ${connectionsPerNode} connections per node...`);
    const startTime = Date.now();

    // 使用更高效的连接算法
    // 1. 确保形成环状结构（每个节点连接到下一个节点）
    // 2. 添加一些随机长距离连接以降低网络直径（小世界网络特性）

    // 部分1: 环状连接
    for (let i = 0; i < nodes.length; i++) {
        const nextIndex = (i + 1) % nodes.length;
        nodes[i].connectToNode(nodes[nextIndex]);
    }

    // 部分2: 添加随机长距离连接
    // 使用基于概率的方法，连接距离越远的节点概率越小
    // 这种方法将创建一个"小世界网络"，具有较小的平均路径长度
    for (let i = 0; i < nodes.length; i++) {
        const additionalConnections = connectionsPerNode - 1; // 减1是因为已经有环状连接
        const sourceNode = nodes[i];

        for (let c = 0; c < additionalConnections; c++) {
            // 使用幂律分布选择连接距离
            // 这会创建少量长距离连接和更多短距离连接
            const jumpSize = Math.floor(Math.pow(Math.random() * nodes.length, 0.8));
            const targetIndex = (i + jumpSize) % nodes.length;

            // 避免自连接和重复连接
            if (targetIndex !== i) {
                sourceNode.connectToNode(nodes[targetIndex]);
            }
        }
    }

    const duration = Date.now() - startTime;
    console.log(`Network topology built in ${duration}ms`);
}

/**
 * 打印集群状态统计信息
 */
function printClusterStatus(nodes: SimpleClusterNode[]): void {
    // 计算连接分布
    const connectivityStats = {
        min: Number.MAX_SAFE_INTEGER,
        max: 0,
        total: 0
    };

    for (const node of nodes) {
        const activeNodes = node.getActiveNodes().length;
        connectivityStats.min = Math.min(connectivityStats.min, activeNodes);
        connectivityStats.max = Math.max(connectivityStats.max, activeNodes);
        connectivityStats.total += activeNodes;
    }

    const avgConnectivity = Math.round(connectivityStats.total / nodes.length);

    console.log(`Cluster Status: ${nodes.length} nodes`);
    console.log(`Connectivity: min=${connectivityStats.min}, max=${connectivityStats.max}, avg=${avgConnectivity}`);

    // 只输出几个样本节点的连接详情
    const sampleSize = Math.min(5, nodes.length);
    console.log(`Sample nodes connectivity:`);

    // 选择有代表性的节点：种子节点、第一个、中间的和最后一个
    const sampleIndices = [0];
    if (nodes.length > 10) {
        sampleIndices.push(1, Math.floor(nodes.length / 2), nodes.length - 1);
    } else {
        for (let i = 1; i < Math.min(sampleSize, nodes.length); i++) {
            sampleIndices.push(i);
        }
    }

    for (const idx of sampleIndices) {
        const node = nodes[idx];
        const activeNodes = node.getActiveNodes();
        console.log(`- Node ${node.nodeId}: ${activeNodes.length} connections`);
    }
}

/**
 * 测试消息传递
 */
async function testMessagePassing(nodes: SimpleClusterNode[]): Promise<void> {
    // 计算合适的测试消息数量
    // 对于大型集群，不需要测试所有节点对
    const testPairs = Math.min(nodes.length * 2, 100);
    console.log(`Testing message passing with ${testPairs} random node pairs...`);

    // 并行发送消息以提高效率
    const batchSize = 20; // 每批次并行发送的消息数
    const batches = Math.ceil(testPairs / batchSize);

    for (let batch = 0; batch < batches; batch++) {
        const count = Math.min(batchSize, testPairs - batch * batchSize);
        const promises = [];

        for (let i = 0; i < count; i++) {
            // 随机选择源节点和目标节点
            const sourceIndex = Math.floor(Math.random() * nodes.length);
            let targetIndex;
            do {
                targetIndex = Math.floor(Math.random() * nodes.length);
            } while (targetIndex === sourceIndex);

            const sourceNode = nodes[sourceIndex];
            const targetNode = nodes[targetIndex];

            // 随机选择消息类型
            const messageType = Math.random() < 0.5 ? MessageTypes.PING : MessageTypes.DATA;

            // 发送消息
            const payload = messageType === MessageTypes.DATA ? {
                data: `Test data from ${sourceNode.nodeId} at ${new Date().toISOString()}`
            } : {};

            promises.push(sourceNode.sendMessage(targetNode, messageType, payload)
                .catch(error => {
                    console.error(`Error sending message from ${sourceNode.nodeId} to ${targetNode.nodeId}:`, error);
                }));
        }

        // 等待当前批次完成
        await Promise.all(promises);

        // 短暂暂停允许系统处理消息
        if (batch < batches - 1) {
            await sleep(50);
        }
    }

    // 等待消息处理完成
    console.log("Waiting for message processing to complete...");
    await sleep(500);
}

/**
 * 收集集群统计信息
 */
async function collectClusterStatistics(nodes: SimpleClusterNode[]): Promise<{
    totalMessagesReceived: number;
    totalMessagesSent: number;
    totalErrors: number;
    avgProcessingTime: number;
    messageTypeDistribution: Record<string, number>;
    activeNodeCount: number;
}> {
    console.log("Collecting cluster statistics...");

    const stats = {
        totalMessagesReceived: 0,
        totalMessagesSent: 0,
        totalErrors: 0,
        processingTimes: [] as number[],
        messageTypeDistribution: {} as Record<string, number>,
        activeNodeCount: 0
    };

    // 使用Promise.all收集所有节点的统计信息
    const nodeStats = await Promise.all(
        nodes.map(node => node.getStatus().catch(() => null))
    );

    // 处理结果
    for (const status of nodeStats) {
        if (status) {
            stats.totalMessagesReceived += status.stats.messagesReceived;
            stats.totalMessagesSent += status.stats.messagesSent;
            stats.totalErrors += status.stats.errors || 0;

            if (status.stats.processingTime) {
                stats.processingTimes.push(status.stats.processingTime);
            }

            // 更新消息类型分布
            for (const type in status.stats.messageTypes) {
                stats.messageTypeDistribution[type] = (stats.messageTypeDistribution[type] || 0) +
                    status.stats.messageTypes[type];
            }

            if (status.stats.messagesReceived > 0 || status.stats.messagesSent > 0) {
                stats.activeNodeCount++;
            }
        }
    }

    // 计算平均处理时间
    const avgProcessingTime = stats.processingTimes.length > 0 ?
        stats.processingTimes.reduce((sum, time) => sum + time, 0) / stats.processingTimes.length : 0;

    // 输出统计信息
    console.log(`Statistics Summary:`);
    console.log(`- Active nodes: ${stats.activeNodeCount}/${nodes.length}`);
    console.log(`- Total messages received: ${stats.totalMessagesReceived}`);
    console.log(`- Total messages sent: ${stats.totalMessagesSent}`);
    console.log(`- Average processing time: ${avgProcessingTime.toFixed(2)}ms`);
    console.log(`- Errors: ${stats.totalErrors}`);

    // 输出消息类型分布
    console.log("Message type distribution:");
    for (const type in stats.messageTypeDistribution) {
        console.log(`- ${type}: ${stats.messageTypeDistribution[type]}`);
    }

    return {
        ...stats,
        avgProcessingTime
    };
}

/**
 * 测试集群的可扩展性
 * 添加/移除节点并观察集群行为
 */
async function testClusterScalability(nodes: SimpleClusterNode[]): Promise<void> {
    if (nodes.length < 10) return;

    console.log("Testing cluster scalability...");

    // 1. 移除一部分节点
    const nodesToRemove = Math.min(5, Math.floor(nodes.length * 0.1));
    console.log(`Removing ${nodesToRemove} nodes from the cluster...`);

    for (let i = 0; i < nodesToRemove; i++) {
        // 选择非种子节点移除
        const removeIndex = nodes.length - 1 - i;
        const nodeToRemove = nodes[removeIndex];

        console.log(`Node ${nodeToRemove.nodeId} is leaving...`);

        // 通知其他节点这个节点正在离开
        for (let j = 0; j < removeIndex; j++) {
            const nodeInfo = nodeToRemove.getNodeInfo();
            if (nodeInfo) {
                nodeInfo.status = NodeStatus.LEAVING;
                nodes[j].getClusterManager().handleNodeStatus(nodeToRemove.nodeId, NodeStatus.LEAVING);
            }
        }

        // 停止节点
        await nodeToRemove.stop();

        // 更新其他节点中的状态为DEAD
        for (let j = 0; j < removeIndex; j++) {
            nodes[j].getClusterManager().handleNodeStatus(nodeToRemove.nodeId, NodeStatus.DEAD);
        }

        // 从活跃节点列表中移除
        nodes.splice(removeIndex, 1);
    }

    // 等待状态传播
    await sleep(300);

    // 2. 添加新节点
    const newNodesCount = nodesToRemove;
    console.log(`Adding ${newNodesCount} new nodes to the cluster...`);

    const newStartPort = BASE_PORT + nodes.length + 10;
    const newNodes = await createMultipleNodes(
        newNodesCount,
        newStartPort,
        'new',
        1
    );

    // 连接新节点到现有集群
    for (const newNode of newNodes) {
        // 连接到种子节点和几个随机选择的节点
        newNode.connectToNode(nodes[0]); // 种子节点

        // 添加2个随机连接
        for (let i = 0; i < 2; i++) {
            const randomIndex = 1 + Math.floor(Math.random() * (nodes.length - 1));
            newNode.connectToNode(nodes[randomIndex]);
            nodes[randomIndex].connectToNode(newNode);
        }

        // 添加到节点列表
        nodes.push(newNode);
    }

    // 等待状态传播
    await sleep(300);

    // 3. 检查集群状态
    console.log("\nCluster status after scalability test:");
    printClusterStatus(nodes);

    // 4. 测试消息通信
    console.log("\nTesting communication with new nodes...");

    // 从新节点发送消息到原始节点
    const promises = [];
    for (let i = 0; i < newNodesCount; i++) {
        const sourceNode = nodes[nodes.length - 1 - i]; // 新添加的节点
        const targetIndex = Math.floor(Math.random() * (nodes.length - newNodesCount)); // 原始节点

        promises.push(sourceNode.sendMessage(nodes[targetIndex], MessageTypes.PING, {}));
    }

    await Promise.all(promises);

    // 等待消息处理完成
    await sleep(300);
}

/**
 * 运行大规模集群测试
 */
async function runLargeScaleClusterExample(): Promise<void> {
    console.log("========================================");
    console.log(`Starting Large Scale Cluster Test (${NODES_COUNT} nodes)`);
    console.log("========================================");

    // 性能测量
    const startTime = Date.now();
    const metrics = {
        initTime: 0,
        networkBuildTime: 0,
        messagingTime: 0,
        cleanupTime: 0,
        messagesProcessed: 0,
        errors: 0
    };

    const nodes: SimpleClusterNode[] = [];

    try {
        console.log("Phase 1: Node Creation and Initialization");
        const initStart = Date.now();

        // 创建种子节点
        console.log("Creating seed node...");
        const seedNode = new SimpleClusterNode('seed', BASE_PORT);
        await seedNode.start();
        nodes.push(seedNode);

        // 创建多批worker节点以避免资源耗尽
        const batchSize = 10; // 每批创建的节点数量
        const batches = Math.ceil((NODES_COUNT - 1) / batchSize);

        for (let batch = 0; batch < batches; batch++) {
            const count = Math.min(batchSize, NODES_COUNT - 1 - batch * batchSize);
            console.log(`Creating batch ${batch + 1}/${batches} (${count} nodes)...`);

            const startIndex = batch * batchSize + 1;
            const batchNodes = await createMultipleNodes(
                count,
                BASE_PORT + startIndex,
                'worker',
                startIndex
            );

            nodes.push(...batchNodes);

            // 简单连接到种子节点
            for (const node of batchNodes) {
                node.connectToNode(seedNode);
                // 减少连接双向性以优化性能
                if (Math.random() < 0.5) {
                    seedNode.connectToNode(node);
                }
            }

            // 允许系统喘息
            if (batch < batches - 1) {
                await sleep(100);
            }
        }

        metrics.initTime = Date.now() - initStart;
        console.log(`Node initialization completed in ${metrics.initTime}ms`);

        // 构建优化的网络拓扑
        console.log("\nPhase 2: Building Network Topology");
        const networkStart = Date.now();

        // 计算最佳连接数
        const connectionsPerNode = getOptimalConnectionsPerNode(nodes.length);
        console.log(`Using ${connectionsPerNode} connections per node for ${nodes.length} nodes`);

        // 使用优化版本的网络构建算法
        buildScalableNetworkTopology(nodes, connectionsPerNode);

        metrics.networkBuildTime = Date.now() - networkStart;
        console.log(`Network topology built in ${metrics.networkBuildTime}ms`);

        // 打印集群状态
        console.log("\nPhase 3: Cluster Status");
        printClusterStatus(nodes);

        // 测试消息传递
        console.log("\nPhase 4: Message Passing Test");
        const messagingStart = Date.now();

        // 更高效的消息测试 - 更多并行性
        await testMessagePassing(nodes);

        metrics.messagingTime = Date.now() - messagingStart;
        console.log(`Message passing tests completed in ${metrics.messagingTime}ms`);

        // 获取统计信息
        console.log("\nPhase 5: Performance Statistics");
        const stats = await collectClusterStatistics(nodes);
        metrics.messagesProcessed = stats.totalMessagesReceived + stats.totalMessagesSent;
        metrics.errors = stats.totalErrors;

        // 验证可扩展性
        console.log("\nPhase 6: Scalability Test");
        await testClusterScalability(nodes);

    } catch (error) {
        console.error("Error in cluster example:", error);
        metrics.errors++;
    } finally {
        // 关闭所有节点
        console.log("\nPhase 7: Cluster Shutdown");
        const cleanupStart = Date.now();

        // 分批关闭节点以避免资源争用
        const shutdownBatchSize = 10;
        const shutdownBatches = Math.ceil(nodes.length / shutdownBatchSize);

        for (let i = 0; i < shutdownBatches; i++) {
            const start = i * shutdownBatchSize;
            const end = Math.min(start + shutdownBatchSize, nodes.length);

            console.log(`Shutting down nodes ${start + 1} to ${end} (batch ${i + 1}/${shutdownBatches})...`);

            const shutdownPromises = [];
            for (let j = start; j < end; j++) {
                shutdownPromises.push(nodes[j].stop().catch(err => {
                    console.error(`Error stopping node ${nodes[j].nodeId}:`, err);
                    metrics.errors++;
                }));
            }

            await Promise.all(shutdownPromises);
        }

        metrics.cleanupTime = Date.now() - cleanupStart;
    }

    // 计算总时间和性能指标
    const totalDuration = Date.now() - startTime;
    const messagesPerSecond = metrics.messagesProcessed > 0 ?
        Math.floor((metrics.messagesProcessed * 1000) / metrics.messagingTime) : 0;

    console.log("\n========================================");
    console.log(`Large Scale Cluster Test Completed (${NODES_COUNT} nodes)`);
    console.log("========================================");
    console.log("Performance Metrics:");
    console.log(`- Total duration: ${totalDuration}ms`);
    console.log(`- Initialization: ${metrics.initTime}ms`);
    console.log(`- Network building: ${metrics.networkBuildTime}ms`);
    console.log(`- Message passing: ${metrics.messagingTime}ms`);
    console.log(`- Cleanup: ${metrics.cleanupTime}ms`);
    console.log(`- Messages processed: ${metrics.messagesProcessed}`);
    console.log(`- Throughput: ${messagesPerSecond} messages/second`);
    console.log(`- Errors: ${metrics.errors}`);
    console.log("========================================");
}

// 导出增强版的测试函数
export { runLargeScaleClusterExample };

// 如果直接运行此文件，则执行示例
if (require.main === module) {
    runLargeScaleClusterExample().catch(error => {
        console.error("Fatal error:", error);
        process.exit(1);
    });
} 