import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';
import { ActorSystem } from '@bactor/core';
import { MessageBusActor, MessageFilter, EnhancedMessage, MessageHandler } from '../message_bus';

describe('MessageBusActor', () => {
    let system: ActorSystem;
    let messageBus: MessageBusActor;

    beforeEach(async () => {
        system = new ActorSystem();
        const context = await system.spawn({
            actorClass: MessageBusActor
        });
        messageBus = system.getActor(context.id) as MessageBusActor;
        await messageBus.init();

        // Add a test request handler
        await messageBus.subscribe({ type: 'TEST' }, async (message: EnhancedMessage) => {
            return {
                type: 'RESPONSE',
                payload: message.payload,
                correlationId: message.correlationId
            };
        });
    });

    afterEach(async () => {
        await system.stop();
    });

    it('should handle subscribe and unsubscribe', async () => {
        const filter: MessageFilter = {
            priority: ['high'],
            roles: ['test']
        };

        const handler = jest.fn<MessageHandler>().mockImplementation(async () => { });
        const unsubscribe = await messageBus.subscribe(filter, handler);

        // Publish a matching message
        const message: EnhancedMessage = {
            type: 'TEST',
            context: {
                priority: 'high'
            },
            sender: {
                id: '1',
                role: 'test'
            }
        };

        await messageBus.publish(message);
        await new Promise(resolve => setTimeout(resolve, 100)); // Wait for message processing
        expect(handler).toHaveBeenCalledWith(message);

        // Unsubscribe and verify no more messages are received
        unsubscribe();
        await messageBus.publish(message);
        await new Promise(resolve => setTimeout(resolve, 100));
        expect(handler).toHaveBeenCalledTimes(1);
    });

    it('should handle request-response pattern', async () => {
        const request: EnhancedMessage = {
            type: 'TEST',
            payload: {
                data: 'test'
            },
            context: {
                priority: 'high'
            },
            sender: {
                id: '1',
                role: 'test'
            }
        };

        const response = await messageBus.request(request);
        expect(response).toMatchObject({
            type: 'RESPONSE',
            payload: {
                data: 'test'
            }
        });
    });

    it('should timeout on request with no response', async () => {
        const request: EnhancedMessage = {
            type: 'TIMEOUT_TEST',
            payload: {
                data: 'test'
            }
        };

        await expect(messageBus.request(request, 100)).rejects.toThrow('Request timed out');
    });

    it('should clear all subscriptions and pending requests', async () => {
        const filter: MessageFilter = {
            priority: ['high']
        };

        const handler = jest.fn<MessageHandler>().mockImplementation(async () => { });
        await messageBus.subscribe(filter, handler);

        messageBus.clear();

        const message: EnhancedMessage = {
            type: 'TEST',
            context: {
                priority: 'high'
            }
        };

        await messageBus.publish(message);
        await new Promise(resolve => setTimeout(resolve, 100));
        expect(handler).not.toHaveBeenCalled();
    });

    it('should handle publish messages', async () => {
        const filter: MessageFilter = {
            priority: ['high']
        };

        const handler = jest.fn<MessageHandler>().mockImplementation(async () => { });
        await messageBus.subscribe(filter, handler);

        const message: EnhancedMessage = {
            type: 'TEST_PUBLISH',
            context: {
                priority: 'high'
            }
        };

        await messageBus.publish(message);
        await new Promise(resolve => setTimeout(resolve, 100));
        expect(handler).toHaveBeenCalledWith(message);
    });

    it('should handle multiple concurrent requests', async () => {
        const requests = [
            {
                type: 'TEST',
                payload: { data: 'test-1' }
            },
            {
                type: 'TEST',
                payload: { data: 'test-2' }
            },
            {
                type: 'TEST',
                payload: { data: 'test-3' }
            }
        ] as EnhancedMessage[];

        const responses = await Promise.all(
            requests.map(req => messageBus.request(req))
        );

        responses.forEach((res, i) => {
            expect(res).toMatchObject({
                type: 'RESPONSE',
                payload: {
                    data: requests[i].payload.data
                }
            });
        });
    });

    it('should filter messages based on priority', async () => {
        const filter: MessageFilter = {
            priority: ['high']
        };

        const handler = jest.fn<MessageHandler>().mockImplementation(async () => { });
        await messageBus.subscribe(filter, handler);

        const highPriorityMessage: EnhancedMessage = {
            type: 'TEST',
            context: {
                priority: 'high'
            }
        };

        const lowPriorityMessage: EnhancedMessage = {
            type: 'TEST',
            context: {
                priority: 'low'
            }
        };

        await messageBus.publish(highPriorityMessage);
        await messageBus.publish(lowPriorityMessage);
        await new Promise(resolve => setTimeout(resolve, 100));

        expect(handler).toHaveBeenCalledTimes(1);
        expect(handler).toHaveBeenCalledWith(highPriorityMessage);
    });

    it('should filter messages based on roles', async () => {
        const filter: MessageFilter = {
            roles: ['developer']
        };

        const handler = jest.fn<MessageHandler>().mockImplementation(async () => { });
        await messageBus.subscribe(filter, handler);

        const devMessage: EnhancedMessage = {
            type: 'TEST',
            sender: {
                id: '1',
                role: 'developer'
            }
        };

        const adminMessage: EnhancedMessage = {
            type: 'TEST',
            sender: {
                id: '2',
                role: 'admin'
            }
        };

        await messageBus.publish(devMessage);
        await messageBus.publish(adminMessage);
        await new Promise(resolve => setTimeout(resolve, 100));

        expect(handler).toHaveBeenCalledTimes(1);
        expect(handler).toHaveBeenCalledWith(devMessage);
    });

    it('should handle unsubscribe correctly', async () => {
        const filter: MessageFilter = {
            priority: ['high']
        };

        const handler = jest.fn<MessageHandler>().mockImplementation(async () => { });
        const unsubscribe = await messageBus.subscribe(filter, handler);

        const message: EnhancedMessage = {
            type: 'TEST',
            context: {
                priority: 'high'
            }
        };

        await messageBus.publish(message);
        await new Promise(resolve => setTimeout(resolve, 100));
        expect(handler).toHaveBeenCalledTimes(1);

        unsubscribe();

        await messageBus.publish(message);
        await new Promise(resolve => setTimeout(resolve, 100));
        expect(handler).toHaveBeenCalledTimes(1);
    });

    it('should handle multiple subscribers', async () => {
        const filter: MessageFilter = {
            priority: ['high']
        };

        const handler1 = jest.fn<MessageHandler>().mockImplementation(async () => { });
        const handler2 = jest.fn<MessageHandler>().mockImplementation(async () => { });

        await messageBus.subscribe(filter, handler1);
        await messageBus.subscribe(filter, handler2);

        const message: EnhancedMessage = {
            type: 'TEST',
            context: {
                priority: 'high'
            }
        };

        await messageBus.publish(message);
        await new Promise(resolve => setTimeout(resolve, 100));

        expect(handler1).toHaveBeenCalledWith(message);
        expect(handler2).toHaveBeenCalledWith(message);
    });

    it('should handle errors in subscriber handlers', async () => {
        const filter: MessageFilter = {
            priority: ['high']
        };

        const errorHandler = jest.fn<MessageHandler>().mockImplementation(async () => {
            throw new Error('Handler error');
        });
        await messageBus.subscribe(filter, errorHandler);

        const message: EnhancedMessage = {
            type: 'TEST',
            context: {
                priority: 'high'
            }
        };

        // Should not throw
        await messageBus.publish(message);
        await new Promise(resolve => setTimeout(resolve, 100));

        expect(errorHandler).toHaveBeenCalledWith(message);
    });
}); 