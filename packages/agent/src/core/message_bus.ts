import { log } from '@bactor/core';
import { Actor, ActorContext, Message, PID, Props } from '@bactor/core';
import {
    EnhancedMessage,
    MessageFilter,
    MessageHandler,
    MessageBus as IMessageBus,
    Priority
} from '../types/message';

interface Subscription {
    id: string;
    filter: MessageFilter;
    handler: MessageHandler;
    subscriber: PID;
}

interface BusMessage {
    type: 'SUBSCRIBE' | 'UNSUBSCRIBE' | 'PUBLISH' | 'REQUEST';
    filter?: MessageFilter;
    handler?: MessageHandler;
    message?: EnhancedMessage;
    subscriber?: PID;
    timeout?: number;
}

export class MessageBus extends Actor implements IMessageBus {
    private subscriptions: Map<string, Subscription>;
    private pendingRequests: Map<string, PID>;

    constructor(context: ActorContext) {
        super(context);
        this.subscriptions = new Map();
        this.pendingRequests = new Map();
        log.debug('MessageBus actor created');
    }

    protected behaviors(): void {
        this.addBehavior('default', async (msg: Message) => {
            const busMsg = msg.payload as BusMessage;

            switch (busMsg.type) {
                case 'SUBSCRIBE':
                    if (busMsg.filter && busMsg.subscriber) {
                        const id = `sub_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
                        this.subscriptions.set(id, {
                            id,
                            filter: busMsg.filter,
                            handler: busMsg.handler!,
                            subscriber: busMsg.subscriber
                        });
                        log.debug(`New subscription registered: ${id}`, {
                            filter: busMsg.filter,
                            subscriber: busMsg.subscriber.id,
                            totalSubscriptions: this.subscriptions.size
                        });
                        await this.context.send(msg.sender!, { type: 'SUBSCRIBED', id });
                    }
                    break;

                case 'UNSUBSCRIBE':
                    if (busMsg.subscriber) {
                        for (const [id, sub] of this.subscriptions.entries()) {
                            if (sub.subscriber.id === busMsg.subscriber.id) {
                                this.subscriptions.delete(id);
                                log.debug(`Subscription removed: ${id}`, {
                                    subscriber: busMsg.subscriber.id,
                                    remainingSubscriptions: this.subscriptions.size
                                });
                            }
                        }
                    }
                    break;

                case 'PUBLISH':
                    if (busMsg.message) {
                        const message = busMsg.message;
                        log.debug(`Publishing message`, {
                            type: message.type,
                            sender: message.sender.id,
                            receiver: message.receiver?.id,
                            correlationId: message.correlationId
                        });

                        // Find matching subscriptions
                        const matchingSubscriptions = this.findMatchingSubscriptions(message);
                        log.debug(`Found matching subscriptions`, {
                            count: matchingSubscriptions.length,
                            messageType: message.type
                        });

                        // Deliver to subscribers
                        for (const subscription of matchingSubscriptions) {
                            try {
                                await subscription.handler(message);
                            } catch (error) {
                                log.error(`Error in subscription handler ${subscription.id}:`, error);
                            }
                        }

                        // Handle pending requests
                        if (message.correlationId && this.pendingRequests.has(message.correlationId)) {
                            const requester = this.pendingRequests.get(message.correlationId)!;
                            this.pendingRequests.delete(message.correlationId);
                            await this.context.send(requester, message);
                        }
                    }
                    break;

                case 'REQUEST':
                    if (busMsg.message && busMsg.timeout) {
                        const correlationId = `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
                        const message = busMsg.message;
                        message.correlationId = correlationId;

                        // Store the request
                        this.pendingRequests.set(correlationId, msg.sender!);

                        // Set up timeout
                        setTimeout(async () => {
                            if (this.pendingRequests.has(correlationId)) {
                                const requester = this.pendingRequests.get(correlationId)!;
                                this.pendingRequests.delete(correlationId);
                                await this.context.send(requester, {
                                    type: 'ERROR',
                                    error: new Error(`Request timed out after ${busMsg.timeout}ms`)
                                });
                            }
                        }, busMsg.timeout);

                        // Publish the request
                        await this.publish(message);
                    }
                    break;
            }
        });
    }

