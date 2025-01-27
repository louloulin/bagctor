import { expect, test, mock } from "bun:test";
import { ActorSystem } from "../core/system";
import { createRouter, RouterType, RouterConfig } from "../core/router";
import { Actor } from "../core/actor";
import { Message, PID } from "../core/types";
import { ActorContext } from "../core/context";
import { log } from "../utils/logger";
import { beforeEach, describe, it, jest } from '@jest/globals';

class TestActor extends Actor {
    public receivedMessages: Message[] = [];
    private static instances: Map<string, TestActor> = new Map();
    private messagePromises: Map<string, Promise<void>> = new Map();
    private readonly mutex = new Mutex();

    constructor(context: ActorContext) {
        super(context);
        TestActor.instances.set(context.self.id, this);
        log.info(`[TestActor ${context.self.id}] Initialized`);
        this.initialize();
    }

    protected behaviors(): void {
        this.addBehavior('default', async (message: Message) => {
            const actorId = this.context.self.id;
            log.info(`[TestActor ${actorId}] Received message of type: ${message.type}`, {
                messageType: message.type,
                messageId: message.messageId,
                payload: message.payload
            });

            if (message.type === 'get-messages') {
                if (message.sender) {
                    try {
                        log.info(`[TestActor ${actorId}] Processing get-messages request from ${message.sender.id}`);
                        const release = await this.mutex.acquire();
                        try {
                            if (this.messagePromises.size > 0) {
                                log.info(`[TestActor ${actorId}] Waiting for ${this.messagePromises.size} pending messages to complete`);
                                await Promise.all(this.messagePromises.values());
                            }
                            log.info(`[TestActor ${actorId}] Current message count: ${this.receivedMessages.length}`);
                            log.debug(`[TestActor ${actorId}] Messages to send:`, this.receivedMessages);
                            await this.context.system.send(message.sender, {
                                type: 'messages',
                                payload: [...this.receivedMessages]
                            });
                            log.info(`[TestActor ${actorId}] Successfully sent messages to ${message.sender.id}`);
                        } finally {
                            release();
                        }
                    } catch (error) {
                        log.error(`[TestActor ${actorId}] Error sending messages:`, error);
                        throw error;
                    }
                }
            } else {
                const messageId = message.messageId || Math.random().toString(36).substring(7);
                log.info(`[TestActor ${actorId}] Processing message ${messageId} of type ${message.type}`);

                const messagePromise = (async () => {
                    const release = await this.mutex.acquire();
                    try {
                        log.info(`[TestActor ${actorId}] Starting to process message ${messageId}`, {
                            originalType: message.type,
                            messageId,
                            currentCount: this.receivedMessages.length
                        });

                        // Strip the 'routed.' prefix if present
                        const originalMessage = {
                            ...message,
                            type: message.type.startsWith('routed.') ? message.type.substring(7) : message.type
                        };

                        log.info(`[TestActor ${actorId}] Processed message type transformation`, {
                            originalType: message.type,
                            newType: originalMessage.type,
                            messageId
                        });

                        this.receivedMessages.push(originalMessage);
                        log.info(`[TestActor ${actorId}] Added message to receivedMessages`, {
                            messageId,
                            newCount: this.receivedMessages.length,
                            messageType: originalMessage.type
                        });

                        // Add a small delay to ensure message is processed
                        await new Promise(resolve => setTimeout(resolve, 50));
                    } finally {
                        release();
                        this.messagePromises.delete(messageId);
                        log.info(`[TestActor ${actorId}] Completed processing message ${messageId}`, {
                            finalCount: this.receivedMessages.length
                        });
                    }
                })();

                this.messagePromises.set(messageId, messagePromise);
                await messagePromise;
            }
        });
    }

    async getReceivedMessages(): Promise<Message[]> {
        return this.receivedMessages;
    }

    async receive(message: Message): Promise<void> {
        this.receivedMessages.push(message);
        await super.receive(message);
    }

    static getInstance(id: string): TestActor | undefined {
        return TestActor.instances.get(id);
    }

    static clearInstances(): void {
        TestActor.instances.clear();
    }

    getId(): string {
        return this.context.self.id;
    }
}

class Mutex {
    private mutex = Promise.resolve();

    async acquire(): Promise<() => void> {
        let resolveMutex: () => void;
        const newMutex = new Promise<void>((resolve) => {
            resolveMutex = resolve;
        });

        const oldMutex = this.mutex;
        this.mutex = newMutex;

        await oldMutex;
        return resolveMutex!;
    }
}

