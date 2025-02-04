import { expect, test, mock } from "bun:test";
import { Actor, ActorContext, PID, createRouter, Message, Props, log } from '@bactor/core';
import {
    MessageBusActor,
    BusMessageTypes,
    RouterMessageTypes,
    BusMessage,
    RouterMessage,
    MessageHandler,
    PublishMessage,
    RequestMessage,
    SystemMessageTypes,
    MessageCommon,
    SystemMessageType,
    MessageType
} from '../message_bus';
import { describe, beforeEach, jest, beforeAll, afterEach } from 'bun:test';

// Mock context implementation
class MockContext extends ActorContext {
    public sentMessages: { target: PID; message: any }[] = [];
    private spawnedActors: Map<string, PID> = new Map();
    private nextActorId = 0;
    private routerActors: Map<string, PID> = new Map();
    private routeesByType: Map<string, PID[]> = new Map();

    constructor(pid: PID) {
        super(pid, {
            send: async (target: PID, message: Message) => {
                log.debug('MockContext send called', {
                    targetId: target.id,
                    messageType: message.type,
                    senderId: message.sender?.id,
                    correlationId: (message as any).correlationId,
                    isRouter: target.id.includes('router'),
                    isRoutee: target.id.includes('routee')
                });

                if (target && message.type === BusMessageTypes.REQUEST) {
                    log.debug('MockContext handling request message', {
                        targetId: target.id,
                        correlationId: (message as any).correlationId,
                        payload: message.payload,
                        isRouter: target.id.includes('router'),
                        isRoutee: target.id.includes('routee')
                    });

                    // If this is a router, forward to a routee
                    if (target.id.includes('router')) {
                        const routerType = target.id.includes('request') ? 'request' : 'subscription';
                        const routees = this.routeesByType.get(routerType) || [];

                        if (routees.length > 0) {
                            const routee = routees[0]; // For testing, just use the first routee
                            log.debug('Router forwarding request to routee', {
                                routerId: target.id,
                                routeeId: routee.id,
                                correlationId: (message as any).correlationId
                            });

                            const routeeMessage = {
                                ...message,
                                sender: message.sender // Preserve original sender
                            };
                            await this.send(routee, routeeMessage);
                            return;
                        }
                    }

                    // If this is a routee or direct request, send response
                    if (message.sender) {
                        // Simulate some processing time
                        await new Promise(resolve => setTimeout(resolve, 10));

                        const response = {
                            type: BusMessageTypes.REQUEST,
                            payload: { success: true, data: message.payload },
                            correlationId: (message as any).correlationId,
                            sender: target
                        };

                        log.debug('Sending response for request', {
                            targetId: message.sender.id,
                            correlationId: (message as any).correlationId,
                            responseType: response.type,
                            responsePayload: response.payload,
                            isRouter: target.id.includes('router'),
                            isRoutee: target.id.includes('routee')
                        });

                        await this.send(message.sender, response);
                    }
                } else if (target && message.type === RouterMessageTypes.BROADCAST) {
                    log.debug('MockContext handling broadcast message', {
                        targetId: target.id,
                        payloadType: message.payload?.message?.type,
                        correlationId: (message as any).correlationId
                    });

                    const payload = message.payload?.message;
                    if (payload?.type === 'SET_HIGH_PRIORITY_HANDLER' || payload?.type === 'SET_NORMAL_PRIORITY_HANDLER') {
                        const routerType = target.id.includes('request') ? 'request' : 'subscription';
                        const routees = this.routeesByType.get(routerType) || [];

                        log.debug('Broadcasting to routees', {
                            routeeCount: routees.length,
                            routeeIds: routees.map(r => r.id),
                            handlerType: payload.type,
                            correlationId: (message as any).correlationId
                        });

                        // Forward to all routees
                        for (const routee of routees) {
                            const routeeMessage = {
                                type: payload.type,
                                payload: payload,
                                correlationId: (message as any).correlationId,
                                sender: message.sender
                            };
                            await this.send(routee, routeeMessage);
                        }

                        // Send success response back
                        if (message.sender) {
                            const response = {
                                type: BusMessageTypes.REQUEST,
                                payload: { success: true },
                                correlationId: (message as any).correlationId,
                                sender: target
                            };

                            log.debug('Sending broadcast response', {
                                targetId: message.sender.id,
                                correlationId: (message as any).correlationId,
                                responseType: response.type
                            });

                            await this.send(message.sender, response);
                        }
                    }
                }
            },
            spawn: async (props: Props) => {
                const pid = await this.spawn(props);
                log.debug('System spawn called', { actorId: pid.id });
                return pid;
            },
            stop: async (pid: PID) => {
                log.debug('MockContext stop called', { actorId: pid.id });
                this.spawnedActors.delete(pid.id);
                this.routerActors.delete(pid.id);
                // Remove from routees if present
                for (const [type, routees] of this.routeesByType.entries()) {
                    const index = routees.findIndex(r => r.id === pid.id);
                    if (index !== -1) {
                        routees.splice(index, 1);
                        if (routees.length === 0) {
                            this.routeesByType.delete(type);
                        }
                    }
                }
            },
            restart: async (pid: PID, error: Error) => {
                log.debug('MockContext restart called', {
                    actorId: pid.id,
                    error: error.message
                });
            }
        } as any);
    }

