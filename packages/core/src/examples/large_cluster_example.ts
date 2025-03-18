/**
 * 大型集群示例 - 模拟100个节点的actor集群通信
 * 
 * 此示例展示了如何创建一个具有100个节点的虚拟集群，并在这些节点之间进行actor通信。
 * 每个节点将运行一组actor，这些actor可以相互通信，模拟一个大型分布式系统。
 * 
 * 注意：这是一个简化的模拟，使用NODE_ENV=test来避免实际的网络传输
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
    ClusterState,
    NodeLoad,
    ActorInfo,
    ClusterEventType
} from '@bactor/cluster';
import { v4 as uuid } from 'uuid';
import { setTimeout as sleep } from 'node:timers/promises';

// 节点数量 - 减少数量以便测试
const NODE_COUNT = 10;
// 每个节点上的actor数量
const ACTORS_PER_NODE = 3;
// 每个actor发送的消息数量
const MESSAGES_PER_ACTOR = 5;

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
            try {
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

                    // 模拟处理延迟 - 减少延迟以加快测试
                    const processingTime = 1 + Math.random() * 2;
                    await sleep(processingTime);

                    // 记录接收到的消息
                    if (this.stats.messagesReceived % 10 === 0) {
                        console.log(`[${this.nodeId}] ${this.serviceType} service has received ${this.stats.messagesReceived} messages`);
                    }

                    // 有50%的概率回复消息
                    if (Math.random() > 0.5 && message.sender) {
                        const response: Message = {
                            type: 'RESPONSE',
                            payload: {
                                originalType: message.type,
                                serviceType: this.serviceType,
                                nodeId: this.nodeId,
                                timestamp: Date.now(),
                                processingTime
                            },
                            sender: this.context.self
                        };

                        await this.context.send(message.sender, response);
                        this.stats.messagesSent++;
                    }

                    return {
                        receivedAt: Date.now(),
                        nodeId: this.nodeId,
                        serviceType: this.serviceType
                    };
                }

                // 处理响应消息
                if (message.type === 'RESPONSE') {
                    this.stats.messagesReceived++;
                    return;
                }

                // 处理获取统计信息的消息
                if (message.type === 'GET_STATS') {
                    return {
                        ...this.stats,
                        nodeId: this.nodeId,
                        serviceType: this.serviceType,
                        pid: this.context.self
                    };
                }
            } catch (error) {
                console.error(`Error in ServiceActor: ${error}`);
                throw error;
            }
        });
    }
}

// 集群协调器actor - 负责管理虚拟集群
class ClusterCoordinatorActor extends Actor {
    private clusterManagers: Map<string, ClusterManager> = new Map();
    private nodeMap: Map<string, NodeInfo> = new Map();
    private actorPids: Map<string, PID> = new Map();
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
            try {
                if (message.type === 'START') {
                    console.log('Starting cluster simulation...');
                    await this.setupCluster();
                    await this.startCommunication();
                    return;
                }

                if (message.type === 'SIMULATE_FAILURES') {
                    const count = message.payload?.count || 3;
                    await this.simulateNodeFailures(count);
                    return;
                }

                if (message.type === 'GET_STATS') {
                    this.getClusterStats();
                    return;
                }
            } catch (error) {
                console.error(`Error in ClusterCoordinatorActor: ${error}`);
                throw error;
            }
        });
    }

    private async setupCluster(): Promise<void> {
        console.log(`Setting up virtual cluster with ${NODE_COUNT} nodes...`);
        const system = new ActorSystem();
        await system.start();

        // 使用测试模式以避免实际网络传输
        process.env.NODE_ENV = 'test';

        // 创建虚拟节点
        for (let i = 0; i < NODE_COUNT; i++) {
            const nodeInfo = createVirtualNode(i);
            this.nodeMap.set(nodeInfo.id, nodeInfo);

            try {
                // 为每个节点创建一个ClusterManager
                const config: ClusterConfig = {
                    nodeId: nodeInfo.id,
                    heartbeatInterval: 1000,
                    failureDetectionTimeout: 3000,
                    partitionDetectionTimeout: 5000,
                    bootstrapList: [],
                    listenAddresses: [nodeInfo.address],
                    enableDHT: false,
                    enablePubSub: true,
                    enableGossip: true
                };

                // 创建ClusterManager
                const clusterManager = new ClusterManager(config);

                // 保存ClusterManager引用
                this.clusterManagers.set(nodeInfo.id, clusterManager);

                // 启动ClusterManager
                clusterManager.start();

                // 确保节点已正确注册到自己的ClusterManager中
                if (!clusterManager.getNodeInfo(nodeInfo.id)) {
                    clusterManager.registerNode(nodeInfo);
                }

                // 在每个节点上创建services actor
                for (let j = 0; j < ACTORS_PER_NODE; j++) {
                    const serviceType = ServiceTypes[j % ServiceTypes.length];
                    const actorName = `${serviceType}-${nodeInfo.id}-${j}`;

                    const serviceProps: Props = {
                        producer: (context: ActorContext) => new ServiceActor(context)
                    };

                    const actorPid = await system.spawn(serviceProps);

                    // 初始化service actor
                    const initMessage: Message = {
                        type: 'INIT',
                        payload: {
                            serviceType,
                            nodeId: nodeInfo.id
                        },
                        sender: this.context.self
                    };

                    await system.send(actorPid, initMessage);

                    try {
                        // 向ClusterManager注册actor
                        await clusterManager.registerActor(actorName, actorPid);

                        // 保存actor PID引用以便后续发送消息
                        this.actorPids.set(actorName, actorPid);
                    } catch (error) {
                        console.warn(`Failed to register actor ${actorName}: ${error}`);
                    }
                }
            } catch (error) {
                console.error(`Error setting up node ${nodeInfo.id}: ${error}`);
                // 继续处理其他节点
            }
        }

        // 让所有节点互相了解
        try {
            for (const [nodeId, manager] of this.clusterManagers.entries()) {
                // 向每个节点注册所有其他节点
                for (const [otherNodeId, otherNodeInfo] of this.nodeMap.entries()) {
                    if (otherNodeId !== nodeId) {
                        try {
                            manager.registerNode(otherNodeInfo);
                        } catch (error) {
                            console.warn(`Failed to register node ${otherNodeId} to ${nodeId}: ${error}`);
                        }
                    }
                }
            }
        } catch (error) {
            console.error(`Error during node cross-registration: ${error}`);
        }

        console.log(`Cluster setup complete. Created ${NODE_COUNT} nodes with ${this.actorPids.size} services.`);
    }

    private async startCommunication(): Promise<void> {
        console.log('Starting inter-node communication...');

        const start = Date.now();
        const promises: Promise<any>[] = [];

        // 获取所有actor的列表
        const allActors = Array.from(this.actorPids.entries());
        const totalMessages = allActors.length * MESSAGES_PER_ACTOR;

        console.log(`Planning to send ${totalMessages} messages between ${allActors.length} actors...`);

        for (const [actorName, senderPid] of allActors) {
            // 为每个actor发送多条消息
            for (let i = 0; i < MESSAGES_PER_ACTOR; i++) {
                // 随机选择一个目标actor
                const randomIndex = Math.floor(Math.random() * allActors.length);
                const [targetActorName, receiverPid] = allActors[randomIndex];

                // 不要发送给自己
                if (actorName === targetActorName) continue;

                // 随机选择一个消息类型
                const eventTypes = Object.values(EventTypes);
                const messageType = eventTypes[Math.floor(Math.random() * eventTypes.length)];

                // 准备消息
                const message: Message = {
                    type: messageType,
                    payload: {
                        data: `Message ${i} from ${actorName} to ${targetActorName}`,
                        timestamp: Date.now(),
                        sourceNode: actorName.split('-')[1] // 提取nodeId
                    },
                    sender: senderPid
                };

                // 发送消息
                promises.push((async () => {
                    this.messageStats.sent++;
                    try {
                        await this.context.send(receiverPid, message);
                        this.messageStats.successful++;
                    } catch (error) {
                        this.messageStats.failed++;
                        console.error(`Failed to send message from ${actorName} to ${targetActorName}:`, error);
                    }
                })());

                // 添加一些随机延迟，避免同时发送所有消息
                if (Math.random() > 0.8) {
                    await sleep(Math.random() * 2);
                }
            }
        }

        // 等待所有消息发送完成
        try {
            await Promise.all(promises);

            const duration = (Date.now() - start) / 1000;
            console.log(`Communication complete. Sent ${this.messageStats.successful} messages (${(this.messageStats.successful / duration).toFixed(2)} msgs/sec)`);
            console.log(`Success rate: ${((this.messageStats.successful / this.messageStats.sent) * 100).toFixed(2)}%`);
        } catch (error) {
            console.error(`Error during communication: ${error}`);
        }
    }

    private async simulateNodeFailures(failureCount: number): Promise<void> {
        console.log(`Simulating ${failureCount} node failures...`);

        // 获取所有节点
        const allNodes = Array.from(this.nodeMap.entries())
            .filter(([_, nodeInfo]) => nodeInfo.status === NodeStatus.ACTIVE)
            .map(([nodeId, _]) => nodeId);

        if (allNodes.length === 0) {
            console.log('No active nodes to fail');
            return;
        }

        // 限制故障数量，确保不超过可用节点数
        const actualFailureCount = Math.min(failureCount, allNodes.length);

        // 随机选择几个节点进行故障模拟
        const nodesToFail = [];
        for (let i = 0; i < actualFailureCount; i++) {
            const randomIndex = Math.floor(Math.random() * allNodes.length);
            const nodeToFailId = allNodes[randomIndex];
            nodesToFail.push(nodeToFailId);

            // 从可选列表中移除已选择的节点
            allNodes.splice(randomIndex, 1);
        }

        for (const nodeToFailId of nodesToFail) {
            try {
                const nodeToFail = this.nodeMap.get(nodeToFailId);
                if (!nodeToFail) continue;

                console.log(`Simulating failure for node: ${nodeToFailId}`);

                // 更新节点状态
                nodeToFail.status = NodeStatus.DEAD;
                this.nodeMap.set(nodeToFailId, nodeToFail);

                // 获取节点的ClusterManager
                const clusterManager = this.clusterManagers.get(nodeToFailId);
                if (clusterManager) {
                    // 通知集群中的其他节点这个节点已经失效
                    for (const [otherNodeId, otherManager] of this.clusterManagers.entries()) {
                        if (otherNodeId !== nodeToFailId) {
                            try {
                                otherManager.handleNodeStatus(nodeToFailId, NodeStatus.DEAD);
                            } catch (error) {
                                console.warn(`Failed to notify node ${otherNodeId} about failure of ${nodeToFailId}: ${error}`);
                            }
                        }
                    }

                    // 停止该节点的ClusterManager
                    try {
                        await clusterManager.stop();
                    } catch (error) {
                        console.warn(`Error stopping cluster manager for ${nodeToFailId}: ${error}`);
                    }

                    // 获取该节点上的所有actor
                    const nodeActors = Array.from(this.actorPids.entries())
                        .filter(([name]) => name.includes(nodeToFailId));

                    // 将这些actor标记为不可用
                    for (const [actorName] of nodeActors) {
                        this.actorPids.delete(actorName);
                    }

                    console.log(`Node ${nodeToFailId} failed with ${nodeActors.length} actors`);
                }
            } catch (error) {
                console.error(`Error simulating failure for node ${nodeToFailId}: ${error}`);
            }
        }

        const activeNodes = Array.from(this.nodeMap.values()).filter(n => n.status === NodeStatus.ACTIVE).length;
        console.log(`Simulated ${nodesToFail.length} node failures. Remaining active nodes: ${activeNodes}`);
    }

    private getClusterStats(): void {
        const now = Date.now();
        const uptime = (now - this.startTime) / 1000; // 秒

        // 计算节点统计信息
        const totalNodes = this.nodeMap.size;
        const activeNodes = Array.from(this.nodeMap.values()).filter(n => n.status === NodeStatus.ACTIVE).length;
        const deadNodes = Array.from(this.nodeMap.values()).filter(n => n.status === NodeStatus.DEAD).length;

        // 计算actor统计信息
        const totalActors = this.actorPids.size;
        const actorsPerNode = activeNodes > 0 ? totalActors / activeNodes : 0;

        // 计算消息统计信息
        const messagesPerSecond = this.messageStats.successful / (uptime || 1); // 避免除以0

        console.log('\n===== CLUSTER STATISTICS =====');
        console.log(`Uptime: ${uptime.toFixed(2)} seconds`);
        console.log(`Nodes: ${activeNodes} active / ${deadNodes} dead / ${totalNodes} total`);
        console.log(`Actors: ${totalActors} total (avg ${actorsPerNode.toFixed(2)} per node)`);
        console.log(`Messages: ${this.messageStats.successful} successful / ${this.messageStats.failed} failed / ${this.messageStats.sent} total`);
        console.log(`Throughput: ${messagesPerSecond.toFixed(2)} messages/second`);
        console.log('==============================\n');

        // 构建统计数据对象但不返回它，因为方法类型是void
        const stats = {
            uptime,
            nodes: {
                total: totalNodes,
                active: activeNodes,
                dead: deadNodes
            },
            actors: {
                total: totalActors,
                perNode: actorsPerNode
            },
            messages: {
                ...this.messageStats,
                throughput: messagesPerSecond
            }
        };

        // 如果需要，可以将stats保存到actor实例上供后续使用
        // this.lastStats = stats;
    }
}

// 自定义事件流 - 用于集群事件通知
class CustomEventStream {
    private subscribers: Map<string, ((data: any) => void)[]> = new Map();

    subscribe(event: string, callback: (data: any) => void) {
        if (!this.subscribers.has(event)) {
            this.subscribers.set(event, []);
        }
        this.subscribers.get(event)?.push(callback);
    }

    publish(event: string, data: any = {}) {
        const callbacks = this.subscribers.get(event) || [];
        for (const callback of callbacks) {
            try {
                callback(data);
            } catch (error) {
                console.error(`Error in event handler for ${event}:`, error);
            }
        }
    }
}

// 主函数 - 运行大型集群示例
async function runLargeClusterExample() {
    console.log('============================');
    console.log('Starting Large Cluster Example');
    console.log('============================');

    try {
        // 初始化Actor系统
        const system = new ActorSystem();
        await system.start();

        // 创建一个集群协调器Actor
        const coordinatorProps: Props = {
            producer: (context: ActorContext) => new ClusterCoordinatorActor(context)
        };

        const coordinatorPid = await system.spawn(coordinatorProps);
        console.log(`Created cluster coordinator with PID: ${coordinatorPid.id}`);

        // 开始集群模拟
        await system.send(coordinatorPid, { type: 'START' });

        // 等待一段时间让集群通信进行
        console.log('Waiting for cluster communication to complete...');
        await sleep(3000);

        // 获取集群统计信息
        await system.send(coordinatorPid, { type: 'GET_STATS' });

        // 模拟节点故障
        console.log('Simulating node failures...');
        await system.send(coordinatorPid, {
            type: 'SIMULATE_FAILURES',
            payload: { count: 3 }  // 减少失败节点数量
        });

        // 等待一段时间让故障检测和恢复机制运行
        await sleep(1000);

        // 获取最终的集群统计信息
        await system.send(coordinatorPid, { type: 'GET_STATS' });

        // 关闭Actor系统
        console.log('Shutting down...');
        await system.shutdown();

        console.log('============================');
        console.log('Large Cluster Example Complete');
        console.log('============================');
    } catch (error) {
        console.error('Fatal error in large cluster example:', error);
    }
}

// 执行示例
if (require.main === module) {
    runLargeClusterExample().catch(error => {
        console.error('Error running large cluster example:', error);
        process.exit(1);
    });
}

export { runLargeClusterExample }; 