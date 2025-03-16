/**
 * Reactor - 事件循环优化实现
 * 
 * 每个Reactor实例代表一个独立的事件处理循环，能够高效处理异步任务
 * 支持与特定CPU核心绑定（如果平台支持）以提高性能
 */

import {
    bindToCore,
    unbindCurrentThread,
    ThreadAffinityOptions
} from '../performance/thread_affinity';
import {
    getCpuUsage,
    isNativeBindingSupported
} from '../performance/thread_binding';

/**
 * Reactor选项接口
 */
export interface ReactorOptions {
    /**
     * 唯一标识符
     */
    id: string;

    /**
     * 绑定的CPU核心ID（如果支持）
     */
    cpuCore?: number;

    /**
     * 线程亲和性选项
     */
    affinityOptions?: ThreadAffinityOptions;

    /**
     * 工作队列容量
     */
    queueCapacity?: number;

    /**
     * 日志选项
     */
    logging?: {
        enabled: boolean;
        level: 'debug' | 'info' | 'warn' | 'error';
    };
}

/**
 * 工作项接口
 */
export interface Work {
    /**
     * 工作类型
     */
    type: string;

    /**
     * 工作负载
     */
    payload: any;

    /**
     * 优先级 (较低的值具有较高的优先级)
     */
    priority?: number;
}

/**
 * 工作结果接口
 */
export interface WorkResult {
    /**
     * 结果状态
     */
    status: 'success' | 'error';

    /**
     * 结果数据
     */
    data?: any;

    /**
     * 错误信息
     */
    error?: Error;

    /**
     * 处理时间（毫秒）
     */
    processingTime: number;
}

/**
 * Reactor统计信息
 */
export interface ReactorStats {
    /**
     * Reactor ID
     */
    id: string;

    /**
     * 当前负载（处理中的工作数）
     */
    currentLoad: number;

    /**
     * 排队的工作数
     */
    queuedWork: number;

    /**
     * 总处理的工作数
     */
    totalProcessed: number;

    /**
     * 平均处理时间（毫秒）
     */
    averageProcessingTime: number;

    /**
     * 最后活动时间戳
     */
    lastActiveTimestamp: number;

    /**
     * CPU使用率(如果可获取)
     */
    cpuUsage?: number;

    /**
     * 绑定的CPU核心
     */
    boundToCore?: number;
}

/**
 * Reactor类 - 每个实例管理一个独立的事件循环
 */
export class Reactor {
    /**
     * Reactor的唯一标识符
     */
    readonly id: string;

    /**
     * 当前活跃的工作数量
     */
    private activeWorkCount: number = 0;

    /**
     * 工作队列
     */
    private workQueue: Work[] = [];

    /**
     * 总处理的工作数
     */
    private totalWorkProcessed: number = 0;

    /**
     * 总处理时间（用于计算平均值）
     */
    private totalProcessingTimeMs: number = 0;

    /**
     * 是否正在运行
     */
    private isRunning: boolean = false;

    /**
     * 绑定的CPU核心
     */
    private cpuCore?: number;

    /**
     * 线程亲和性选项
     */
    private affinityOptions?: ThreadAffinityOptions;

    /**
     * CPU亲和性是否可用
     */
    private affinityAvailable: boolean;

    /**
     * 是否已绑定
     */
    private isBound: boolean = false;

    /**
     * 日志选项
     */
    private logging: {
        enabled: boolean;
        level: 'debug' | 'info' | 'warn' | 'error';
    };

    /**
     * 最后活动时间戳
     */
    private lastActiveTimestamp: number = Date.now();

    /**
     * 工作处理器映射
     */
    private workHandlers: Map<string, (work: Work) => Promise<any>> = new Map();

    /**
     * 统计信息收集计时器
     */
    private statsTimer: NodeJS.Timeout | null = null;