    async send(target: PID, message: Message): Promise<void> {
        log.debug('MockContext send intercepted', {
            targetId: target.id,
            messageType: message.type,
            senderId: message.sender?.id,
            correlationId: (message as any).correlationId,
            payload: message.payload
        });
        this.sentMessages.push({ target, message });
        await super.send(target, message);
    }

    async spawn(props: Props): Promise<PID> {
        // Check if this is a router spawn
        if (props.producer && props.producer.toString().includes('Router')) {
            const routerType = props.producer.toString().includes('request') ? 'request' : 'subscription';
            log.debug('MockContext spawning router', {
                routerType,
                existingRouters: Array.from(this.routerActors.keys()),
                existingActors: Array.from(this.spawnedActors.keys())
            });

            // Return existing router if it exists
            if (this.routerActors.has(routerType)) {
                const existingRouter = this.routerActors.get(routerType)!;
                log.debug('Returning existing router', {
                    routerId: existingRouter.id,
                    routerType
                });
                return existingRouter;
            }

            // Create new router
            const id = `test-${routerType}-router`;
            const pid = { id, address: 'local' };
            this.routerActors.set(routerType, pid);
            this.spawnedActors.set(id, pid);
            log.debug('Created new router', {
                routerId: id,
                routerType,
                totalRouters: this.routerActors.size,
                totalActors: this.spawnedActors.size
            });

            // Create initial routee for this router if none exists
            const routees = this.routeesByType.get(routerType) || [];
            if (routees.length === 0) {
                const routeeId = `test-routee-${routerType}-${this.nextActorId++}`;
                const routeePid = { id: routeeId, address: 'local' };
                this.spawnedActors.set(routeeId, routeePid);
                routees.push(routeePid);
                this.routeesByType.set(routerType, routees);
                log.debug('Created initial routee for router', {
                    routerId: id,
                    routeeId: routeeId,
                    routerType,
                    totalActors: this.spawnedActors.size
                });
            } else {
                log.debug('Using existing routee for router', {
                    routerId: id,
                    existingRoutees: routees.map(r => r.id),
                    routerType
                });
            }

            return pid;
        }

        // For routees, create new ones with router type in the ID
        const routerType = props.producer?.toString().includes('RequestHandlerActor') ? 'request' : 'subscription';
        const routees = this.routeesByType.get(routerType) || [];

        // Return existing routee if available
        if (routees.length > 0) {
            const existingRoutee = routees[0];
            log.debug('Returning existing routee', {
                routeeId: existingRoutee.id,
                routerType
            });
            return existingRoutee;
        }

        // Create new routee
        const id = `test-routee-${routerType}-${this.nextActorId++}`;
        const pid = { id, address: 'local' };
        this.spawnedActors.set(id, pid);
        routees.push(pid);
        this.routeesByType.set(routerType, routees);
        log.debug('Created new routee', {
            routeeId: id,
            routerType,
            totalActors: this.spawnedActors.size
        });
        return pid;
    }

