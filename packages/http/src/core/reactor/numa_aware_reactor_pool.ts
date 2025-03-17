/**
 * numa_aware_reactor_pool.ts
 * 
 * NUMA感知反应器池实现
 * 提供针对NUMA架构优化的反应器池，提升系统性能
 */

import { Reactor, ReactorOptions, Work, WorkResult } from './reactor';
import { MultiReactorPool, MultiReactorPoolOptions } from './multi_reactor_pool';
import {
    getSystemTopology,
    isNativeBindingSupported,
    setNumaAffinity,
    getCpuUsage
} from '../performance/thread_binding';
import {
    ThreadAffinityManager,
    ThreadAffinityOptions
} from '../performance/thread_affinity';

/**
 * NUMA感知反应器池配置选项
 */
export interface NumaAwareReactorPoolOptions extends MultiReactorPoolOptions {
    /**
     * 每个NUMA节点的反应器数量
     * 如果未指定，将根据每个NUMA节点的CPU核心数自动确定
     */
    reactorsPerNumaNode?: number;

    /**
     * 内存分配策略
     */
    memoryPolicy?: 'local' | 'interleaved' | 'preferred';

    /**
     * 优先使用的NUMA节点
     * 仅在memoryPolicy为'preferred'时有效
     */
    preferredNumaNode?: number;

    /**
     * 跨NUMA节点工作窃取策略
     */
    crossNumaWorkStealingPolicy?: 'never' | 'when-idle' | 'always';

    /**
     * NUMA负载不平衡的重平衡阈值(%)
     * 例如: 30表示当一个NUMA节点的负载比另一个高30%时触发重平衡
     */
    numaRebalanceThreshold?: number;
}

/**
 * NUMA节点反应器组
 */
interface NumaNodeReactorGroup {
    /**
     * NUMA节点ID
     */
    numaNodeId: number;

    /**
     * 该NUMA节点的反应器列表
     */
    reactors: Reactor[];

    /**
     * 该NUMA节点的CPU核心列表
     */
    cores: number[];

    /**
     * 当前可分配的核心索引
     */
    currentCoreIndex: number;

    /**
     * 当前负载指标
     */
    currentLoad: number;
}

/**
 * NUMA感知反应器池
 * 优化反应器分配，使其与NUMA拓扑保持一致，提高性能
 */
export class NumaAwareReactorPool extends MultiReactorPool {
    /**
     * 系统拓扑信息
     */
    private systemTopology: ReturnType<typeof getSystemTopology>;

    /**
     * 按NUMA节点分组的反应器
     */
    private numaGroups: NumaNodeReactorGroup[] = [];

    /**
     * 跨NUMA节点工作窃取策略
     */
    private crossNumaWorkStealingPolicy: 'never' | 'when-idle' | 'always';

    /**
     * NUMA负载重平衡阈值
     */
    private numaRebalanceThreshold: number;

    /**
     * 内存分配策略
     */
    private memoryPolicy: 'local' | 'interleaved' | 'preferred';

    /**
     * 优先使用的NUMA节点
     */
    private preferredNumaNode: number;

    /**
     * 最后一次进行NUMA负载均衡的时间
     */
    private lastNumaRebalanceTime: number = 0;

    /**
     * 原生绑定是否可用
     */
    private nativeBindingSupported: boolean;

    /**
     * 是否正在运行
     */
    private running: boolean = false;

    /**
     * 配置选项
     */
    private options: NumaAwareReactorPoolOptions;

