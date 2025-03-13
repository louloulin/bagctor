import { DeliveryTracker } from './types';
import { log } from '../../utils/logger';

export class InMemoryDeliveryTracker implements DeliveryTracker {
    private acknowledged: Set<string> = new Set();
    private tracked: Set<string> = new Set();

    track(messageId: string): void {
        this.tracked.add(messageId);
        log.debug('Message tracked', { messageId });
    }

    acknowledge(messageId: string): void {
        if (this.tracked.has(messageId)) {
            this.acknowledged.add(messageId);
            log.debug('Message acknowledged', { messageId });
        } else {
            log.warn('Attempted to acknowledge untracked message', { messageId });
        }
    }

    isAcknowledged(messageId: string): boolean {
        return this.acknowledged.has(messageId);
    }

    getUnacknowledged(): string[] {
        return Array.from(this.tracked).filter(id => !this.acknowledged.has(id));
    }

    clear(messageId: string): void {
        this.tracked.delete(messageId);
        this.acknowledged.delete(messageId);
        log.debug('Message tracking cleared', { messageId });
    }

    // Additional utility methods
    getTrackedCount(): number {
        return this.tracked.size;
    }

    getAcknowledgedCount(): number {
        return this.acknowledged.size;
    }

    clearAll(): void {
        this.tracked.clear();
        this.acknowledged.clear();
        log.debug('All message tracking cleared');
    }
} 