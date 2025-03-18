/**
 * 大型集群示例 - 模拟100个节点的actor集群通信
 * 
 * 此示例展示了如何创建一个具有100个节点的虚拟集群，并在这些节点之间进行actor通信。
 * 每个节点将运行一组actor，这些actor可以相互通信，模拟一个大型分布式系统。
 */

import { Message, Props } from '../core/types';
import { ActorContext } from '../core/context';
import { Actor } from '../core/actor';
import { ActorSystem } from '../core/system';
import { ClusterManager, NodeInfo, NodeStatus, ClusterConfig, ClusterState, NodeLoad, ActorInfo, ClusterEventType } from '@bactor/cluster';
import { v4 as uuid } from 'uuid';
import { setTimeout as sleep } from 'node:timers/promises';

// 节点数量
const NODE_COUNT = 100;
// 每个节点上的actor数量
const ACTORS_PER_NODE = 5;
// 每个actor发送的消息数量
const MESSAGES_PER_ACTOR = 10;

// 模拟事件类型
const EventTypes: Record<string, string> = {
    SENSOR_DATA: 'SENSOR_DATA',
    CONTROL_COMMAND: 'CONTROL_COMMAND',
    STATUS_UPDATE: 'STATUS_UPDATE',
    ERROR_REPORT: 'ERROR_REPORT',
    COORDINATION: 'COORDINATION'
};

// 模拟系统区域
const Regions = ['us-east', 'us-west', 'eu-west', 'eu-central', 'ap-northeast', 'ap-southeast'];

// 模拟资源类型
const ResourceTypes = ['compute', 'storage', 'network', 'database', 'cache'];

// 服务类型
const ServiceTypes = ['auth', 'user', 'transaction', 'analytics', 'monitoring', 'storage', 'processing'];

// 创建一个虚拟节点
function createVirtualNode(id: number): NodeInfo {
    const region = Regions[id % Regions.length];
    const resourceType = ResourceTypes[id % ResourceTypes.length];

    return {
        id: `node-${id}`,
        address: `virtual-${region}-${id}.example.com`,
        status: NodeStatus.ACTIVE,
        lastHeartbeat: Date.now(),
        metadata: {
            region,
            zone: `${region}-${Math.floor(id / 10) + 1}`,
            resourceType
        },
        capabilities: [resourceType],
        load: {
            cpu: 20 + (id % 50), // 20-70%
            memory: 30 + (id % 40), // 30-70%
            messageRate: 100 * (1 + (id % 10)),
            actorCount: ACTORS_PER_NODE
        }
    };
}

// 服务actor实现
class ServiceActor extends Actor {
    private serviceType: string = '';
    private nodeId: string = '';
    private stats: {
        messagesReceived: number;
        messagesSent: number;
        lastMessageTime: number;
    } = {
            messagesReceived: 0,
            messagesSent: 0,
            lastMessageTime: 0
        };

    constructor(context: ActorContext) {
        super(context);
    }

    protected behaviors(): void {
        this.addBehavior('default', async (message: Message) => {
            // 初始化消息
            if (message.type === 'INIT') {
                this.serviceType = message.payload.serviceType;
                this.nodeId = message.payload.nodeId;
                console.log(`[${this.nodeId}] ${this.serviceType} service initialized at ${this.context.self.id}`);
                return;
            }

            // 处理常规消息
            if (Object.values(EventTypes).includes(message.type)) {
                this.stats.messagesReceived++;
                this.stats.lastMessageTime = Date.now();

                // 模拟处理延迟
                const processingTime = 1 + Math.random() * 5;
                await sleep(processingTime);

                // 记录接收到的消息
                if (this.stats.messagesReceived % 50 === 0) {
                    console.log(`[${this.nodeId}] ${this.serviceType} received ${this.stats.messagesReceived} messages`);
                }

                // 有时返回响应
                if (Math.random() > 0.7) {
                    const response = {
                        type: 'RESPONSE',
                        payload: {
                            originalType: message.type,
                            result: `Processed ${message.type} from ${message.sender?.id}`,
                            timestamp: Date.now()
                        }
                    };
                    if (message.sender) {
                        this.context.send(message.sender, response);
                        this.stats.messagesSent++;
                    }
                }
            }

            // 获取统计信息
            if (message.type === 'GET_STATS') {
                if (message.sender) {
                    this.context.send(message.sender, {
                        type: 'STATS_RESULT',
                        payload: {
                            ...this.stats,
                            serviceType: this.serviceType,
                            nodeId: this.nodeId,
                            pid: this.context.self
                        }
                    });
                }
            }
        });
    }
}

