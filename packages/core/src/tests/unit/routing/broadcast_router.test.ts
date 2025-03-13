import { describe, test, expect, beforeEach } from 'bun:test';
import { BroadcastRouter } from '../../../core/routing';
import { RouterConfig, RouterStrategy } from '../../../core/routing';
import { MessageEnvelope } from '../../../core/messaging/types';
import { v4 as uuidv4 } from 'uuid';

describe('BroadcastRouter', () => {
    let router: BroadcastRouter;
    let config: RouterConfig;
    const routees = [
        { id: 'actor-1', address: 'local://actor-1' },
        { id: 'actor-2', address: 'local://actor-2' },
        { id: 'actor-3', address: 'local://actor-3' }
    ];

    beforeEach(() => {
        config = {
            strategy: RouterStrategy.BROADCAST,
            routees: [...routees]
        };
        router = new BroadcastRouter(config);
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

    test('should broadcast messages to all routees', () => {
        const message = createTestMessage();
        const result = router.route(message);

        // 验证返回了所有routee
        expect(Array.isArray(result)).toBe(true);
        expect(result.length).toBe(routees.length);

        // 验证每个原始routee都在结果中
        for (const routee of routees) {
            expect(result.some(r => r.id === routee.id)).toBe(true);
        }
    });

    test('should return empty array when no routees are available', () => {
        const emptyRouter = new BroadcastRouter({
            strategy: RouterStrategy.BROADCAST,
            routees: []
        });

        const message = createTestMessage();
        const result = emptyRouter.route(message);

        expect(Array.isArray(result)).toBe(true);
        expect(result.length).toBe(0);
    });

    test('should handle adding and removing routees', () => {
        const newRoutee = { id: 'actor-4', address: 'local://actor-4' };
        router.addRoutee(newRoutee);

        // 验证已添加
        expect(router.getRoutees().length).toBe(4);
        expect(router.getRoutees().some(r => r.id === newRoutee.id)).toBe(true);

        // 验证广播结果包含新添加的routee
        const message = createTestMessage();
        const result = router.route(message);
        expect(result.some(r => r.id === newRoutee.id)).toBe(true);

        // 删除一个routee
        router.removeRoutee(newRoutee);
        expect(router.getRoutees().length).toBe(3);

        // 验证广播结果不包含已删除的routee
        const updatedResult = router.route(message);
        expect(updatedResult.some(r => r.id === newRoutee.id)).toBe(false);
    });

    test('should not duplicate routees with same id', () => {
        const duplicateRoutee = { id: 'actor-1', address: 'local://actor-1-duplicate' };
        router.addRoutee(duplicateRoutee);

        // 路由器应该不允许相同ID的routee
        expect(router.getRoutees().length).toBe(3);

        // 验证广播结果中没有重复
        const message = createTestMessage();
        const result = router.route(message);

        // 计算ID为'actor-1'的routee数量
        const actorCount = result.filter(r => r.id === 'actor-1').length;
        expect(actorCount).toBe(1);
    });

    test('should return a copy of routees, not the original array', () => {
        const message = createTestMessage();
        const result = router.route(message);

        // 验证结果是数组副本，而不是原始数组的引用
        expect(result).not.toBe(router.getRoutees());

        // 修改返回的数组不应影响内部状态
        const originalLength = router.getRoutees().length;
        result.push({ id: 'actor-extra', address: 'local://actor-extra' });

        // 内部routee数量不应变化
        expect(router.getRoutees().length).toBe(originalLength);
    });
}); 