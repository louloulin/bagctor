import { expect, test, mock, describe, afterEach, beforeEach } from "bun:test";
import { ThroughputDispatcher } from "../core/dispatcher";

// 创建模拟任务，返回Promise和任务完成标记
function createMockTask(executionTime: number = 0) {
    const completed = { value: false };
    const promise = new Promise<void>((resolve) => {
        setTimeout(() => {
            completed.value = true;
            resolve();
        }, executionTime);
    });
    return { promise, completed };
}

// 创建多个模拟任务
function createMockTasks(count: number, executionTime: number = 0) {
    const tasks = [];
    for (let i = 0; i < count; i++) {
        tasks.push(createMockTask(executionTime));
    }
    return tasks;
}

describe("ThroughputDispatcher", () => {
    let dispatcher: ThroughputDispatcher;

    beforeEach(() => {
        // 创建一个新的调度器实例，使用较小的值以加速测试
        dispatcher = new ThroughputDispatcher(100, 10, 500, 100, 200, true, 5);
    });

    afterEach(() => {
        // 重置调度器状态
        dispatcher.reset();
    });

    test("基本任务调度", async () => {
        const results: number[] = [];

        // 调度简单任务
        dispatcher.schedule(async () => {
            results.push(1);
        });

        dispatcher.schedule(async () => {
            results.push(2);
        });

        // 等待任务完成
        await new Promise(resolve => setTimeout(resolve, 300));

        // 验证任务执行
        expect(results).toEqual([1, 2]);
    });

    test("保持吞吐量限制", async () => {
        const startTime = Date.now();

        // 创建100个快速任务
        const tasks = createMockTasks(50, 0);

        // 调度所有任务
        tasks.forEach(task => {
            dispatcher.schedule(() => task.promise);
        });

        // 等待所有任务完成
        await new Promise(resolve => setTimeout(resolve, 1000));

        // 验证所有任务已完成
        expect(tasks.every(task => task.completed.value)).toBe(true);

        // 验证总执行时间，应该至少是基于吞吐量的理论时间
        const endTime = Date.now();
        const duration = endTime - startTime;

        // 理论上50个任务，吞吐量100/秒，应该至少需要500ms
        const theoreticalMinTime = 500 * 0.8; // 考虑到计时误差，使用80%的理论时间

        expect(duration).toBeGreaterThan(theoreticalMinTime);

        // 查看统计信息
        const stats = dispatcher.getStats();
        expect(stats.processedTotal).toBe(50);
    });

    test("处理长时间运行的任务", async () => {
        const longTasks = createMockTasks(5, 100); // 每个任务运行100ms
        const shortTasks = createMockTasks(10, 10); // 每个任务运行10ms

        // 先调度长任务
        longTasks.forEach(task => {
            dispatcher.schedule(() => task.promise);
        });

        // 然后调度短任务
        shortTasks.forEach(task => {
            dispatcher.schedule(() => task.promise);
        });

        // 等待所有任务完成
        await new Promise(resolve => setTimeout(resolve, 1500));

        // 验证所有任务已完成
        expect(longTasks.every(task => task.completed.value)).toBe(true);
        expect(shortTasks.every(task => task.completed.value)).toBe(true);

        // 检查统计信息
        const stats = dispatcher.getStats();
        expect(stats.processedTotal).toBe(15);
    });

    test("backpressure机制", async () => {
        // 创建大量任务以触发backpressure
        const tasks = createMockTasks(200, 10); // 创建200个任务，每个运行10ms

        // 调度所有任务
        tasks.forEach(task => {
            dispatcher.schedule(() => task.promise);
        });

        // 等待一段时间，让backpressure生效
        await new Promise(resolve => setTimeout(resolve, 300));

        // 检查是否检测到过载
        const stats = dispatcher.getStats();
        expect(stats.overloadDetected).toBe(true);

        // 等待所有任务完成
        await new Promise(resolve => setTimeout(resolve, 3000));

        // 验证所有任务最终都完成了
        expect(tasks.every(task => task.completed.value)).toBe(true);
    });

    test("自适应吞吐量控制", async () => {
        // 这个测试需要更长的运行时间

        // 第一阶段：正常负载
        const normalTasks = createMockTasks(20, 10);
        normalTasks.forEach(task => {
            dispatcher.schedule(() => task.promise);
        });

        await new Promise(resolve => setTimeout(resolve, 500));
        const normalStats = dispatcher.getStats();

        // 第二阶段：高负载
        const heavyTasks = createMockTasks(150, 5);
        heavyTasks.forEach(task => {
            dispatcher.schedule(() => task.promise);
        });

        await new Promise(resolve => setTimeout(resolve, 500));
        const overloadStats = dispatcher.getStats();

        // 等待自适应调整发生
        await new Promise(resolve => setTimeout(resolve, 300));

        // 第三阶段：负载减轻
        await new Promise(resolve => setTimeout(resolve, 2000));
        const recoveryStats = dispatcher.getStats();

        // 验证自适应调整发生
        expect(overloadStats.adaptiveAdjustments).toBeGreaterThan(0);

        // 等待所有任务完成
        await new Promise(resolve => setTimeout(resolve, 1000));

        // 验证所有任务最终都完成了
        expect([...normalTasks, ...heavyTasks].every(task => task.completed.value)).toBe(true);
    });

    test("错误处理", async () => {
        // 创建一些正常任务
        const goodTasks = createMockTasks(5, 10);

        // 创建一个抛出错误的任务
        const errorTask = () => Promise.reject(new Error("Test error"));

        // 调度所有任务，错误任务放在中间
        for (let i = 0; i < 3; i++) {
            dispatcher.schedule(() => goodTasks[i].promise);
        }

        dispatcher.schedule(errorTask);

        for (let i = 3; i < 5; i++) {
            dispatcher.schedule(() => goodTasks[i].promise);
        }

        // 等待所有任务尝试完成
        await new Promise(resolve => setTimeout(resolve, 500));

        // 验证良好任务都完成了，尽管有错误任务
        expect(goodTasks.every(task => task.completed.value)).toBe(true);

        // 验证处理的任务总数
        const stats = dispatcher.getStats();
        expect(stats.processedTotal).toBe(5); // 只有5个好任务完成
    });

    test("重置功能", async () => {
        // 调度一些任务
        const tasks = createMockTasks(20, 10);
        tasks.forEach(task => {
            dispatcher.schedule(() => task.promise);
        });

        // 等待一些任务完成
        await new Promise(resolve => setTimeout(resolve, 300));

        // 重置调度器
        dispatcher.reset();

        // 验证状态已重置
        const stats = dispatcher.getStats();
        expect(stats.queueSize).toBe(0);
        expect(stats.currentThroughput).toBe(100); // 回到初始值
        expect(stats.overloadDetected).toBe(false);

        // 调度新任务并验证仍然正常工作
        const newTasks = createMockTasks(5, 10);
        newTasks.forEach(task => {
            dispatcher.schedule(() => task.promise);
        });

        await new Promise(resolve => setTimeout(resolve, 300));

        expect(newTasks.every(task => task.completed.value)).toBe(true);
    });
}); 