// 集群协调器actor
class ClusterCoordinatorActor extends Actor {
    private clusterManagers: Map<string, ClusterManager> = new Map();
    private nodeMap: Map<string, NodeInfo> = new Map();
    private actorPids: Map<string, any> = new Map();
    private startTime: number = Date.now();
    private messageStats: {
        sent: number;
        successful: number;
        failed: number;
    } = {
            sent: 0,
            successful: 0,
            failed: 0
        };

    constructor(context: ActorContext) {
        super(context);
    }

    protected behaviors(): void {
        this.addBehavior('default', async (message: Message) => {
            if (message.type === 'SETUP_CLUSTER') {
                await this.setupCluster();
                return;
            }

            if (message.type === 'START_COMMUNICATION') {
                await this.startCommunication();
                return;
            }

            if (message.type === 'GET_CLUSTER_STATS') {
                this.getClusterStats();
                return;
            }

            if (message.type === 'SIMULATE_NODE_FAILURES') {
                await this.simulateNodeFailures(message.payload.count || 5);
                return;
            }

            if (message.type === 'STATS_RESULT') {
                // 响应统计信息收集
                const stats = message.payload;
                if (stats.successful) {
                    this.messageStats.successful += stats.successful;
                }
                if (stats.failed) {
                    this.messageStats.failed += stats.failed;
                }
            }
        });
    }

    private async setupCluster(): Promise<void> {
        console.log(`Setting up virtual cluster with ${NODE_COUNT} nodes...`);

        // 为每个节点创建一个集群管理器
        for (let i = 1; i <= NODE_COUNT; i++) {
            const nodeId = `node-${i}`;
            const config: ClusterConfig = {
                nodeId,
                heartbeatInterval: 1000,
                failureDetectionTimeout: 3000,
                partitionDetectionTimeout: 6000
            };

            const clusterManager = new ClusterManager(config);
            this.clusterManagers.set(nodeId, clusterManager);

            // 创建并注册节点信息
            const nodeInfo = createVirtualNode(i);
            this.nodeMap.set(nodeId, nodeInfo);

            // 启动集群管理器
            clusterManager.start();

            // 注册所有其他节点
            for (const [otherNodeId, otherNodeInfo] of this.nodeMap.entries()) {
                if (otherNodeId !== nodeId) {
                    clusterManager.registerNode(otherNodeInfo);
                }
            }

            // 显示进度
            if (i % 10 === 0) {
                console.log(`Created ${i} cluster managers`);
            }
        }

        console.log('All cluster managers created and connected.');

        // 等待所有节点注册完成
        await sleep(500);

        // 检查每个集群管理器中的节点数量
        const firstManager = this.clusterManagers.get('node-1');
        if (firstManager) {
            const nodesInFirstManager = firstManager.getAllNodes().length;
            console.log(`Node-1 sees ${nodesInFirstManager} nodes in the cluster`);

            // 验证每个集群管理器看到的节点数量
            let allConsistent = true;
            for (const [nodeId, manager] of this.clusterManagers.entries()) {
                const nodesCount = manager.getAllNodes().length;
                if (nodesCount !== NODE_COUNT) {
                    console.log(`Node ${nodeId} only sees ${nodesCount} nodes (expected ${NODE_COUNT})`);
                    allConsistent = false;
                }
            }

            if (allConsistent) {
                console.log('All cluster managers have a consistent view of the cluster');
            }
        }

        if (this.context.sender) {
            this.context.send(this.context.sender, { type: 'CLUSTER_SETUP_COMPLETE' });
        }
    }

