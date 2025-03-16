/**
 * 多反应器池 - 管理多个Reactor实例的高性能工作调度器
 * 
 * 为bactor HTTP实现多反应器模式，每个CPU核心分配一个独立事件循环，
 * 充分利用多核处理器资源，提高系统的并行处理能力和整体吞吐量。
 */

import { Reactor, ReactorOptions, Work, WorkResult, ReactorStats } from './reactor';
import { createHash } from 'crypto';

/**
 * 多反应器池配置选项
 */
export interface MultiReactorPoolOptions {
    /**
     * 反应器数量，默认为系统CPU核心数
     */
    reactorCount?: number;

    /**
     * 负载均衡策略
     */
    balancingStrategy?: 'round-robin' | 'least-busy' | 'consistent-hash';

    /**
     * 是否启用CPU亲和性（如果平台支持）
     */
    enableAffinityIfSupported?: boolean;

    /**
     * 日志选项
     */
    logging?: {
        enabled: boolean;
        level: 'debug' | 'info' | 'warn' | 'error';
    };
}

/**
 * 反应器池统计信息
 */
export interface ReactorPoolStats {
    /**
     * 活跃的反应器数量
     */
    activeReactors: number;

    /**
     * 总处理工作数
     */
    totalWorkProcessed: number;

    /**
     * 每个反应器的工作负载
     */
    reactorLoads: {
        reactorId: string;
        currentLoad: number;
        totalProcessed: number;
        averageProcessingTime: number;
    }[];
}

/**
 * 负载均衡器接口
 */
interface LoadBalancer {
    selectReactor(work: Work, reactors: Reactor[]): Reactor;
    update(reactor: Reactor): void;
}

/**
 * 轮询负载均衡器
 */
class RoundRobinLoadBalancer implements LoadBalancer {
    private currentIndex = 0;

    selectReactor(work: Work, reactors: Reactor[]): Reactor {
        const reactor = reactors[this.currentIndex];
        this.currentIndex = (this.currentIndex + 1) % reactors.length;
        return reactor;
    }

    update(reactor: Reactor): void {
        // 轮询算法不需要更新状态
    }
}

/**
 * 最少忙碌负载均衡器
 */
class LeastBusyLoadBalancer implements LoadBalancer {
    selectReactor(work: Work, reactors: Reactor[]): Reactor {
        // 选择负载最小的反应器
        return reactors.reduce((least, current) => {
            const leastStats = least.getStats();
            const currentStats = current.getStats();
            return currentStats.currentLoad < leastStats.currentLoad ? current : least;
        });
    }

    update(reactor: Reactor): void {
        // 不需要额外更新，因为每次都会直接获取最新统计信息
    }
}

/**
 * 一致性哈希负载均衡器
 */
class ConsistentHashLoadBalancer implements LoadBalancer {
    selectReactor(work: Work, reactors: Reactor[]): Reactor {
        // 基于工作类型和负载计算哈希值
        const key = `${work.type}-${JSON.stringify(work.payload)}`;
        const hash = createHash('md5').update(key).digest().readUInt32BE(0);
        const index = hash % reactors.length;
        return reactors[index];
    }

    update(reactor: Reactor): void {
        // 一致性哈希不需要更新状态
    }
}

/**
 * 多反应器池类
 */
export class MultiReactorPool {
    /**
     * 反应器实例数组
     */
    private reactors: Reactor[] = [];

    /**
     * 负载均衡器
     */
    private loadBalancer: LoadBalancer;

    /**
     * 日志选项
     */
    private logging: {
        enabled: boolean;
        level: 'debug' | 'info' | 'warn' | 'error';
    };

    /**
     * 是否正在运行
     */
    private isRunning: boolean = false;

    /**
     * 构造函数
     * @param options 多反应器池配置选项
     */
    constructor(options?: MultiReactorPoolOptions) {
        // 设置默认值
        const reactorCount = options?.reactorCount || MultiReactorPool.getCpuCount();
        const balancingStrategy = options?.balancingStrategy || 'round-robin';
        const enableAffinity = options?.enableAffinityIfSupported ?? false;
        this.logging = options?.logging || { enabled: false, level: 'info' };

        // 创建负载均衡器
        this.loadBalancer = this.createLoadBalancer(balancingStrategy);

        // 记录初始化信息
        this.log('info', `初始化多反应器池，反应器数量: ${reactorCount}，负载均衡策略: ${balancingStrategy}`);

        // 创建反应器实例
        for (let i = 0; i < reactorCount; i++) {
            const reactorOptions: ReactorOptions = {
                id: `reactor-${i}`,
                logging: this.logging
            };

            // 如果启用CPU亲和性，设置CPU核心
            if (enableAffinity) {
                reactorOptions.cpuCore = i;
            }

            const reactor = new Reactor(reactorOptions);
            this.reactors.push(reactor);
        }

        this.log('info', `多反应器池初始化完成，创建了 ${this.reactors.length} 个反应器`);
    }

