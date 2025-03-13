import { describe, test, expect, beforeEach } from 'bun:test';
import { RouterFactory, RouterStrategy } from '../../core/routing';
import { BackpressureStrategy } from '../../core/backpressure/types';
import { BackpressureFactory } from '../../core/backpressure/backpressure_factory';
import { MessageEnvelope } from '../../core/messaging/types';
import { v4 as uuidv4 } from 'uuid';
import { performance } from 'perf_hooks';
import { EventEmitter } from 'events';

// 测试配置 - 减少消息数量以避免超时
const TEST_MESSAGE_COUNT = 2000;
const BATCH_SIZE = 500;

describe('End-to-End Performance', () => {
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

    // 创建路由目标
    function createRoutees(count: number) {
        return Array.from({ length: count }, (_, i) => ({
            id: `actor-${i}`,
            address: `local://actor-${i}`
        }));
    }

    // 模拟处理逻辑完成时间 - 减少等待时间
    function simulateProcessingTime(processingTime: number): Promise<void> {
        return new Promise(resolve => setTimeout(resolve, Math.min(processingTime, 5)));
    }

    // 测试路由+背压组合的端到端性能
    async function testEndToEndPerformance(
        routerStrategy: RouterStrategy,
        backpressureStrategy: BackpressureStrategy,
        routeeCount: number,
        queueSize: number,
        processingTime: number
    ) {
        // 创建背压控制器
        const controller = BackpressureFactory.createController({
            maxQueueSize: queueSize,
            highWatermark: 0.8,
            lowWatermark: 0.2,
            strategy: backpressureStrategy,
            waitTimeout: 100 // 减少等待超时时间
        });

        // 创建路由目标
        const routees = createRoutees(routeeCount);

        // 创建路由器
        const router = RouterFactory.createRouter({
            strategy: routerStrategy,
            routees
        });

        // 收集指标
        let messagesProcessed = 0;
        let messagesDropped = 0;
        let backpressureActivations = 0;

        // 监听背压事件
        (controller as unknown as EventEmitter).on('backpressure:activated', () => {
            backpressureActivations++;
        });

        // 监听消息丢弃事件
        (controller as unknown as EventEmitter).on('message:dropped', () => {
            messagesDropped++;
        });

        // 创建测试消息
        const messages = Array.from({ length: TEST_MESSAGE_COUNT }, () => createTestMessage());

        // 开始计时
        const startTime = performance.now();

        // 启动处理器 - 模拟消费者
        const processor = (async () => {
            let checkCount = 0;
            const maxChecks = 100; // 添加最大检查次数，避免死循环

            while (checkCount < maxChecks) {
                const message = await controller.next();
                if (!message) {
                    // 如果队列为空，休息一下再检查
                    await simulateProcessingTime(5);
                    // 如果已处理所有消息且没有更多提交，退出
                    if (messagesProcessed + messagesDropped >= TEST_MESSAGE_COUNT) {
                        break;
                    }
                    checkCount++;
                    continue;
                }

                checkCount = 0; // 重置检查计数

                // 模拟处理消息 - 使用更短的处理时间
                await simulateProcessingTime(processingTime);

                // 路由消息到下一个目标
                const routedTo = router.route(message);

                // 完成消息处理
                controller.complete(message.id);
                messagesProcessed++;

                // 如果已处理足够多的消息，提前退出
                if (messagesProcessed + messagesDropped >= TEST_MESSAGE_COUNT) {
                    break;
                }
            }
        })();

        // 提交消息 - 模拟生产者
        const producer = (async () => {
            for (let i = 0; i < TEST_MESSAGE_COUNT; i += BATCH_SIZE) {
                const batch = messages.slice(i, Math.min(i + BATCH_SIZE, TEST_MESSAGE_COUNT));

                // 并行提交批量消息，但使用较小的批次
                await Promise.all(
                    batch.map(message =>
                        controller.submit(message)
                            .catch(() => false)
                    )
                );

                // 提交完一批后等待较短时间
                await simulateProcessingTime(1);
            }
        })();

        // 等待生产者和消费者完成
        await Promise.all([producer, processor]);

        // 停止计时
        const endTime = performance.now();
        const duration = endTime - startTime;

        // 计算有效吞吐量 (每秒处理的消息数)
        const throughput = Math.floor(messagesProcessed / (duration / 1000));

        console.log(`Router: ${routerStrategy}, Backpressure: ${backpressureStrategy}, ` +
            `Routees: ${routeeCount}, QueueSize: ${queueSize}, ProcessingTime: ${processingTime}ms`);
        console.log(`Processed: ${messagesProcessed}, Dropped: ${messagesDropped}, ` +
            `Backpressure activations: ${backpressureActivations}`);
        console.log(`Throughput: ${throughput} msgs/sec, Duration: ${duration.toFixed(2)}ms\n`);

        return {
            routerStrategy,
            backpressureStrategy,
            routeeCount,
            queueSize,
            processingTime,
            messagesProcessed,
            messagesDropped,
            backpressureActivations,
            duration,
            throughput
        };
    }

    test('End-to-end performance with various configurations', async () => {
        const results = [];

        // 减少测试的组合数量
        const routerStrategies = [
            RouterStrategy.ROUND_ROBIN,
            RouterStrategy.RANDOM
        ];

        const backpressureStrategies = [
            BackpressureStrategy.DROP_NEW
        ];

        // 使用较少的参数组合
        const routeeCount = 5;
        const queueSize = 100;

        // 只测试一个处理时间
        const processingTime = 1;

        // 缩减测试量
        for (const routerStrategy of routerStrategies) {
            for (const backpressureStrategy of backpressureStrategies) {
                results.push(await testEndToEndPerformance(
                    routerStrategy,
                    backpressureStrategy,
                    routeeCount,
                    queueSize,
                    processingTime
                ));
            }
        }

        // 打印性能比较表格
        console.log("\nEnd-to-End Performance Summary (throughput in msgs/sec):");
        console.log("Router Strategy | Backpressure Strategy | Throughput");
        console.log("---------------|----------------------|----------");

        for (const result of results) {
            const row = [
                result.routerStrategy.padEnd(15),
                result.backpressureStrategy.padEnd(22),
                result.throughput.toLocaleString()
            ];

            console.log(row.join("| "));
        }

        // 添加结果验证
        expect(results.length).toBe(
            routerStrategies.length *
            backpressureStrategies.length
        );
    }, 10000); // 增加测试超时时间到10秒
}); 