import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { ActorSystem, Message, PID, Props, Actor } from '@bactor/core';
import { AgentMessageBus } from '../agent_message_bus';
import { MessageTypes, EnhancedMessage, Priority } from '../../types/message';

class TestActor extends Actor {
    constructor(context: any) {
        super(context);
    }

    protected behaviors(): void {
        this.addBehavior('default', async (msg: Message) => {
            if (msg.type === 'TASK' && msg.sender) {
                await this.context.send(msg.sender, {
                    type: 'RESPONSE',
                    payload: { received: true }
                });
            }
        });
    }
}

class ResponderActor extends Actor {
    constructor(context: any) {
        super(context);
    }

    protected behaviors(): void {
        this.addBehavior('default', async (msg: Message) => {
            if (msg.type === 'REQUEST' && msg.sender) {
                await this.context.send(msg.sender, {
                    type: 'RESPONSE',
                    payload: { processed: true }
                });
            }
        });
    }
}

describe('AgentMessageBus', () => {
    let system: ActorSystem;
    let messageBus: PID;

    beforeEach(async () => {
        system = new ActorSystem();
        messageBus = await system.spawn({
            actorClass: AgentMessageBus
        } as Props);
    });

    afterEach(async () => {
        await system.stop();
    });

    test('should handle subscription and message delivery', async () => {
        const receiverActor = await system.spawn({
            actorClass: TestActor
        } as Props);

        // Subscribe to high priority messages
        await system.send(messageBus, {
            type: MessageTypes.COORDINATION_REQUEST,
            payload: {
                action: 'subscribe',
                data: {
                    filter: { priority: ['high' as Priority] },
                    actor: receiverActor
                }
            }
        } as EnhancedMessage);

        // Send a high priority message
        await system.send(messageBus, {
            type: 'TASK',
            context: {
                priority: 'high' as Priority
            },
            payload: {
                task: 'test'
            },
            sender: {
                id: 'test-sender',
                role: 'test',
                capabilities: [],
                state: {}
            },
            metadata: {}
        } as EnhancedMessage);

        // Wait for response processing
        await new Promise(resolve => setTimeout(resolve, 100));
    });

    test('should handle request-response pattern', async () => {
        const responderActor = await system.spawn({
            actorClass: ResponderActor
        } as Props);

        // Subscribe responder to requests
        await system.send(messageBus, {
            type: MessageTypes.COORDINATION_REQUEST,
            payload: {
                action: 'subscribe',
                data: {
                    filter: {},
                    actor: responderActor
                }
            },
            sender: {
                id: 'test-sender',
                role: 'test',
                capabilities: [],
                state: {}
            },
            context: {
                priority: 'high' as Priority
            },
            metadata: {}
        } as EnhancedMessage);

        // Send request
        await system.send(messageBus, {
            type: MessageTypes.COORDINATION_REQUEST,
            payload: {
                action: 'request',
                data: {
                    requestMessage: {
                        type: 'REQUEST',
                        context: {
                            priority: 'high' as Priority
                        }
                    }
                }
            },
            sender: {
                id: 'test-sender',
                role: 'test',
                capabilities: [],
                state: {}
            },
            context: {
                priority: 'high' as Priority
            },
            metadata: {}
        } as EnhancedMessage);

        // Wait for response processing
        await new Promise(resolve => setTimeout(resolve, 100));
    });

    test('should handle request timeout', async () => {
        await system.send(messageBus, {
            type: MessageTypes.COORDINATION_REQUEST,
            payload: {
                action: 'request',
                data: {
                    requestMessage: {
                        type: 'REQUEST',
                        context: {
                            priority: 'high' as Priority
                        }
                    },
                    timeout: 100
                }
            },
            sender: {
                id: 'test-sender',
                role: 'test',
                capabilities: [],
                state: {}
            },
            context: {
                priority: 'high' as Priority
            },
            metadata: {}
        } as EnhancedMessage);

        // Wait for timeout
        await new Promise(resolve => setTimeout(resolve, 200));
    });

    test('should handle unsubscribe', async () => {
        const receiverActor = await system.spawn({
            actorClass: TestActor
        } as Props);

        // Subscribe
        await system.send(messageBus, {
            type: MessageTypes.COORDINATION_REQUEST,
            payload: {
                action: 'subscribe',
                data: {
                    filter: {},
                    actor: receiverActor
                }
            },
            sender: {
                id: 'test-sender',
                role: 'test',
                capabilities: [],
                state: {}
            },
            context: {
                priority: 'high' as Priority
            },
            metadata: {}
        } as EnhancedMessage);

        // Unsubscribe
        await system.send(messageBus, {
            type: MessageTypes.COORDINATION_REQUEST,
            payload: {
                action: 'unsubscribe',
                data: {
                    actor: receiverActor
                }
            },
            sender: {
                id: 'test-sender',
                role: 'test',
                capabilities: [],
                state: {}
            },
            context: {
                priority: 'high' as Priority
            },
            metadata: {}
        } as EnhancedMessage);

        // Try to send message after unsubscribe
        await system.send(messageBus, {
            type: 'TASK',
            payload: {
                task: 'test'
            },
            sender: {
                id: 'test-sender',
                role: 'test',
                capabilities: [],
                state: {}
            },
            context: {
                priority: 'high' as Priority
            },
            metadata: {}
        } as EnhancedMessage);

        // Wait for message processing
        await new Promise(resolve => setTimeout(resolve, 100));
    });
}); 