    /**
     * 构造函数
     * @param options Reactor配置选项
     */
    constructor(options: ReactorOptions) {
        this.id = options.id;
        this.cpuCore = options.cpuCore;
        this.affinityOptions = options.affinityOptions;
        this.logging = options.logging || { enabled: false, level: 'info' };
        this.affinityAvailable = isNativeBindingSupported();

        // 注册默认处理器
        this.registerWorkHandler('default', async (work) => {
            this.log('debug', `执行默认处理器，工作类型: ${work.type}`);
            return { message: '默认处理器执行成功' };
        });

        this.log('info', `Reactor [${this.id}] 已创建${this.cpuCore !== undefined ? '，将绑定到CPU核心 ' + this.cpuCore : ''}`);
        this.log('info', `原生线程亲和性支持: ${this.affinityAvailable ? '可用' : '不可用'}`);
    }

    /**
     * 启动Reactor
     */
    async start(): Promise<void> {
        if (this.isRunning) {
            return;
        }

        this.isRunning = true;
        this.log('info', `Reactor [${this.id}] 已启动`);

        // 如果平台支持，尝试实现CPU亲和性
        if (this.cpuCore !== undefined) {
            try {
                this.tryCpuAffinity();
            } catch (error: any) {
                this.log('warn', `无法设置CPU亲和性: ${error.message}`);
            }
        }

        // 启动统计信息收集
        this.startStatsCollection();

        // 启动事件循环
        this.processWorkQueue();
    }

    /**
     * 停止Reactor
     */
    async stop(): Promise<void> {
        if (!this.isRunning) {
            return;
        }

        this.isRunning = false;
        this.log('info', `Reactor [${this.id}] 正在停止，队列中还有 ${this.workQueue.length} 项工作`);

        // 停止统计信息收集
        this.stopStatsCollection();

        // 解除CPU绑定
        if (this.isBound) {
            try {
                unbindCurrentThread();
                this.isBound = false;
                this.log('info', `已解除Reactor [${this.id}] 与CPU核心 ${this.cpuCore} 的绑定`);
            } catch (error: any) {
                this.log('warn', `解除CPU绑定失败: ${error.message}`);
            }
        }

        // 等待所有活跃工作完成
        if (this.activeWorkCount > 0) {
            this.log('info', `等待 ${this.activeWorkCount} 个活跃工作完成...`);
            await new Promise(resolve => {
                const checkInterval = setInterval(() => {
                    if (this.activeWorkCount === 0) {
                        clearInterval(checkInterval);
                        resolve(null);
                    }
                }, 100);
            });
        }

        this.log('info', `Reactor [${this.id}] 已停止`);
    }

    /**
     * 提交工作到Reactor
     * @param work 工作项
     */
    async submit(work: Work): Promise<WorkResult> {
        if (!this.isRunning) {
            return {
                status: 'error',
                error: new Error('Reactor未运行'),
                processingTime: 0
            };
        }

        this.lastActiveTimestamp = Date.now();

        return new Promise<WorkResult>((resolve, reject) => {
            // 创建带有回调的增强版工作项
            const enhancedWork: Work & {
                resolve: (result: WorkResult) => void;
                reject: (error: Error) => void;
            } = {
                ...work,
                priority: work.priority || 10, // 默认优先级
                resolve,
                reject
            };

            // 添加到工作队列
            this.workQueue.push(enhancedWork);

            // 按优先级对队列排序
            this.workQueue.sort((a, b) => (a.priority || 10) - (b.priority || 10));

            this.log('debug', `工作已提交到队列, 类型: ${work.type}, 队列长度: ${this.workQueue.length}`);
        });
    }

    /**
     * 注册工作处理器
     * @param workType 工作类型
     * @param handler 处理函数
     */
    registerWorkHandler(workType: string, handler: (work: Work) => Promise<any>): void {
        this.workHandlers.set(workType, handler);
        this.log('debug', `已注册工作处理器, 类型: ${workType}`);
    }