    /**
     * 启动多反应器池
     */
    async start(): Promise<void> {
        if (this.isRunning) {
            return;
        }

        this.log('info', '启动多反应器池');
        this.isRunning = true;

        // 启动所有反应器
        await Promise.all(this.reactors.map(reactor => reactor.start()));

        this.log('info', '多反应器池已启动');
    }

    /**
     * 停止多反应器池
     */
    async stop(): Promise<void> {
        if (!this.isRunning) {
            return;
        }

        this.log('info', '停止多反应器池');
        this.isRunning = false;

        // 停止所有反应器
        await Promise.all(this.reactors.map(reactor => reactor.stop()));

        this.log('info', '多反应器池已停止');
    }

    /**
     * 将工作分发给合适的反应器
     * @param work 要处理的工作
     */
    async dispatch(work: Work): Promise<WorkResult> {
        if (!this.isRunning) {
            return {
                status: 'error',
                error: new Error('多反应器池未运行'),
                processingTime: 0
            };
        }

        // 使用负载均衡器选择反应器
        const selectedReactor = this.loadBalancer.selectReactor(work, this.reactors);

        this.log('debug', `将工作分发给反应器 ${selectedReactor.id}, 工作类型: ${work.type}`);

        // 提交工作到选中的反应器
        const result = await selectedReactor.submit(work);

        // 更新负载均衡器状态
        this.loadBalancer.update(selectedReactor);

        return result;
    }

    /**
     * 获取反应器池的统计信息
     */
    getStats(): ReactorPoolStats {
        const reactorStats = this.reactors.map(reactor => reactor.getStats());

        const totalWorkProcessed = reactorStats.reduce((sum, stats) => sum + stats.totalProcessed, 0);

        const reactorLoads = reactorStats.map(stats => ({
            reactorId: stats.id,
            currentLoad: stats.currentLoad,
            totalProcessed: stats.totalProcessed,
            averageProcessingTime: stats.averageProcessingTime
        }));

        return {
            activeReactors: this.reactors.length,
            totalWorkProcessed,
            reactorLoads
        };
    }

    /**
     * 为指定的工作类型注册处理器
     * @param workType 工作类型
     * @param handler 处理函数
     */
    registerWorkHandler(workType: string, handler: (work: Work) => Promise<any>): void {
        // 向所有反应器注册相同的处理器
        for (const reactor of this.reactors) {
            reactor.registerWorkHandler(workType, handler);
        }

        this.log('info', `为所有反应器注册工作处理器，类型: ${workType}`);
    }

    /**
     * 创建负载均衡器实例
     * @param strategy 负载均衡策略
     */
    private createLoadBalancer(strategy: string): LoadBalancer {
        switch (strategy) {
            case 'round-robin':
                return new RoundRobinLoadBalancer();
            case 'least-busy':
                return new LeastBusyLoadBalancer();
            case 'consistent-hash':
                return new ConsistentHashLoadBalancer();
            default:
                this.log('warn', `未知的负载均衡策略: ${strategy}，使用默认的轮询策略`);
                return new RoundRobinLoadBalancer();
        }
    }

    /**
     * 获取系统CPU核心数
     */
    private static getCpuCount(): number {
        try {
            // 尝试使用node的os模块
            return require('os').cpus().length;
        } catch (e) {
            // 尝试获取Bun的CPU核心数
            if (typeof Bun !== 'undefined' && typeof (Bun as any).env?.BUN_CPU_COUNT === 'string') {
                const count = parseInt((Bun as any).env.BUN_CPU_COUNT, 10);
                if (!isNaN(count) && count > 0) {
                    return count;
                }
            }

            // 保守默认值
            return 4;
        }
    }

    /**
     * 记录日志
     * @param level 日志级别
     * @param message 日志消息
     */
    private log(level: 'debug' | 'info' | 'warn' | 'error', message: string): void {
        if (!this.logging.enabled) {
            return;
        }

        const levelPriority = {
            'debug': 0,
            'info': 1,
            'warn': 2,
            'error': 3
        };

        if (levelPriority[level] >= levelPriority[this.logging.level]) {
            const timestamp = new Date().toISOString();
            console[level](`[${timestamp}] [MultiReactorPool] [${level.toUpperCase()}] ${message}`);
        }
    }
} 