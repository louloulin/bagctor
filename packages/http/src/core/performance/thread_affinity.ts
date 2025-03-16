/**
 * thread_affinity.ts
 * 
 * 线程亲和性(Thread Affinity)实现
 * 用于将工作线程绑定到特定的CPU核心，减少上下文切换
 */

import { Worker, isMainThread, parentPort, workerData } from 'worker_threads';
import { cpus } from 'os';
import {
    isNativeBindingSupported,
    bindThreadToCore as nativeBindThreadToCore,
    getNativeThreadId,
    getCurrentThreadCore,
    setThreadPriority,
    getSystemTopology,
    getCpuUsage,
    setNumaAffinity,
    unbindThread
} from './thread_binding';

/**
 * 线程亲和性配置选项
 */
export interface ThreadAffinityOptions {
    /**
     * 是否启用线程亲和性
     */
    enabled: boolean;

    /**
     * 优先级策略
     */
    priorityStrategy: 'static' | 'dynamic';

    /**
     * 是否启用NUMA感知
     */
    numaAware?: boolean;

    /**
     * 是否启用日志记录
     */
    logging?: boolean;
}

/**
 * 线程信息
 */
export interface ThreadInfo {
    /**
     * 线程ID
     */
    id: number;

    /**
     * 绑定的CPU核心ID
     */
    cpuCore: number;

    /**
     * 优先级 (0-99，值越大优先级越高)
     */
    priority: number;

    /**
     * 当前负载指标
     */
    load: number;

    /**
     * NUMA节点(如果支持)
     */
    numaNode?: number;
}

/**
 * CPU亲和性管理器
 * 管理工作线程与CPU核心的绑定关系
 */
export class ThreadAffinityManager {
    private static instance: ThreadAffinityManager;
    private options: ThreadAffinityOptions;
    private threads: Map<number, ThreadInfo> = new Map();
    private availableCores: number[];
    private coreAssignments: Map<number, number> = new Map();
    private systemTopology: ReturnType<typeof getSystemTopology> | null = null;
    private nativeBindingSupported: boolean;

    /**
     * 私有构造函数，实现单例模式
     */
    private constructor(options: ThreadAffinityOptions) {
        this.options = options;
        this.availableCores = this.getAvailableCores();
        this.nativeBindingSupported = isNativeBindingSupported();

        if (this.options.numaAware) {
            this.systemTopology = getSystemTopology();
        }

        this.log(`ThreadAffinityManager initialized, native binding ${this.nativeBindingSupported ? 'available' : 'not available'}`);
        this.log(`Available CPU cores: ${this.availableCores.length}`);

        if (this.systemTopology && this.systemTopology.numaNodes > 1) {
            this.log(`NUMA架构检测到 ${this.systemTopology.numaNodes} 个节点`);
        }
    }

    /**
     * 获取单例实例
     */
    public static getInstance(options?: ThreadAffinityOptions): ThreadAffinityManager {
        if (!ThreadAffinityManager.instance) {
            ThreadAffinityManager.instance = new ThreadAffinityManager(
                options || { enabled: true, priorityStrategy: 'static', logging: false }
            );
        }
        return ThreadAffinityManager.instance;
    }

