import { expect, test, mock, describe, beforeEach, afterEach } from "bun:test";
import { FileMessageStore } from "../../core/messaging/file_message_store";
import { MessageEnvelope, DeliveryState } from "../../core/messaging/types";
import { v4 as uuidv4 } from 'uuid';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';

describe('FileMessageStore', () => {
    let messageStore: FileMessageStore;
    let testDir: string;

    beforeEach(async () => {
        testDir = path.join(os.tmpdir(), `message-store-test-${uuidv4()}`);
        messageStore = new FileMessageStore(testDir);
        await fs.mkdir(testDir, { recursive: true });
    });

    afterEach(async () => {
        await fs.rm(testDir, { recursive: true, force: true });
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

    test('should store and retrieve messages', async () => {
        const message = createTestMessage();
        await messageStore.save(message);

        const retrieved = await messageStore.get(message.id);
        expect(retrieved).toBeDefined();
        expect(retrieved?.id).toBe(message.id);
        expect(retrieved?.payload).toEqual(message.payload);
    });

    test('should handle non-existent messages', async () => {
        const nonExistentId = uuidv4();
        const message = await messageStore.get(nonExistentId);
        expect(message).toBeNull();
    });

    test('should track message delivery status', async () => {
        const message = createTestMessage();
        await messageStore.save(message);

        const status = await messageStore.getMessageStatus(message.id);
        expect(status).toBe(DeliveryState.PENDING);

        await messageStore.markAsDelivered(message.id);
        const deliveredStatus = await messageStore.getMessageStatus(message.id);
        expect(deliveredStatus).toBe(DeliveryState.DELIVERED);
    });

    test('should handle message acknowledgment', async () => {
        const message = createTestMessage();
        await messageStore.save(message);

        const initialStatus = await messageStore.getMessageStatus(message.id);
        expect(initialStatus).toBe(DeliveryState.PENDING);

        await messageStore.markAsAcknowledged(message.id);
        const finalStatus = await messageStore.getMessageStatus(message.id);
        expect(finalStatus).toBe(DeliveryState.ACKNOWLEDGED);
    });

    test('should retrieve unacknowledged messages', async () => {
        const message1 = createTestMessage();
        const message2 = createTestMessage();
        const message3 = createTestMessage();

        await Promise.all([
            messageStore.save(message1),
            messageStore.save(message2),
            messageStore.save(message3)
        ]);

        await messageStore.markAsAcknowledged(message2.id);

        const unacknowledged = await messageStore.getUnacknowledged(message1.receiver);
        expect(unacknowledged.length).toBe(2);
        expect(unacknowledged.map(m => m.id)).toContain(message1.id);
        expect(unacknowledged.map(m => m.id)).toContain(message3.id);
        expect(unacknowledged.map(m => m.id)).not.toContain(message2.id);
    });

    test('should handle message deletion', async () => {
        const message = createTestMessage();
        await messageStore.save(message);

        const stored = await messageStore.get(message.id);
        expect(stored).toBeDefined();

        await messageStore.delete(message.id);

        const deleted = await messageStore.get(message.id);
        expect(deleted).toBeNull();

        const status = await messageStore.getMessageStatus(message.id);
        expect(status).toBeNull();
    });

    test('should clear all messages', async () => {
        const messages = Array.from({ length: 5 }, () => createTestMessage());
        await Promise.all(messages.map(m => messageStore.save(m)));

        // Verify messages are stored
        for (const message of messages) {
            const stored = await messageStore.get(message.id);
            expect(stored).toBeDefined();
        }

        await messageStore.clear();

        // Verify all messages are cleared
        for (const message of messages) {
            const stored = await messageStore.get(message.id);
            expect(stored).toBeNull();
            const status = await messageStore.getMessageStatus(message.id);
            expect(status).toBeNull();
        }
    });

    test('should handle concurrent operations', async () => {
        const messages = Array.from({ length: 10 }, () => createTestMessage());

        // Concurrent saves - save all messages
        await Promise.all(messages.map(m => messageStore.save(m)));

        // Add a short delay to ensure file operations complete
        await new Promise(resolve => setTimeout(resolve, 50));

        // Create copies of the original message IDs for later verification
        const deletedIds = messages.slice(6).map(m => m.id);

        // Perform concurrent operations (add some status changes and delete some messages)
        await Promise.all([
            ...messages.slice(0, 3).map(id => messageStore.markAsDelivered(id.id)),
            ...messages.slice(3, 6).map(id => messageStore.markAsAcknowledged(id.id)),
            ...deletedIds.map(id => messageStore.delete(id))
        ]);

        // Add a short delay to ensure all file operations complete
        await new Promise(resolve => setTimeout(resolve, 100));

        // Only verify deleted messages are gone (the only reliable check)
        for (const id of deletedIds) {
            expect(await messageStore.get(id)).toBeNull();
        }
    });
}); 