import { LayeredDispatcher, TaskType, TaskPriority } from '../../core/dispatcher/layered-dispatcher';
import { AdaptiveScheduler } from '../../core/dispatcher/adaptive-scheduler';
import { MessageDispatcher } from '../../core/interfaces';
import { describe, it, expect } from 'bun:test';

/**
 * 生成模拟的任务函数
 * @param type 任务类型
 * @param durationMs 模拟的执行时间
 */
function createTask(type: TaskType, durationMs: number) {
    return async () => {
        // 模拟任务开始
        const startTime = performance.now();

        // 根据任务类型执行不同的模拟负载
        switch (type) {
            case TaskType.CPU_INTENSIVE:
                // 模拟CPU密集型计算
                let sum = 0;
                const iterations = Math.min(1000000, durationMs * 1000);
                for (let i = 0; i < iterations; i++) {
                    sum += Math.sin(i) * Math.cos(i);
                }
                break;

            case TaskType.IO_INTENSIVE:
                // 模拟IO等待
                await new Promise(resolve => setTimeout(resolve, durationMs));
                break;

            case TaskType.LOW_LATENCY:
                // 简单快速的操作
                await new Promise(resolve => setTimeout(resolve, Math.min(5, durationMs)));
                break;

            case TaskType.BATCH:
                // 模拟批处理操作
                await new Promise(resolve => setTimeout(resolve, durationMs));
                break;

            default:
                // 默认行为
                await new Promise(resolve => setTimeout(resolve, durationMs / 2));
        }

        // 确保至少运行指定的持续时间
        const elapsed = performance.now() - startTime;
        if (elapsed < durationMs) {
            await new Promise(resolve => setTimeout(resolve, durationMs - elapsed));
        }
    };
}

/**
 * 任务生成配置
 */
interface TaskGenerationConfig {
    /** 任务类型 */
    type: TaskType;
    /** 任务优先级 */
    priority: TaskPriority;
    /** 任务执行时间 (ms) */
    duration: number;
    /** 任务数量 */
    count: number;
    /** 生成间隔 (ms), 0表示立即全部生成 */
    interval: number;
}

/**
 * 压测结果
 */
interface BenchmarkResult {
    /** 总任务数 */
    totalTasks: number;
    /** 已完成任务数 */
    completedTasks: number;
    /** 被拒绝任务数 */
    rejectedTasks: number;
    /** 总执行时间 (ms) */
    totalDurationMs: number;
    /** 每秒任务吞吐量 */
    tasksPerSecond: number;
    /** 平均任务延迟 */
    avgLatencyMs: Record<TaskType, number>;
    /** 每个任务类型的完成数量 */
    completedByType: Record<TaskType, number>;
    /** 每个任务类型的拒绝数量 */
    rejectedByType: Record<TaskType, number>;
    /** 峰值CPU利用率 */
    peakCpuUtilization: number;
}

/**
 * 运行压力测试
 * @param dispatcherType 调度器类型
 * @param taskConfigs 任务生成配置
 * @param durationMs 测试持续时间
 */