    /**
     * 尝试将当前线程绑定到指定CPU核心
     * @param coreId CPU核心ID
     * @param priority 线程优先级
     * @returns 是否绑定成功
     */
    public bindCurrentThread(coreId: number, priority: number = 50): boolean {
        if (!this.options.enabled) {
            this.log('Thread affinity is disabled');
            return false;
        }

        // 检查是否有效的核心ID
        if (!this.availableCores.includes(coreId)) {
            this.log(`Invalid core ID: ${coreId}`);
            return false;
        }

        try {
            const threadId = this.getCurrentThreadId();
            const result = this.bindThreadToCore(threadId, coreId, priority);

            if (result) {
                // 如果是NUMA感知且有NUMA信息
                let numaNode: number | undefined = undefined;
                if (this.options.numaAware && this.systemTopology && this.systemTopology.numaNodes > 1) {
                    // 计算核心所属的NUMA节点
                    for (let nodeId = 0; nodeId < this.systemTopology.numaNodes; nodeId++) {
                        const startCore = nodeId > 0 ?
                            this.systemTopology.coresPerNode.slice(0, nodeId).reduce((a, b) => a + b, 0) : 0;
                        const endCore = startCore + this.systemTopology.coresPerNode[nodeId];

                        if (coreId >= startCore && coreId < endCore) {
                            numaNode = nodeId;
                            // 设置NUMA亲和性
                            setNumaAffinity(nodeId);
                            break;
                        }
                    }
                }

                this.threads.set(threadId, {
                    id: threadId,
                    cpuCore: coreId,
                    priority,
                    load: 0,
                    numaNode
                });
                this.coreAssignments.set(coreId, threadId);
                this.log(`Thread ${threadId} bound to CPU core ${coreId} with priority ${priority}${numaNode !== undefined ? `, NUMA node ${numaNode}` : ''}`);
            }

            return result;
        } catch (error: any) {
            this.log(`Failed to bind thread to core: ${error.message}`);
            return false;
        }
    }

    /**
     * 创建一个与指定CPU核心绑定的worker线程
     * @param scriptPath Worker脚本路径
     * @param coreId CPU核心ID
     * @param data 传递给Worker的数据
     * @returns Worker实例
     */
    public createAffinityWorker(scriptPath: string, coreId: number, data?: any): Worker {
        if (!isMainThread) {
            throw new Error('createAffinityWorker can only be called from the main thread');
        }

        // 检查是否有效的核心ID
        if (!this.availableCores.includes(coreId)) {
            this.log(`Invalid core ID: ${coreId}, using round-robin assignment`);
            coreId = this.getNextAvailableCore();
        }

        // 确定NUMA节点
        let numaNode: number | undefined = undefined;
        if (this.options.numaAware && this.systemTopology && this.systemTopology.numaNodes > 1) {
            // 计算核心所属的NUMA节点
            for (let nodeId = 0; nodeId < this.systemTopology.numaNodes; nodeId++) {
                const startCore = nodeId > 0 ?
                    this.systemTopology.coresPerNode.slice(0, nodeId).reduce((a, b) => a + b, 0) : 0;
                const endCore = startCore + this.systemTopology.coresPerNode[nodeId];

                if (coreId >= startCore && coreId < endCore) {
                    numaNode = nodeId;
                    break;
                }
            }
        }

        const workerOptions = {
            workerData: {
                ...data,
                _affinityCore: coreId,
                _affinityNumaNode: numaNode,
                _affinityNativeSupported: this.nativeBindingSupported
            }
        };

        const worker = new Worker(scriptPath, workerOptions);

        this.log(`Created worker bound to CPU core ${coreId}${numaNode !== undefined ? `, NUMA node ${numaNode}` : ''}`);
        return worker;
    }

    /**
     * 获取当前系统的CPU核心数
     */
    public getCpuCount(): number {
        return this.availableCores.length;
    }

    /**
     * 获取线程信息
     * @param threadId 线程ID
     */
    public getThreadInfo(threadId: number): ThreadInfo | undefined {
        return this.threads.get(threadId);
    }

    /**
     * 获取所有线程信息
     */
    public getAllThreads(): ThreadInfo[] {
        return Array.from(this.threads.values());
    }

    /**
     * 更新线程负载信息
     * @param threadId 线程ID
     * @param load 负载值
     */
    public updateThreadLoad(threadId: number, load: number): void {
        const thread = this.threads.get(threadId);
        if (thread) {
            thread.load = load;
            this.threads.set(threadId, thread);
        }
    }

    /**
     * 解除线程绑定
     * @param threadId 线程ID
     * @returns 是否解除成功
     */
    public unbindThread(threadId: number): boolean {
        const thread = this.threads.get(threadId);
        if (!thread) {
            this.log(`Thread ${threadId} not found for unbinding`);
            return false;
        }

        let result = true;
        if (this.nativeBindingSupported) {
            result = unbindThread();
        }

        if (result) {
            this.coreAssignments.delete(thread.cpuCore);
            this.threads.delete(threadId);
            this.log(`Thread ${threadId} unbound from CPU core ${thread.cpuCore}`);
        }

        return result;
    }

