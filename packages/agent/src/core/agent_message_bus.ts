import { Actor, ActorContext, Message, PID } from '@bactor/core';
import { log } from '@bactor/core';
import {
    EnhancedMessage,
    MessageFilter,
    MessageHandler,
    MessageType,
    MessageTypes
} from '../types/message';

interface Subscription {
    id: string;
    filter: MessageFilter;
    handler: MessageHandler;
    actor: PID;
}

interface PendingRequest {
    resolve: (message: EnhancedMessage) => void;
    reject: (error: Error) => void;
    timeout: ReturnType<typeof setTimeout>;
    sender: PID;
}

export class AgentMessageBus extends Actor {
    private subscriptions: Map<string, Subscription>;
    private pendingRequests: Map<string, PendingRequest>;

    constructor(context: ActorContext) {
        super(context);
        this.subscriptions = new Map();
        this.pendingRequests = new Map();
    }

    protected behaviors(): void {
        // Handle subscription messages
        this.addBehavior('subscribe', async (message: Message) => {
            if (message.type === MessageTypes.COORDINATION_REQUEST && message.payload?.action === 'subscribe') {
                const { filter, actor } = message.payload.data;
                const subscriptionId = this.subscribe(filter, actor);
                await this.context.tell(message.sender, {
                    type: MessageTypes.COORDINATION_RESPONSE,
                    sender: this.context.self,
                    payload: {
                        action: 'subscribe',
                        data: { subscriptionId }
                    }
                });
            }
        });

        // Handle unsubscription messages
        this.addBehavior('unsubscribe', async (message: Message) => {
            if (message.type === MessageTypes.COORDINATION_REQUEST && message.payload?.action === 'unsubscribe') {
                const { subscriptionId } = message.payload.data;
                this.unsubscribe(subscriptionId);
                await this.context.tell(message.sender, {
                    type: MessageTypes.COORDINATION_RESPONSE,
                    sender: this.context.self,
                    payload: {
                        action: 'unsubscribe',
                        data: { success: true }
                    }
                });
            }
        });

        // Handle publish messages
        this.addBehavior('publish', async (message: Message) => {
            if (message.type === MessageTypes.COORDINATION_REQUEST && message.payload?.action === 'publish') {
                const enhancedMessage = message.payload.data.message as EnhancedMessage;
                await this.publish(enhancedMessage);
                await this.context.tell(message.sender, {
                    type: MessageTypes.COORDINATION_RESPONSE,
                    sender: this.context.self,
                    payload: {
                        action: 'publish',
                        data: { success: true }
                    }
                });
            }
        });

        // Handle request messages
        this.addBehavior('request', async (message: Message) => {
            if (message.type === MessageTypes.COORDINATION_REQUEST && message.payload?.action === 'request') {
                const { requestMessage, timeout } = message.payload.data;
                try {
                    const response = await this.request(requestMessage, timeout);
                    await this.context.tell(message.sender, {
                        type: MessageTypes.COORDINATION_RESPONSE,
                        sender: this.context.self,
                        payload: {
                            action: 'request',
                            data: { response }
                        }
                    });
                } catch (error) {
                    await this.context.tell(message.sender, {
                        type: MessageTypes.COORDINATION_RESPONSE,
                        sender: this.context.self,
                        payload: {
                            action: 'request',
                            error: error instanceof Error ? error : new Error(String(error))
                        }
                    });
                }
            }
        });
    }

    private subscribe(filter: MessageFilter, actor: PID): string {
        const id = `sub_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

        const subscription: Subscription = {
            id,
            filter,
            actor,
            handler: async (message: EnhancedMessage) => {
                await this.context.tell(actor, message);
            }
        };

        this.subscriptions.set(id, subscription);
        log.debug(`New subscription registered for actor ${actor.id}:`, { id, filter });

        return id;
    }

    private unsubscribe(subscriptionId: string): void {
        const subscription = this.subscriptions.get(subscriptionId);
        if (subscription) {
            this.subscriptions.delete(subscriptionId);
            log.debug(`Subscription removed for actor ${subscription.actor.id}:`, subscriptionId);
        }
    }

    private async publish(message: EnhancedMessage): Promise<void> {
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
        }

        // Deliver to all matching subscribers
        await Promise.all(
            matchingSubscriptions.map(async subscription => {
                try {
                    await subscription.handler(message);
                } catch (error) {
                    log.error(`Error delivering message to actor ${subscription.actor.id}:`, error);
                }
            })
        );
    }

    private async request(message: EnhancedMessage, timeout: number = 5000): Promise<EnhancedMessage> {
        return new Promise((resolve, reject) => {
            const correlationId = `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
            message.correlationId = correlationId;

            // Set timeout
            const timeoutId = setTimeout(() => {
                this.pendingRequests.delete(correlationId);
                reject(new Error(`Request timed out after ${timeout}ms`));
            }, timeout);

            // Store the pending request
            this.pendingRequests.set(correlationId, {
                resolve,
                reject,
                timeout: timeoutId,
                sender: message.sender
            });

            // Publish the request
            this.publish(message).catch(error => {
                this.pendingRequests.delete(correlationId);
                clearTimeout(timeoutId);
                reject(error);
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

    // Actor lifecycle methods
    protected async onStart(): Promise<void> {
        log.info('AgentMessageBus started');
    }

    protected async onStop(): Promise<void> {
        // Clear all subscriptions and pending requests
        this.subscriptions.clear();

        // Reject all pending requests
        for (const [correlationId, request] of this.pendingRequests.entries()) {
            clearTimeout(request.timeout);
            request.reject(new Error('AgentMessageBus stopped'));
        }
        this.pendingRequests.clear();

        log.info('AgentMessageBus stopped');
    }

    // Utility methods
    getStats(): { subscriptions: number; pendingRequests: number } {
        return {
            subscriptions: this.subscriptions.size,
            pendingRequests: this.pendingRequests.size
        };
    }
} 