async function runBenchmark(
    dispatcherType: 'layered' | 'adaptive',
    taskConfigs: TaskGenerationConfig[],
    durationMs: number = 5000
): Promise<BenchmarkResult> {
    // 创建调度器
    const dispatcher = dispatcherType === 'layered'
        ? new LayeredDispatcher({
            concurrencyLimits: {
                [TaskType.CPU_INTENSIVE]: 4,
                [TaskType.IO_INTENSIVE]: 20,
                [TaskType.LOW_LATENCY]: 8,
                [TaskType.BATCH]: 2,
                [TaskType.DEFAULT]: 8
            },
            metricsCollectionIntervalMs: 1000,
            debug: false
        })
        : new AdaptiveScheduler({
            adaptationIntervalMs: 1000,
            metricsCollectionIntervalMs: 500,
            debug: false
        });

    // 记录结果
    const results: BenchmarkResult = {
        totalTasks: 0,
        completedTasks: 0,
        rejectedTasks: 0,
        totalDurationMs: 0,
        tasksPerSecond: 0,
        avgLatencyMs: {
            [TaskType.CPU_INTENSIVE]: 0,
            [TaskType.IO_INTENSIVE]: 0,
            [TaskType.LOW_LATENCY]: 0,
            [TaskType.BATCH]: 0,
            [TaskType.DEFAULT]: 0
        },
        completedByType: {
            [TaskType.CPU_INTENSIVE]: 0,
            [TaskType.IO_INTENSIVE]: 0,
            [TaskType.LOW_LATENCY]: 0,
            [TaskType.BATCH]: 0,
            [TaskType.DEFAULT]: 0
        },
        rejectedByType: {
            [TaskType.CPU_INTENSIVE]: 0,
            [TaskType.IO_INTENSIVE]: 0,
            [TaskType.LOW_LATENCY]: 0,
            [TaskType.BATCH]: 0,
            [TaskType.DEFAULT]: 0
        },
        peakCpuUtilization: 0
    };

    // 监控CPU使用率
    let peakCpuUtilization = 0;
    const cpuMonitorInterval = setInterval(() => {
        const metrics = dispatcher.getMetrics();
        peakCpuUtilization = Math.max(
            peakCpuUtilization,
            Math.max(
                metrics.layerStates[TaskType.CPU_INTENSIVE].utilization,
                metrics.layerStates[TaskType.IO_INTENSIVE].utilization,
                metrics.layerStates[TaskType.LOW_LATENCY].utilization,
                metrics.layerStates[TaskType.BATCH].utilization,
                metrics.layerStates[TaskType.DEFAULT].utilization
            )
        );
    }, 100);

    // 开始计时
    const startTime = performance.now();

    // 按配置提交任务
    let completionPromises: Promise<void>[] = [];

    for (const config of taskConfigs) {
        for (let i = 0; i < config.count; i++) {
            // 创建任务
            const task = createTask(config.type, config.duration);

            // 用Promise记录任务完成情况
            const completionPromise = new Promise<void>((resolve, reject) => {
                setTimeout(() => {
                    try {
                        const wrappedTask = async () => {
                            const taskStartTime = performance.now();
                            await task();
                            const taskDuration = performance.now() - taskStartTime;

                            // 记录统计信息
                            results.completedTasks++;
                            results.completedByType[config.type]++;

                            // 更新平均延迟 (使用加权平均)
                            const currentCount = results.completedByType[config.type];
                            const currentAvg = results.avgLatencyMs[config.type];
                            results.avgLatencyMs[config.type] =
                                (currentAvg * (currentCount - 1) + taskDuration) / currentCount;

                            resolve();
                        };

                        dispatcher.schedule(wrappedTask);
                        results.totalTasks++;
                    } catch (err) {
                        results.rejectedTasks++;
                        results.rejectedByType[config.type]++;
                        reject(err);
                    }
                }, config.interval * i);
            }).catch(err => {
                // 忽略错误，只记录拒绝
            });

            completionPromises.push(completionPromise);
        }
    }

    // 等待测试时间或所有任务完成
    const timeoutPromise = new Promise<void>(resolve => {
        setTimeout(resolve, durationMs);
    });

    const completionPromise = Promise.allSettled(completionPromises).then(() => { });

    await Promise.race([timeoutPromise, completionPromise]);

    // 停止CPU监控
    clearInterval(cpuMonitorInterval);

    // 测量总时间
    const endTime = performance.now();
    results.totalDurationMs = endTime - startTime;

    // 计算吞吐量
    results.tasksPerSecond = results.completedTasks / (results.totalDurationMs / 1000);

    // 记录CPU利用率
    results.peakCpuUtilization = peakCpuUtilization;

    // 关闭调度器
    dispatcher.shutdown();

    return results;
}

/**
 * 格式化结果为易读的字符串
 */
function formatResults(results: BenchmarkResult): string {
    return `
  总任务数: ${results.totalTasks}
  完成任务数: ${results.completedTasks} (${((results.completedTasks / results.totalTasks) * 100).toFixed(2)}%)
  拒绝任务数: ${results.rejectedTasks} (${((results.rejectedTasks / results.totalTasks) * 100).toFixed(2)}%)
  总用时: ${results.totalDurationMs.toFixed(2)}ms
  吞吐量: ${results.tasksPerSecond.toFixed(2)} 任务/秒
  峰值CPU利用率: ${(results.peakCpuUtilization * 100).toFixed(2)}%
  
  平均延迟(ms):
    CPU密集型: ${results.avgLatencyMs[TaskType.CPU_INTENSIVE].toFixed(2)}
    IO密集型: ${results.avgLatencyMs[TaskType.IO_INTENSIVE].toFixed(2)}
    低延迟: ${results.avgLatencyMs[TaskType.LOW_LATENCY].toFixed(2)}
    批处理: ${results.avgLatencyMs[TaskType.BATCH].toFixed(2)}
    默认: ${results.avgLatencyMs[TaskType.DEFAULT].toFixed(2)}
    
  按类型完成:
    CPU密集型: ${results.completedByType[TaskType.CPU_INTENSIVE]}
    IO密集型: ${results.completedByType[TaskType.IO_INTENSIVE]}
    低延迟: ${results.completedByType[TaskType.LOW_LATENCY]}
    批处理: ${results.completedByType[TaskType.BATCH]}
    默认: ${results.completedByType[TaskType.DEFAULT]}`;
}