    private async startCommunication(): Promise<void> {
        const system = this.context.system;
        console.log('Creating service actors on each node...');

        // 在每个节点上创建服务actor
        let actorCount = 0;
        for (let nodeId of this.nodeMap.keys()) {
            for (let i = 0; i < ACTORS_PER_NODE; i++) {
                const serviceType = ServiceTypes[i % ServiceTypes.length];
                const actorName = `${serviceType}-service-${uuid().substring(0, 8)}`;

                // 创建actor
                const serviceProps: Props = {
                    producer: (context: ActorContext) => new ServiceActor(context)
                };

                const actorPid = await system.spawn(serviceProps, actorName);

                // 初始化actor
                await system.send(actorPid, {
                    type: 'INIT',
                    payload: {
                        serviceType,
                        nodeId
                    }
                });

                // 存储actor引用
                this.actorPids.set(actorName, actorPid);

                // 在集群管理器中注册actor
                const manager = this.clusterManagers.get(nodeId);
                if (manager) {
                    await manager.registerActor(actorName, actorPid);
                }

                actorCount++;
            }
        }

        console.log(`Created ${actorCount} service actors across ${NODE_COUNT} nodes`);

        // 开始在actor之间发送消息
        console.log('Starting inter-actor communication...');

        const allActors = Array.from(this.actorPids.entries());

        // 每个actor向其他随机actor发送消息
        for (const [actorName, actorPid] of allActors) {
            for (let i = 0; i < MESSAGES_PER_ACTOR; i++) {
                // 随机选择目标actor
                const targetIndex = Math.floor(Math.random() * allActors.length);
                const [targetName, targetPid] = allActors[targetIndex];

                if (targetName !== actorName) {
                    // 随机选择消息类型
                    const eventTypeKeys = Object.keys(EventTypes);
                    const eventType = EventTypes[eventTypeKeys[Math.floor(Math.random() * eventTypeKeys.length)]];

                    // 发送消息
                    const message = {
                        type: eventType,
                        payload: {
                            timestamp: Date.now(),
                            sender: actorName,
                            data: `Message ${i} from ${actorName} to ${targetName}`,
                            value: Math.random() * 100
                        }
                    };

                    try {
                        await system.send(targetPid, message);
                        this.messageStats.sent++;
                    } catch (err) {
                        console.error(`Failed to send message from ${actorName} to ${targetName}:`, err);
                    }
                }
            }
        }

        // 等待所有消息处理完成
        console.log('Waiting for messages to be processed...');
        await sleep(5000);

        if (this.context.sender) {
            this.context.send(this.context.sender, {
                type: 'COMMUNICATION_COMPLETE',
                payload: {
                    actorCount,
                    messagesSent: this.messageStats.sent
                }
            });
        }
    }