    /**
     * 根据CPU利用率重新平衡线程分配
     * 仅在动态优先级策略下有效
     * @returns 重新平衡的线程数
     */
    public rebalanceThreads(): number {
        if (this.options.priorityStrategy !== 'dynamic') {
            this.log('Rebalancing ignored: Not using dynamic priority strategy');
            return 0;
        }

        // 获取每个核心的负载
        const coreLoads = new Map<number, number>();

        // 如果支持原生绑定，可以获取实际CPU使用率
        if (this.nativeBindingSupported) {
            for (const coreId of this.availableCores) {
                coreLoads.set(coreId, getCpuUsage(coreId));
            }
        } else {
            // 否则，使用记录的线程负载
            for (const [coreId, threadId] of this.coreAssignments.entries()) {
                const thread = this.threads.get(threadId);
                if (thread) {
                    coreLoads.set(coreId, thread.load);
                } else {
                    coreLoads.set(coreId, 0);
                }
            }
        }

        // 找出负载最高和最低的核心
        let maxLoad = -1;
        let minLoad = 101; // 超过满负载
        let maxLoadCore = -1;
        let minLoadCore = -1;

        for (const [coreId, load] of coreLoads.entries()) {
            if (load > maxLoad) {
                maxLoad = load;
                maxLoadCore = coreId;
            }
            if (load < minLoad) {
                minLoad = load;
                minLoadCore = coreId;
            }
        }

        // 如果最高负载核心的负载比最低负载核心高50%以上，尝试重新平衡
        if (maxLoad > minLoad * 1.5 && maxLoad > 60) {
            // 找出绑定到高负载核心的线程
            const threadIdToMove = this.coreAssignments.get(maxLoadCore);
            if (threadIdToMove !== undefined) {
                const thread = this.threads.get(threadIdToMove);
                if (thread) {
                    // 解绑线程
                    this.unbindThread(threadIdToMove);

                    // 重新绑定到低负载核心
                    this.bindThreadToCore(threadIdToMove, minLoadCore, thread.priority);

                    this.log(`Rebalanced thread ${threadIdToMove} from core ${maxLoadCore} (${maxLoad}%) to core ${minLoadCore} (${minLoad}%)`);
                    return 1;
                }
            }
        }

        return 0;
    }

    /**
     * 获取可用的CPU核心ID列表
     */
    private getAvailableCores(): number[] {
        try {
            const cpuInfo = cpus();
            return cpuInfo.map((_, index) => index);
        } catch (error: any) {
            this.log(`Failed to get CPU information: ${error.message}`);
            // 默认假设有4个核心
            return [0, 1, 2, 3];
        }
    }

    /**
     * 绑定线程到指定CPU核心，这是实际的绑定操作
     */
    private bindThreadToCore(threadId: number, coreId: number, priority: number): boolean {
        // 使用原生绑定如果可用
        if (this.nativeBindingSupported) {
            const result = nativeBindThreadToCore(coreId);
            if (result) {
                // 尝试设置线程优先级
                setThreadPriority(priority);
            }
            return result;
        }

        // 回退到模拟绑定

        // 如果是Worker线程，检查是否有预设的绑定核心
        if (!isMainThread && workerData?._affinityCore !== undefined) {
            // 在Worker内部，尝试自我绑定到指定核心
            this.log(`Worker self-binding to core ${workerData._affinityCore}`);
            return true;
        }

        // 执行平台特定的线程绑定操作（这需要native模块支持）
        // 这里仅作为示例代码，实际上不会真正绑定线程
        this.log(`[SIMULATION] Binding thread ${threadId} to CPU core ${coreId}`);

        // 设置线程优先级（在Node.js中也无法直接设置，这里仅作为示例）
        this.log(`[SIMULATION] Setting thread ${threadId} priority to ${priority}`);

        return true;
    }

