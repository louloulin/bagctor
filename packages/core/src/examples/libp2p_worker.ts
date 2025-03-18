/**
 * libp2p多进程测试 - 工作进程
 * 
 * 该文件实现工作进程，负责:
 * 1. 创建和管理1-3个真实的libp2p节点
 * 2. 处理来自协调器的命令
 * 3. 向协调器报告状态和结果
 */

import { ActorSystem } from '../core/system';
import { Actor } from '../core/actor';
import { ActorContext } from '../core/context';
import { Message, Props, PID } from '../core/types';
import {
    ClusterManager,
    ClusterConfig,
    LibP2pClusterSystem,
    LibP2pClusterSystemConfig,
    NodeInfo,
    NodeStatus
} from '@bactor/cluster';
import { setTimeout as sleep } from 'node:timers/promises';
import * as crypto from 'crypto';
import { BackpressureStrategy, RecoveryPolicy, LoadBalancingStrategy, PartitionStrategy, ConsistencyLevel } from '@bactor/cluster';

// 解析命令行参数
const args = process.argv.slice(2);
const processId = parseInt(args.find(arg => arg.startsWith('--processId='))?.split('=')[1] || '0');
const nodeCount = parseInt(args.find(arg => arg.startsWith('--nodeCount='))?.split('=')[1] || '1');
const startPort = parseInt(args.find(arg => arg.startsWith('--startPort='))?.split('=')[1] || '40000');

// 全局结构
interface NodeInstance {
    id: string;
    port: number;
    address: string;
    actorSystem: ActorSystem;
    clusterSystem: LibP2pClusterSystem;
    servicePid: PID;
    metrics: {
        messagesReceived: number;
        messagesSent: number;
        errors: number;
        latencies: number[];
        startTime: number;
    };
    role: string; // 'bootstrap' 或 'worker'
}

// 消息类型
const MessageTypes = {
    HELLO: 'HELLO',
    PING: 'PING',
    PONG: 'PONG',
    DATA: 'DATA',
    STATUS: 'STATUS'
};

// 节点实例
const nodes: NodeInstance[] = [];

// 创建基础配置
let baseClusterConfig: ClusterConfig;
let baseLibp2pConfig: LibP2pClusterSystemConfig;

function createConfigs(nodeId: string, address: string) {
    // 创建libp2p集群配置
    baseClusterConfig = {
        nodeId,
        heartbeatInterval: 1000,
        failureDetectionTimeout: 3000,
        partitionDetectionTimeout: 5000,
        bootstrapList: [],
        listenAddresses: [address],
        enableDHT: true,
        enablePubSub: true,
        enableGossip: true,
        backpressureConfig: {
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
            recoveryPolicy: RecoveryPolicy.ADAPTIVE,
            samplingInterval: 1000
        }
    };

    // 创建libp2p系统配置
    baseLibp2pConfig = {
        nodeId,
        clusterConfig: baseClusterConfig,
        localAddress: address,
        seedNodes: [],
        dhtEnabled: true,
        dhtRandomWalk: true,
        loadBalancingConfig: {
            strategy: LoadBalancingStrategy.ADAPTIVE,
            thresholds: {
                cpu: 80,
                memory: 80,
                messageRate: 1000,
                actorCount: 100
            },
            rebalanceInterval: 5000
        },
        partitionConfig: {
            strategy: PartitionStrategy.CONSISTENT_HASH,
            replicationFactor: 2,
            consistencyLevel: ConsistencyLevel.QUORUM
        },
        backpressureConfig: {
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
            recoveryPolicy: RecoveryPolicy.ADAPTIVE,
            samplingInterval: 1000
        }
    };
}

/**
 * 生成节点的私钥
 */
function generatePrivateKey(): Uint8Array {
    const buffer = crypto.randomBytes(32);
    return new Uint8Array(buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength));
}

/**
 * 汇报状态到协调器
 */
function reportStatus(status: string) {
    if (process.send) {
        process.send({
            type: 'STATUS',
            status
        });
    }
    console.log(status);
}

/**
 * 汇报错误到协调器
 */