    getSpawnedActorCount(): number {
        const count = this.spawnedActors.size;
        log.debug('Getting spawned actor count', {
            count,
            actorIds: Array.from(this.spawnedActors.keys())
        });
        return count;
    }

    clearState(): void {
        log.debug('Clearing MockContext state', {
            previousActorCount: this.spawnedActors.size,
            previousMessageCount: this.sentMessages.length,
            actorIds: Array.from(this.spawnedActors.keys())
        });
        this.sentMessages = [];
        this.spawnedActors.clear();
        this.routerActors.clear();
        this.routeesByType.clear();
        this.nextActorId = 0;
    }
}

// Test helper functions
function createTestPID(id: string): PID {
    return { id };
}

function createTestMessage(type: MessageType, payload: any = {}): Message {
    return {
        type,
        payload,
        messageId: Math.random().toString(36).substring(7)
    };
}

function createTaskMessage(taskId: string, priority?: 'high' | 'normal' | 'low'): RequestMessage {
    const innerMessage: BusMessage = {
        type: BusMessageTypes.REGISTER_HANDLER,
        payload: {
            handler: async () => { },
            priority: priority || 'normal'
        }
    };

    return {
        type: BusMessageTypes.REQUEST,
        payload: {
            request: innerMessage,
            timeout: 5000 // Default timeout for tests
        },
        sender: { id: 'test-sender', address: 'local' }
    };
}

