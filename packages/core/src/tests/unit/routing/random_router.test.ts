import { describe, test, expect, beforeEach, mock } from 'bun:test';
import { RandomRouter } from '../../../core/routing';
import { RouterConfig, RouterStrategy } from '../../../core/routing';
import { MessageEnvelope } from '../../../core/messaging/types';
import { v4 as uuidv4 } from 'uuid';

describe('RandomRouter', () => {
    let router: RandomRouter;
    let config: RouterConfig;
    const routees = [
        { id: 'actor-1', address: 'local://actor-1' },
        { id: 'actor-2', address: 'local://actor-2' },
        { id: 'actor-3', address: 'local://actor-3' }
    ];

    beforeEach(() => {
        config = {
            strategy: RouterStrategy.RANDOM,
            routees: [...routees]
        };
        router = new RandomRouter(config);
    });

    const createTestMessage = (): MessageEnvelope => ({
        id: uuidv4(),
        sender: { id: 'sender-1', address: 'local://sender-1' },
        receiver: { id: 'receiver-1', address: 'local://receiver-1' },
        payload: { test: 'data' },
        metadata: {
            deliveryAttempt: 1,
            messageType: 'TEST',
        },
        timestamp: Date.now()
    });

    test('should route messages to a valid routee', () => {
        const message = createTestMessage();
        const routee = router.route(message);

        // 验证返回了一个有效的routee
        expect(routee).not.toBeNull();
        expect(routees.some(r => r.id === routee!.id)).toBe(true);
    });

    test('should return null when no routees are available', () => {
        const emptyRouter = new RandomRouter({
            strategy: RouterStrategy.RANDOM,
            routees: []
        });

        const message = createTestMessage();
        const result = emptyRouter.route(message);
        expect(result).toBeNull();
    });

    test('should distribute messages randomly', () => {
        // 使用模拟的Math.random来测试分布
        const originalRandom = Math.random;

        try {
            // 我们会使用固定的随机值序列来测试
            const randomValues = [0.1, 0.5, 0.9, 0.3, 0.7];
            let callCount = 0;

            Math.random = mock(() => {
                return randomValues[callCount++ % randomValues.length];
            });

            const message1 = createTestMessage();
            const message2 = createTestMessage();
            const message3 = createTestMessage();

            const routee1 = router.route(message1);
            const routee2 = router.route(message2);
            const routee3 = router.route(message3);

            // 验证选择了不同的routee（因为我们的随机值会选择不同的索引）
            expect(routee1!.id).toBe(routees[0].id); // 0.1 * 3 = 0.3, 向下取整为 0
            expect(routee2!.id).toBe(routees[1].id); // 0.5 * 3 = 1.5, 向下取整为 1
            expect(routee3!.id).toBe(routees[2].id); // 0.9 * 3 = 2.7, 向下取整为 2
        } finally {
            // 恢复原始的Math.random
            Math.random = originalRandom;
        }
    });

    test('should handle adding and removing routees', () => {
        const newRoutee = { id: 'actor-4', address: 'local://actor-4' };
        router.addRoutee(newRoutee);

        // 验证已添加
        expect(router.getRoutees().length).toBe(4);
        expect(router.getRoutees().some(r => r.id === newRoutee.id)).toBe(true);

        // 删除一个routee
        router.removeRoutee(newRoutee);
        expect(router.getRoutees().length).toBe(3);
        expect(router.getRoutees().some(r => r.id === newRoutee.id)).toBe(false);
    });

    test('should not duplicate routees with same id', () => {
        const duplicateRoutee = { id: 'actor-1', address: 'local://actor-1-duplicate' };
        router.addRoutee(duplicateRoutee);

        // 路由器应该不允许相同ID的routee
        expect(router.getRoutees().length).toBe(3);
    });

    test('should select routees with uniform distribution over many iterations', () => {
        const iterations = 1000;
        const counts: Record<string, number> = {};

        // 初始化计数器
        for (const routee of routees) {
            counts[routee.id] = 0;
        }

        // 进行多次路由测试
        for (let i = 0; i < iterations; i++) {
            const message = createTestMessage();
            const routee = router.route(message);
            if (routee) {
                counts[routee.id]++;
            }
        }

        // 检查分布是否相对均匀
        // 在完全均匀的情况下，每个routee应该得到iterations/routees.length次选择
        const expectedCount = iterations / routees.length;
        // 允许30%的误差
        const tolerance = 0.3;

        for (const routee of routees) {
            const count = counts[routee.id];
            // 验证计数在预期范围内
            expect(count).toBeGreaterThan(expectedCount * (1 - tolerance));
            expect(count).toBeLessThan(expectedCount * (1 + tolerance));
        }
    });
}); 