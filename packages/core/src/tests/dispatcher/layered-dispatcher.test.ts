import { describe, expect, test, mock, beforeEach, afterEach } from 'bun:test';
import { LayeredDispatcher, TaskType, TaskPriority } from '../../core/dispatcher/layered-dispatcher';
import { AdaptiveScheduler } from '../../core/dispatcher/adaptive-scheduler';

describe('多层调度策略', () => {
    describe('LayeredDispatcher', () => {
        let dispatcher: LayeredDispatcher;

        beforeEach(() => {
            dispatcher = new LayeredDispatcher({
                concurrencyLimits: {
                    [TaskType.CPU_INTENSIVE]: 2,
                    [TaskType.IO_INTENSIVE]: 5,
                    [TaskType.LOW_LATENCY]: 3,
                    [TaskType.BATCH]: 1,
                    [TaskType.DEFAULT]: 2
                },
                debug: false
            });
        });

        afterEach(() => {
            dispatcher.shutdown();
        });

        test('基本任务调度', async () => {
            // 创建模拟任务
            const mockTask = mock(() => Promise.resolve());

            // 调度任务
            dispatcher.schedule(mockTask);

            // 等待任务完成
            await new Promise((resolve) => setTimeout(resolve, 50));

            // 验证任务被执行
            expect(mockTask).toHaveBeenCalled();
        });

        test('获取指标', async () => {
            // 调度一些任务
            for (let i = 0; i < 5; i++) {
                dispatcher.schedule(() => Promise.resolve());
            }

            // 等待任务完成
            await new Promise((resolve) => setTimeout(resolve, 100));

            // 获取指标
            const metrics = dispatcher.getMetrics();

            // 验证指标
            expect(metrics.totalTasksSubmitted).toBe(5);
            expect(metrics.totalTasksCompleted).toBe(5);
            expect(metrics.totalTasksRejected).toBe(0);
        });

        test('任务拒绝', async () => {
            // 创建一个模拟的慢任务
            const slowTask = () => new Promise((resolve) => {
                setTimeout(resolve, 100);
            });

            // 设置限制
            dispatcher = new LayeredDispatcher({
                concurrencyLimits: { [TaskType.DEFAULT]: 1 },
                queueSizeLimits: { [TaskType.DEFAULT]: 1 }
            });

            // 调度超过限制的任务
            const successfulTasks = [];

            dispatcher.schedule(slowTask);
            dispatcher.schedule(slowTask).then(result => {
                if (result !== false) {
                    successfulTasks.push(result);
                }
            });
            dispatcher.schedule(slowTask).then(result => {
                if (result !== false) {
                    successfulTasks.push(result);
                }
            });

            // 等待任务完成
            await new Promise((resolve) => setTimeout(resolve, 300));

            // 获取指标
            const metrics = dispatcher.getMetrics();

            // 验证有任务被拒绝
            expect(metrics.totalTasksRejected).toBeGreaterThan(0);
            expect(successfulTasks.length).toBeLessThan(3);
        });
    });

    describe('AdaptiveScheduler', () => {
        let scheduler: AdaptiveScheduler;

        beforeEach(() => {
            scheduler = new AdaptiveScheduler({
                adaptationIntervalMs: 100, // 快速适应测试
                debug: false
            });
        });

        afterEach(() => {
            scheduler.shutdown();
        });

        test('基本调度功能', async () => {
            // 创建模拟任务
            const mockTask = mock(() => Promise.resolve());

            // 调度任务
            scheduler.schedule(mockTask);

            // 等待任务完成
            await new Promise((resolve) => setTimeout(resolve, 50));

            // 验证任务被执行
            expect(mockTask).toHaveBeenCalled();
        });

        test('自适应调整', async () => {
            // 让调度器运行一段时间以触发自适应调整
            await new Promise((resolve) => setTimeout(resolve, 150));

            // 获取指标
            const metrics = scheduler.getMetrics();

            // 验证调度器正在收集指标
            expect(metrics).toBeDefined();
        });

        test('高负载场景', async () => {
            // 创建大量IO密集型任务
            const ioTasks = Array(50).fill(0).map(() =>
                () => new Promise<void>(resolve => setTimeout(resolve, 10))
            );

            // 调度任务
            for (const task of ioTasks) {
                scheduler.schedule(task);
            }

            // 等待适应过程
            await new Promise((resolve) => setTimeout(resolve, 200));

            // 获取指标，验证IO层被适当调整
            const metrics = scheduler.getMetrics();
            expect(metrics.layerStates[TaskType.IO_INTENSIVE]).toBeDefined();
        });
    });
}); 