function reportError(error: any) {
    if (process.send) {
        process.send({
            type: 'ERROR',
            error: error.toString()
        });
    }
    console.error(error);
}

/**
 * 节点服务Actor，处理节点间通信
 */
class NodeServiceActor extends Actor {
    private nodeId: string;
    private nodeInstance: NodeInstance;

    constructor(context: ActorContext, nodeId: string, nodeInstance: NodeInstance) {
        super(context);
        this.nodeId = nodeId;
        this.nodeInstance = nodeInstance;
    }

    protected behaviors(): void {
        this.addBehavior('default', async (message: Message) => {
            try {
                const startTime = Date.now();

                // 初始化消息
                if (message.type === 'INIT') {
                    console.log(`[Node ${this.nodeId}] Service actor initialized`);
                    return;
                }

                // 更新指标
                this.nodeInstance.metrics.messagesReceived++;

                // 处理HELLO消息
                if (message.type === MessageTypes.HELLO) {
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
                        this.nodeInstance.metrics.messagesSent++;
                    }
                    return;
                }

                // 处理PING消息
                if (message.type === MessageTypes.PING) {
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
                        this.nodeInstance.metrics.messagesSent++;
                    }
                    return;
                }

                // 处理PONG消息
                if (message.type === MessageTypes.PONG && message.payload?.originalTimestamp) {
                    const roundtripTime = Date.now() - message.payload.originalTimestamp;
                    this.nodeInstance.metrics.latencies.push(roundtripTime);
                    return;
                }

                // 处理DATA消息 - 只需接收，不需回复
                if (message.type === MessageTypes.DATA) {
                    // 收到数据消息，不需要回复
                    return;
                }

                // 处理状态请求
                if (message.type === MessageTypes.STATUS) {
                    // 计算平均延迟
                    const avgLatency = this.nodeInstance.metrics.latencies.length > 0
                        ? this.nodeInstance.metrics.latencies.reduce((sum, val) => sum + val, 0) / this.nodeInstance.metrics.latencies.length
                        : 0;

                    return {
                        nodeId: this.nodeId,
                        messagesReceived: this.nodeInstance.metrics.messagesReceived,
                        messagesSent: this.nodeInstance.metrics.messagesSent,
                        errors: this.nodeInstance.metrics.errors,
                        avgLatency: avgLatency,
                        uptime: Date.now() - this.nodeInstance.metrics.startTime
                    };
                }
            } catch (error) {
                console.error(`[Node ${this.nodeId}] Error processing message:`, error);
                this.nodeInstance.metrics.errors++;
            }
        });
    }
}

/**
 * 启动节点
 */
async function startNodes() {
    reportStatus(`Worker ${processId} starting ${nodeCount} nodes from port ${startPort}`);

    try {
        // 创建节点
        for (let i = 0; i < nodeCount; i++) {
            const nodeId = `node-${processId}-${i}`;
            const port = startPort + i;
            const address = `/ip4/127.0.0.1/tcp/${port}`;
            const isFirstNode = i === 0;

            reportStatus(`Creating node ${nodeId} on port ${port}...`);

            // 创建actor系统
            const actorSystem = new ActorSystem();
            await actorSystem.start();

            // 分配角色 - 每个工作进程的第一个节点作为bootstrap节点
            const role = isFirstNode ? 'bootstrap' : 'worker';

            // 初始化指标
            const metrics = {
                messagesReceived: 0,
                messagesSent: 0,
                errors: 0,
                latencies: [],
                startTime: Date.now()
            };

            // 创建服务Actor
            const serviceProps: Props = {
                producer: (context: ActorContext) => new NodeServiceActor(context, nodeId, {
                    id: nodeId,
                    port,
                    address,
                    actorSystem,
                    clusterSystem: null as any, // 将在后面设置
                    servicePid: null as any,    // 将在后面设置
                    metrics,
                    role
                })
            };

            const servicePid = await actorSystem.spawn(serviceProps);

            // 初始化服务Actor
            await actorSystem.send(servicePid, {
                type: 'INIT'
            });

            // 创建基础配置
            createConfigs(nodeId, address);

            // 创建集群系统
            const clusterSystem = new LibP2pClusterSystem(baseLibp2pConfig);

            // 保存节点实例
            const nodeInstance: NodeInstance = {
                id: nodeId,
                port,
                address,
                actorSystem,
                clusterSystem,
                servicePid,
                metrics,
                role
            };

            // 保存到全局节点列表
            nodes.push(nodeInstance);
            nodes[i].clusterSystem = clusterSystem;

            // 启动集群系统
            await clusterSystem.start();

            // 向协调器报告节点信息
            if (process.send) {
                process.send({
                    type: 'NODE_INFO',
                    nodeId,
                    info: {
                        address,
                        role,
                        port
                    }
                });
            }

            reportStatus(`Node ${nodeId} (${role}) started successfully`);

            // 等待一段时间再启动下一个节点，避免资源争抢
            if (i < nodeCount - 1) {
                await sleep(500);
            }
        }

        reportStatus(`All ${nodeCount} nodes started successfully`);
    } catch (error) {
        reportError(`Failed to start nodes: ${error}`);
        throw error;
    }
}

