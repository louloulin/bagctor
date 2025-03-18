/**
 * 测试新实现的功能模块
 */
import { ClusterManager } from '../cluster_manager';
import {
    ClusterConfig,
    MembershipProtocol,
    ReconnectionStrategy,
    NodeInfo,
    NodeStatus,
    NodeLoad,
    BackpressureStrategy,
    RecoveryPolicy
} from '../types';
import { FailureDetectionConsensus } from '../utils/consensus';
import { SystemMetricsCollector } from '../utils/system_metrics';
import { BackpressureManager, MessagePriority } from '../utils/backpressure';
import { ConsistentHashActorPlacement } from '../actor/consistent_hash_placement';
import { log } from '@bactor/core';

// 使环境变量 NO_COLOR=1 生效避免日志中的颜色代码
process.env.NO_COLOR = '1';

// 注意：log.level已移除，因为在@bactor/core中不支持

/**
 * 测试分布式共识功能
 */
function testConsensus() {
    console.log('\n--- 测试分布式共识 ---');

    // 创建一个模拟的 ClusterManager 实例
    const mockClusterManager = {
        getAllNodes: () => Array.from({ length: 5 }, (_, i) => ({
            id: `node-${i}`,
            status: NodeStatus.ACTIVE,
            address: `127.0.0.1:${8000 + i}`,
            lastHeartbeat: Date.now(),
            metadata: {},
            capabilities: []
        })),
        handleNodeStatus: async () => { }
    } as unknown as ClusterManager;

    // 创建共识实例
    const consensus = new FailureDetectionConsensus(
        mockClusterManager,
        {
            suspicionTimeout: 5000,
            quorumSize: 3
        }
    );

    // 模拟5个节点
    const totalNodes = 5;
    const nodeIds = Array.from({ length: totalNodes }, (_, i) => `node-${i}`);

    // 模拟节点投票
    console.log('模拟节点投票过程:');

    // 节点0被2个节点怀疑
    consensus.voteSuspect('node-1', 'node-0');
    consensus.voteSuspect('node-2', 'node-0');
    console.log(`节点node-0被2个节点怀疑，状态: ${consensus.determineNodeStatus('node-0', totalNodes)}`);

    // 节点0又被一个节点怀疑，达到阈值
    consensus.voteSuspect('node-0', 'node-3');
    console.log(`节点node-0被3个节点怀疑，状态: ${consensus.determineNodeStatus('node-0', totalNodes)}`);

    // 节点1被4个节点判定为死亡
    for (let i = 0; i < 4; i++) {
        if (i !== 1) { // 除了自己
            consensus.voteDead('node-1', `node-${i}`);
        }
    }
    console.log(`节点node-1被4个节点判定死亡，状态: ${consensus.determineNodeStatus('node-1', totalNodes)}`);

    // 清理投票
    consensus.clearVotes('node-0');
    console.log(`清理node-0的投票后，状态: ${consensus.determineNodeStatus('node-0', totalNodes)}`);
}

/**
 * 测试系统指标收集
 */
function testSystemMetrics() {
    console.log('\n--- 测试系统指标收集 ---');

    const metrics = new SystemMetricsCollector();

    // 设置虚拟Actor数量
    metrics.setActorCount(100);

    // 模拟接收消息
    for (let i = 0; i < 1000; i++) {
        metrics.recordMessage();
    }

    // 获取并打印系统指标
    const load = metrics.getNodeLoad();
    console.log('系统负载指标:');
    console.log(`- CPU使用率: ${load.cpu.toFixed(2)}%`);
    console.log(`- 内存使用率: ${load.memory.toFixed(2)}%`);
    console.log(`- 消息速率: ${load.messageRate.toFixed(2)} 消息/秒`);
    console.log(`- Actor数量: ${load.actorCount}`);
    console.log(`- 估计队列大小: ${metrics.estimateQueueSize()}`);
}

/**
 * 测试背压策略
 */
