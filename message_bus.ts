import {
    RouterConfig,
    Message,
    RouterType,
    Actor,
    PID,
    ActorContext,
    createRouter
} from '@bactor/core';
import {
    IMessageBus,
    MessageFilter,
    MessageHandler,
    EnhancedMessage
} from '../packages/agent/src/types/message';

export class MessageBus extends Actor implements IMessageBus {
    private subscriberRouter?: PID;
    private publishRouter?: PID;
    private subscriptions: Map<string, { filter: MessageFilter, handlerId: string }>;
    private pendingRequests: Map<string, {
        resolve: (value: any) => void;
        reject: (error: any) => void;
        timeout: NodeJS.Timer;
    }>;

    constructor(context: ActorContext) {
        super(context);
        this.subscriptions = new Map();
        this.pendingRequests = new Map();
    }

    protected behaviors(): void {
        this.addBehavior('default', async (msg: Message) => {
            const busMsg = msg.payload as any;

            switch (msg.type) {
                case 'SUBSCRIBE':
                    if (busMsg.filter && busMsg.handler) {
                        const id = `sub_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
                        const handlerId = `handler_${id}`;

                        if (this.subscriberRouter) {
                            // Add handler to subscriber actors
                            await this.context.send(this.subscriberRouter, {
                                type: 'ADD_HANDLER',
                                payload: { id: handlerId, handler: busMsg.handler }
                            });

                            // Store subscription
                            this.subscriptions.set(id, {
                                filter: busMsg.filter,
                                handlerId
                            });

                            await this.context.send(msg.sender!, { type: 'SUBSCRIBED', id });
                        }
                    }
                    break;

                case 'PUBLISH':
                    if (busMsg.message && this.publishRouter && this.subscriberRouter) {
                        const message = busMsg.message as EnhancedMessage;

                        // Find matching subscriptions
                        const matchingSubscriptions = this.findMatchingSubscriptions(message);

                        // Route message to publisher actors using consistent hash
                        await this.context.send(this.publishRouter, {
                            type: 'DELIVER',
                            payload: {
                                message,
                                subscriptions: matchingSubscriptions
                            }
                        });

                        // Deliver to subscribers using broadcast
                        for (const subscription of matchingSubscriptions) {
                            await this.context.send(this.subscriberRouter, {
                                type: 'DELIVER',
                                payload: {
                                    message,
                                    handlerId: subscription.handlerId
                                }
                            });
                        }
                    }
                    break;
            }
        });
    }

    protected async init(): Promise<void> {
        if (!this.context) {
            throw new Error('ActorContext is not initialized');
        }

        if (!this.context.system) {
            throw new Error('ActorSystem is not initialized');
        }

        const subscriberConfig: RouterConfig & { routerType: RouterType } = {
            system: this.context.system,
            routerType: 'consistent-hash',
            routingConfig: {
                hashFunction: (message: Message) => message.type,
                virtualNodeCount: 100
            }
        };

        const publisherConfig: RouterConfig & { routerType: RouterType } = {
            system: this.context.system,
            routerType: 'broadcast'
        };

        // Create routers
        const subscriberRouter = createRouter('consistent-hash', subscriberConfig);
        this.subscriberRouter = await this.context.spawnChild(subscriberRouter);

        const publisherRouter = createRouter('broadcast', publisherConfig);
        this.publishRouter = await this.context.spawnChild(publisherRouter);
    }

    private findMatchingSubscriptions(message: EnhancedMessage): Array<{ filter: MessageFilter, handlerId: string }> {
        const matches: Array<{ filter: MessageFilter, handlerId: string }> = [];

        for (const [id, subscription] of this.subscriptions.entries()) {
            let isMatch = true;
            const filter = subscription.filter;

            // Check priority
            if (filter.priority && !filter.priority.includes(message.context.priority)) {
                isMatch = false;
            }

            // Check workflow
            if (filter.workflow &&
                (!message.context.workflow ||
                    message.context.workflow.name !== filter.workflow)) {
                isMatch = false;
            }

            // Check stage
            if (filter.stage &&
                (!message.context.workflow ||
                    message.context.workflow.currentStage.name !== filter.stage)) {
                isMatch = false;
            }

            // Check roles
            if (filter.roles &&
                (!message.sender.role ||
                    !filter.roles.includes(message.sender.role))) {
                isMatch = false;
            }

            // Check capabilities
            if (filter.capabilities &&
                (!message.sender.capabilities ||
                    !filter.capabilities.every((cap: string) => message.sender.capabilities.includes(cap)))) {
                isMatch = false;
            }

            // Check tags
            if (filter.tags &&
                (!message.context.tags ||
                    !filter.tags.every((tag: string) => message.context.tags!.includes(tag)))) {
                isMatch = false;
            }

            if (isMatch) {
                matches.push(subscription);
            }
        }

        return matches;
    }

    async subscribe(filter: MessageFilter, handler: MessageHandler): Promise<() => void> {
        const response = await this.context.ask(this.context.self, {
            type: 'SUBSCRIBE',
            filter,
            handler
        });

        const subscriptionId = (response as any).id;
        return () => {
            this.context.send(this.context.self, {
                type: 'UNSUBSCRIBE',
                id: subscriptionId
            });
        };
    }

    async publish(message: EnhancedMessage): Promise<void> {
        await this.context.ask(this.context.self, {
            type: 'PUBLISH',
            message
        });
    }

    async request(message: EnhancedMessage, timeout: number = 5000): Promise<EnhancedMessage> {
        const correlationId = `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

        return new Promise((resolve, reject) => {
            const timeoutId = setTimeout(() => {
                this.pendingRequests.delete(correlationId);
                reject(new Error(`Request timed out after ${timeout}ms`));
            }, timeout);

            this.pendingRequests.set(correlationId, {
                resolve,
                reject,
                timeout: timeoutId
            });

            this.context.send(this.context.self, {
                type: 'PUBLISH',
                message: {
                    ...message,
                    correlationId
                }
            });
        });
    }

    clear(): void {
        this.subscriptions.clear();
        for (const [correlationId, request] of this.pendingRequests.entries()) {
            clearTimeout(request.timeout);
            request.reject(new Error('MessageBus cleared'));
        }
        this.pendingRequests.clear();
    }

    getStats(): { subscriptions: number; pendingRequests: number } {
        return {
            subscriptions: this.subscriptions.size,
            pendingRequests: this.pendingRequests.size
        };
    }
} 