    private async simulateNodeFailures(failureCount: number): Promise<void> {
        console.log(`Simulating ${failureCount} node failures...`);

        // 随机选择节点进行模拟故障
        const nodeIds = Array.from(this.nodeMap.keys());
        const shuffledNodes = nodeIds.sort(() => Math.random() - 0.5);
        const nodesToFail = shuffledNodes.slice(0, failureCount);

        for (let i = 0; i < nodesToFail.length; i++) {
            const nodeId = nodesToFail[i];
            console.log(`Simulating failure for node ${nodeId}`);

            // 通知所有其他节点此节点已失败
            for (const [otherNodeId, manager] of this.clusterManagers.entries()) {
                if (otherNodeId !== nodeId) {
                    const nodeInfo = this.nodeMap.get(nodeId);
                    if (nodeInfo) {
                        nodeInfo.status = NodeStatus.SUSPECTED;
                        await manager.handleNodeStatus(nodeId, NodeStatus.SUSPECTED);

                        // 等待一段时间后将节点标记为死亡
                        await sleep(200);
                        nodeInfo.status = NodeStatus.DEAD;
                        await manager.handleNodeStatus(nodeId, NodeStatus.DEAD);
                    }
                }
            }

            // 获取该节点上的actor
            const actorsOnNode = Array.from(this.actorPids.entries())
                .filter(([actorName, _]) => {
                    const manager = this.clusterManagers.get(nodeId);
                    if (!manager) return false;

                    // 检查这个actor是否在失败的节点上
                    const actorInfo = manager.getActorInfo({ id: actorName, address: nodeId });
                    return actorInfo && actorInfo.nodeId === nodeId;
                });

            console.log(`Node ${nodeId} had ${actorsOnNode.length} actors`);

            // 在其他节点上重新创建这些actor（模拟迁移）
            const availableNodes = nodeIds.filter(id => !nodesToFail.includes(id));

            if (availableNodes.length > 0) {
                for (const [actorName, actorPid] of actorsOnNode) {
                    // 为迁移选择一个随机节点
                    const targetNodeId = availableNodes[Math.floor(Math.random() * availableNodes.length)];
                    console.log(`Migrating actor ${actorName} from ${nodeId} to ${targetNodeId}`);

                    // 更新actor在集群中的位置
                    const targetManager = this.clusterManagers.get(targetNodeId);
                    if (targetManager) {
                        await targetManager.registerActor(actorName, actorPid);
                    }
                }
            }
        }

        // 检查集群状态
        await sleep(1000);
        const metrics = [];
        for (const [nodeId, manager] of this.clusterManagers.entries()) {
            if (!nodesToFail.includes(nodeId)) {
                const nodeMetrics = manager.getMetrics();
                metrics.push({
                    nodeId,
                    activeNodes: nodeMetrics.activeNodes,
                    suspectedNodes: nodeMetrics.suspectedNodes,
                    deadNodes: nodeMetrics.deadNodes
                });
            }
        }

        console.log('Cluster state after failures:');
        console.log(metrics[0]);

        if (this.context.sender) {
            this.context.send(this.context.sender, {
                type: 'FAILURE_SIMULATION_COMPLETE',
                payload: {
                    failedNodes: nodesToFail,
                    metrics
                }
            });
        }
    }

    private getClusterStats(): void {
        const runningTime = (Date.now() - this.startTime) / 1000;

        // 收集所有节点的负载信息
        const nodeLoads: Record<string, NodeLoad> = {};
        for (const [nodeId, manager] of this.clusterManagers.entries()) {
            const load = manager.getNodeLoad(nodeId);
            if (load) {
                nodeLoads[nodeId] = load;
            }
        }

        // 计算平均负载
        const avgCpu = Object.values(nodeLoads).reduce((sum, load) => sum + load.cpu, 0) / Object.keys(nodeLoads).length;
        const avgMemory = Object.values(nodeLoads).reduce((sum, load) => sum + load.memory, 0) / Object.keys(nodeLoads).length;
        const avgMessageRate = Object.values(nodeLoads).reduce((sum, load) => sum + load.messageRate, 0) / Object.keys(nodeLoads).length;

        // 收集actor统计
        const actorCount = this.actorPids.size;
        const totalMessages = this.messageStats.sent;
        const messagesPerSec = totalMessages / runningTime;

        const stats = {
            clusterSize: this.nodeMap.size,
            activeNodes: Array.from(this.nodeMap.values()).filter(n => n.status === NodeStatus.ACTIVE).length,
            suspectedNodes: Array.from(this.nodeMap.values()).filter(n => n.status === NodeStatus.SUSPECTED).length,
            deadNodes: Array.from(this.nodeMap.values()).filter(n => n.status === NodeStatus.DEAD).length,
            avgLoad: {
                cpu: avgCpu.toFixed(2),
                memory: avgMemory.toFixed(2),
                messageRate: avgMessageRate.toFixed(2)
            },
            actorCount,
            messageStats: this.messageStats,
            messagesPerSec: messagesPerSec.toFixed(2),
            runningTime: runningTime.toFixed(2)
        };

        console.log('Cluster Statistics:');
        console.log(JSON.stringify(stats, null, 2));

        if (this.context.sender) {
            this.context.send(this.context.sender, { type: 'CLUSTER_STATS', payload: stats });
        }
    }
}