/**
 * 连接到引导节点
 */
async function connectToBootstrapNodes(bootstrapAddresses: string[]) {
    reportStatus(`Connecting to ${bootstrapAddresses.length} bootstrap nodes...`);

    try {
        // 为每个节点设置引导节点
        for (const node of nodes) {
            // bootstrap节点不需要再连接自己
            if (node.role === 'bootstrap' && bootstrapAddresses.includes(node.address)) {
                continue;
            }

            try {
                // 更新种子节点列表
                const clusterSystem = node.clusterSystem;
                if (clusterSystem) {
                    // 停止当前系统
                    await clusterSystem.stop();

                    // 创建新的配置，更新种子节点和引导节点列表
                    const newConfig = {
                        ...baseLibp2pConfig,
                        seedNodes: bootstrapAddresses,
                        clusterConfig: {
                            ...baseClusterConfig,
                            bootstrapList: bootstrapAddresses
                        }
                    };

                    // 重新初始化系统
                    const newClusterSystem = new LibP2pClusterSystem(newConfig);
                    node.clusterSystem = newClusterSystem;

                    // 启动新系统
                    await newClusterSystem.start();

                    reportStatus(`Node ${node.id} connected to bootstrap nodes`);
                }
            } catch (error: any) {
                reportError(`Node ${node.id} failed to connect to bootstrap nodes: ${error}`);
                node.metrics.errors++;
            }
        }

        reportStatus('Bootstrap connections completed');
    } catch (error: any) {
        reportError(`Error connecting to bootstrap nodes: ${error}`);
        throw error;
    }
}

/**
 * 执行测试
 */
async function runTests(params: any = {}) {
    const { messagingRounds = 3, messageCount = 5, messageInterval = 1000 } = params;

    reportStatus(`Starting test with ${messagingRounds} rounds, ${messageCount} messages per round`);

    try {
        // 获取除自己以外的节点列表
        const getTargetNodes = (sourceNodeIndex: number) => {
            // 现在所有节点可能已经在一个网络中，不只是同一进程内的节点
            // 如果在协调器中提供了其他节点的信息，应该在这里使用
            // 这里为简单起见，我们只使用同一进程中的其他节点
            return nodes.filter((_, index) => index !== sourceNodeIndex);
        };

        // 多轮消息发送
        for (let round = 0; round < messagingRounds; round++) {
            reportStatus(`Starting messaging round ${round + 1}/${messagingRounds}`);

            // 每个节点向其他节点发送消息
            const messagePromises = [];

            for (let i = 0; i < nodes.length; i++) {
                const sourceNode = nodes[i];
                const targetNodes = getTargetNodes(i);

                // 每个目标节点发送特定数量的消息
                for (let j = 0; j < Math.min(targetNodes.length, messageCount); j++) {
                    const targetNode = targetNodes[j % targetNodes.length];

                    // 随机选择消息类型
                    const messageType = Math.random() < 0.5 ? MessageTypes.PING : MessageTypes.DATA;

                    // 准备消息载荷
                    const payload: any = {
                        sourceNodeId: sourceNode.id,
                        timestamp: Date.now()
                    };

                    if (messageType === MessageTypes.DATA) {
                        payload.data = `Test data from ${sourceNode.id}, round ${round}, message ${j}`;
                    }

                    // 发送消息
                    messagePromises.push(
                        sourceNode.actorSystem.send(targetNode.servicePid, {
                            type: messageType,
                            payload,
                            sender: sourceNode.servicePid
                        }).then(() => {
                            sourceNode.metrics.messagesSent++;
                        }).catch(error => {
                            reportError(`Failed to send ${messageType} from ${sourceNode.id} to ${targetNode.id}: ${error}`);
                            sourceNode.metrics.errors++;
                        })
                    );
                }
            }

            // 等待所有消息发送完成
            await Promise.allSettled(messagePromises);

            // 等待一定时间让消息处理完成
            await sleep(messageInterval);
        }

        reportStatus('Test messaging completed');
    } catch (error) {
        reportError(`Test execution failed: ${error}`);
        throw error;
    }
}

