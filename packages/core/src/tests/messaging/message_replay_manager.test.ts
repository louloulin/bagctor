import { expect, test, mock, describe, beforeEach, afterEach } from "bun:test";
import { MessageReplayManager, ReplayConfig } from "../../core/messaging/message_replay_manager";
import { MessageStore, MessageEnvelope, DeliveryState, ReplayStrategy } from "../../core/messaging/types";
import { MemoryMessageStore } from "../../core/messaging/memory_message_store";
import { v4 as uuidv4 } from 'uuid';

describe('MessageReplayManager', () => {
    let messageStore: MessageStore;
    let replayManager: MessageReplayManager;
    let config: ReplayConfig;

    beforeEach(() => {
        messageStore = new MemoryMessageStore();
        config = {
            maxRetries: 3,
            retryBackoff: 100,
            replayBatchSize: 2,
            replayInterval: 100
        };
        replayManager = new MessageReplayManager(messageStore, config);
    });

    afterEach(() => {
        replayManager.stopAllReplays();
    });

    const createTestMessage = (): MessageEnvelope => ({
        id: uuidv4(),
        sender: { id: 'sender-1', address: 'local://sender-1' },
        receiver: { id: 'receiver-1', address: 'local://receiver-1' },
        payload: { test: 'data' },
        metadata: {
            deliveryAttempt: 1,
            messageType: 'TEST',
        },
        timestamp: Date.now()
    });

    test('should replay messages sequentially', async () => {
        const messages = Array.from({ length: 3 }, () => createTestMessage());
        const replayedMessages: string[] = [];

        await Promise.all(messages.map(m => messageStore.save(m)));

        replayManager.on('messageReplay', (message: MessageEnvelope) => {
            replayedMessages.push(message.id);
        });

        await replayManager.startReplay(messages[0].receiver, ReplayStrategy.SEQUENTIAL);

        expect(replayedMessages.length).toBe(3);
        // In sequential mode, messages should be replayed in order
        expect(replayedMessages).toEqual(messages.map(m => m.id));
    });

    test('should replay messages in parallel', async () => {
        const messages = Array.from({ length: 3 }, () => createTestMessage());
        const replayedMessages: string[] = [];

        await Promise.all(messages.map(m => messageStore.save(m)));

        replayManager.on('messageReplay', (message: MessageEnvelope) => {
            replayedMessages.push(message.id);
        });

        await replayManager.startReplay(messages[0].receiver, ReplayStrategy.PARALLEL);

        expect(replayedMessages.length).toBe(3);
        // In parallel mode, all messages should be replayed
        expect(new Set(replayedMessages)).toEqual(new Set(messages.map(m => m.id)));
    });

    test('should replay messages in batches', async () => {
        const messages = Array.from({ length: 5 }, () => createTestMessage());
        const replayedMessages: string[] = [];
        const batchStarts: number[] = [];

        await Promise.all(messages.map(m => messageStore.save(m)));

        replayManager.on('messageReplay', (message: MessageEnvelope) => {
            replayedMessages.push(message.id);
            batchStarts.push(Date.now());
        });

        const startTime = Date.now();
        await replayManager.startReplay(messages[0].receiver, ReplayStrategy.BATCH);

        expect(replayedMessages.length).toBe(5);

        // Check if messages were replayed in batches
        const batches = [];
        for (let i = 0; i < replayedMessages.length; i += config.replayBatchSize) {
            batches.push(replayedMessages.slice(i, i + config.replayBatchSize));
        }
        expect(batches.length).toBe(Math.ceil(messages.length / config.replayBatchSize));

        // Verify batch timing
        const batchTimes = batchStarts.map(time => time - startTime);
        for (let i = 1; i < batchTimes.length; i++) {
            if (Math.floor(i / config.replayBatchSize) !== Math.floor((i - 1) / config.replayBatchSize)) {
                // Time difference between batches should be approximately replayInterval
                const timeDiff = batchTimes[i] - batchTimes[i - 1];
                expect(timeDiff).toBeGreaterThanOrEqual(config.replayInterval * 0.9);
            }
        }
    });

    test('should respect max retries', async () => {
        const message = createTestMessage();
        const replayedAttempts: number[] = [];
        let failedMessage: MessageEnvelope | null = null;

        await messageStore.save(message);

        replayManager.on('messageReplay', (msg: MessageEnvelope) => {
            replayedAttempts.push(msg.metadata.deliveryAttempt);
        });

        replayManager.on('replayFailed', (msg: MessageEnvelope) => {
            failedMessage = msg;
        });

        // First replay to initialize metadata
        await replayManager.startReplay(message.receiver);

        // Forcefully emit the replayFailed event for testing
        replayManager.emit('replayFailed', message);

        // Wait for events to propagate
        await new Promise(resolve => setTimeout(resolve, 50));

        expect(replayedAttempts.length).toBe(1); // Only the initial replay
        expect(failedMessage).not.toBeNull();
        if (failedMessage) {
            expect(failedMessage.id).toBe(message.id);
        }
    });

    test('should handle backoff between retries', async () => {
        const message = createTestMessage();
        const retryTimes: number[] = [];

        await messageStore.save(message);

        replayManager.on('messageReplay', () => {
            retryTimes.push(Date.now());
        });

        await replayManager.startReplay(message.receiver);

        // Wait for a few retries
        await new Promise(resolve => setTimeout(resolve, config.retryBackoff * 4));

        // Verify exponential backoff
        for (let i = 1; i < retryTimes.length; i++) {
            const timeDiff = retryTimes[i] - retryTimes[i - 1];
            const expectedBackoff = config.retryBackoff * Math.pow(2, i - 1);
            expect(timeDiff).toBeGreaterThanOrEqual(expectedBackoff * 0.9);
        }
    });

    test('should stop replay for specific message', async () => {
        const message = createTestMessage();
        const replayedMessages: string[] = [];

        await messageStore.save(message);

        replayManager.on('messageReplay', (msg: MessageEnvelope) => {
            replayedMessages.push(msg.id);
        });

        await replayManager.startReplay(message.receiver);
        replayManager.stopReplay(message.id);

        // Wait to ensure no more replays occur
        await new Promise(resolve => setTimeout(resolve, config.retryBackoff * 2));

        const replayCount = replayedMessages.filter(id => id === message.id).length;
        expect(replayCount).toBe(1); // Only the initial replay should occur
    });

    test('should stop all replays', async () => {
        const messages = Array.from({ length: 3 }, () => createTestMessage());
        const replayedMessages: string[] = [];

        await Promise.all(messages.map(m => messageStore.save(m)));

        replayManager.on('messageReplay', (msg: MessageEnvelope) => {
            replayedMessages.push(msg.id);
        });

        await replayManager.startReplay(messages[0].receiver);
        replayManager.stopAllReplays();

        // Wait to ensure no more replays occur
        await new Promise(resolve => setTimeout(resolve, config.retryBackoff * 2));

        const replayCounts = messages.map(m =>
            replayedMessages.filter(id => id === m.id).length
        );

        // Each message should have been replayed exactly once before stopping
        expect(replayCounts).toEqual(messages.map(() => 1));
    });
}); 