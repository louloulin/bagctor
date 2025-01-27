import { log } from '@bactor/core';
import {
    EnhancedMessage,
    MessageFilter,
    MessageHandler,
    MessageBus as IMessageBus
} from '../types/message';

interface Subscription {
    id: string;
    filter: MessageFilter;
    handler: MessageHandler;
}

interface PendingRequest {
    resolve: (message: EnhancedMessage) => void;
    reject: (error: Error) => void;
    timeout: ReturnType<typeof setTimeout>;
}

export class MessageBus implements IMessageBus {
    private subscriptions: Map<string, Subscription>;
    private pendingRequests: Map<string, PendingRequest>;

    constructor() {
        this.subscriptions = new Map();
        this.pendingRequests = new Map();
    }

    subscribe(filter: MessageFilter, handler: MessageHandler): () => void {
        const id = `sub_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        this.subscriptions.set(id, { id, filter, handler });

        log.debug(`New subscription registered: ${id}`, { filter });

        // Return unsubscribe function
        return () => {
            this.subscriptions.delete(id);
            log.debug(`Subscription removed: ${id}`);
        };
    }

    async publish(message: EnhancedMessage): Promise<void> {
        log.debug(`Publishing message`, {
            type: message.type,
            sender: message.sender.id,
            receiver: message.receiver?.id
        });

        const matchingSubscriptions = this.findMatchingSubscriptions(message);

        // Handle pending requests if this is a response message
        if (message.correlationId && this.pendingRequests.has(message.correlationId)) {
            const request = this.pendingRequests.get(message.correlationId)!;
            clearTimeout(request.timeout);
            this.pendingRequests.delete(message.correlationId);
            request.resolve(message);
            return;
        }

        // Deliver to all matching subscribers
        await Promise.all(
            matchingSubscriptions.map(async subscription => {
                try {
                    await subscription.handler(message);
                } catch (error) {
                    log.error(`Error in subscription handler ${subscription.id}:`, error);
                }
            })
        );
    }

    async request(message: EnhancedMessage, timeout: number = 5000): Promise<EnhancedMessage> {
        return new Promise((resolve, reject) => {
            const correlationId = `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
            message.correlationId = correlationId;

            // Set timeout
            const timeoutId = setTimeout(() => {
                if (this.pendingRequests.has(correlationId)) {
                    this.pendingRequests.delete(correlationId);
                    reject(new Error(`Request timed out after ${timeout}ms`));
                }
            }, timeout);

            // Store the pending request
            this.pendingRequests.set(correlationId, {
                resolve,
                reject,
                timeout: timeoutId
            });

            // Publish the request
            this.publish(message).catch(error => {
                if (this.pendingRequests.has(correlationId)) {
                    this.pendingRequests.delete(correlationId);
                    clearTimeout(timeoutId);
                    reject(error);
                }
            });
        });
    }

    private findMatchingSubscriptions(message: EnhancedMessage): Subscription[] {
        return Array.from(this.subscriptions.values()).filter(subscription => {
            const filter = subscription.filter;

            // Check priority
            if (filter.priority && !filter.priority.includes(message.context.priority)) {
                return false;
            }

            // Check roles
            if (filter.roles && message.receiver &&
                !filter.roles.includes(message.receiver.role)) {
                return false;
            }

            // Check capabilities
            if (filter.capabilities && message.receiver) {
                const hasAllCapabilities = filter.capabilities.every(
                    cap => message.receiver!.capabilities.includes(cap)
                );
                if (!hasAllCapabilities) {
                    return false;
                }
            }

            // Check tags
            if (filter.tags && message.context.tags) {
                const hasAnyTag = filter.tags.some(
                    tag => message.context.tags!.includes(tag)
                );
                if (!hasAnyTag) {
                    return false;
                }
            }

            // Check workflow
            if (filter.workflow &&
                (!message.context.workflow ||
                    message.context.workflow.name !== filter.workflow)) {
                return false;
            }

            // Check stage
            if (filter.stage &&
                (!message.context.workflow ||
                    message.context.workflow.currentStage.name !== filter.stage)) {
                return false;
            }

            return true;
        });
    }

    // Utility methods
    getStats(): { subscriptions: number; pendingRequests: number } {
        return {
            subscriptions: this.subscriptions.size,
            pendingRequests: this.pendingRequests.size
        };
    }

    clear(): void {
        // Reject all pending requests
        for (const [correlationId, request] of this.pendingRequests.entries()) {
            clearTimeout(request.timeout);
            request.reject(new Error('MessageBus cleared'));
            this.pendingRequests.delete(correlationId);
        }

        // Clear subscriptions
        this.subscriptions.clear();

        log.debug('MessageBus cleared');
    }
} 