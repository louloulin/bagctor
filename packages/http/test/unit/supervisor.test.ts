import { test, expect, describe, mock, beforeEach, afterEach } from 'bun:test';
import { ActorSystem, Actor, ActorContext, PID } from '@bactor/core';
import {
    SupervisorActor,
    OneForOneStrategy,
    AllForOneStrategy,
    TemporaryError,
    ResourceError,
    FatalError
} from '../../src/actors/supervision';

// Mock worker actor that can throw errors
class ErrorProneActor extends Actor {
    private name: string;

    constructor(context: ActorContext, props?: any) {
        super(context);
        this.name = props?.name || 'anonymous';
    }

    protected behaviors(): void {
        this.addBehavior('default', async (msg) => {
            if (msg.type === 'throw') {
                console.log(`[${this.name}] About to throw error: ${msg.payload.errorType}`);

                // Throw the specified error type
                switch (msg.payload.errorType) {
                    case 'temporary':
                        throw new TemporaryError(`Temporary error from ${this.name}`);
                    case 'resource':
                        throw new ResourceError(`Resource error from ${this.name}`);
                    case 'fatal':
                        throw new FatalError(`Fatal error from ${this.name}`);
                    default:
                        throw new Error(`Generic error from ${this.name}`);
                }
            } else if (msg.type === 'ping') {
                // Respond to ping to check if actor is alive
                if (msg.sender) {
                    await this.context.send(msg.sender, {
                        type: 'pong',
                        payload: { from: this.name },
                        sender: this.context.self
                    });
                }
            }
        });
    }
}

describe('SupervisorActor', () => {
    let system: ActorSystem;
    let supervisorRef: PID;
    let workerRef: PID;

    beforeEach(async () => {
        // Create a new actor system for each test
        system = new ActorSystem('test-system');

        // Create a supervisor actor
        supervisorRef = await system.spawn({
            actorClass: SupervisorActor
        });

        // Create a worker actor
        workerRef = await system.spawn({
            actorClass: ErrorProneActor,
            actorContext: {
                name: 'test-worker'
            }
        });

        // Tell the supervisor to supervise the worker
        await system.send(supervisorRef, {
            type: 'supervise',
            payload: { child: workerRef },
            sender: null
        });
    });

    afterEach(async () => {
        // Clean up the actor system
        await system.shutdown();
    });

    test('should handle message passing', async () => {
        // Define a test message sender
        const testSender = await system.spawn({
            actorClass: class TestSender extends Actor {
                constructor(context: ActorContext) {
                    super(context);
                }

                protected behaviors(): void {
                    this.addBehavior('default', (msg) => {
                        // Just store the message for assertion
                        this.context.state.set('lastMessage', msg);
                    });
                }
            }
        });

        // Send a ping message to the worker
        await system.send(workerRef, {
            type: 'ping',
            sender: testSender
        });

        // Wait a bit for the message to be processed
        await new Promise(resolve => setTimeout(resolve, 100));

        // Get the response from the test actor's state
        const lastMessage = system.getActor(testSender.id).context.state.get('lastMessage');

        expect(lastMessage).not.toBe(undefined);
        expect(lastMessage.type).toBe('pong');
        expect(lastMessage.payload.from).toBe('test-worker');
    });

    // This test demonstrates that the supervisor handles errors
    // Note: In a real test, we would need to adapt this to actually
    // verify the supervisory behavior, but this can be challenging without
    // access to internal state or mock capabilities
    test('should handle errors from supervised actors', async () => {
        // Store the current console.error to restore later
        const originalConsoleError = console.error;

        // Mock console.error to catch error logs
        const errorLogs: string[] = [];
        console.error = (message: string) => {
            errorLogs.push(message);
        };

        try {
            // Send a message that will cause the worker to throw an error
            await system.send(workerRef, {
                type: 'throw',
                payload: { errorType: 'temporary' },
                sender: null
            });

            // Wait for the error to be handled
            await new Promise(resolve => setTimeout(resolve, 100));

            // We can't easily assert on the supervision behavior directly
            // but we can check that error logs were generated
            expect(errorLogs.length).toBeGreaterThan(0);
            expect(errorLogs.some(log => log.includes('test-worker') || log.includes('Temporary error'))).toBe(true);
        } finally {
            // Restore the original console.error
            console.error = originalConsoleError;
        }
    });
}); 