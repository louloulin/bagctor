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
    NodeStatus,
    BackpressureStrategy,
    RecoveryPolicy,
    LoadBalancingStrategy,
    PartitionStrategy,
    ConsistencyLevel,
    LibP2pClusterOptions
} from '@bactor/cluster';
import { setTimeout as sleep } from 'node:timers/promises';
import * as crypto from 'crypto';
import { createEd25519PeerId } from '@libp2p/peer-id-factory';
import { log } from '../utils/logger';

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
// let baseClusterConfig: ClusterConfig;
// let baseLibp2pConfig: LibP2pClusterSystemConfig;

function createConfigs(nodeId: string, address: string) {
    const clusterConfig: ClusterConfig = {
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
            strategy: BackpressureStrategy.DROP,
            thresholds: {
                messageRate: 1000,
                queueSize: 1000,
                processingTime: 100,
                errorRate: 0.1,
                cpuUsage: 80,
                memoryUsage: 80
            },
            recoveryPolicy: RecoveryPolicy.IMMEDIATE,
            samplingInterval: 1000
        }
    };

    const libp2pConfig: LibP2pClusterSystemConfig = {
        clusterConfig,
        localAddress: address,
        seedNodes: [],
        dhtEnabled: true,
        dhtRandomWalk: true,
        nodeId,
        loadBalancingConfig: {
            strategy: LoadBalancingStrategy.ROUND_ROBIN,
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
            replicationFactor: 3,
            consistencyLevel: ConsistencyLevel.QUORUM
        },
        backpressureConfig: {
            enabled: true,
            strategy: BackpressureStrategy.DROP,
            thresholds: {
                messageRate: 1000,
                queueSize: 1000,
                processingTime: 100,
                errorRate: 0.1,
                cpuUsage: 80,
                memoryUsage: 80
            },
            recoveryPolicy: RecoveryPolicy.IMMEDIATE,
            samplingInterval: 1000
        },
        privateKey: null // 这里设置为 null，稍后会被替换为实际的 peerId
    };

    return { clusterConfig, libp2pConfig };
}

/**
 * 生成节点的私钥
 */
