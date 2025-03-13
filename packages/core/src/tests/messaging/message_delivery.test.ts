import { expect, test, mock, describe, beforeEach } from "bun:test";
import { MemoryMessageStore } from "../../core/messaging/memory_message_store";
import { InMemoryDeliveryTracker } from "../../core/messaging/delivery_tracker";
import { MessageEnvelope, DeliveryState } from "../../core/messaging/types";
import { v4 as uuidv4 } from 'uuid';

describe('Message Delivery System', () => {
    let messageStore: MemoryMessageStore;
    let deliveryTracker: InMemoryDeliveryTracker;

    beforeEach(() => {
        messageStore = new MemoryMessageStore();
        deliveryTracker = new InMemoryDeliveryTracker();
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
        deliveryTracker.track(message.id);

        expect(deliveryTracker.isAcknowledged(message.id)).toBe(false);

        deliveryTracker.acknowledge(message.id);
        await messageStore.markAsAcknowledged(message.id);

        expect(deliveryTracker.isAcknowledged(message.id)).toBe(true);
        const status = await messageStore.getMessageStatus(message.id);
        expect(status).toBe(DeliveryState.ACKNOWLEDGED);
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

        deliveryTracker.track(message1.id);
        deliveryTracker.track(message2.id);
        deliveryTracker.track(message3.id);

        deliveryTracker.acknowledge(message2.id);
        await messageStore.markAsAcknowledged(message2.id);

        const unacknowledged = await messageStore.getUnacknowledged(message1.receiver);
        expect(unacknowledged.length).toBe(2);
        expect(unacknowledged.map(m => m.id)).toContain(message1.id);
        expect(unacknowledged.map(m => m.id)).toContain(message3.id);
    });

    test('should clear message tracking', () => {
        const message = createTestMessage();
        deliveryTracker.track(message.id);
        deliveryTracker.acknowledge(message.id);

        expect(deliveryTracker.getTrackedCount()).toBe(1);
        expect(deliveryTracker.getAcknowledgedCount()).toBe(1);

        deliveryTracker.clear(message.id);

        expect(deliveryTracker.getTrackedCount()).toBe(0);
        expect(deliveryTracker.getAcknowledgedCount()).toBe(0);
    });

    test('should handle message deletion', async () => {
        const message = createTestMessage();
        await messageStore.save(message);

        const stored = await messageStore.get(message.id);
        expect(stored).toBeDefined();

        await messageStore.delete(message.id);

        const deleted = await messageStore.get(message.id);
        expect(deleted).toBeNull();
    });

    test('should handle bulk operations', async () => {
        const messages = Array.from({ length: 5 }, () => createTestMessage());

        await Promise.all(messages.map(m => messageStore.save(m)));
        messages.forEach(m => deliveryTracker.track(m.id));

        expect(deliveryTracker.getTrackedCount()).toBe(5);

        const unacknowledged = deliveryTracker.getUnacknowledged();
        expect(unacknowledged.length).toBe(5);

        deliveryTracker.clearAll();
        expect(deliveryTracker.getTrackedCount()).toBe(0);
    });
}); 