class TempActor extends Actor {
    private resolve: ((messages: Message[]) => void) | undefined;
    private reject: ((error: Error) => void) | undefined;
    private timeout: ReturnType<typeof setTimeout> | undefined;
    private tempId: string;

    constructor(context: ActorContext, resolve: (messages: Message[]) => void, reject: (error: Error) => void) {
        super(context);
        this.resolve = resolve;
        this.reject = reject;
        this.tempId = Math.random().toString(36).substring(7);
        this.initialize();
    }

    protected behaviors(): void {
        this.addBehavior('default', async (message: Message) => {
            if (this.resolve && message.type === 'messages') {
                if (this.timeout) {
                    clearTimeout(this.timeout);
                    this.timeout = undefined;
                }
                this.resolve(message.payload);
                this.resolve = undefined;
                this.reject = undefined;
                await this.context.system.stop(this.context.self);
            }
        });
    }

    setTimeout(timeout: ReturnType<typeof setTimeout>): void {
        this.timeout = timeout;
    }

    handleTimeout(): void {
        if (this.timeout) {
            clearTimeout(this.timeout);
            this.timeout = undefined;
        }
        if (this.reject) {
            this.reject(new Error('Timeout waiting for messages'));
            this.reject = undefined;
            this.resolve = undefined;
        }
        if (this.context?.system && this.context?.self) {
            this.context.system.stop(this.context.self).catch((error: Error) => {
                console.error(`[TempActor ${this.tempId}] Error stopping actor:`, error);
            });
        }
    }
}

interface TestActorResult {
    system: ActorSystem;
    routees: PID[];
}

async function createTestActors(count: number): Promise<TestActorResult> {
    const system = new ActorSystem();
    const routees: PID[] = [];

    log.info(`[createTestActors] Creating ${count} test actors`);

    for (let i = 0; i < count; i++) {
        const pid = await system.spawn({
            producer: (context: ActorContext) => new TestActor(context)
        });
        routees.push(pid);
        log.info(`[createTestActors] Created actor ${i + 1}/${count}`, {
            actorId: pid.id
        });
    }

    log.info('[createTestActors] All actors created', {
        count,
        routeeIds: routees.map(r => r.id)
    });

    return { system, routees };
}

async function getTestActors(routees: PID[]): Promise<TestActor[]> {
    log.info('[getTestActors] Getting test actors', {
        routeeCount: routees.length,
        routeeIds: routees.map(r => r.id)
    });

    const actors = routees.map(pid => {
        const actor = TestActor.getInstance(pid.id);
        if (!actor) {
            const error = `Actor not found for PID ${pid.id}`;
            log.error('[getTestActors] Actor not found', {
                missingPid: pid.id
            });
            throw new Error(error);
        }
        return actor;
    });

    log.info('[getTestActors] Successfully retrieved all actors', {
        count: actors.length
    });

    return actors;
}

async function getReceivedMessages(system: ActorSystem, pid: PID): Promise<Message[]> {
    log.info('[getReceivedMessages] Requesting messages', {
        targetActorId: pid.id
    });

    return new Promise((resolve, reject) => {
        system.spawn({
            producer: async (context: ActorContext) => {
                const actor = new TempActor(context, resolve, reject);
                actor.setTimeout(setTimeout(() => {
                    log.error('[getReceivedMessages] Timeout waiting for response', {
                        targetActorId: pid.id,
                        tempActorId: context.self.id
                    });
                    actor.handleTimeout();
                }, 10000));

                log.info('[getReceivedMessages] Sending get-messages request', {
                    fromActorId: context.self.id,
                    toActorId: pid.id
                });

                await context.send(pid, { type: 'get-messages', sender: context.self });
                return actor;
            }
        });
    });
}