describe('MessageBusActor', () => {
    let context: MockContext;
    let messageBus: MessageBusActor;

    beforeEach(async () => {
        context = new MockContext(createTestPID('test-actor'));
        messageBus = new MessageBusActor(context);
        // Wait for initialization
        await new Promise(resolve => setTimeout(resolve, 100));
        log.debug('Test setup complete', {
            spawnedActors: Array.from(context['spawnedActors'].keys()),
            routerActors: Array.from(context['routerActors'].keys())
        });
    });

    afterEach(() => {
        log.debug('Test cleanup starting', {
            spawnedActors: Array.from(context['spawnedActors'].keys()),
            routerActors: Array.from(context['routerActors'].keys())
        });
        context.clearState();
    });

    test('should initialize with routers', async () => {
        const spawnedActors = Array.from(context['spawnedActors'].keys());
        log.debug('Checking initialization', {
            spawnedActorCount: context.getSpawnedActorCount(),
            spawnedActors,
            routerActors: Array.from(context['routerActors'].keys())
        });
        // We expect:
        // 1. Request router
        // 2. Subscription router
        // 3. Initial routee for request router
        // 4. Initial routee for subscription router
        expect(context.getSpawnedActorCount()).toBe(4);

        // Verify we have both routers
        const routerCount = Array.from(context['routerActors'].keys()).length;
        expect(routerCount).toBe(2);

        // Verify we have the correct number of routees
        const routeeCount = spawnedActors.filter(id => id.includes('routee')).length;
        expect(routeeCount).toBe(2);
    });

    test('should handle high priority messages correctly', async () => {
        const highPriorityHandler = mock(() => Promise.resolve({ success: true }));
        await messageBus.setHighPriorityHandler(highPriorityHandler);

        const message = createTaskMessage('test-task', 'high');
        message.payload.timeout = 1000; // Increase timeout

        log.debug('Sending high priority message', {
            messageType: message.type,
            timeout: message.payload.timeout
        });

        const response = await messageBus.request(message);

        log.debug('Received response for high priority message', {
            response,
            sentMessagesCount: context.sentMessages.length
        });

        expect(response).toBeDefined();
        expect(response.success).toBe(true);
        expect(context.sentMessages.length).toBeGreaterThan(0);
    });

    test('should handle normal priority messages correctly', async () => {
        const normalPriorityHandler = mock(() => Promise.resolve({ success: true }));
        await messageBus.setNormalPriorityHandler(normalPriorityHandler);

        const message = createTaskMessage('test-task', 'normal');
        message.payload.timeout = 1000; // Increase timeout

        log.debug('Sending normal priority message', {
            messageType: message.type,
            timeout: message.payload.timeout
        });

        const response = await messageBus.request(message);

        log.debug('Received response for normal priority message', {
            response,
            sentMessagesCount: context.sentMessages.length
        });

        expect(response).toBeDefined();
        expect(response.success).toBe(true);
        expect(context.sentMessages.length).toBeGreaterThan(0);
    });

    test('should handle request timeout', async () => {
        const message = createTaskMessage('test-task');
        message.payload.timeout = 100; // Short timeout

        log.debug('Sending message with short timeout', {
            messageType: message.type,
            timeout: message.payload.timeout
        });

        await expect(messageBus.request(message)).rejects.toThrow('Request timed out');
    });

    test('should handle publish/subscribe correctly', async () => {
        const handler = mock(() => Promise.resolve(void 0));
        await messageBus.subscribe(BusMessageTypes.PUBLISH, handler);

        const innerMessage: BusMessage = {
            type: BusMessageTypes.REGISTER_HANDLER,
            payload: {
                handler: async () => { },
                priority: 'normal'
            }
        };

        const message: PublishMessage = {
            type: BusMessageTypes.PUBLISH,
            payload: innerMessage,
            sender: { id: 'test-sender', address: 'local' }
        };

        log.debug('Publishing message', {
            messageType: message.type,
            sender: message.sender?.id
        });

        await messageBus.publish(message);

        log.debug('Message published', {
            sentMessagesCount: context.sentMessages.length,
            publishMessages: context.sentMessages.filter(m => m.message.type === BusMessageTypes.PUBLISH).length
        });

        expect(context.sentMessages.length).toBeGreaterThan(0);
        const publishMessages = context.sentMessages.filter(m => m.message.type === BusMessageTypes.PUBLISH);
        expect(publishMessages.length).toBeGreaterThan(0);
    });

    test('should handle multiple subscribers', async () => {
        const handler1 = mock(() => Promise.resolve(void 0));
        const handler2 = mock(() => Promise.resolve(void 0));

        log.debug('Subscribing multiple handlers');
        await messageBus.subscribe(BusMessageTypes.PUBLISH, handler1);
        await messageBus.subscribe(BusMessageTypes.PUBLISH, handler2);

        const innerMessage: BusMessage = {
            type: BusMessageTypes.REGISTER_HANDLER,
            payload: {
                handler: async () => { },
                priority: 'normal'
            }
        };

        const message: PublishMessage = {
            type: BusMessageTypes.PUBLISH,
            payload: innerMessage,
            sender: { id: 'test-sender', address: 'local' }
        };

        log.debug('Publishing message to multiple subscribers', {
            messageType: message.type,
            sender: message.sender?.id
        });

        await messageBus.publish(message);

        log.debug('Message published to multiple subscribers', {
            sentMessagesCount: context.sentMessages.length,
            subscribeMessages: context.sentMessages.filter(m => m.message.type === BusMessageTypes.SUBSCRIBE).length
        });

        expect(context.sentMessages.length).toBeGreaterThan(0);
        const subscribeMessages = context.sentMessages.filter(m => m.message.type === BusMessageTypes.SUBSCRIBE);
        expect(subscribeMessages.length).toBe(2);
    });
}); 