// 自定义事件流处理
class CustomEventStream {
    private subscribers: Map<string, ((data: any) => void)[]> = new Map();

    subscribe(event: string, callback: (data: any) => void) {
        if (!this.subscribers.has(event)) {
            this.subscribers.set(event, []);
        }
        this.subscribers.get(event)?.push(callback);
    }

    publish(event: string, data: any = {}) {
        if (this.subscribers.has(event)) {
            for (const callback of this.subscribers.get(event) || []) {
                callback(data);
            }
        }
    }
}

// 主函数来运行示例
async function runLargeClusterExample() {
    console.log('Starting Large Cluster Example');
    console.log(`Configuring a virtual cluster with ${NODE_COUNT} nodes and ${ACTORS_PER_NODE} actors per node`);

    // 创建actor系统
    const system = new ActorSystem();
    await system.start();

    // 添加自定义事件流
    const eventStream = new CustomEventStream();

    // 创建集群协调器
    const coordinatorProps: Props = {
        producer: (context: ActorContext) => new ClusterCoordinatorActor(context)
    };

    const coordinatorPid = await system.spawn(coordinatorProps, 'cluster-coordinator');

    console.log('Setting up the cluster...');

    // 设置集群
    await system.send(coordinatorPid, { type: 'SETUP_CLUSTER' });

    // 等待集群设置完成
    await new Promise<void>(resolve => {
        // 模拟消息接收
        setTimeout(() => {
            eventStream.publish('CLUSTER_SETUP_COMPLETE');
            resolve();
        }, 3000);
    });

    console.log('Cluster setup completed');

    // 开始通信
    console.log('Starting inter-node communication...');
    await system.send(coordinatorPid, { type: 'START_COMMUNICATION' });

    // 等待通信完成
    await new Promise<void>(resolve => {
        // 模拟消息接收
        setTimeout(() => {
            eventStream.publish('COMMUNICATION_COMPLETE', {
                actorCount: NODE_COUNT * ACTORS_PER_NODE,
                messagesSent: NODE_COUNT * ACTORS_PER_NODE * MESSAGES_PER_ACTOR
            });
            resolve();
        }, 10000);
    });

    console.log(`Communication completed: ${NODE_COUNT * ACTORS_PER_NODE} actors sent approximately ${NODE_COUNT * ACTORS_PER_NODE * MESSAGES_PER_ACTOR} messages`);

    // 获取统计信息
    console.log('Collecting cluster statistics...');
    await system.send(coordinatorPid, { type: 'GET_CLUSTER_STATS' });

    // 模拟一些节点故障
    console.log('Simulating node failures...');
    await system.send(coordinatorPid, { type: 'SIMULATE_NODE_FAILURES', payload: { count: 10 } });

    // 等待故障模拟完成
    await new Promise<void>(resolve => {
        // 模拟消息接收
        setTimeout(() => {
            eventStream.publish('FAILURE_SIMULATION_COMPLETE');
            resolve();
        }, 5000);
    });

    console.log('Failure simulation completed');

    // 再次获取统计信息，看看故障后的影响
    console.log('Collecting post-failure statistics...');
    await system.send(coordinatorPid, { type: 'GET_CLUSTER_STATS' });

    // 等待最终的统计数据
    await sleep(1000);

    console.log('Example completed. Shutting down the actor system...');

    // 关闭actor系统
    await system.stop();
}

// 如果这个文件被直接运行（而不是导入），则运行示例
if (require.main === module) {
    runLargeClusterExample().catch(err => {
        console.error('Error running large cluster example:', err);
        process.exit(1);
    });
}

export { runLargeClusterExample }; 