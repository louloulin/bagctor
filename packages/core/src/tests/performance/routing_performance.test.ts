import { describe, test, expect, beforeEach } from 'bun:test';
import { RouterFactory, RouterStrategy } from '../../core/routing';
import { MessageEnvelope } from '../../core/messaging/types';
import { v4 as uuidv4 } from 'uuid';
import { performance } from 'perf_hooks';

// 测试配置
const TEST_MESSAGE_COUNT = 100000; // 测试消息数量
const ROUTEE_COUNTS = [10, 100, 1000]; // 测试不同数量的路由目标

describe('Routing Performance', () => {
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

    // 测试特定路由策略的性能
    async function testRouterPerformance(strategy: RouterStrategy, routeeCount: number) {
        // 创建测试消息
        const messages = Array.from({ length: TEST_MESSAGE_COUNT }, () => createTestMessage());

        // 创建路由目标
        const routees = createRoutees(routeeCount);

        // 创建路由器
        const router = RouterFactory.createRouter({
            strategy,
            routees
        });

        // 测量路由性能
        const startTime = performance.now();

        for (const message of messages) {
            router.route(message);
        }

        const endTime = performance.now();
        const duration = endTime - startTime;

        // 计算每秒操作数
        const opsPerSecond = Math.floor(TEST_MESSAGE_COUNT / (duration / 1000));

        console.log(`${strategy} 路由器 with ${routeeCount} routees: ${opsPerSecond} ops/sec (${duration.toFixed(2)} ms)`);

        return {
            strategy,
            routeeCount,
            duration,
            opsPerSecond
        };
    }

    // 为每种路由策略和路由目标数量组合运行测试
    test('Measure routing performance for all strategies', async () => {
        const results = [];

        // 测试所有策略和路由目标数量组合
        for (const routeeCount of ROUTEE_COUNTS) {
            results.push(await testRouterPerformance(RouterStrategy.ROUND_ROBIN, routeeCount));
            results.push(await testRouterPerformance(RouterStrategy.RANDOM, routeeCount));
            results.push(await testRouterPerformance(RouterStrategy.BROADCAST, routeeCount));
            results.push(await testRouterPerformance(RouterStrategy.CONSISTENT_HASH, routeeCount));
        }

        // 确保测试完成
        expect(results.length).toBe(ROUTEE_COUNTS.length * 4);

        // 打印性能比较表格
        console.log("\nRouting Performance Summary (ops/sec):");
        console.log("Strategy           | 10 Routees    | 100 Routees   | 1000 Routees");
        console.log("-------------------|--------------|--------------|-------------");

        const strategies = [
            RouterStrategy.ROUND_ROBIN,
            RouterStrategy.RANDOM,
            RouterStrategy.BROADCAST,
            RouterStrategy.CONSISTENT_HASH
        ];

        for (const strategy of strategies) {
            const strategyResults = results.filter(r => r.strategy === strategy);
            const row = [
                strategy.padEnd(18),
                strategyResults[0].opsPerSecond.toLocaleString().padEnd(13),
                strategyResults[1].opsPerSecond.toLocaleString().padEnd(13),
                strategyResults[2].opsPerSecond.toLocaleString()
            ];
            console.log(row.join("| "));
        }
    });
}); 