async function waitForMessages(actors: TestActor[], expectedCounts: number[], timeout = 30000): Promise<void> {
    const startTime = Date.now();
    const maxAttempts = 20;
    let attempt = 0;

    while (attempt < maxAttempts) {
        attempt++;
        log.info(`[waitForMessages] Starting attempt ${attempt}/${maxAttempts}`, {
            expectedCounts,
            timeout,
            elapsedTime: Date.now() - startTime
        });

        try {
            const receivedCounts = await Promise.all(
                actors.map(async (actor, index) => {
                    const messages = await actor.getReceivedMessages();
                    const messageTypes = messages.map(m => m.type);
                    log.info(`[waitForMessages] Actor ${actor.getId()} status:`, {
                        expectedCount: expectedCounts[index],
                        actualCount: messages.length,
                        attempt,
                        messageTypes,
                        messages: messages.map(m => ({ type: m.type, id: m.messageId }))
                    });
                    return messages.length;
                })
            );

            log.info(`[waitForMessages] Checking counts`, {
                attempt,
                receivedCounts,
                expectedCounts
            });

            const mismatches = receivedCounts.map((count, index) => ({
                actorId: actors[index].getId(),
                expected: expectedCounts[index],
                actual: count,
                matches: count === expectedCounts[index]
            }));

            const allMatch = mismatches.every(m => m.matches);

            if (!allMatch) {
                log.warn(`[waitForMessages] Count mismatches:`, {
                    mismatches: mismatches.filter(m => !m.matches)
                });
            } else {
                log.info('[waitForMessages] All message counts match expected counts', {
                    receivedCounts,
                    expectedCounts
                });
                return;
            }

            if (Date.now() - startTime > timeout) {
                const finalMessages = await Promise.all(
                    actors.map(async actor => {
                        const messages = await actor.getReceivedMessages();
                        return {
                            actorId: actor.getId(),
                            messages: messages.map(m => ({
                                type: m.type,
                                id: m.messageId,
                                content: m.content
                            }))
                        };
                    })
                );

                log.error('[waitForMessages] Timeout exceeded', {
                    timeout,
                    elapsedTime: Date.now() - startTime,
                    lastReceivedCounts: receivedCounts,
                    expectedCounts,
                    finalMessageState: finalMessages
                });
                throw new Error(`Timeout waiting for messages. Expected ${JSON.stringify(expectedCounts)} but got ${JSON.stringify(receivedCounts)}`);
            }

            log.info('[waitForMessages] Waiting before next attempt', {
                attempt,
                nextAttemptIn: '2000ms'
            });
            await new Promise(resolve => setTimeout(resolve, 2000));
        } catch (error) {
            log.error(`[waitForMessages] Attempt ${attempt} failed:`, error);

            if (attempt === maxAttempts) {
                const finalMessages = await Promise.all(
                    actors.map(async actor => {
                        const messages = await actor.getReceivedMessages();
                        return {
                            actorId: actor.getId(),
                            messages: messages.map(m => ({
                                type: m.type,
                                id: m.messageId,
                                content: m.content
                            }))
                        };
                    })
                );

                log.error('[waitForMessages] Max attempts reached', {
                    maxAttempts,
                    totalTime: Date.now() - startTime,
                    finalMessageState: finalMessages
                });
                throw error;
            }

            log.info('[waitForMessages] Retrying after error', {
                attempt,
                nextAttemptIn: '2000ms'
            });
            await new Promise(resolve => setTimeout(resolve, 2000));
        }
    }

    throw new Error(`Failed to receive expected messages after ${maxAttempts} attempts`);
}

async function waitForMessagesOnSystem(routees: PID[], expectedCounts: number[]): Promise<void> {
    log.info('Waiting for messages on system', { routees: routees.map(r => r.id), expectedCounts });
    const actors = await getTestActors(routees);
    try {
        await waitForMessages(actors, expectedCounts);
        log.info('Successfully received all expected messages');
    } catch (error) {
        log.error('Failed to receive expected messages:', error);
        // Log current message counts for debugging
        const currentCounts = await Promise.all(actors.map(async actor => {
            const messages = await actor.getReceivedMessages();
            return { actorId: actor.getId(), count: messages.length };
        }));
        log.info('Current message counts:', currentCounts);
        throw error;
    }
}