async function generatePrivateKey() {
    try {
        console.log('[PRIVATE_KEY] 开始生成新的私钥');
        const peerId = await createEd25519PeerId();

        // 详细记录PeerId结构，帮助排查问题
        const privateKeyInfo = {
            hasPrivateKey: !!peerId,
            type: typeof peerId,
            isValidPeerId: peerId && typeof peerId === 'object' && 'privateKey' in peerId,
            peerIdKeys: peerId ? Object.keys(peerId) : [],
            privateKeyType: peerId?.privateKey ? typeof peerId.privateKey : 'undefined',
            privateKeyIsBuffer: peerId?.privateKey instanceof Uint8Array,
            privateKeyLength: peerId?.privateKey?.length,
            publicKeyPresent: 'publicKey' in (peerId || {}),
            publicKeyType: peerId?.publicKey ? typeof peerId.publicKey : 'undefined',
            publicKeyIsBuffer: peerId?.publicKey instanceof Uint8Array,
            publicKeyLength: peerId?.publicKey?.length
        };

        console.log('[PRIVATE_KEY] 私钥生成结果: ', JSON.stringify(privateKeyInfo));
        log.info('Generated private key', privateKeyInfo);

        // 验证PeerId有效性
        if (!peerId || typeof peerId !== 'object') {
            console.error('[PRIVATE_KEY] 严重错误: 生成的PeerId不是有效对象!');
            log.error('Generated PeerId is not a valid object');
            throw new Error('Generated PeerId is not a valid object');
        }

        if (!('privateKey' in peerId)) {
            console.error('[PRIVATE_KEY] 严重错误: 生成的PeerId缺少privateKey属性!');
            log.error('Generated PeerId is missing privateKey property');
            throw new Error('Generated PeerId is missing privateKey property');
        }

        if (!peerId.privateKey) {
            console.error('[PRIVATE_KEY] 严重错误: privateKey属性存在但值为空!');
            log.error('PrivateKey property exists but is null or undefined');
            throw new Error('PrivateKey property exists but is null or undefined');
        }

        console.log('[PRIVATE_KEY] 私钥生成成功，返回有效的PeerId对象');
        // 确保返回一个有效的peerId对象，直接返回原始对象
        return peerId;
    } catch (error) {
        console.error('[PRIVATE_KEY] 私钥生成失败:', error);
        log.error('Failed to generate private key', {
            error: error instanceof Error ? error.message : String(error),
            stack: error instanceof Error ? error.stack : undefined
        });
        throw error;
    }
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
    private nodeId: string = '';
    private nodeInstance!: NodeInstance;

    constructor(context: ActorContext) {
        super(context);
    }

    init(nodeId: string, nodeInstance: NodeInstance) {
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
    console.log(`[NODE_START] Worker ${processId} 开始启动 ${nodeCount} 个节点, 起始端口 ${startPort}`);

    try {
        const nodes: NodeInstance[] = [];

        for (let i = 0; i < nodeCount; i++) {
            const nodeId = `node-${processId}-${i}`;
            const port = startPort + i;
            const address = `/ip4/127.0.0.1/tcp/${port}`;

            console.log(`[NODE_START] 正在启动节点 ${nodeId}, 地址 ${address}`);

            // 生成私钥
            console.log(`[NODE_START] ${nodeId}: 开始生成私钥`);
            const peerId = await generatePrivateKey();

            if (!peerId) {
                console.error(`[NODE_START] ${nodeId}: 私钥生成失败，结果为null或undefined`);
                throw new Error(`Failed to generate private key for node ${nodeId}`);
            }

            console.log(`[NODE_START] ${nodeId}: 私钥生成成功，详细信息:`);
            const peerIdInfo = {
                nodeId,
                hasPrivateKey: !!peerId,
                peerIdType: typeof peerId,
                peerIdProps: peerId ? Object.keys(peerId) : [],
                hasPrivateKeyProp: peerId && typeof peerId === 'object' && 'privateKey' in peerId,
                privateKeyLength: peerId?.privateKey?.length,
                peerIdStringify: !!peerId ? '有效对象' : 'null或undefined'
            };
            console.log(JSON.stringify(peerIdInfo, null, 2));
            log.info('Generated node private key', peerIdInfo);

            // 创建配置
            console.log(`[NODE_START] ${nodeId}: 创建节点配置`);
            const { clusterConfig, libp2pConfig } = createConfigs(nodeId, address);

            // 创建 Actor System
            console.log(`[NODE_START] ${nodeId}: 创建Actor System`);
            const actorSystem = new ActorSystem();

            // 创建 Cluster System，确保privateKey被正确设置
            console.log(`[NODE_START] ${nodeId}: 准备集群配置`);
            const clusterSystemConfig: LibP2pClusterSystemConfig = {
                ...libp2pConfig,
                clusterConfig: {
                    ...clusterConfig,
                    listenAddresses: [address],
                    bootstrapList: []
                },
                nodeId,
                localAddress: address,
                privateKey: peerId  // 确保这里的privateKey设置正确
            };

            // 打印配置信息，帮助调试
            const configInfo = {
                nodeId,
                hasPrivateKey: !!clusterSystemConfig.privateKey,
                peerIdType: typeof clusterSystemConfig.privateKey,
                peerIdProps: clusterSystemConfig.privateKey ? Object.keys(clusterSystemConfig.privateKey) : [],
                hasPrivateKeyProp: clusterSystemConfig.privateKey && typeof clusterSystemConfig.privateKey === 'object' && 'privateKey' in clusterSystemConfig.privateKey,
                localAddress: clusterSystemConfig.localAddress
            };
            console.log(`[NODE_START] ${nodeId}: 集群配置详情:`, JSON.stringify(configInfo, null, 2));
            log.info('Creating LibP2pClusterSystem with config', configInfo);

            console.log(`[NODE_START] ${nodeId}: 创建LibP2pClusterSystem实例`);
            const clusterSystem = new LibP2pClusterSystem(clusterSystemConfig);

            // 创建节点实例
            console.log(`[NODE_START] ${nodeId}: 创建节点实例对象`);
            const nodeInstance: NodeInstance = {
                id: nodeId,
                port,
                address,
                actorSystem,
                clusterSystem,
                servicePid: null as unknown as PID,
                metrics: {
                    messagesReceived: 0,
                    messagesSent: 0,
                    errors: 0,
                    latencies: [],
                    startTime: Date.now()
                },
                role: i === 0 ? 'bootstrap' : 'worker'
            };

            // 启动 Service Actor
            console.log(`[NODE_START] ${nodeId}: 启动Service Actor`);
            const servicePid = await actorSystem.spawn({
                producer: (context: ActorContext) => {
                    const actor = new NodeServiceActor(context);
                    actor.init(nodeId, nodeInstance);
                    return actor;
                }
            });

            nodeInstance.servicePid = servicePid;

            // 启动系统
            console.log(`[NODE_START] ${nodeId}: 启动Actor System`);
            await actorSystem.start();

            console.log(`[NODE_START] ${nodeId}: 启动Cluster System`);
            try {
                await clusterSystem.start();
                console.log(`[NODE_START] ${nodeId}: Cluster System启动成功`);
            } catch (err) {
                console.error(`[NODE_START] ${nodeId}: Cluster System启动失败:`, err);
                throw err;
            }

            nodes.push(nodeInstance);
            console.log(`[NODE_START] ${nodeId}: 节点启动完成并添加到节点列表`);

            // 等待一段时间再启动下一个节点
            if (i < nodeCount - 1) {
                console.log(`[NODE_START] 等待500ms后启动下一个节点`);
                await sleep(500);
            }
        }

        return nodes;
    } catch (error) {
        console.error(`[NODE_START] 启动节点失败:`, error);
        reportError(`Failed to start nodes: ${error}`);
        throw error;
    }
}

/**
 * 连接到引导节点
 */
async function connectToBootstrapNodes(bootstrapAddresses: string[]) {
    console.log(`[Bootstrap] 开始连接到 ${bootstrapAddresses.length} 个引导节点`);
    console.log(`[Bootstrap] 引导节点地址列表: ${JSON.stringify(bootstrapAddresses)}`);
    reportStatus(`Connecting to ${bootstrapAddresses.length} bootstrap nodes...`);

    if (bootstrapAddresses.length === 0) {
        console.error('[Bootstrap] 错误: 没有可用的引导节点地址');
        reportError('No bootstrap nodes available');
        return;
    }

    try {
        for (const node of nodes) {
            console.log(`[Bootstrap] 处理节点 ${node.id}, 角色: ${node.role}`);

            if (node.role === 'bootstrap' && bootstrapAddresses.includes(node.address)) {
                console.log(`[Bootstrap] ${node.id} 是引导节点，跳过连接`);
                continue;
            }

            try {
                const clusterSystem = node.clusterSystem;
                if (clusterSystem) {
                    console.log(`[Bootstrap] ${node.id} 开始处理集群系统配置`);

                    // 获取现有的私钥（通过 clusterSystem 对象访问）
                    const existingPrivateKey = (clusterSystem as any).config.privateKey;

                    console.log(`[Bootstrap] ${node.id} 现有私钥信息:`, {
                        hasPrivateKey: !!existingPrivateKey,
                        peerIdType: typeof existingPrivateKey,
                        peerIdProps: existingPrivateKey ? Object.keys(existingPrivateKey) : [],
                        hasPrivateKeyProp: existingPrivateKey && typeof existingPrivateKey === 'object' && 'privateKey' in existingPrivateKey,
                    });

                    log.info(`[Bootstrap] ${node.id} Retrieved private key for bootstrap connection`, {
                        nodeId: node.id,
                        hasPrivateKey: !!existingPrivateKey,
                        peerIdType: typeof existingPrivateKey,
                        peerIdProps: existingPrivateKey ? Object.keys(existingPrivateKey) : []
                    });

                    console.log(`[Bootstrap] ${node.id} 停止现有集群系统`);
                    await clusterSystem.stop();

                    // 创建新的配置，但保留现有的私钥
                    console.log(`[Bootstrap] ${node.id} 创建新配置`);
                    const { clusterConfig: baseConfig, libp2pConfig: baseLibp2pConfig } = createConfigs(node.id, node.address);

                    // 确保使用现有私钥，如果不可用，则生成新的
                    console.log(`[Bootstrap] ${node.id} 检查私钥可用性`);
                    let privateKey = existingPrivateKey;

                    if (!privateKey) {
                        console.log(`[Bootstrap] ${node.id} 现有私钥不可用，生成新私钥`);
                        privateKey = await generatePrivateKey();
                        console.log(`[Bootstrap] ${node.id} 新私钥生成结果:`, {
                            generated: !!privateKey,
                            type: typeof privateKey,
                            props: privateKey ? Object.keys(privateKey) : []
                        });
                    }

                    if (!privateKey) {
                        const errMsg = `Failed to get or generate private key for node ${node.id}`;
                        console.error(`[Bootstrap] ${node.id} ${errMsg}`);
                        throw new Error(errMsg);
                    }

                    // 验证私钥结构
                    console.log(`[Bootstrap] ${node.id} 验证私钥结构`);
                    if (typeof privateKey !== 'object' || !('privateKey' in privateKey)) {
                        console.warn(`[Bootstrap] ${node.id} 私钥结构无效，生成新私钥`, {
                            privateKeyType: typeof privateKey,
                            privateKeyProps: privateKey ? Object.keys(privateKey) : []
                        });

                        log.warn('[Bootstrap] Private key has invalid structure, generating new one', {
                            nodeId: node.id,
                            privateKeyType: typeof privateKey,
                            privateKeyProps: privateKey ? Object.keys(privateKey) : []
                        });

                        const newPrivateKey = await generatePrivateKey();
                        console.log(`[Bootstrap] ${node.id} 新私钥生成结果:`, {
                            generated: !!newPrivateKey,
                            type: typeof newPrivateKey,
                            props: newPrivateKey ? Object.keys(newPrivateKey) : []
                        });

                        if (!newPrivateKey) {
                            const errMsg = `Failed to generate new private key for node ${node.id}`;
                            console.error(`[Bootstrap] ${node.id} ${errMsg}`);
                            throw new Error(errMsg);
                        }
                        privateKey = newPrivateKey;
                    }

                    console.log(`[Bootstrap] ${node.id} 最终选择的私钥:`, {
                        hasPrivateKey: !!privateKey,
                        privateKeyType: typeof privateKey,
                        privateKeyProps: privateKey ? Object.keys(privateKey) : [],
                        hasPrivateKeyProp: privateKey && typeof privateKey === 'object' && 'privateKey' in privateKey,
                        isExistingKey: privateKey === existingPrivateKey
                    });

                    log.info('[Bootstrap] Using private key for new cluster system', {
                        nodeId: node.id,
                        hasPrivateKey: !!privateKey,
                        peerIdType: typeof privateKey,
                        peerIdProps: privateKey ? Object.keys(privateKey) : [],
                        isExistingKey: privateKey === existingPrivateKey
                    });

                    const newConfig: LibP2pClusterSystemConfig = {
                        ...baseLibp2pConfig,
                        clusterConfig: {
                            ...baseConfig,
                            listenAddresses: [node.address],
                            bootstrapList: bootstrapAddresses
                        },
                        nodeId: node.id,
                        localAddress: node.address,
                        seedNodes: bootstrapAddresses,
                        privateKey: privateKey  // 确保这里正确设置privateKey
                    };

                    console.log(`[Bootstrap] ${node.id} 创建的新配置:`, {
                        nodeId: node.id,
                        hasPrivateKey: !!newConfig.privateKey,
                        privateKeyType: typeof newConfig.privateKey,
                        privateKeyProps: newConfig.privateKey ? Object.keys(newConfig.privateKey) : [],
                        hasPrivateKeyProp: newConfig.privateKey && typeof newConfig.privateKey === 'object' && 'privateKey' in newConfig.privateKey,
                        bootstrapNodes: bootstrapAddresses.length
                    });

                    log.info('[Bootstrap] Created new config for bootstrap connection', {
                        nodeId: node.id,
                        hasPrivateKey: !!newConfig.privateKey,
                        peerIdJSON: newConfig.privateKey ? JSON.stringify(newConfig.privateKey).substring(0, 100) : 'null'
                    });

                    console.log(`[Bootstrap] ${node.id} 创建新的LibP2pClusterSystem实例`);
                    const newClusterSystem = new LibP2pClusterSystem(newConfig);
                    node.clusterSystem = newClusterSystem;

                    console.log(`[Bootstrap] ${node.id} 启动新的集群系统`);
                    try {
                        await newClusterSystem.start();
                        console.log(`[Bootstrap] ${node.id} 新集群系统启动成功`);
                        reportStatus(`Node ${node.id} connected to bootstrap nodes`);
                    } catch (err) {
                        console.error(`[Bootstrap] ${node.id} 启动集群系统失败:`, err);
                        throw err;
                    }
                }
            } catch (error: any) {
                console.error(`[Bootstrap] ${node.id} 连接到引导节点失败:`, error);
                reportError(`Node ${node.id} failed to connect to bootstrap nodes: ${error}`);
                node.metrics.errors++;
            }
        }

        console.log(`[Bootstrap] 所有节点处理完成`);
        reportStatus('Bootstrap connections completed');
    } catch (error: any) {
        console.error(`[Bootstrap] 引导连接过程中发生错误:`, error);
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
                    console.log('[消息处理] 收到bootstrap消息, bootstrapNodes:', message.nodes.length);
                    // 处理bootstrap连接
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