    /**
     * 获取Reactor统计信息
     */
    getStats(): ReactorStats {
        // 获取CPU使用率
        let cpuUsage: number | undefined = undefined;
        if (this.affinityAvailable && this.cpuCore !== undefined) {
            cpuUsage = getCpuUsage(this.cpuCore);
        }

        return {
            id: this.id,
            currentLoad: this.activeWorkCount,
            queuedWork: this.workQueue.length,
            totalProcessed: this.totalWorkProcessed,
            averageProcessingTime: this.totalWorkProcessed > 0
                ? this.totalProcessingTimeMs / this.totalWorkProcessed
                : 0,
            lastActiveTimestamp: this.lastActiveTimestamp,
            cpuUsage,
            boundToCore: this.isBound ? this.cpuCore : undefined
        };
    }

    /**
     * 处理工作队列的主事件循环
     */
    private async processWorkQueue(): Promise<void> {
        // 使用递归处理工作队列，确保任务逐一处理
        const processNext = async () => {
            if (!this.isRunning) {
                return;
            }

            if (this.workQueue.length === 0) {
                // 队列为空，设置短延迟后再次检查
                setTimeout(() => processNext(), 1);
                return;
            }

            // 获取下一个工作项
            const work = this.workQueue.shift() as (Work & {
                resolve: (result: WorkResult) => void;
                reject: (error: Error) => void;
            });

            if (!work) {
                // 安全检查
                setTimeout(() => processNext(), 1);
                return;
            }

            this.activeWorkCount++;
            const startTime = performance.now();

            try {
                // 找到合适的处理器
                const handler = this.workHandlers.get(work.type) || this.workHandlers.get('default');

                if (!handler) {
                    throw new Error(`未找到处理器: ${work.type}`);
                }

                // 执行处理器
                const result = await handler(work);
                const processingTime = performance.now() - startTime;

                // 更新统计信息
                this.totalWorkProcessed++;
                this.totalProcessingTimeMs += processingTime;

                // 调用resolve回调
                work.resolve({
                    status: 'success',
                    data: result,
                    processingTime
                });
            } catch (error: any) {
                const processingTime = performance.now() - startTime;
                this.log('error', `处理工作时出错, 类型: ${work.type}, 错误: ${error.message}`);

                // 调用reject回调
                work.reject(error);
            } finally {
                this.activeWorkCount--;
                this.lastActiveTimestamp = Date.now();

                // 继续处理下一个工作
                setImmediate(() => processNext());
            }
        };

        // 启动事件循环
        processNext();
    }

    /**
     * 启动统计信息收集
     */
    private startStatsCollection(): void {
        // 每10秒收集一次统计信息
        this.statsTimer = setInterval(() => {
            const stats = this.getStats();

            // 记录CPU使用率
            if (stats.cpuUsage !== undefined) {
                this.log('debug', `Reactor [${this.id}] CPU使用率: ${stats.cpuUsage.toFixed(1)}%`);
            }

            // 记录队列长度
            if (stats.queuedWork > 0) {
                this.log('debug', `Reactor [${this.id}] 队列长度: ${stats.queuedWork}`);
            }
        }, 10000) as unknown as NodeJS.Timeout;
    }

    /**
     * 停止统计信息收集
     */
    private stopStatsCollection(): void {
        if (this.statsTimer) {
            clearInterval(this.statsTimer);
            this.statsTimer = null;
        }
    }

    /**
     * 尝试实现CPU亲和性
     */
    private tryCpuAffinity(): void {
        if (this.cpuCore === undefined) {
            return;
        }

        this.log('info', `尝试将Reactor [${this.id}] 绑定到CPU核心 ${this.cpuCore}`);

        // 使用线程亲和性绑定函数
        const priority = 50; // 默认优先级
        const result = bindToCore(this.cpuCore, priority);

        if (result) {
            this.isBound = true;
            this.log('info', `成功将Reactor [${this.id}] 绑定到CPU核心 ${this.cpuCore}`);
        } else {
            this.log('warn', `无法将Reactor [${this.id}] 绑定到CPU核心 ${this.cpuCore}`);
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
            console[level](`[${timestamp}] [Reactor:${this.id}] [${level.toUpperCase()}] ${message}`);
        }
    }
} 