    /**
     * 构造函数
     * @param options NUMA感知反应器池配置选项
     */
    constructor(options?: NumaAwareReactorPoolOptions) {
        // 先调用父类构造函数，但暂时不创建反应器
        // 我们将传入一个空的反应器配置，稍后自己创建
        const parentOptions = {
            ...options,
            reactorCount: 0 // 暂时设置为0，我们将手动创建反应器
        };

        super(parentOptions);

        // 保存选项
        this.options = options || {};

        // 获取系统拓扑信息
        this.systemTopology = getSystemTopology();
        this.nativeBindingSupported = isNativeBindingSupported();

        // 设置NUMA相关参数
        this.crossNumaWorkStealingPolicy = options?.crossNumaWorkStealingPolicy || 'when-idle';
        this.numaRebalanceThreshold = options?.numaRebalanceThreshold || 30;
        this.memoryPolicy = options?.memoryPolicy || 'local';
        this.preferredNumaNode = options?.preferredNumaNode || 0;

        // 记录初始化信息
        this.logMessage('info', `初始化NUMA感知反应器池，NUMA节点数: ${this.systemTopology.numaNodes}`);
        this.logMessage('info', `每个节点的核心数: ${JSON.stringify(this.systemTopology.coresPerNode)}`);
        this.logMessage('info', `跨NUMA工作窃取策略: ${this.crossNumaWorkStealingPolicy}`);

        // 创建并分配反应器到NUMA节点
        this.createNumaAlignedReactors(options);
    }

    /**
     * 将工作分发给合适的反应器
     * @param work 要处理的工作
     */
    async dispatch(work: Work): Promise<WorkResult> {
        if (!this.running) {
            return {
                status: 'error',
                error: new Error('NUMA感知反应器池未运行'),
                processingTime: 0
            };
        }

        // 选择最适合的NUMA节点
        const targetNumaGroup = this.selectNumaNodeForWork(work);

        // 在选定的NUMA节点内选择反应器
        const selectedReactor = this.selectReactorInNumaNode(targetNumaGroup, work);

        this.logMessage('debug', `将工作分发给NUMA节点 ${targetNumaGroup.numaNodeId} 上的反应器 ${selectedReactor.id}`);

        // 提交工作到选中的反应器
        const result = await selectedReactor.submit(work);

        // 更新NUMA组的负载统计
        this.updateNumaGroupLoad(targetNumaGroup);

        // 定期检查是否需要重平衡NUMA负载
        this.checkAndRebalanceNumaLoad();

        return result;
    }

    /**
     * 获取所有反应器的列表
     */
    getAllReactors(): Reactor[] {
        const allReactors: Reactor[] = [];

        for (const group of this.numaGroups) {
            allReactors.push(...group.reactors);
        }

        return allReactors;
    }

    /**
     * 统计每个NUMA节点的当前负载情况
     */
    getNumaNodesLoad(): { numaNodeId: number; loadPercentage: number; reactorCount: number }[] {
        return this.numaGroups.map(group => {
            return {
                numaNodeId: group.numaNodeId,
                loadPercentage: group.currentLoad,
                reactorCount: group.reactors.length
            };
        });
    }

    /**
     * 获取特定NUMA节点的反应器列表
     * @param numaNodeId NUMA节点ID
     */
    getReactorsForNumaNode(numaNodeId: number): Reactor[] {
        const group = this.numaGroups.find(g => g.numaNodeId === numaNodeId);
        return group ? [...group.reactors] : [];
    }