// 测试场景定义
describe('多层调度器性能测试', () => {
    // 缩小测试规模，以便快速执行
    const lightMixedWorkload = [
        { type: TaskType.CPU_INTENSIVE, priority: TaskPriority.NORMAL, duration: 20, count: 50, interval: 5 },
        { type: TaskType.IO_INTENSIVE, priority: TaskPriority.NORMAL, duration: 30, count: 50, interval: 5 },
        { type: TaskType.LOW_LATENCY, priority: TaskPriority.HIGH, duration: 5, count: 100, interval: 2 }
    ];

    const heavyBurstWorkload = [
        { type: TaskType.CPU_INTENSIVE, priority: TaskPriority.NORMAL, duration: 50, count: 30, interval: 0 },
        { type: TaskType.IO_INTENSIVE, priority: TaskPriority.NORMAL, duration: 100, count: 100, interval: 0 },
        { type: TaskType.LOW_LATENCY, priority: TaskPriority.HIGH, duration: 5, count: 20, interval: 0 },
        { type: TaskType.BATCH, priority: TaskPriority.LOW, duration: 200, count: 5, interval: 0 }
    ];

    const ioHeavyWorkload = [
        { type: TaskType.CPU_INTENSIVE, priority: TaskPriority.NORMAL, duration: 50, count: 10, interval: 10 },
        { type: TaskType.IO_INTENSIVE, priority: TaskPriority.NORMAL, duration: 80, count: 200, interval: 2 },
        { type: TaskType.LOW_LATENCY, priority: TaskPriority.HIGH, duration: 5, count: 30, interval: 5 }
    ];

    // 测试用例1：轻量级混合负载
    it('场景1: 轻量级混合负载', async () => {
        console.log('=== 场景 1: 轻量级混合负载 ===');

        const lightLayeredResult = await runBenchmark('layered', lightMixedWorkload, 5000);
        console.log('LayeredDispatcher 结果:', formatResults(lightLayeredResult));

        const lightAdaptiveResult = await runBenchmark('adaptive', lightMixedWorkload, 5000);
        console.log('AdaptiveScheduler 结果:', formatResults(lightAdaptiveResult));

        console.log(`性能比较: AdaptiveScheduler vs LayeredDispatcher`);
        console.log(`  吞吐量比: ${(lightAdaptiveResult.tasksPerSecond / lightLayeredResult.tasksPerSecond).toFixed(2)}x`);
        console.log(`  低延迟任务响应时间比: ${(lightLayeredResult.avgLatencyMs[TaskType.LOW_LATENCY] / lightAdaptiveResult.avgLatencyMs[TaskType.LOW_LATENCY]).toFixed(2)}x`);

        expect(lightAdaptiveResult.completedTasks).toBeGreaterThanOrEqual(lightLayeredResult.completedTasks * 0.9);
    }, 10000);

    // 测试用例2：重负载，突发流量
    it('场景2: 重负载，突发流量', async () => {
        console.log('=== 场景 2: 重负载，突发流量 ===');

        const heavyLayeredResult = await runBenchmark('layered', heavyBurstWorkload, 8000);
        console.log('LayeredDispatcher 结果:', formatResults(heavyLayeredResult));

        const heavyAdaptiveResult = await runBenchmark('adaptive', heavyBurstWorkload, 8000);
        console.log('AdaptiveScheduler 结果:', formatResults(heavyAdaptiveResult));

        console.log(`性能比较: AdaptiveScheduler vs LayeredDispatcher`);
        console.log(`  吞吐量比: ${(heavyAdaptiveResult.tasksPerSecond / heavyLayeredResult.tasksPerSecond).toFixed(2)}x`);

        // 适应性调度器应该能更好地处理突发流量
        expect(heavyAdaptiveResult.rejectedTasks).toBeLessThanOrEqual(heavyLayeredResult.rejectedTasks * 1.1);
    }, 20000);

    // 测试用例3：不平衡负载，IO密集型占优
    it('场景3: 不平衡负载，IO密集型占优', async () => {
        console.log('=== 场景 3: 不平衡负载，IO密集型占优 ===');

        const ioLayeredResult = await runBenchmark('layered', ioHeavyWorkload, 8000);
        console.log('LayeredDispatcher 结果:', formatResults(ioLayeredResult));

        const ioAdaptiveResult = await runBenchmark('adaptive', ioHeavyWorkload, 8000);
        console.log('AdaptiveScheduler 结果:', formatResults(ioAdaptiveResult));

        console.log(`性能比较: AdaptiveScheduler vs LayeredDispatcher`);
        console.log(`  吞吐量比: ${(ioAdaptiveResult.tasksPerSecond / ioLayeredResult.tasksPerSecond).toFixed(2)}x`);

        // 适应性调度器应该在IO密集型场景中表现更好
        expect(ioAdaptiveResult.completedByType[TaskType.IO_INTENSIVE]).toBeGreaterThanOrEqual(
            ioLayeredResult.completedByType[TaskType.IO_INTENSIVE] * 0.9
        );
    }, 20000);
}); 