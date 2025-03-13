import { MessageEnvelope, MessageStore, DeliveryState } from './types';
import { PID } from '../types';
import { log } from '../../utils/logger';

export class MemoryMessageStore implements MessageStore {
    private messages: Map<string, MessageEnvelope> = new Map();
    private deliveryStatus: Map<string, DeliveryState> = new Map();

    async save(message: MessageEnvelope): Promise<void> {
        this.messages.set(message.id, message);
        this.deliveryStatus.set(message.id, DeliveryState.PENDING);
        log.debug('Message saved to store', { messageId: message.id });
    }

    async get(messageId: string): Promise<MessageEnvelope | null> {
        const message = this.messages.get(messageId);
        return message || null;
    }

    async delete(messageId: string): Promise<void> {
        this.messages.delete(messageId);
        this.deliveryStatus.delete(messageId);
        log.debug('Message deleted from store', { messageId });
    }

    async getUnacknowledged(pid: PID): Promise<MessageEnvelope[]> {
        const unacknowledged = Array.from(this.messages.values()).filter(message => {
            const status = this.deliveryStatus.get(message.id);
            return message.receiver.id === pid.id &&
                status !== DeliveryState.ACKNOWLEDGED;
        });

        log.debug('Retrieved unacknowledged messages', {
            pid: pid.id,
            count: unacknowledged.length
        });

        return unacknowledged;
    }

    async markAsAcknowledged(messageId: string): Promise<void> {
        if (this.deliveryStatus.has(messageId)) {
            this.deliveryStatus.set(messageId, DeliveryState.ACKNOWLEDGED);
            log.debug('Message marked as acknowledged', { messageId });
        }
    }

    async markAsDelivered(messageId: string): Promise<void> {
        if (this.deliveryStatus.has(messageId)) {
            this.deliveryStatus.set(messageId, DeliveryState.DELIVERED);
            log.debug('Message marked as delivered', { messageId });
        }
    }

    // Additional utility methods
    async getMessageStatus(messageId: string): Promise<DeliveryState | null> {
        return this.deliveryStatus.get(messageId) || null;
    }

    async clear(): Promise<void> {
        this.messages.clear();
        this.deliveryStatus.clear();
        log.debug('Message store cleared');
    }
} 