function testBackpressure() {
    console.log('\n--- 测试背压管理 ---');

    // 创建系统指标收集器
    const metrics = new SystemMetricsCollector();

    // 创建背压管理器
    const backpressure = new BackpressureManager({
        enabled: true,
        strategy: BackpressureStrategy.ADAPTIVE,
        thresholds: {
            messageRate: 1000,
            queueSize: 100,
            memoryUsage: 90,
            cpuUsage: 80,
            processingTime: 100,
            errorRate: 0.05
        },
        recoveryPolicy: RecoveryPolicy.GRADUAL,
        samplingInterval: 1000
    }, metrics);

    console.log('初始背压管理器状态:');

    // 模拟系统负载变化
    console.log('模拟高负载情况:');
    metrics.recordMessage();
    metrics.recordMessage();
    metrics.updateActorCount(1);

    // 检查背压状态
    const isBackpressureNeeded = backpressure.shouldApplyBackpressure();
    console.log(`- 是否需要应用背压: ${isBackpressureNeeded}`);

    // 获取背压状态
    const state = backpressure.getBackpressureState();
    console.log('背压详细状态:');
    console.log(`- 当前策略: ${state.currentStrategy}`);
    console.log(`- 丢弃率: ${state.metrics.dropRate.toFixed(2)}`);
    console.log(`- 限流率: ${state.metrics.throttleRate.toFixed(2)}`);
    console.log(`- 缓冲区大小: ${state.metrics.bufferSizeLimit}`);

    // 测试消息处理决策
    console.log('\n消息处理决策:');
    console.log(`- 高优先级消息是否丢弃: ${backpressure.shouldDropMessage(MessagePriority.HIGH)}`);
    console.log(`- 中优先级消息是否丢弃: ${backpressure.shouldDropMessage(MessagePriority.MEDIUM)}`);
    console.log(`- 低优先级消息是否丢弃: ${backpressure.shouldDropMessage(MessagePriority.LOW)}`);

    // 测试消息缓冲
    const testMessage = { type: 'TEST', payload: 'test data' };
    const buffered = backpressure.bufferMessage(testMessage, MessagePriority.MEDIUM);
    console.log(`- 消息缓冲结果: ${buffered ? '已缓冲' : '未缓冲'}`);

    // 获取待处理的缓冲消息
    const messages = backpressure.getBufferedMessagesToProcess(10);
    console.log(`- 获取到 ${messages.length} 条待处理消息`);
}

/**
 * 测试一致性哈希Actor放置
 */
function testConsistentHashing() {
    console.log('\n--- 测试一致性哈希Actor放置 ---');

    // 创建模拟的ClusterManager (仅用于测试)
    const mockClusterManager = {
        getAllNodes: () => {
            return [
                { id: 'node-1', status: NodeStatus.ACTIVE },
                { id: 'node-2', status: NodeStatus.ACTIVE },
                { id: 'node-3', status: NodeStatus.ACTIVE },
                { id: 'node-4', status: NodeStatus.SUSPECTED },
                { id: 'node-5', status: NodeStatus.ACTIVE }
            ];
        },
        on: (event: string, callback: (data: any) => void) => {
            // 简单的事件监听模拟
            console.log(`已注册事件监听: ${event}`);
        }
    };

    // 创建一致性哈希放置策略
    const placement = new ConsistentHashActorPlacement(mockClusterManager as any);

    // 测试Actor放置
    console.log('测试Actor放置:');
    const actors = [
        { id: 'actor-1', type: 'worker' },
        { id: 'actor-2', type: 'supervisor' },
        { id: 'actor-3', type: 'worker' },
        { id: 'actor-4', type: 'processor' },
        { id: 'actor-5', type: 'worker' }
    ];

    // 检查每个Actor的放置位置
    for (const actor of actors) {
        const nodeId = placement.determineNodeForActor(actor.id);
        console.log(`- Actor ${actor.id} (${actor.type}) 被放置到节点: ${nodeId}`);
    }

    // 测试获取备份节点
    const actorId = 'actor-1';
    const replicas = placement.getReplicaNodesForActor(actorId, 2);
    console.log(`\nActor ${actorId} 的备份节点:`);
    for (const replica of replicas) {
        console.log(`- ${replica}`);
    }

    // 模拟节点变化，触发哈希环更新
    console.log('\n模拟节点变化后的重新放置:');
    // 这里我们直接调用更新方法，在实际使用中会通过事件触发
    placement.updateHashRing();

    // 重新检查Actor放置
    for (const actor of actors) {
        const nodeId = placement.determineNodeForActor(actor.id);
        console.log(`- Actor ${actor.id} (${actor.type}) 现在被放置到节点: ${nodeId}`);
    }
}

// 执行所有测试
function runAllTests() {
    console.log('开始测试新实现的功能模块...\n');

    testConsensus();
    testSystemMetrics();
    testBackpressure();
    testConsistentHashing();

    console.log('\n所有测试完成!');
}

// 如果直接运行此文件，执行测试
if (require.main === module) {
    runAllTests();
}

export {
    testConsensus,
    testSystemMetrics,
    testBackpressure,
    testConsistentHashing,
    runAllTests
};

/**
 * 创建一个简单的模拟传输层
 */
function createMockTransport() {
    return {
        start: async () => { console.log('Mock transport started'); },
        stop: async () => { console.log('Mock transport stopped'); },
        on: (eventName: string, callback: (data: any) => void) => {
            console.log(`Registered listener for event: ${eventName}`);
        },
        broadcast: async (msg: any) => {
            console.log(`Broadcasting message: ${JSON.stringify(msg)}`);
        },
        sendToNode: async (nodeId: string, msg: any) => {
            console.log(`Sending message to node ${nodeId}`);
        }
    };
} 