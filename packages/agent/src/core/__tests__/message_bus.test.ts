import { describe, test, expect } from 'bun:test';
import { MessageBus } from '../message_bus';
import { EnhancedMessage, MessageFilter, Priority } from '../../types/message';

describe('MessageBus', () => {
    test('should subscribe and publish messages', async () => {
        const bus = new MessageBus();
        const messages: EnhancedMessage[] = [];

        const filter: MessageFilter = {
            priority: ['high']
        };

        const handler = async (message: EnhancedMessage) => {
            messages.push(message);
        };

        bus.subscribe(filter, handler);

        const message: EnhancedMessage = {
            type: 'TEST',
            sender: {
                id: 'sender1',
                role: 'test',
                capabilities: [],
                state: {}
            },
            context: {
                priority: 'high' as Priority
            },
            metadata: {}
        };

        await bus.publish(message);
        expect(messages.length).toBe(1);
        expect(messages[0]).toEqual(message);
    });

    test('should filter messages by priority', async () => {
        const bus = new MessageBus();
        const messages: EnhancedMessage[] = [];

        const filter: MessageFilter = {
            priority: ['high']
        };

        bus.subscribe(filter, async (message) => {
            messages.push(message);
        });

        // High priority message should be received
        await bus.publish({
            type: 'TEST',
            sender: {
                id: 'sender1',
                role: 'test',
                capabilities: [],
                state: {}
            },
            context: {
                priority: 'high' as Priority
            },
            metadata: {}
        });

        // Low priority message should be filtered out
        await bus.publish({
            type: 'TEST',
            sender: {
                id: 'sender1',
                role: 'test',
                capabilities: [],
                state: {}
            },
            context: {
                priority: 'low' as Priority
            },
            metadata: {}
        });

        expect(messages.length).toBe(1);
        expect(messages[0].context.priority).toBe('high');
    });

    test('should handle request-response pattern', async () => {
        const bus = new MessageBus();
        let requestReceived = false;

        // Set up responder
        bus.subscribe({}, async (message) => {
            if (message.type === 'REQUEST' && message.correlationId) {
                requestReceived = true;
                await bus.publish({
                    type: 'RESPONSE',
                    correlationId: message.correlationId,
                    sender: {
                        id: 'responder',
                        role: 'test',
                        capabilities: [],
                        state: {}
                    },
                    context: {
                        priority: 'high' as Priority
                    },
                    metadata: {}
                });
            }
        });

        // Send request
        const response = await bus.request({
            type: 'REQUEST',
            sender: {
                id: 'requester',
                role: 'test',
                capabilities: [],
                state: {}
            },
            context: {
                priority: 'high' as Priority
            },
            metadata: {}
        });

        expect(requestReceived).toBe(true);
        expect(response.type).toBe('RESPONSE');
        expect(response.sender.id).toBe('responder');
    });

    test('should timeout on request with no response', async () => {
        const bus = new MessageBus();
        const timeout = 100; // Short timeout for testing

        await expect(async () => {
            await bus.request({
                type: 'REQUEST',
                sender: {
                    id: 'requester',
                    role: 'test',
                    capabilities: [],
                    state: {}
                },
                context: {
                    priority: 'high' as Priority
                },
                metadata: {}
            }, timeout);
        }).rejects.toThrow(`Request timed out after ${timeout}ms`);
    });

    test('should unsubscribe correctly', async () => {
        const bus = new MessageBus();
        const messages: EnhancedMessage[] = [];

        const unsubscribe = bus.subscribe({}, async (message) => {
            messages.push(message);
        });

        // First message should be received
        await bus.publish({
            type: 'TEST',
            sender: {
                id: 'sender1',
                role: 'test',
                capabilities: [],
                state: {}
            },
            context: {
                priority: 'high' as Priority
            },
            metadata: {}
        });

        unsubscribe();

        // Second message should not be received
        await bus.publish({
            type: 'TEST',
            sender: {
                id: 'sender1',
                role: 'test',
                capabilities: [],
                state: {}
            },
            context: {
                priority: 'high' as Priority
            },
            metadata: {}
        });

        expect(messages.length).toBe(1);
    });

    test('should clear all subscriptions and pending requests', async () => {
        const bus = new MessageBus();
        const messages: EnhancedMessage[] = [];

        bus.subscribe({}, async (message) => {
            messages.push(message);
        });

        // Start a request that will never be responded to
        const requestPromise = bus.request({
            type: 'REQUEST',
            sender: {
                id: 'requester',
                role: 'test',
                capabilities: [],
                state: {}
            },
            context: {
                priority: 'high' as Priority
            },
            metadata: {}
        });

        // Clear the bus before the request can complete
        bus.clear();

        // Request should be rejected
        await expect(requestPromise).rejects.toThrow('MessageBus cleared');

        // New messages should not be received
        await bus.publish({
            type: 'TEST',
            sender: {
                id: 'sender1',
                role: 'test',
                capabilities: [],
                state: {}
            },
            context: {
                priority: 'high' as Priority
            },
            metadata: {}
        });

        expect(messages.length).toBe(0);

        const stats = bus.getStats();
        expect(stats.subscriptions).toBe(0);
        expect(stats.pendingRequests).toBe(0);
    });
}); 