import { describe, test, expect, beforeEach } from 'bun:test';
import { BackpressureStrategy } from '../../core/backpressure/types';
import { BackpressureFactory } from '../../core/backpressure/backpressure_factory';
import { MessageEnvelope } from '../../core/messaging/types';
import { v4 as uuidv4 } from 'uuid';
import { performance } from 'perf_hooks';

// 测试配置
const TEST_MESSAGE_COUNT = 50000; // 测试消息数量
const QUEUE_SIZES = [100, 1000, 10000]; // 不同队列大小
const CONCURRENCY_LEVELS = [1, 10, 50]; // 并发级别

describe('Backpressure Performance', () => {
    // 创建测试消息
    function createTestMessage(id?: string): MessageEnvelope {
        return {
            id: id || uuidv4(),
            sender: { id: 'sender-1', address: 'local://sender-1' },
            receiver: { id: 'receiver-1', address: 'local://receiver-1' },
            payload: { test: 'data' },
            metadata: {
                deliveryAttempt: 1,
                messageType: 'TEST',
            },
            timestamp: Date.now()
        };
    }

    // 测试特定背压策略的提交性能
    async function testSubmitPerformance(
        strategy: BackpressureStrategy,
        queueSize: number,
        concurrency: number
    ) {
        // 创建控制器
        const controller = BackpressureFactory.createController({
            maxQueueSize: queueSize,
            highWatermark: 0.8,
            lowWatermark: 0.2,
            strategy,
            waitTimeout: 100 // 对于WAIT策略
        });

        // 生成测试消息
        const messages = Array.from({ length: TEST_MESSAGE_COUNT }, () => createTestMessage());
        const batchSize = Math.ceil(TEST_MESSAGE_COUNT / concurrency);

        // 开始计时
        const startTime = performance.now();

        // 使用Promise.all模拟并发提交
        const batches = [];
        for (let i = 0; i < concurrency; i++) {
            const start = i * batchSize;
            const end = Math.min(start + batchSize, TEST_MESSAGE_COUNT);
            const batchMessages = messages.slice(start, end);

            batches.push((async () => {
                const results = [];
                for (const message of batchMessages) {
                    try {
                        const result = await controller.submit(message);
                        results.push(result);

                        // 如果使用非DROP_NEW策略且队列接近满，则处理一些消息以避免阻塞
                        if (strategy !== BackpressureStrategy.DROP_NEW &&
                            controller.getQueueUtilization() > 0.9) {
                            const msg = await controller.next();
                            if (msg) controller.complete(msg.id);
                        }
                    } catch (err) {
                        // 对于THROW策略，我们期望有异常
                        if (strategy !== BackpressureStrategy.THROW) {
                            throw err;
                        }
                    }
                }
                return results;
            })());
        }

        // 等待所有批次完成
        await Promise.all(batches);

        // 停止计时
        const endTime = performance.now();
        const duration = endTime - startTime;

        // 计算每秒操作数
        const opsPerSecond = Math.floor(TEST_MESSAGE_COUNT / (duration / 1000));

        console.log(`${strategy} strategy, queue size ${queueSize}, concurrency ${concurrency}: ${opsPerSecond} ops/sec (${duration.toFixed(2)} ms)`);

        return {
            strategy,
            queueSize,
            concurrency,
            duration,
            opsPerSecond
        };
    }

    // 测试消费性能
    async function testConsumptionPerformance(queueSize: number) {
        // 创建控制器
        const controller = BackpressureFactory.createController({
            maxQueueSize: queueSize,
            highWatermark: 0.8,
            lowWatermark: 0.2,
            strategy: BackpressureStrategy.DROP_NEW
        });

        // 预填充队列
        const messages = Array.from({ length: queueSize }, () => createTestMessage());
        for (const message of messages) {
            await controller.submit(message);
        }

        expect(controller.getQueueSize()).toBe(queueSize);

        // 开始计时
        const startTime = performance.now();

        // 消费所有消息
        let messageCount = 0;
        let msg;
        while ((msg = await controller.next()) !== null && messageCount < queueSize) {
            controller.complete(msg.id);
            messageCount++;
        }

        // 停止计时
        const endTime = performance.now();
        const duration = endTime - startTime;

        // 计算每秒操作数
        const opsPerSecond = Math.floor(queueSize / (duration / 1000));

        console.log(`Consumption test, queue size ${queueSize}: ${opsPerSecond} ops/sec (${duration.toFixed(2)} ms)`);

        return {
            queueSize,
            duration,
            opsPerSecond
        };
    }

    test('Measure submit performance across strategies', async () => {
        const results = [];

        // 对THROW策略使用较小的消息数量避免过多异常
        const throwTestMessageCount = TEST_MESSAGE_COUNT / 10;

        // 测试DROP_NEW策略
        for (const queueSize of QUEUE_SIZES) {
            for (const concurrency of CONCURRENCY_LEVELS) {
                results.push(await testSubmitPerformance(
                    BackpressureStrategy.DROP_NEW, queueSize, concurrency
                ));
            }
        }

        // 测试DROP_OLD策略
        for (const queueSize of QUEUE_SIZES) {
            for (const concurrency of CONCURRENCY_LEVELS) {
                results.push(await testSubmitPerformance(
                    BackpressureStrategy.DROP_OLD, queueSize, concurrency
                ));
            }
        }

        // 打印结果摘要
        console.log("\nBackpressure Submit Performance (ops/sec):");
        console.log("Strategy | Queue Size | Concurrency 1 | Concurrency 10 | Concurrency 50");
        console.log("---------|------------|--------------|----------------|---------------");

        const strategies = [BackpressureStrategy.DROP_NEW, BackpressureStrategy.DROP_OLD];

        for (const strategy of strategies) {
            for (const queueSize of QUEUE_SIZES) {
                const strategyResults = results.filter(
                    r => r.strategy === strategy && r.queueSize === queueSize
                );
                const row = [
                    strategy,
                    queueSize.toString(),
                    strategyResults[0].opsPerSecond.toLocaleString(),
                    strategyResults[1].opsPerSecond.toLocaleString(),
                    strategyResults[2].opsPerSecond.toLocaleString()
                ];
                console.log(row.join(" | "));
            }
        }
    });

    test('Measure consumption performance', async () => {
        const results = [];

        // 测试不同队列大小的消费性能
        for (const queueSize of QUEUE_SIZES) {
            results.push(await testConsumptionPerformance(queueSize));
        }

        // 打印结果摘要
        console.log("\nBackpressure Consumption Performance (ops/sec):");
        console.log("Queue Size | Performance");
        console.log("-----------|------------");

        for (const result of results) {
            console.log(`${result.queueSize.toString().padEnd(10)} | ${result.opsPerSecond.toLocaleString()}`);
        }
    });
}); 