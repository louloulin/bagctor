import { test, expect, describe, mock, beforeEach, afterEach } from 'bun:test';
import { ActorSystem, Actor, ActorContext } from '@bactor/core';
import { ActorPool } from '../../src/actors/pool/actor_pool';

// Mock worker actor class for testing
class TestWorkerActor extends Actor {
    private name: string;

    constructor(context: ActorContext, props?: any) {
        super(context);
        this.name = props?.name || 'anonymous';
    }

    protected behaviors(): void {
        this.addBehavior('default', async (msg) => {
            if (msg.type === 'work') {
                // Process the work
                const result = `Processed by ${this.name}: ${msg.payload}`;

                // Send the response
                if (msg.sender) {
                    await this.context.send(msg.sender, {
                        type: 'work.complete',
                        payload: {
                            result,
                            originalSender: msg.payload.originalSender
                        },
                        sender: this.context.self
                    });
                }
            }
        });
    }
}

describe('ActorPool', () => {
    let system: ActorSystem;
    let poolRef: any;

    beforeEach(async () => {
        // Create a new actor system for each test
        system = new ActorSystem('test-system');

        // Create an actor pool
        poolRef = await system.spawn({
            actorClass: ActorPool,
            actorContext: {
                pooledActorClass: TestWorkerActor,
                poolSize: 3,
                routingStrategy: 'round-robin',
                pooledActorProps: {
                    name: 'test-worker'
                }
            }
        });
    });

    afterEach(async () => {
        // Clean up the actor system
        await system.shutdown();
    });

    test('should create the specified number of workers', async () => {
        // Get stats from the pool
        const response = await system.ask(poolRef, {
            type: 'pool.stats',
            sender: system.deadLetter
        });

        expect(response.type).toBe('pool.stats.result');
        expect(response.payload.size).toBe(3);
        expect(response.payload.busy).toBe(0);
        expect(response.payload.strategy).toBe('round-robin');
    });

    test('should distribute work using round-robin strategy', async () => {
        const requests = 6;
        const results = [];

        // Send multiple work requests
        for (let i = 0; i < requests; i++) {
            const response = await system.ask(poolRef, {
                type: 'work',
                payload: `work-${i}`,
                sender: system.deadLetter
            });

            results.push(response.payload);
        }

        // Verify that work was distributed evenly
        const workCounts = {
            worker0: 0,
            worker1: 0,
            worker2: 0
        };

        for (const result of results) {
            if (result.includes('worker-0')) workCounts.worker0++;
            if (result.includes('worker-1')) workCounts.worker1++;
            if (result.includes('worker-2')) workCounts.worker2++;
        }

        // With round-robin and 6 requests to 3 workers, each should get 2 requests
        expect(workCounts.worker0).toBe(2);
        expect(workCounts.worker1).toBe(2);
        expect(workCounts.worker2).toBe(2);
    });

    test('should resize the pool', async () => {
        // Resize the pool to 5 workers
        await system.send(poolRef, {
            type: 'pool.resize',
            payload: { size: 5 },
            sender: system.deadLetter
        });

        // Give some time for resize operation to complete
        await new Promise(resolve => setTimeout(resolve, 100));

        // Get stats from the pool
        const response = await system.ask(poolRef, {
            type: 'pool.stats',
            sender: system.deadLetter
        });

        expect(response.payload.size).toBe(5);
    });
}); 