    /**
     * 创建NUMA对齐的反应器
     * @param options 配置选项
     */
    private createNumaAlignedReactors(options?: NumaAwareReactorPoolOptions): void {
        // 确定每个NUMA节点的反应器数量
        const reactorsPerNode = options?.reactorsPerNumaNode || this.calculateOptimalReactorsPerNode();

        this.logMessage('info', `每个NUMA节点创建 ${reactorsPerNode} 个反应器`);

        // 为每个NUMA节点创建反应器组
        for (let nodeId = 0; nodeId < this.systemTopology.numaNodes; nodeId++) {
            // 计算该NUMA节点的核心列表
            const coreStart = nodeId > 0
                ? this.systemTopology.coresPerNode.slice(0, nodeId).reduce((a, b) => a + b, 0)
                : 0;
            const coreCount = this.systemTopology.coresPerNode[nodeId];
            const nodeCores = Array.from(
                { length: coreCount },
                (_, i) => coreStart + i
            );

            const numaGroup: NumaNodeReactorGroup = {
                numaNodeId: nodeId,
                reactors: [],
                cores: nodeCores,
                currentCoreIndex: 0,
                currentLoad: 0
            };

            // 为此NUMA节点创建反应器
            for (let i = 0; i < reactorsPerNode; i++) {
                // 选择此反应器的核心
                const coreId = this.getNextCoreForNumaNode(numaGroup);

                // 创建反应器
                const reactorId = `numa-${nodeId}-reactor-${i}`;

                const reactorOptions: ReactorOptions = {
                    id: reactorId,
                    cpuCore: coreId,
                    affinityOptions: {
                        enabled: true,
                        priorityStrategy: 'dynamic',
                        numaAware: true,
                        logging: options?.logging?.enabled || false
                    },
                    logging: options?.logging
                };

                const reactor = new Reactor(reactorOptions);

                // 添加到NUMA组
                numaGroup.reactors.push(reactor);

                this.logMessage('debug', `创建NUMA节点 ${nodeId} 上的反应器 ${reactorId}，绑定到核心 ${coreId}`);
            }

            // 将此NUMA组添加到列表
            this.numaGroups.push(numaGroup);

            this.logMessage('info', `NUMA节点 ${nodeId} 创建了 ${numaGroup.reactors.length} 个反应器`);
        }
    }

    /**
     * 计算每个NUMA节点的最优反应器数量
     */
    private calculateOptimalReactorsPerNode(): number {
        // 简单策略：每个NUMA节点的反应器数量为核心数的75%，但至少1个
        const avgCoresPerNode = this.systemTopology.coresPerNode.reduce((sum, cores) => sum + cores, 0) /
            this.systemTopology.numaNodes;

        return Math.max(1, Math.floor(avgCoresPerNode * 0.75));
    }

    /**
     * 获取NUMA节点的下一个可用核心
     * @param numaGroup NUMA节点反应器组
     */
    private getNextCoreForNumaNode(numaGroup: NumaNodeReactorGroup): number {
        // 按轮询方式选择核心
        const coreId = numaGroup.cores[numaGroup.currentCoreIndex];
        numaGroup.currentCoreIndex = (numaGroup.currentCoreIndex + 1) % numaGroup.cores.length;
        return coreId;
    }

    /**
     * 为工作选择最合适的NUMA节点
     * @param work 工作项
     */
    private selectNumaNodeForWork(work: Work): NumaNodeReactorGroup {
        switch (this.memoryPolicy) {
            case 'preferred':
                // 总是使用首选的NUMA节点
                const preferredGroup = this.numaGroups.find(g => g.numaNodeId === this.preferredNumaNode);
                if (preferredGroup) {
                    return preferredGroup;
                }
                // 如果找不到首选节点，则继续使用其他策略
                break;

            case 'interleaved':
                // 在所有NUMA节点之间交替分配工作
                // 选择负载最低的NUMA节点
                return this.numaGroups.reduce((lowest, current) =>
                    current.currentLoad < lowest.currentLoad ? current : lowest,
                    this.numaGroups[0]
                );

            case 'local':
            default:
                // 尝试找到与工作关联性最强的NUMA节点
                if (work.payload && work.payload._preferredNumaNode !== undefined) {
                    const preferredNodeId = work.payload._preferredNumaNode;
                    const matchingGroup = this.numaGroups.find(g => g.numaNodeId === preferredNodeId);
                    if (matchingGroup) {
                        return matchingGroup;
                    }
                }

                // 如果没有关联性信息，则选择负载最低的NUMA节点
                return this.numaGroups.reduce((lowest, current) =>
                    current.currentLoad < lowest.currentLoad ? current : lowest,
                    this.numaGroups[0]
                );
        }

        // 默认返回第一个NUMA节点组
        return this.numaGroups[0];
    }

