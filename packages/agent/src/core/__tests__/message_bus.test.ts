import { expect, test, mock } from "bun:test";
import { Actor, ActorContext, PID, createRouter, Message, Props } from '@bactor/core';
import {
    MessageBusActor,
    BusMessageTypes,
    RouterMessageTypes,
    BusMessage,
    RouterMessage,
    MessageHandler
} from '../message_bus';
import { log } from '@bactor/core/src/utils/logger';

// Mock mailbox implementation
const mockMailbox = {
    push: async () => { },
    pop: async () => undefined,
    isEmpty: () => true,
    start: () => { },
    suspend: () => { },
    resume: () => { },
    postSystemMessage: () => { },
    postUserMessage: () => { },
    registerHandlers: () => { },
    isSuspended: () => false,
    getCurrentMessage: () => undefined,
    hasMessages: async () => false,
    getQueueSizes: async () => ({ system: 0, high: 0, normal: 0, low: 0 })
};

// Mock actor class for testing
class MockActor extends Actor {
    protected behaviors(): void {
        this.addBehavior('default', async () => { });
    }
}

// Mock system implementation
const mockSystem = {
    send: async (target: PID, message: Message) => { },
    spawn: async (props: Props) => ({ id: 'child_' + Math.random().toString(36).substring(7) }),
    stop: async (pid: PID) => { },
    restart: async (pid: PID, error: Error) => { }
};

// Mock context implementation
class MockContext extends ActorContext {
    public sentMessages: { target: PID; message: any }[] = [];
    private spawnedActors: PID[] = [];

    constructor(pid: PID) {
        super(pid, mockSystem as any);
    }

    async send(target: PID, message: Message): Promise<void> {
        this.sentMessages.push({ target, message });
        await super.send(target, message);
    }

    async spawn(props: Props): Promise<PID> {
        if (!props.actorClass && !props.producer) {
            props = {
                ...props,
                actorClass: MockActor
            };
        }
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

// Tests
test("MessageBusActor should initialize routers", async () => {
    const context = new MockContext(createTestPID('test-bus'));
    const messageBus = new MessageBusActor(context);

    // Wait for initialization
    await new Promise(resolve => setTimeout(resolve, 100));

    expect(context.getSpawnedActorCount()).toBe(2); // Should have subscription and request routers
});

test("MessageBusActor should handle publish messages", async () => {
    const context = new MockContext(createTestPID('test-bus'));
    const messageBus = new MessageBusActor(context);

    // Wait for initialization
    await new Promise(resolve => setTimeout(resolve, 100));

    const handler = mock(() => Promise.resolve());
    await messageBus.subscribe('test-event', handler);

    const publishMessage = createTestMessage(BusMessageTypes.PUBLISH, {
        type: 'test-event',
        data: 'test'
    });

    await messageBus.publish(publishMessage);
    expect(handler).toHaveBeenCalled();
});

test("MessageBusActor should handle request messages", async () => {
    const context = new MockContext(createTestPID('test-bus'));
    const messageBus = new MessageBusActor(context);

    // Wait for initialization
    await new Promise(resolve => setTimeout(resolve, 100));

    const requestMessage = createTestMessage(BusMessageTypes.REQUEST, {
        request: { type: 'test-request', data: 'test' },
        timeout: 1000
    });

    const handler = mock(() => Promise.resolve());
    await messageBus.setHighPriorityHandler(handler);

    const response = await messageBus.request(requestMessage);
    expect(response).toBeDefined();
    expect(handler).toHaveBeenCalled();
});

test("MessageBusActor should handle message priorities", async () => {
    const context = new MockContext(createTestPID('test-bus'));
    const messageBus = new MessageBusActor(context);

    // Wait for initialization
    await new Promise(resolve => setTimeout(resolve, 100));

    const highPriorityHandler = mock(() => Promise.resolve());
    const normalPriorityHandler = mock(() => Promise.resolve());

    await messageBus.setHighPriorityHandler(highPriorityHandler);
    await messageBus.setNormalPriorityHandler(normalPriorityHandler);

    const highPriorityMessage = createTestMessage(BusMessageTypes.PUBLISH, {
        type: 'test-event',
        data: 'high',
        priority: 'high'
    });

    const normalPriorityMessage = createTestMessage(BusMessageTypes.PUBLISH, {
        type: 'test-event',
        data: 'normal',
        priority: 'normal'
    });

    await messageBus.publish(highPriorityMessage);
    await messageBus.publish(normalPriorityMessage);

    expect(highPriorityHandler).toHaveBeenCalledTimes(1);
    expect(normalPriorityHandler).toHaveBeenCalledTimes(1);
}); 