    async subscribe(filter: MessageFilter, handler: MessageHandler): Promise<() => void> {
        const response = await this.context.ask(this.context.self, {
            type: 'SUBSCRIBE',
            filter,
            handler,
            subscriber: this.context.self
        });

        const subscriptionId = (response as any).id;
        return () => {
            this.context.send(this.context.self, {
                type: 'UNSUBSCRIBE',
                subscriber: this.context.self
            });
        };
    }

    async publish(message: EnhancedMessage): Promise<void> {
        await this.context.send(this.context.self, {
            type: 'PUBLISH',
            message
        });
    }

    async request(message: EnhancedMessage, timeout: number = 5000): Promise<EnhancedMessage> {
        const response = await this.context.ask(this.context.self, {
            type: 'REQUEST',
            message,
            timeout
        });

        if (response.type === 'ERROR') {
            throw response.error;
        }

        return response as EnhancedMessage;
    }

    private findMatchingSubscriptions(message: EnhancedMessage): Subscription[] {
        const allSubscriptions = Array.from(this.subscriptions.values());
        log.debug(`Finding matching subscriptions`, {
            totalSubscriptions: allSubscriptions.length,
            messageType: message.type,
            priority: message.context.priority
        });

        const matches = allSubscriptions.filter(subscription => {
            const filter = subscription.filter;

            // Empty filter matches everything
            if (Object.keys(filter).length === 0) {
                return true;
            }

            // Check priority
            if (filter.priority && !filter.priority.includes(message.context.priority)) {
                log.debug(`Priority mismatch for subscription ${subscription.id}`, {
                    expected: filter.priority,
                    actual: message.context.priority
                });
                return false;
            }

            // Check roles
            if (filter.roles && message.receiver &&
                !filter.roles.includes(message.receiver.role)) {
                log.debug(`Role mismatch for subscription ${subscription.id}`, {
                    expected: filter.roles,
                    actual: message.receiver.role
                });
                return false;
            }

            // Check capabilities
            if (filter.capabilities && message.receiver) {
                const hasAllCapabilities = filter.capabilities.every(
                    cap => message.receiver!.capabilities.includes(cap)
                );
                if (!hasAllCapabilities) {
                    log.debug(`Capabilities mismatch for subscription ${subscription.id}`, {
                        required: filter.capabilities,
                        actual: message.receiver.capabilities
                    });
                    return false;
                }
            }

            // Check tags
            if (filter.tags && message.context.tags) {
                const hasAnyTag = filter.tags.some(
                    tag => message.context.tags!.includes(tag)
                );
                if (!hasAnyTag) {
                    log.debug(`Tags mismatch for subscription ${subscription.id}`, {
                        expected: filter.tags,
                        actual: message.context.tags
                    });
                    return false;
                }
            }

            // Check workflow
            if (filter.workflow &&
                (!message.context.workflow ||
                    message.context.workflow.name !== filter.workflow)) {
                log.debug(`Workflow mismatch for subscription ${subscription.id}`, {
                    expected: filter.workflow,
                    actual: message.context.workflow?.name
                });
                return false;
            }

            // Check stage
            if (filter.stage &&
                (!message.context.workflow ||
                    message.context.workflow.currentStage.name !== filter.stage)) {
                log.debug(`Stage mismatch for subscription ${subscription.id}`, {
                    expected: filter.stage,
                    actual: message.context.workflow?.currentStage.name
                });
                return false;
            }

            return true;
        });

        log.debug(`Found matching subscriptions`, {
            count: matches.length,
            messageType: message.type
        });

        return matches;
    }

    getStats(): { subscriptions: number; pendingRequests: number } {
        const stats = {
            subscriptions: this.subscriptions.size,
            pendingRequests: this.pendingRequests.size
        };
        log.debug('MessageBus stats', stats);
        return stats;
    }

    clear(): void {
        log.debug('Clearing MessageBus', {
            pendingRequests: this.pendingRequests.size,
            subscriptions: this.subscriptions.size
        });

        // Clear all subscriptions and pending requests
        this.subscriptions.clear();
        this.pendingRequests.clear();

        log.debug('MessageBus cleared');
    }
} 