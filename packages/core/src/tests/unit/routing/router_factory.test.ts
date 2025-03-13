import { describe, test, expect } from 'bun:test';
import { RouterFactory, RouterStrategy, RoundRobinRouter, RandomRouter, BroadcastRouter, ConsistentHashRouter } from '../../../core/routing';

describe('RouterFactory', () => {
    const routees = [
        { id: 'actor-1', address: 'local://actor-1' },
        { id: 'actor-2', address: 'local://actor-2' }
    ];

    test('should create a RoundRobinRouter', () => {
        const router = RouterFactory.createRouter({
            strategy: RouterStrategy.ROUND_ROBIN,
            routees: [...routees]
        });

        expect(router).toBeInstanceOf(RoundRobinRouter);
        expect(router.getRoutees().length).toBe(routees.length);
    });

    test('should create a RandomRouter', () => {
        const router = RouterFactory.createRouter({
            strategy: RouterStrategy.RANDOM,
            routees: [...routees]
        });

        expect(router).toBeInstanceOf(RandomRouter);
        expect(router.getRoutees().length).toBe(routees.length);
    });

    test('should create a BroadcastRouter', () => {
        const router = RouterFactory.createRouter({
            strategy: RouterStrategy.BROADCAST,
            routees: [...routees]
        });

        expect(router).toBeInstanceOf(BroadcastRouter);
        expect(router.getRoutees().length).toBe(routees.length);
    });

    test('should create a ConsistentHashRouter', () => {
        const router = RouterFactory.createRouter({
            strategy: RouterStrategy.CONSISTENT_HASH,
            routees: [...routees]
        });

        expect(router).toBeInstanceOf(ConsistentHashRouter);
        expect(router.getRoutees().length).toBe(routees.length);
    });

    test('should create a ConsistentHashRouter with custom hash function', () => {
        const hashFunction = (message: any) => message.id;
        const router = RouterFactory.createRouter({
            strategy: RouterStrategy.CONSISTENT_HASH,
            routees: [...routees],
            hashFunction
        });

        expect(router).toBeInstanceOf(ConsistentHashRouter);
        expect(router.getRoutees().length).toBe(routees.length);
    });

    test('should throw error for unknown strategy', () => {
        expect(() => {
            RouterFactory.createRouter({
                strategy: 'unknown-strategy' as RouterStrategy,
                routees: [...routees]
            });
        }).toThrow();
    });
}); 