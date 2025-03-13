import { describe, test, expect, beforeEach } from 'bun:test';
import { ConsistentHashRouter } from '../../../core/routing';
import { RouterConfig, RouterStrategy } from '../../../core/routing';
import { MessageEnvelope } from '../../../core/messaging/types';

describe('ConsistentHashRouter', () => {
    let router: ConsistentHashRouter;
    let config: RouterConfig;
    const routees = [
        { id: 'actor-1', address: 'local://actor-1' },
        { id: 'actor-2', address: 'local://actor-2' },
        { id: 'actor-3', address: 'local://actor-3' }
    ];

    beforeEach(() => {
        config = {
            strategy: RouterStrategy.CONSISTENT_HASH,
            routees: [...routees],
            hashFunction: (message: MessageEnvelope) => message.id
        };
        router = new ConsistentHashRouter(config);
    });

    const createTestMessage = (id: string): MessageEnvelope => ({
        id,
        sender: { id: 'sender-1', address: 'local://sender-1' },
        receiver: { id: 'receiver-1', address: 'local://receiver-1' },
        payload: { test: 'data' },
        metadata: {
            deliveryAttempt: 1,
            messageType: 'TEST',
        },
        timestamp: Date.now()
    });

    test('should route same message ID to same routee', () => {
        const messageId = 'test-message-1';
        const message1 = createTestMessage(messageId);
        const message2 = createTestMessage(messageId);

        const routee1 = router.route(message1);
        const routee2 = router.route(message2);

        // 相同的消息ID应该被路由到同一个routee
        expect(routee1).not.toBeNull();
        expect(routee2).not.toBeNull();
        expect(routee1!.id).toBe(routee2!.id);
    });

    test('should return null when no routees are available', () => {
        const emptyRouter = new ConsistentHashRouter({
            strategy: RouterStrategy.CONSISTENT_HASH,
            routees: []
        });

        const message = createTestMessage('test-message');
        const result = emptyRouter.route(message);
        expect(result).toBeNull();
    });

    test('should handle adding and removing routees', () => {
        const messageId = 'test-message-2';
        const message = createTestMessage(messageId);

        // 获取初始路由结果
        const initialRoutee = router.route(message);
        expect(initialRoutee).not.toBeNull();

        // 添加新的routee
        const newRoutee = { id: 'actor-4', address: 'local://actor-4' };
        router.addRoutee(newRoutee);

        // 验证已添加
        expect(router.getRoutees().length).toBe(4);
        expect(router.getRoutees().some(r => r.id === newRoutee.id)).toBe(true);

        // 移除routee后再次路由
        router.removeRoutee(newRoutee);
        const finalRoutee = router.route(message);

        // 验证routee已移除
        expect(router.getRoutees().length).toBe(3);
        expect(router.getRoutees().some(r => r.id === newRoutee.id)).toBe(false);

        // 验证移除routee后，原始消息仍然路由到同一个目标
        // (因为我们恢复了原始的routee列表)
        expect(finalRoutee!.id).toBe(initialRoutee!.id);
    });

    test('should use custom hash function when provided', () => {
        // 创建一个使用payload.key作为哈希基础的路由器
        const customHashRouter = new ConsistentHashRouter({
            strategy: RouterStrategy.CONSISTENT_HASH,
            routees: [...routees],
            hashFunction: (message: MessageEnvelope) => message.payload.key as string
        });

        // 创建具有相同key的不同消息
        const message1 = createTestMessage('different-id-1');
        message1.payload = { key: 'same-key' };

        const message2 = createTestMessage('different-id-2');
        message2.payload = { key: 'same-key' };

        // 验证具有相同key的消息路由到相同的routee
        const routee1 = customHashRouter.route(message1);
        const routee2 = customHashRouter.route(message2);

        expect(routee1).not.toBeNull();
        expect(routee2).not.toBeNull();
        expect(routee1!.id).toBe(routee2!.id);
    });

    test('should distribute messages evenly across routees', () => {
        // 使用大量不同的消息ID进行测试
        const messageCount = 1000;
        const routeeCounts: Record<string, number> = {};

        // 初始化计数器
        for (const routee of routees) {
            routeeCounts[routee.id] = 0;
        }

        // 路由大量消息
        for (let i = 0; i < messageCount; i++) {
            const messageId = `test-message-${i}`;
            const message = createTestMessage(messageId);
            const routee = router.route(message);

            if (routee) {
                routeeCounts[routee.id]++;
            }
        }

        // 验证分布相对均匀
        // 在均匀分布的情况下，每个routee应该得到messageCount/routees.length次选择
        const expectedCount = messageCount / routees.length;
        // 允许30%的误差
        const tolerance = 0.3;

        for (const routee of routees) {
            const count = routeeCounts[routee.id];
            expect(count).toBeGreaterThan(expectedCount * (1 - tolerance));
            expect(count).toBeLessThan(expectedCount * (1 + tolerance));
        }
    });

    test('should remap messages when routees change', () => {
        // 创建多个测试消息
        const messages = Array.from({ length: 10 }, (_, i) => createTestMessage(`test-message-${i}`));

        // 记录初始路由结果
        const initialRoutings = new Map<string, string>();
        for (const message of messages) {
            const routee = router.route(message);
            if (routee) {
                initialRoutings.set(message.id, routee.id);
            }
        }

        // 移除一个routee
        router.removeRoutee(routees[0]);

        // 记录移除后的路由结果
        const newRoutings = new Map<string, string>();
        for (const message of messages) {
            const routee = router.route(message);
            if (routee) {
                newRoutings.set(message.id, routee.id);
            }
        }

        // 验证一些消息的路由发生了变化
        let changedCount = 0;
        for (const [messageId, initialRouteeId] of initialRoutings.entries()) {
            const newRouteeId = newRoutings.get(messageId);
            if (initialRouteeId !== newRouteeId) {
                changedCount++;
            }
        }

        // 至少应该有一些消息的路由发生了变化
        // 但不应该全部改变（一致性哈希的特性）
        expect(changedCount).toBeGreaterThan(0);
        expect(changedCount).toBeLessThan(messages.length);
    });
}); 