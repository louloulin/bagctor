import { describe, test, expect } from 'bun:test';
import { RouterFactory } from '../../../core/routing/router_factory';
import { RoundRobinRouter } from '../../../core/routing/round_robin_router';
import { RandomRouter } from '../../../core/routing/random_router';
import { BroadcastRouter } from '../../../core/routing/broadcast_router';
import { ConsistentHashRouter } from '../../../core/routing/consistent_hash_router';
import { RouterStrategy } from '../../../core/routing/types';

describe('RouterFactory', () => {
    // 创建测试用的routees
    const routees = [
        { id: 'actor-1', address: 'local://actor-1' },
        { id: 'actor-2', address: 'local://actor-2' },
        { id: 'actor-3', address: 'local://actor-3' }
    ];

    test('should create a RoundRobinRouter', () => {
        const router = RouterFactory.createRouter({
            strategy: RouterStrategy.ROUND_ROBIN,
            routees: [...routees]
        });

        expect(router).toBeInstanceOf(RoundRobinRouter);
        expect(router.getRoutees().length).toBe(3);
    });

    test('should create a RandomRouter', () => {
        const router = RouterFactory.createRouter({
            strategy: RouterStrategy.RANDOM,
            routees: [...routees]
        });

        expect(router).toBeInstanceOf(RandomRouter);
        expect(router.getRoutees().length).toBe(3);
    });

    test('should create a BroadcastRouter', () => {
        const router = RouterFactory.createRouter({
            strategy: RouterStrategy.BROADCAST,
            routees: [...routees]
        });

        expect(router).toBeInstanceOf(BroadcastRouter);
        expect(router.getRoutees().length).toBe(3);
    });

    test('should create a ConsistentHashRouter', () => {
        const router = RouterFactory.createRouter({
            strategy: RouterStrategy.CONSISTENT_HASH,
            routees: [...routees]
        });

        expect(router).toBeInstanceOf(ConsistentHashRouter);
        expect(router.getRoutees().length).toBe(3);
    });

    test('should create a ConsistentHashRouter with custom hash function', () => {
        const hashFunction = (message: any) => message.id;
        const router = RouterFactory.createRouter({
            strategy: RouterStrategy.CONSISTENT_HASH,
            routees: [...routees],
            hashFunction
        });

        expect(router).toBeInstanceOf(ConsistentHashRouter);
        expect(router.getRoutees().length).toBe(3);
    });

    test('should throw error for unknown strategy', () => {
        expect(() => {
            RouterFactory.createRouter({
                strategy: 'UNKNOWN_STRATEGY' as RouterStrategy,
                routees: [...routees]
            });
        }).toThrow();
    });
}); 