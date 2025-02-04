import {
    Actor,
    ActorContext,
    PID,
    ActorSystem,
    log,
    Message,
} from '@bactor/core';

import {
    MessageBusActor,
    BusMessageTypes,
    MessageCommon,
    createMessage,
    BusMessage,
    MessageHandler,
    MessageResponse,
    PublishMessage,
    RequestMessage,
    SystemMessageTypes,
} from '../core/message_bus';

// Example message types
const ExampleMessageTypes = {
    BROADCAST_MESSAGE: BusMessageTypes.PUBLISH,
    SINGLE_MESSAGE: BusMessageTypes.REQUEST,
    PERFORMANCE_TEST: BusMessageTypes.PUBLISH,
} as const;

// Example message payloads
interface BroadcastPayload {
    content: string;
}

interface SinglePayload {
    content: string;
    targetId?: string;
}

interface PerformancePayload {
    iteration: number;
    data: string;
}

// Example actor that receives messages
class ReceiverActor extends Actor {
    private receivedMessages: number = 0;
    private messageHandlers: Map<string, (message: Message) => Promise<void>> = new Map();

    constructor(context: ActorContext) {
        super(context);
        log.info(`ReceiverActor created with PID: ${context.self.id}`);
    }

    protected behaviors(): void {
        // Handle broadcast messages
        this.addBehavior(BusMessageTypes.PUBLISH, async (message: Message) => {
            const payload = message.payload as BroadcastPayload;
            log.info(`[${this.context.self.id}] Received broadcast: ${payload.content}`);
        });

        // Handle single messages
        this.addBehavior(BusMessageTypes.REQUEST, async (message: Message) => {
            const payload = message.payload as SinglePayload;
            log.info(`[${this.context.self.id}] Received single message: ${payload.content}`);
        });

        // Handle performance test messages
        this.addBehavior(BusMessageTypes.PUBLISH, async (message: Message) => {
            const payload = message.payload as PerformancePayload;
            this.receivedMessages++;
            if (this.receivedMessages % 1000 === 0) {
                log.info(`[${this.context.self.id}] Processed ${this.receivedMessages} messages`);
            }
        });
    }

    public getReceivedMessages(): number {
        return this.receivedMessages;
    }
}

// Example demonstrating message bus usage
async function runMessageBusDemo() {
    try {
        log.info('Starting message bus demo...');

        // Create actor system with local address
        const system = new ActorSystem('localhost:50051');
        log.info('Actor system created');

        await system.start();
        log.info('Actor system started');

        // Create message bus actor
        const messageBusActor = await system.spawn({ actorClass: MessageBusActor });
        log.info('Message bus actor created');

        // Create multiple receiver actors
        const receiver1 = await system.spawn({ actorClass: ReceiverActor });
        const receiver2 = await system.spawn({ actorClass: ReceiverActor });
        const receiver3 = await system.spawn({ actorClass: ReceiverActor });
        log.info('Receiver actors created');

        // Subscribe receivers to broadcast messages
        await system.send(messageBusActor, createMessage(BusMessageTypes.SUBSCRIBE, {
            filter: { type: BusMessageTypes.PUBLISH },
            handler: async (message: BusMessage) => {
                await Promise.all([
                    system.send(receiver1, message),
                    system.send(receiver2, message),
                    system.send(receiver3, message),
                ]);
                return { success: true };
            }
        }));
        log.info('Receivers subscribed to broadcast messages');

        // Example 1: Broadcast message
        log.info('=== Broadcasting message to all receivers ===');
        const broadcastMessage = createMessage<PublishMessage>(BusMessageTypes.PUBLISH, {
            type: BusMessageTypes.PUBLISH,
            payload: {
                content: 'Hello everyone!',
            }
        } as any);
        await system.send(messageBusActor, broadcastMessage);
        log.info('Broadcast message sent');

        // Example 2: Single message to specific receiver
        log.info('\n=== Sending single message to receiver-2 ===');
        const singleMessage = createMessage<RequestMessage>(BusMessageTypes.REQUEST, {
            request: {
                type: BusMessageTypes.REQUEST,
                payload: {
                    content: 'Hello receiver 2!',
                    targetId: receiver2.id,
                }
            } as any,
            timeout: 5000,
        });
        await system.send(receiver2, singleMessage);
        log.info('Single message sent');

        // Example 3: Performance test
        log.info('\n=== Starting performance test ===');
        const numMessages = 10000;
        const startTime = Date.now();

        // Create performance test messages
        const performanceMessages = Array.from({ length: numMessages }, (_, i) =>
            createMessage<PublishMessage>(BusMessageTypes.PUBLISH, {
                type: BusMessageTypes.PUBLISH,
                payload: {
                    iteration: i,
                    data: `Test data ${i}`,
                }
            } as any)
        );
        log.info('Performance test messages created');

        // Send messages to receiver1 for performance testing
        log.info(`Sending ${numMessages} messages to receiver-1...`);
        await Promise.all(performanceMessages.map(msg => system.send(receiver1, msg)));
        log.info('Performance test messages sent');

        const endTime = Date.now();
        const duration = (endTime - startTime) / 1000; // Convert to seconds
        const messagesPerSecond = numMessages / duration;

        log.info(`Performance Test Results:`);
        log.info(`- Total messages: ${numMessages}`);
        log.info(`- Duration: ${duration.toFixed(2)} seconds`);
        log.info(`- Messages per second: ${messagesPerSecond.toFixed(2)}`);
        log.info(`- Received messages: ${(await system.getActor(receiver1.id) as ReceiverActor).getReceivedMessages()}`);

        // Stop all actors
        log.info('Stopping actors...');
        await Promise.all([
            system.stop(messageBusActor),
            system.stop(receiver1),
            system.stop(receiver2),
            system.stop(receiver3)
        ]);
        await system.stop();
        log.info('Demo completed successfully');
    } catch (error) {
        log.error('Error in message bus demo:', error);
        throw error;
    }
}

// Run the demo
if (require.main === module) {
    runMessageBusDemo().catch(error => {
        log.error('Demo failed:', error);
        process.exit(1);
    });
}

export { runMessageBusDemo, ReceiverActor, ExampleMessageTypes }; 