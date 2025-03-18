import { LibP2pClusterSystem } from '../libp2p_cluster';
import {
    ClusterConfig,
    NodeStatus,
    MembershipProtocol,
    ReconnectionStrategy,
    LoadBalancingStrategy,
    PartitionStrategy,
    ConsistencyLevel,
    BackpressureStrategy,
    RecoveryPolicy,
    ClusterEventType
} from '../types';
import { log } from '@bactor/core';

// 配置日志
log.level = 'debug';

/**
 * 启动一个集群节点
 * @param localAddress 本地地址
 * @param seedNodes 种子节点列表
 * @param isFirstNode 是否是第一个节点（种子节点）
 */
async function startClusterNode(
    localAddress: string,
    seedNodes: string[],
    isFirstNode: boolean = false
): Promise<LibP2pClusterSystem> {
    // 基本集群配置
    const clusterConfig: ClusterConfig = {
        heartbeatInterval: 5000,                         // 心跳间隔
        failureDetectionThreshold: 15000,                // 故障检测阈值
        reconnectionStrategy: ReconnectionStrategy.EXPONENTIAL_BACKOFF, // 重连策略
        membershipProtocol: MembershipProtocol.GOSSIP,   // 成员关系协议
        gossipInterval: 2000,                            // Gossip间隔
        suspicionTimeout: 10000,                         // 可疑状态超时
        syncInterval: 30000,                             // 同步间隔
        loadReportInterval: 10000                        // 负载报告间隔
    };

    // 负载均衡配置
    const loadBalancingConfig = {
        strategy: LoadBalancingStrategy.LEAST_LOADED,
        thresholds: {
            cpu: 20,
            memory: 20,
            messageRate: 100,
            actorCount: 10
        },
        rebalanceInterval: 60000
    };

    // 分区配置
    const partitionConfig = {
        strategy: PartitionStrategy.CONSISTENT_HASH,
        replicationFactor: 3,
        consistencyLevel: ConsistencyLevel.QUORUM
    };

    // 背压配置
    const backpressureConfig = {
        enabled: true,
        strategy: BackpressureStrategy.ADAPTIVE,
        thresholds: {
            queueSize: 1000,
            memoryUsage: 80,
            cpuUsage: 70,
            messageRate: 5000
        },
        samplingInterval: 5000,
        recoveryPolicy: RecoveryPolicy.GRADUAL
    };

    // 创建集群系统
    const clusterSystem = new LibP2pClusterSystem({
        clusterConfig,
        localAddress,
        seedNodes,
        dhtEnabled: true,
        dhtRandomWalk: true,
        loadBalancingConfig,
        partitionConfig,
        backpressureConfig
    });

    // 注册事件监听器
    registerEventListeners(clusterSystem);

    // 启动集群系统
    await clusterSystem.start();

    log.info(`Cluster node started at ${localAddress}`, {
        isSeed: isFirstNode,
        seedNodes: seedNodes.join(', ')
    });

    return clusterSystem;
}

/**
 * 注册集群事件监听器
 * @param clusterSystem 集群系统
 */
function registerEventListeners(clusterSystem: LibP2pClusterSystem): void {
    // 节点加入事件
    clusterSystem.onClusterEvent(ClusterEventType.NODE_JOINED, (event) => {
        log.info(`Node joined the cluster`, { nodeId: event.nodeId, timestamp: event.timestamp });
    });

    // 节点离开事件
    clusterSystem.onClusterEvent(ClusterEventType.NODE_LEFT, (event) => {
        log.info(`Node left the cluster`, { nodeId: event.nodeId, timestamp: event.timestamp });
    });

    // 节点可疑事件
    clusterSystem.onClusterEvent(ClusterEventType.NODE_SUSPECTED, (event) => {
        log.warn(`Node suspected down`, { nodeId: event.nodeId, timestamp: event.timestamp });
    });

    // 节点恢复事件
    clusterSystem.onClusterEvent(ClusterEventType.NODE_RECOVERED, (event) => {
        log.info(`Node recovered`, { nodeId: event.nodeId, timestamp: event.timestamp });
    });

    // 分区检测事件
    clusterSystem.onClusterEvent(ClusterEventType.PARTITION_DETECTED, (event) => {
        log.warn(`Network partition detected`, {
            partitionCount: event.data?.partitions?.length,
            timestamp: event.timestamp
        });
    });

    // 分区恢复事件
    clusterSystem.onClusterEvent(ClusterEventType.PARTITION_HEALED, (event) => {
        log.info(`Network partition healed`, {
            partitionCount: event.data?.partitions?.length,
            timestamp: event.timestamp
        });
    });

    // 领导者选举事件
    clusterSystem.onClusterEvent(ClusterEventType.LEADER_ELECTED, (event) => {
        log.info(`New leader elected`, { leaderId: event.nodeId, timestamp: event.timestamp });
    });
}

/**
 * 打印集群状态
 * @param clusterSystem 集群系统
 */
function printClusterStatus(clusterSystem: LibP2pClusterSystem): void {
    const state = clusterSystem.getClusterState();
    const metrics = clusterSystem.getClusterMetrics();
    const activeNodes = clusterSystem.getActiveNodes();

    console.log('\n===== CLUSTER STATUS =====');
    console.log(`Active Nodes: ${metrics.activeNodes}`);
    console.log(`Suspected Nodes: ${metrics.suspectedNodes}`);
    console.log(`Dead Nodes: ${metrics.deadNodes}`);
    console.log(`Partition Count: ${metrics.partitionCount}`);
    console.log(`Leader: ${state.leader || 'None'}`);
    console.log('\nNode List:');

    activeNodes.forEach(node => {
        console.log(`  - ID: ${node.id.substring(0, 8)}... | Address: ${node.address} | Status: ${node.status}`);
        if (node.load) {
            console.log(`    Load: CPU ${Math.round(node.load.cpu)}%, Mem ${Math.round(node.load.memory)}%, Actors: ${node.load.actorCount}`);
        }
    });

    console.log('==========================\n');
}

/**
 * 处理命令行参数并启动节点
 */
async function main(): Promise<void> {
    // 解析命令行参数
    const args = process.argv.slice(2);
    let localAddress = '/ip4/127.0.0.1/tcp/10000';
    let seedNodes: string[] = [];
    let isFirstNode = false;

    // 处理命令行参数
    for (let i = 0; i < args.length; i++) {
        if (args[i] === '--address' && i + 1 < args.length) {
            localAddress = args[i + 1];
            i++;
        } else if (args[i] === '--seeds' && i + 1 < args.length) {
            seedNodes = args[i + 1].split(',');
            i++;
        } else if (args[i] === '--first') {
            isFirstNode = true;
        }
    }

    if (isFirstNode) {
        // 第一个节点不需要种子节点
        seedNodes = [];
    } else if (seedNodes.length === 0) {
        // 如果不是第一个节点且没有指定种子节点，使用默认种子节点
        seedNodes = ['/ip4/127.0.0.1/tcp/10000'];
    }

    // 启动集群节点
    const clusterSystem = await startClusterNode(localAddress, seedNodes, isFirstNode);

    // 定期打印集群状态
    setInterval(() => {
        printClusterStatus(clusterSystem);
    }, 10000);

    // 处理进程终止信号
    process.on('SIGINT', async () => {
        console.log('\nShutting down cluster node...');
        await clusterSystem.stop();
        console.log('Cluster node stopped.');
        process.exit(0);
    });
}

// 如果直接运行此文件，启动集群节点
if (require.main === module) {
    main().catch(error => {
        console.error('Failed to start cluster node:', error);
        process.exit(1);
    });
} 