    /**
     * 获取当前线程ID
     */
    private getCurrentThreadId(): number {
        if (this.nativeBindingSupported) {
            return getNativeThreadId();
        }

        // 回退到模拟实现

        // 在Node.js中，我们无法直接获取线程ID，使用模拟值
        // 主线程返回0，Worker线程可以使用其内部ID
        if (isMainThread) {
            return 0;
        } else {
            // 为Worker线程生成一个唯一ID
            const workerId = workerData?._workerId || Date.now() % 10000;
            return workerId;
        }
    }

    /**
     * 获取下一个可用的CPU核心
     * 使用简单的轮询策略
     */
    private getNextAvailableCore(): number {
        // 查找负载最小的核心
        const assignedCores = Array.from(this.coreAssignments.keys());
        const availableCores = this.availableCores.filter(core => !assignedCores.includes(core));

        if (availableCores.length > 0) {
            // 有未分配的核心，返回第一个
            return availableCores[0];
        } else {
            // 所有核心都已分配，返回负载最小的
            let minLoad = Number.MAX_VALUE;
            let selectedCore = this.availableCores[0];

            for (const [core, threadId] of this.coreAssignments.entries()) {
                const thread = this.threads.get(threadId);
                if (thread && thread.load < minLoad) {
                    minLoad = thread.load;
                    selectedCore = core;
                }
            }

            return selectedCore;
        }
    }

    /**
     * 日志输出
     */
    private log(message: string): void {
        if (this.options.logging) {
            console.log(`[ThreadAffinity] ${message}`);
        }
    }
}

/**
 * 在Worker线程中注册CPU亲和性
 * 如果当前是Worker线程，并且workerData中包含_affinityCore，则尝试绑定
 */
export function registerWorkerAffinity(): void {
    if (!isMainThread && workerData?._affinityCore !== undefined) {
        const manager = ThreadAffinityManager.getInstance({
            enabled: true,
            priorityStrategy: 'static',
            logging: true,
            numaAware: workerData?._affinityNumaNode !== undefined
        });

        const coreId = workerData._affinityCore as number;
        manager.bindCurrentThread(coreId);

        // 如果有NUMA信息，设置NUMA亲和性
        if (workerData?._affinityNumaNode !== undefined && workerData?._affinityNativeSupported) {
            setNumaAffinity(workerData._affinityNumaNode as number);
        }

        // 可选：向主线程报告绑定状态
        if (parentPort) {
            parentPort.postMessage({
                type: 'affinity:status',
                bound: true,
                core: coreId,
                numaNode: workerData?._affinityNumaNode
            });
        }
    }
}

/**
 * 创建一个绑定到指定CPU核心的Worker线程
 * @param scriptPath Worker脚本路径
 * @param coreId CPU核心ID
 * @param data 传递给Worker的数据
 */
export function createAffinityWorker(scriptPath: string, coreId: number, data?: any): Worker {
    return ThreadAffinityManager.getInstance().createAffinityWorker(scriptPath, coreId, data);
}

/**
 * 尝试将当前线程绑定到指定CPU核心
 * @param coreId CPU核心ID
 * @param priority 优先级
 */
export function bindToCore(coreId: number, priority: number = 50): boolean {
    return ThreadAffinityManager.getInstance().bindCurrentThread(coreId, priority);
}

/**
 * 获取系统可用的CPU核心数
 */
export function getAvailableCores(): number {
    return ThreadAffinityManager.getInstance().getCpuCount();
}

/**
 * 解除当前线程的CPU亲和性
 */
export function unbindCurrentThread(): boolean {
    const manager = ThreadAffinityManager.getInstance();
    const threadId = isMainThread ? 0 : ((workerData?._workerId || Date.now() % 10000) as number);
    return manager.unbindThread(threadId);
}

/**
 * 重新平衡线程分配（仅在动态优先级策略下有效）
 */
export function rebalanceThreads(): number {
    return ThreadAffinityManager.getInstance().rebalanceThreads();
}

// 自动注册Worker线程亲和性
if (!isMainThread) {
    registerWorkerAffinity();
} 