    /**
     * 在NUMA节点内选择最合适的反应器
     * @param numaGroup NUMA节点反应器组
     * @param work 工作项
     */
    private selectReactorInNumaNode(numaGroup: NumaNodeReactorGroup, work: Work): Reactor {
        // 根据负载选择NUMA节点内部的反应器
        const groupReactors = numaGroup.reactors;

        // 如果需要工作窃取，且该NUMA组内所有反应器负载过高，则尝试从其他NUMA节点窃取反应器
        if (this.crossNumaWorkStealingPolicy !== 'never') {
            const allBusy = groupReactors.every(reactor => {
                const stats = reactor.getStats();
                return stats.currentLoad > 5; // 示例阈值
            });

            if (allBusy && this.crossNumaWorkStealingPolicy === 'always' ||
                (this.crossNumaWorkStealingPolicy === 'when-idle' && numaGroup.currentLoad > 80)) {
                // 从其他NUMA节点中寻找空闲反应器
                const lowestLoadReactor = this.findLowestLoadReactorAcrossNumaNodes();

                if (lowestLoadReactor) {
                    this.logMessage('info', `从其他NUMA节点窃取反应器来处理工作: ${lowestLoadReactor.id}`);
                    return lowestLoadReactor;
                }
            }
        }

        // 默认选择该NUMA节点内负载最低的反应器
        return groupReactors.reduce((lowest, current) => {
            const lowestStats = lowest.getStats();
            const currentStats = current.getStats();
            return currentStats.currentLoad < lowestStats.currentLoad ? current : lowest;
        }, groupReactors[0]);
    }

    /**
     * 在所有NUMA节点中查找负载最低的反应器
     */
    private findLowestLoadReactorAcrossNumaNodes(): Reactor | null {
        let lowestLoad = Number.MAX_VALUE;
        let lowestLoadReactor: Reactor | null = null;

        for (const group of this.numaGroups) {
            for (const reactor of group.reactors) {
                const stats = reactor.getStats();
                if (stats.currentLoad < lowestLoad) {
                    lowestLoad = stats.currentLoad;
                    lowestLoadReactor = reactor;
                }
            }
        }

        return lowestLoadReactor;
    }

    /**
     * 更新NUMA组的负载统计
     * @param numaGroup NUMA节点反应器组
     */
    private updateNumaGroupLoad(numaGroup: NumaNodeReactorGroup): void {
        let totalLoad = 0;
        let reactorsWithLoad = 0;

        for (const reactor of numaGroup.reactors) {
            const stats = reactor.getStats();

            // 如果可以，使用CPU使用率作为负载指标
            if (stats.cpuUsage !== undefined) {
                totalLoad += stats.cpuUsage;
                reactorsWithLoad++;
            } else {
                // 否则，使用队列长度和当前活跃工作数
                const normalizedLoad = (stats.queuedWork + stats.currentLoad) * 10;
                totalLoad += normalizedLoad;
                reactorsWithLoad++;
            }
        }

        // 计算平均负载
        numaGroup.currentLoad = reactorsWithLoad > 0
            ? totalLoad / reactorsWithLoad
            : 0;

        this.logMessage('debug', `NUMA节点 ${numaGroup.numaNodeId} 当前负载: ${numaGroup.currentLoad.toFixed(2)}%`);
    }

