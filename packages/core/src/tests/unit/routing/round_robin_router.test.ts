import { describe, test, expect, beforeEach } from 'bun:test';
import { RoundRobinRouter } from '../../../core/routing';
import { RouterConfig, RouterStrategy } from '../../../core/routing';
import { MessageEnvelope } from '../../../core/messaging/types';
import { v4 as uuidv4 } from 'uuid';

describe('RoundRobinRouter', () => {
    let router: RoundRobinRouter;
    let config: RouterConfig;
    const routees = [
        { id: 'actor-1', address: 'local://actor-1' },
        { id: 'actor-2', address: 'local://actor-2' },
        { id: 'actor-3', address: 'local://actor-3' }
    ];

    beforeEach(() => {
        config = {
            strategy: RouterStrategy.ROUND_ROBIN,
            routees: [...routees]
        };
        router = new RoundRobinRouter(config);
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

    test('should route messages in round-robin fashion', () => {
        const message1 = createTestMessage();
        const message2 = createTestMessage();
        const message3 = createTestMessage();
        const message4 = createTestMessage();

        // 第一轮路由
        const routee1 = router.route(message1);
        const routee2 = router.route(message2);
        const routee3 = router.route(message3);

        // 第二轮开始
        const routee4 = router.route(message4);

        // 验证轮询顺序
        expect(routee1).not.toBeNull();
        expect(routee2).not.toBeNull();
        expect(routee3).not.toBeNull();
        expect(routee4).not.toBeNull();

        expect(routee1!.id).toBe(routees[0].id);
        expect(routee2!.id).toBe(routees[1].id);
        expect(routee3!.id).toBe(routees[2].id);
        expect(routee4!.id).toBe(routees[0].id); // 回到第一个
    });

    test('should handle adding and removing routees', () => {
        const newRoutee = { id: 'actor-4', address: 'local://actor-4' };
        router.addRoutee(newRoutee);

        // 验证已添加
        expect(router.getRoutees().length).toBe(4);
        expect(router.getRoutees().some(r => r.id === newRoutee.id)).toBe(true);

        // 轮询测试中应该包含新添加的routee
        const message1 = createTestMessage();
        const message2 = createTestMessage();
        const message3 = createTestMessage();
        const message4 = createTestMessage();

        const routee1 = router.route(message1);
        const routee2 = router.route(message2);
        const routee3 = router.route(message3);
        const routee4 = router.route(message4);

        // 验证经过了新添加的routee
        const routeeIds = [
            routee1!.id, routee2!.id, routee3!.id, routee4!.id
        ];
        expect(routeeIds).toContain(newRoutee.id);

        // 删除一个routee
        router.removeRoutee(newRoutee);
        expect(router.getRoutees().length).toBe(3);
        expect(router.getRoutees().some(r => r.id === newRoutee.id)).toBe(false);
    });

    test('should return null when no routees are available', () => {
        const emptyRouter = new RoundRobinRouter({
            strategy: RouterStrategy.ROUND_ROBIN,
            routees: []
        });

        const message = createTestMessage();
        const result = emptyRouter.route(message);
        expect(result).toBeNull();
    });

    test('should not duplicate routees with same id', () => {
        const duplicateRoutee = { id: 'actor-1', address: 'local://actor-1-duplicate' };
        router.addRoutee(duplicateRoutee);

        // 路由器应该不允许相同ID的routee
        expect(router.getRoutees().length).toBe(3);
    });

    test('should maintain round-robin order after removing a routee', () => {
        const message1 = createTestMessage();
        const routee1 = router.route(message1); // actor-1

        // 移除当前选中的routee
        router.removeRoutee(routees[1]); // 移除actor-2

        const message2 = createTestMessage();
        const routee2 = router.route(message2);

        // 下一个应该是actor-3（不是actor-2，因为它已被移除）
        expect(routee2!.id).toBe(routees[2].id);

        const message3 = createTestMessage();
        const routee3 = router.route(message3);

        // 然后回到actor-1
        expect(routee3!.id).toBe(routees[0].id);
    });
}); 