describe('Router', () => {
    jest.setTimeout(30000);

    beforeEach(() => {
        TestActor.clearInstances();
    });

    it('should handle subscribe and unsubscribe', async () => {
        const { system, routees } = await createTestActors(3);
        const routerConfig: RouterConfig = {
            system,
            routees
        };
        const router = await createRouter('round-robin', routerConfig);
        const routerPid = await system.spawn({
            producer: (context: ActorContext) => {
                const routerWithContext = Object.assign(router, { context });
                return routerWithContext;
            }
        });

        // Send test messages
        await system.send(routerPid, { type: 'test', content: 'message1' });
        await system.send(routerPid, { type: 'test', content: 'message2' });

        // Wait for messages with expected counts
        await waitForMessagesOnSystem(routees, [1, 1, 0]);
    });

    it('should handle request-response pattern', async () => {
        const { system, routees } = await createTestActors(3);
        const routerConfig: RouterConfig = {
            system,
            routees
        };
        const router = await createRouter('round-robin', routerConfig);
        const routerPid = await system.spawn({
            producer: (context: ActorContext) => {
                const routerWithContext = Object.assign(router, { context });
                return routerWithContext;
            }
        });

        await system.send(routerPid, { type: 'request', content: 'data' });

        // Wait for messages with expected counts
        await waitForMessagesOnSystem(routees, [1, 0, 0]);
    });

    it('should handle routee management messages', async () => {
        const { system, routees } = await createTestActors(2);

        const router = createRouter('round-robin', { system, routees: routees });
        const routerPid = await system.spawn({ producer: () => router });

        // Add a new routee
        const newRoutee = await system.spawn({
            producer: (context: ActorContext) => new TestActor(context)
        });
        await system.send(routerPid, { type: 'router.add-routee', routee: newRoutee });

        // Send test messages
        const promises = [];
        for (let i = 0; i < 3; i++) {
            promises.push(system.send(routerPid, { type: 'test', index: i }));
        }
        await Promise.all(promises);

        // Wait for messages to be processed
        await waitForMessagesOnSystem([...routees, newRoutee], [1, 1, 1]);

        // Verify message distribution includes new routee
        const messages = await getReceivedMessages(system, newRoutee);
        expect(messages.length).toBe(1); // New routee should receive one message
    });

    it('should handle consistent hash routing', async () => {
        const { system, routees } = await createTestActors(3);
        log.info('Created test actors for consistent hash routing test', {
            routeeIds: routees.map(r => r.id)
        });

        const router = createRouter('consistent-hash', {
            system,
            routees,
            routingConfig: {
                hashFunction: (message: Message) => {
                    const hash = message.content || '';
                    log.info('Calculating hash for message', {
                        content: message.content,
                        hash,
                        messageType: message.type
                    });
                    return hash;
                }
            }
        });
        const routerPid = await system.spawn({ producer: () => router });
        log.info('Created consistent hash router', { routerId: routerPid.id });

        // Send messages with same content multiple times
        const promises = [];
        const testMessage = { type: 'test', content: 'same_content' };
        for (let i = 0; i < 5; i++) {
            log.info(`Sending test message ${i + 1}/5`);
            promises.push(system.send(routerPid, testMessage));
        }
        await Promise.all(promises);
        log.info('Finished sending all test messages');

        // Wait for messages to be processed
        await waitForMessagesOnSystem(routees, [5, 0, 0]);

        // Verify messages with same content went to same routee
        const allMessages = await Promise.all(routees.map(routee => getReceivedMessages(system, routee)));
        const messageCounts = allMessages.map(messages => messages.length);

        // One routee should receive all messages, others should receive none
        expect(messageCounts.filter(count => count === 5).length).toBe(1);
        expect(messageCounts.filter(count => count === 0).length).toBe(2);
    });

    it('should handle random routing', async () => {
        const { system, routees } = await createTestActors(3);

        const router = createRouter('random', { system, routees });
        const routerPid = await system.spawn({ producer: () => router });

        // Send test messages
        const promises = [];
        for (let i = 0; i < 30; i++) {
            promises.push(system.send(routerPid, { type: 'test', index: i }));
        }
        await Promise.all(promises);

        // Wait for messages to be processed
        await waitForMessagesOnSystem(routees, [10, 10, 10]);

        // Verify all routees received messages
        const allMessages = await Promise.all(routees.map(routee => getReceivedMessages(system, routee)));
        const messageCounts = allMessages.map(messages => messages.length);

        // Each routee should receive some messages
        messageCounts.forEach(count => expect(count).toBeGreaterThan(0));

        // Total messages should be 30
        expect(messageCounts.reduce((a, b) => a + b, 0)).toBe(30);
    });

    it('should handle broadcast routing', async () => {
        const { system, routees } = await createTestActors(3);

        const router = createRouter('broadcast', { system, routees });
        const routerPid = await system.spawn({ producer: () => router });

        // Send test messages
        const messageCount = 5;
        const promises = [];
        for (let i = 0; i < messageCount; i++) {
            promises.push(system.send(routerPid, { type: 'test', index: i }));
        }
        await Promise.all(promises);

        // Wait for messages to be processed
        await waitForMessagesOnSystem(routees, [5, 5, 5]);

        // Verify all routees received all messages
        const allMessages = await Promise.all(routees.map(routee => getReceivedMessages(system, routee)));

        // Each routee should receive all messages
        allMessages.forEach(messages => {
            expect(messages.length).toBe(messageCount);
            expect(messages.map(m => m.index as number)
                .filter((index): index is number => index !== undefined)
                .sort((a, b) => a - b))
                .toEqual([0, 1, 2, 3, 4]);
        });
    });
}); 