    /**
     * 检查并重平衡NUMA节点间的负载
     */
    private checkAndRebalanceNumaLoad(): void {
        const now = Date.now();

        // 控制重平衡频率，避免过于频繁
        if (now - this.lastNumaRebalanceTime < 10000) { // 每10秒最多一次
            return;
        }

        // 找出负载最高和最低的NUMA节点
        let highestLoad = -1;
        let lowestLoad = Number.MAX_VALUE;
        let highestLoadGroup: NumaNodeReactorGroup | null = null;
        let lowestLoadGroup: NumaNodeReactorGroup | null = null;

        for (const group of this.numaGroups) {
            if (group.currentLoad > highestLoad) {
                highestLoad = group.currentLoad;
                highestLoadGroup = group;
            }

            if (group.currentLoad < lowestLoad) {
                lowestLoad = group.currentLoad;
                lowestLoadGroup = group;
            }
        }

        // 计算负载差异百分比
        if (highestLoadGroup && lowestLoadGroup && lowestLoad > 0) {
            const loadDifferencePercent = ((highestLoad - lowestLoad) / lowestLoad) * 100;

            // 如果负载差异超过阈值，尝试重平衡
            if (loadDifferencePercent > this.numaRebalanceThreshold) {
                this.logMessage('info', `检测到NUMA负载不平衡: 节点${highestLoadGroup.numaNodeId}=${highestLoad.toFixed(2)}%, 节点${lowestLoadGroup.numaNodeId}=${lowestLoad.toFixed(2)}%`);

                // 实施重平衡策略...
                this.rebalanceNumaNodes(highestLoadGroup, lowestLoadGroup);

                this.lastNumaRebalanceTime = now;
            }
        }
    }

    /**
     * 重平衡NUMA节点间的负载
     * @param highLoadGroup 高负载NUMA组
     * @param lowLoadGroup 低负载NUMA组
     */
    private rebalanceNumaNodes(highLoadGroup: NumaNodeReactorGroup, lowLoadGroup: NumaNodeReactorGroup): void {
        this.logMessage('info', `执行NUMA负载重平衡: 从节点${highLoadGroup.numaNodeId}到节点${lowLoadGroup.numaNodeId}`);

        // 此实现仅为示例，真实实现可能需要更复杂的策略
        // 例如，迁移特定的长时间运行任务、重新分配连接等

        // 在此示例中，我们只是记录重平衡尝试
        // 实际的负载平衡会在下一轮工作分发时自然发生，
        // 因为selectNumaNodeForWork方法会倾向于选择低负载的NUMA节点
    }

    /**
     * 启动反应器池
     */
    async start(): Promise<void> {
        if (this.running) {
            return;
        }

        this.logMessage('info', '启动NUMA感知反应器池');

        // 启动所有NUMA节点的所有反应器
        for (const numaGroup of this.numaGroups) {
            this.logMessage('info', `启动NUMA节点 ${numaGroup.numaNodeId} 的反应器`);

            for (const reactor of numaGroup.reactors) {
                await reactor.start();
            }
        }

        // 设置运行状态
        this.running = true;

        this.logMessage('info', 'NUMA感知反应器池已启动');
    }

    /**
     * 停止反应器池
     */
    async stop(): Promise<void> {
        if (!this.running) {
            return;
        }

        this.logMessage('info', '停止NUMA感知反应器池');

        // 停止所有NUMA节点的所有反应器
        for (const numaGroup of this.numaGroups) {
            this.logMessage('info', `停止NUMA节点 ${numaGroup.numaNodeId} 的反应器`);

            for (const reactor of numaGroup.reactors) {
                await reactor.stop();
            }
        }

        // 设置运行状态
        this.running = false;

        this.logMessage('info', 'NUMA感知反应器池已停止');
    }

    /**
     * 日志输出
     * @param level 日志级别
     * @param message 日志消息
     */
    private logMessage(level: 'debug' | 'info' | 'warn' | 'error', message: string): void {
        // 检查是否启用日志记录
        if (!this.options?.logging?.enabled) {
            return;
        }

        const levelPriority = {
            'debug': 0,
            'info': 1,
            'warn': 2,
            'error': 3
        };

        // 检查日志级别
        if (this.options.logging &&
            levelPriority[level] >= levelPriority[this.options.logging.level || 'info']) {
            const timestamp = new Date().toISOString();
            console[level](`[${timestamp}] [NumaAwareReactorPool] [${level.toUpperCase()}] ${message}`);
        }
    }
} 