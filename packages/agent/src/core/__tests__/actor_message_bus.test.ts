import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { ActorSystem, PID, Message, Actor } from '@bactor/core';
import { MessageBusProxy } from '../message_bus_proxy';
import { EnhancedMessage, MessageFilter, Priority } from '../../types/message';

class TestActor extends Actor {
    protected behaviors(): void {
        this.addBehavior('default', async (msg: Message) => {
            console.log('[TestActor] Received message:', {
                type: msg.type,
                payload: msg.payload,
                sender: msg.sender
            });

            if (msg.type === 'SUBSCRIBE') {
                console.log('[TestActor] Handling SUBSCRIBE message:', {
                    correlationId: msg.payload.correlationId,
                    filter: msg.payload.filter
                });

                await this.send(msg.sender!, {
                    type: 'RESPONSE',
                    payload: {
                        correlationId: msg.payload.correlationId,
                        response: { subscriptionId: '123' }
                    }
                });
                console.log('[TestActor] SUBSCRIBE response sent');
            } else if (msg.type === 'REQUEST') {
                console.log('[TestActor] Handling REQUEST message:', {
                    correlationId: msg.payload.correlationId,
                    messageType: msg.payload.message.type,
                    payload: msg.payload.message
                });

                if (msg.payload.message.type === 'INVALID_RESPONSE') {
                    console.log('[TestActor] Sending invalid response format');
                    await this.send(msg.sender!, {
                        type: 'RESPONSE',
                        payload: {
                            correlationId: msg.payload.correlationId,
                            response: { invalid: true }
                        }
                    });
                    console.log('[TestActor] Invalid response sent');
                } else if (msg.payload.message.type === 'TIMEOUT_TEST') {
                    console.log('[TestActor] Simulating timeout - no response will be sent');
                    // Do nothing to trigger timeout
                } else {
                    console.log('[TestActor] Preparing normal response');
                    const response: EnhancedMessage = {
                        type: 'RESPONSE',
                        payload: msg.payload.message.payload,
                        context: {
                            priority: 'high',
                            workflow: {
                                id: '1',
                                name: 'test',
                                currentStage: {
                                    id: '1',
                                    name: 'test',
                                    order: 1,
                                    roles: [],
                                    requirements: []
                                },
                                history: [],
                                metadata: {}
                            }
                        },
                        metadata: {},
                        sender: {
                            id: '1',
                            role: 'test',
                            capabilities: [],
                            state: {}
                        }
                    };

                    console.log('[TestActor] Sending normal response:', {
                        correlationId: msg.payload.correlationId,
                        response
                    });

                    await this.send(msg.sender!, {
                        type: 'RESPONSE',
                        payload: {
                            correlationId: msg.payload.correlationId,
                            response: response
                        }
                    });
                    console.log('[TestActor] Normal response sent');
                }
            } else if (msg.type === 'PUBLISH') {
                console.log('[TestActor] Handling PUBLISH message:', {
                    correlationId: msg.payload.correlationId,
                    message: msg.payload.message
                });

                await this.send(msg.sender!, {
                    type: 'RESPONSE',
                    payload: {
                        correlationId: msg.payload.correlationId,
                        response: { success: true }
                    }
                });
                console.log('[TestActor] PUBLISH response sent');
            }
        });
    }
}

