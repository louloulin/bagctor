import { expect, test, mock } from "bun:test";
import { Actor, ActorContext, PID, createRouter, Message, Props } from '@bactor/core';
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
import { log } from '@bactor/core/src/utils/logger';
import { describe, beforeEach, jest } from 'bun:test';

// Mock context implementation
class MockContext extends ActorContext {
    public sentMessages: { target: PID; message: any }[] = [];
    private spawnedActors: PID[] = [];

    constructor(pid: PID) {
        super(pid, {
            send: async (target: PID, message: Message) => {
                if (target && message.type === BusMessageTypes.REQUEST) {
                    const response = {
                        type: SystemMessageTypes.REQUEST_RESPONSE,
                        payload: { success: true, data: message.payload }
                    };
                    await this.send(message.sender!, response);
                }
            },
            spawn: async (props: Props) => {
                const pid = { id: 'test-routee', address: 'local' };
                this.spawnedActors.push(pid);
                return pid;
            },
            stop: async (pid: PID) => { },
            restart: async (pid: PID, error: Error) => { }
        } as any);
    }

    async send(target: PID, message: Message): Promise<void> {
        this.sentMessages.push({ target, message });
        await super.send(target, message);
    }

    async spawn(props: Props): Promise<PID> {
        const child = await super.spawn(props);
        this.spawnedActors.push(child);
        return child;
    }

    getSpawnedActorCount(): number {
        return this.spawnedActors.length;
    }
}

// Test helper functions
function createTestPID(id: string): PID {
    return { id };
}

function createTestMessage(type: typeof BusMessageTypes[keyof typeof BusMessageTypes] | typeof RouterMessageTypes[keyof typeof RouterMessageTypes], payload: any = {}) {
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
            timeout: 1000
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
    });

    test('should initialize with routers', async () => {
        expect(context.getSpawnedActorCount()).toBe(4); // 2 routers + 2 initial routees
    });

    test('should handle high priority messages correctly', async () => {
        const highPriorityHandler = mock(() => Promise.resolve(void 0));
        await messageBus.setHighPriorityHandler(highPriorityHandler);

        const message = createTaskMessage('test-task', 'high');
        const response = await messageBus.request(message);

        expect(response).toBeDefined();
        expect(response.success).toBe(true);
    });

    test('should handle normal priority messages correctly', async () => {
        const normalPriorityHandler = mock(() => Promise.resolve(void 0));
        await messageBus.setNormalPriorityHandler(normalPriorityHandler);

        const message = createTaskMessage('test-task', 'normal');
        const response = await messageBus.request(message);

        expect(response).toBeDefined();
        expect(response.success).toBe(true);
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

        await messageBus.publish(message);
        expect(context.sentMessages.length).toBeGreaterThan(0);
    });

    test('should handle request timeout', async () => {
        const message = createTaskMessage('test-task');
        message.payload.timeout = 1; // 1ms timeout

        await expect(messageBus.request(message)).rejects.toThrow('Request timed out');
    });

    test('should handle multiple subscribers', async () => {
        const handler1 = mock(() => Promise.resolve(void 0));
        const handler2 = mock(() => Promise.resolve(void 0));

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

        await messageBus.publish(message);
        expect(context.sentMessages.length).toBeGreaterThan(1);
    });
}); 