/**
 * 收集并报告测试结果
 */
async function collectResults() {
    reportStatus('Collecting test results...');

    try {
        // 从每个节点收集状态信息
        for (const node of nodes) {
            try {
                const status = await node.actorSystem.request(node.servicePid, {
                    type: MessageTypes.STATUS
                });

                // 向协调器报告结果
                if (process.send) {
                    process.send({
                        type: 'TEST_RESULT',
                        nodeId: node.id,
                        result: status
                    });
                }
            } catch (error) {
                reportError(`Failed to get status from node ${node.id}: ${error}`);
            }
        }

        reportStatus('Results collection completed');
    } catch (error) {
        reportError(`Results collection failed: ${error}`);
    }
}

/**
 * 关闭所有节点
 */
async function shutdownNodes() {
    reportStatus('Shutting down nodes...');

    const shutdownPromises = [];

    for (const node of nodes) {
        shutdownPromises.push(
            Promise.all([
                node.clusterSystem.stop(),
                node.actorSystem.shutdown()
            ])
                .then(() => reportStatus(`Node ${node.id} stopped`))
                .catch(error => reportError(`Error stopping node ${node.id}: ${error}`))
        );
    }

    try {
        await Promise.allSettled(shutdownPromises);
        reportStatus('All nodes stopped');
    } catch (error) {
        reportError(`Shutdown failed: ${error}`);
    }
}

// 监听来自协调器的命令
if (process.send) {
    process.on('message', async (message: any) => {
        try {
            switch (message.type) {
                case 'BOOTSTRAP':
                    // 连接到bootstrap节点
                    await connectToBootstrapNodes(message.nodes);
                    break;

                case 'START_TEST':
                    // 开始测试
                    await runTests(message.testParams);
                    break;

                case 'COLLECT_RESULTS':
                    // 收集结果
                    await collectResults();
                    break;

                case 'SHUTDOWN':
                    // 关闭节点
                    await shutdownNodes();
                    // 优雅退出进程
                    setTimeout(() => process.exit(0), 1000);
                    break;

                default:
                    reportStatus(`Unknown command: ${message.type}`);
            }
        } catch (error) {
            reportError(`Error handling command ${message.type}: ${error}`);
        }
    });
}

// 启动节点
startNodes().catch(error => {
    reportError(`Fatal error: ${error}`);
    process.exit(1);
});

// 进程结束前清理资源
process.on('exit', () => {
    reportStatus('Worker process exiting');
});

process.on('SIGINT', async () => {
    reportStatus('Received SIGINT, shutting down');
    await shutdownNodes();
    process.exit(0);
});

process.on('SIGTERM', async () => {
    reportStatus('Received SIGTERM, shutting down');
    await shutdownNodes();
    process.exit(0);
});

process.on('uncaughtException', (error) => {
    reportError(`Uncaught exception: ${error}`);
    process.exit(1);
});

// 报告进程启动成功
reportStatus(`Worker process ${processId} started successfully`); 