describe('MessageBusProxy', () => {
    let system: ActorSystem;
    let messageBus: MessageBusProxy;
    let requestReceived = false;

    beforeEach(async () => {
        system = new ActorSystem();
        await system.start();
        const pid = await system.spawn({
            actorClass: TestActor
        });
        messageBus = new MessageBusProxy(pid, system);
    });

    afterEach(async () => {
        await system.stop();
        requestReceived = false;
    });

    test('should handle subscribe and unsubscribe', async () => {
        const filter: MessageFilter = {
            priority: ['high'],
            roles: ['test']
        };
        const handler = async () => { };
        const response = await messageBus.subscribe(filter, handler);
        expect(response.subscriptionId).toBe('123');
    });

    test('should handle request-response pattern', async () => {
        const message: EnhancedMessage = {
            type: 'TEST',
            payload: { data: 'test' },
            context: {
                priority: 'high',
                workflow: {
                    id: '1',
                    name: 'test',
                    currentStage: {
                        id: '1',
                        name: 'test',
                        order: 1,
                        roles: [],
                        requirements: []
                    },
                    history: [],
                    metadata: {}
                }
            },
            metadata: {},
            sender: {
                id: '1',
                role: 'test',
                capabilities: [],
                state: {}
            }
        };

        const response = await messageBus.request(message);
        expect(response.type).toBe('RESPONSE');
        expect(response.context).toBeDefined();
        expect(response.metadata).toBeDefined();
    });

    test('should timeout on request with no response', async () => {
        const message: EnhancedMessage = {
            type: 'TIMEOUT_TEST',
            payload: { data: 'test' },
            context: {
                priority: 'high',
                workflow: {
                    id: '1',
                    name: 'test',
                    currentStage: {
                        id: '1',
                        name: 'test',
                        order: 1,
                        roles: [],
                        requirements: []
                    },
                    history: [],
                    metadata: {}
                }
            },
            metadata: {},
            sender: {
                id: '1',
                role: 'test',
                capabilities: [],
                state: {}
            }
        };

        await expect(messageBus.request(message, 50)).rejects.toThrow('Request timed out');
    });

    test('should clear all subscriptions and pending requests', () => {
        messageBus.clear();
        const stats = messageBus.getStats();
        expect(stats.subscriptions).toBe(0);
        expect(stats.pendingRequests).toBe(0);
    });

    test('should handle publish messages', async () => {
        const message: EnhancedMessage = {
            type: 'TEST_PUBLISH',
            payload: { data: 'test' },
            context: {
                priority: 'high',
                workflow: {
                    id: '1',
                    name: 'test',
                    currentStage: {
                        id: '1',
                        name: 'test',
                        order: 1,
                        roles: [],
                        requirements: []
                    },
                    history: [],
                    metadata: {}
                }
            },
            metadata: {},
            sender: {
                id: '1',
                role: 'test',
                capabilities: [],
                state: {}
            }
        };

        await messageBus.publish(message);
    });

    test('should handle multiple concurrent requests', async () => {
        const createMessage = (id: string): EnhancedMessage => ({
            type: 'TEST',
            payload: { data: `test-${id}` },
            context: {
                priority: 'high',
                workflow: {
                    id: id,
                    name: 'test',
                    currentStage: {
                        id: '1',
                        name: 'test',
                        order: 1,
                        roles: [],
                        requirements: []
                    },
                    history: [],
                    metadata: {}
                }
            },
            metadata: {},
            sender: {
                id: '1',
                role: 'test',
                capabilities: [],
                state: {}
            }
        });

        const requests = [
            messageBus.request(createMessage('1')),
            messageBus.request(createMessage('2')),
            messageBus.request(createMessage('3'))
        ];

        const responses = await Promise.all(requests);
        expect(responses).toHaveLength(3);
        responses.forEach(response => {
            expect(response.type).toBe('RESPONSE');
            expect(response.context).toBeDefined();
            expect(response.metadata).toBeDefined();
        });
    });

    test('should filter messages based on priority', async () => {
        let receivedMessages = 0;
        const filter: MessageFilter = {
            priority: ['high'],
            roles: []
        };

        const handler = async () => {
            receivedMessages++;
        };

        await messageBus.subscribe(filter, handler);

        const highPriorityMessage: EnhancedMessage = {
            type: 'TEST',
            payload: { data: 'test' },
            context: {
                priority: 'high',
                workflow: {
                    id: '1',
                    name: 'test',
                    currentStage: {
                        id: '1',
                        name: 'test',
                        order: 1,
                        roles: [],
                        requirements: []
                    },
                    history: [],
                    metadata: {}
                }
            },
            metadata: {},
            sender: {
                id: '1',
                role: 'test',
                capabilities: [],
                state: {}
            }
        };

        await messageBus.publish(highPriorityMessage);
        expect(receivedMessages).toBe(1);
    });

    test('should reject invalid response formats', async () => {
        const message: EnhancedMessage = {
            type: 'INVALID_RESPONSE',
            payload: { data: 'test' },
            context: {
                priority: 'high',
                workflow: {
                    id: '1',
                    name: 'test',
                    currentStage: {
                        id: '1',
                        name: 'test',
                        order: 1,
                        roles: [],
                        requirements: []
                    },
                    history: [],
                    metadata: {}
                }
            },
            metadata: {},
            sender: {
                id: '1',
                role: 'test',
                capabilities: [],
                state: {}
            }
        };

        await expect(messageBus.request(message, 10000)).rejects.toThrow('Invalid response format');
    });

    test('should filter messages based on roles', async () => {
        let receivedMessages = 0;
        const filter: MessageFilter = {
            priority: ['high', 'low'],
            roles: ['developer']
        };

        const handler = async () => {
            receivedMessages++;
        };

        await messageBus.subscribe(filter, handler);

        const developerMessage: EnhancedMessage = {
            type: 'TEST',
            payload: { data: 'test' },
            context: {
                priority: 'high',
                workflow: {
                    id: '1',
                    name: 'test',
                    currentStage: {
                        id: '1',
                        name: 'test',
                        order: 1,
                        roles: [],
                        requirements: []
                    },
                    history: [],
                    metadata: {}
                }
            },
            metadata: {},
            sender: {
                id: '1',
                role: 'developer',
                capabilities: [],
                state: {}
            }
        };

        const managerMessage: EnhancedMessage = {
            type: 'TEST',
            payload: { data: 'test' },
            context: {
                priority: 'high',
                workflow: {
                    id: '2',
                    name: 'test',
                    currentStage: {
                        id: '1',
                        name: 'test',
                        order: 1,
                        roles: [],
                        requirements: []
                    },
                    history: [],
                    metadata: {}
                }
            },
            metadata: {},
            sender: {
                id: '2',
                role: 'manager',
                capabilities: [],
                state: {}
            }
        };

        await messageBus.publish(developerMessage);
        await messageBus.publish(managerMessage);
        expect(receivedMessages).toBe(1);
    });

    test('should handle unsubscribe correctly', async () => {
        let receivedMessages = 0;
        const filter: MessageFilter = {
            priority: ['high'],
            roles: []
        };

        const handler = async () => {
            receivedMessages++;
        };

        const unsubscribe = await messageBus.subscribe(filter, handler);

        const message: EnhancedMessage = {
            type: 'TEST',
            payload: { data: 'test' },
            context: {
                priority: 'high',
                workflow: {
                    id: '1',
                    name: 'test',
                    currentStage: {
                        id: '1',
                        name: 'test',
                        order: 1,
                        roles: [],
                        requirements: []
                    },
                    history: [],
                    metadata: {}
                }
            },
            metadata: {},
            sender: {
                id: '1',
                role: 'test',
                capabilities: [],
                state: {}
            }
        };

        await messageBus.publish(message);
        expect(receivedMessages).toBe(1);

        unsubscribe();
        await messageBus.publish(message);
        expect(receivedMessages).toBe(1); // Should not increase after unsubscribe
    });

    test('should handle multiple subscribers', async () => {
        let subscriber1Count = 0;
        let subscriber2Count = 0;

        const filter: MessageFilter = {
            priority: ['high'],
            roles: []
        };

        const handler1 = async () => {
            subscriber1Count++;
        };

        const handler2 = async () => {
            subscriber2Count++;
        };

        await messageBus.subscribe(filter, handler1);
        await messageBus.subscribe(filter, handler2);

        const message: EnhancedMessage = {
            type: 'TEST',
            payload: { data: 'test' },
            context: {
                priority: 'high',
                workflow: {
                    id: '1',
                    name: 'test',
                    currentStage: {
                        id: '1',
                        name: 'test',
                        order: 1,
                        roles: [],
                        requirements: []
                    },
                    history: [],
                    metadata: {}
                }
            },
            metadata: {},
            sender: {
                id: '1',
                role: 'test',
                capabilities: [],
                state: {}
            }
        };

        await messageBus.publish(message);
        expect(subscriber1Count).toBe(1);
        expect(subscriber2Count).toBe(1);
    });

    test('should handle errors in subscriber handlers', async () => {
        const filter: MessageFilter = {
            priority: ['high'],
            roles: []
        };

        const errorHandler = async () => {
            throw new Error('Handler error');
        };

        await messageBus.subscribe(filter, errorHandler);

        const message: EnhancedMessage = {
            type: 'TEST',
            payload: { data: 'test' },
            context: {
                priority: 'high',
                workflow: {
                    id: '1',
                    name: 'test',
                    currentStage: {
                        id: '1',
                        name: 'test',
                        order: 1,
                        roles: [],
                        requirements: []
                    },
                    history: [],
                    metadata: {}
                }
            },
            metadata: {},
            sender: {
                id: '1',
                role: 'test',
                capabilities: [],
                state: {}
            }
        };

        // Should not throw error even if handler fails
        await expect(messageBus.publish(message)).resolves.not.toThrow();
    });
}); 