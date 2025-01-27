import {
    RouterConfig,
    Message,
    RouterType,
    Actor,
    PID,
    ActorContext,
    createRouter,
    IRouter
} from '@bactor/core';
import { log } from '@bactor/core';

// Trace context for tracking message lifecycle
interface TraceContext {
    traceId: string;
    parentId?: string;
    timestamp: number;
    operation: string;
    correlationId?: string;
}

// Message types
export type MessageType = 'SUBSCRIBE' | 'UNSUBSCRIBE' | 'PUBLISH' | 'REQUEST' | 'RESPONSE' | 'CLEAR';

// Message filter interface
export interface MessageFilter {
    priority?: string[];
    roles?: string[];
    type?: string;
}

// Message handler type
export type MessageHandler = (message: any) => Promise<void>;

// Enhanced message interface
export interface EnhancedMessage extends Message {
    type: string;
    payload?: any;
    context?: {
        priority?: string;
    };
    sender?: {
        id: string;
        role?: string;
    };
    correlationId?: string;
}

// Message bus interface
export interface MessageBus {
    subscribe(filter: MessageFilter, handler: MessageHandler): Promise<() => void>;
    publish(message: EnhancedMessage): Promise<void>;
    request(message: EnhancedMessage, timeout?: number): Promise<EnhancedMessage>;
    clear(): void;
}

interface RouterMessage extends Message {
    router?: IRouter;
}

class RouterActor extends Actor {
    private routees: PID[] = [];
    private router: IRouter | null = null;

    constructor(context: ActorContext) {
        super(context);
        log.debug('RouterActor created', {
            routerId: this.context.self.id
        });
    }

    public setRouter(router: IRouter): void {
        if (!router) {
            throw new Error('Router is required');
        }
        this.router = router;
        log.debug('Router set', {
            routerId: this.context.self.id,
            routerType: 'broadcast'
        });
    }

    protected behaviors(): void {
        this.addBehavior('default', async (message: RouterMessage) => {
            const traceCtx = this.createTraceContext('router.handle', message);

            log.debug('Router handling message', {
                traceId: traceCtx.traceId,
                type: message.type,
                routees: this.routees.length,
                routerId: this.context.self.id,
                sender: message.sender?.id
            });

            try {
                if (message.type === 'router.set') {
                    if (!message.router) {
                        throw new Error('Router not provided in router.set message');
                    }
                    this.setRouter(message.router);
                    return;
                }

                if (!this.router) {
                    throw new Error('Router not initialized');
                }

                if (message.type === 'router.add-routee' && message.routee) {
                    const routeeId = message.routee.id;
                    const alreadyExists = this.routees.some(r => r.id === routeeId);

                    if (!alreadyExists) {
                        this.routees.push(message.routee);
                        log.debug('Added routee', {
                            traceId: traceCtx.traceId,
                            routeeId,
                            totalRoutees: this.routees.length,
                            routerId: this.context.self.id
                        });
                    } else {
                        log.warn('Routee already exists', {
                            traceId: traceCtx.traceId,
                            routeeId,
                            totalRoutees: this.routees.length,
                            routerId: this.context.self.id
                        });
                    }
                    return;
                }

                if (message.type === 'router.remove-routee' && message.routee) {
                    const routeeId = message.routee.id;
                    const initialLength = this.routees.length;
                    this.routees = this.routees.filter(r => r.id !== routeeId);

                    const removed = initialLength > this.routees.length;
                    log.debug('Removed routee', {
                        traceId: traceCtx.traceId,
                        routeeId,
                        removed,
                        totalRoutees: this.routees.length,
                        routerId: this.context.self.id
                    });
                    return;
                }

                if (this.routees.length === 0) {
                    log.warn('No routees available for routing', {
                        traceId: traceCtx.traceId,
                        messageType: message.type,
                        routerId: this.context.self.id
                    });
                    return;
                }

                await this.router.route(message, this.routees);
                log.debug('Successfully routed message', {
                    traceId: traceCtx.traceId,
                    type: message.type,
                    routees: this.routees.length,
                    routerId: this.context.self.id
                });
            } catch (error) {
                log.error('Failed to route message', {
                    traceId: traceCtx.traceId,
                    type: message.type,
                    error: error instanceof Error ? error.message : 'Unknown error',
                    routerId: this.context.self.id,
                    routees: this.routees.length
                });
                throw error;
            }
        });
    }

    private createTraceContext(operation: string, message?: Message): TraceContext {
        return {
            traceId: Math.random().toString(36).substring(7),
            parentId: message ? (message as any).traceId : undefined,
            timestamp: Date.now(),
            operation,
            correlationId: message ? (message as any).correlationId : undefined
        };
    }
}

export class MessageBusActor extends Actor implements MessageBus {
    private subscriptionRouter: PID | null = null;
    private requestRouter: PID | null = null;
    private subscriptions = new Map<string, {
        filter: MessageFilter;
        handler: MessageHandler;
        traceContext: TraceContext;
    }>();

    public async init(): Promise<void> {
        const traceCtx = this.createTraceContext('init');

        log.debug('Starting MessageBus initialization', {
            traceId: traceCtx.traceId,
            actorId: this.context.self.id
        });

        try {
            // Create subscription router with broadcast strategy
            log.debug('Creating subscription router', {
                traceId: traceCtx.traceId,
                routerType: 'broadcast'
            });

            const subRouter = await createRouter('broadcast', {
                system: this.context.system,
                routees: []
            });

            if (!subRouter) {
                throw new Error('Failed to create subscription router');
            }

            const subRouterPID = await this.context.spawn({
                actorClass: RouterActor
            });

            log.debug('Subscription router actor created', {
                traceId: traceCtx.traceId,
                routerId: subRouterPID.id
            });

            await this.context.send(subRouterPID, {
                type: 'router.set',
                router: subRouter,
                traceId: traceCtx.traceId
            });
            this.subscriptionRouter = subRouterPID;

            // Create request router with broadcast strategy
            log.debug('Creating request router', {
                traceId: traceCtx.traceId,
                routerType: 'broadcast'
            });

            const reqRouter = await createRouter('broadcast', {
                system: this.context.system,
                routees: []
            });

            if (!reqRouter) {
                throw new Error('Failed to create request router');
            }

            const reqRouterPID = await this.context.spawn({
                actorClass: RouterActor
            });

            log.debug('Request router actor created', {
                traceId: traceCtx.traceId,
                routerId: reqRouterPID.id
            });

            await this.context.send(reqRouterPID, {
                type: 'router.set',
                router: reqRouter,
                traceId: traceCtx.traceId
            });
            this.requestRouter = reqRouterPID;

            log.info('MessageBus initialization completed', {
                traceId: traceCtx.traceId,
                subscriptionRouterId: this.subscriptionRouter?.id,
                requestRouterId: this.requestRouter?.id,
                actorId: this.context.self.id
            });
        } catch (error) {
            log.error('Failed to initialize MessageBus', {
                traceId: traceCtx.traceId,
                error: error instanceof Error ? error.message : 'Unknown error',
                stack: error instanceof Error ? error.stack : undefined,
                actorId: this.context.self.id
            });
            throw error;
        }
    }

    protected behaviors(): void {
        this.addBehavior('default', async (msg: Message) => {
            const traceCtx = this.createTraceContext('handle_message');

            log.debug('MessageBus received message', {
                traceId: traceCtx.traceId,
                type: msg.type,
                payload: msg.payload,
                sender: msg.sender?.id
            });

            try {
                switch (msg.type) {
                    case 'SUBSCRIBE':
                        await this.handleSubscribe(msg, traceCtx);
                        break;
                    case 'UNSUBSCRIBE':
                        await this.handleUnsubscribe(msg, traceCtx);
                        break;
                    case 'PUBLISH':
                        await this.handlePublish(msg, traceCtx);
                        break;
                    case 'REQUEST':
                        await this.handleRequest(msg, traceCtx);
                        break;
                    case 'RESPONSE':
                        await this.handleResponse(msg, traceCtx);
                        break;
                    case 'CLEAR':
                        this.handleClear(traceCtx);
                        break;
                    default:
                        log.warn('Received unknown message type', {
                            traceId: traceCtx.traceId,
                            type: msg.type
                        });
                }
            } catch (error) {
                log.error('Error handling message', {
                    traceId: traceCtx.traceId,
                    type: msg.type,
                    error: error instanceof Error ? error.message : 'Unknown error'
                });
                throw error;
            }
        });
    }

    private createTraceContext(operation: string, parentContext?: TraceContext): TraceContext {
        return {
            traceId: Math.random().toString(36).substring(7),
            parentId: parentContext?.traceId,
            timestamp: Date.now(),
            operation
        };
    }

    private async handleSubscribe(msg: Message, traceCtx: TraceContext): Promise<void> {
        const { filter, handler } = msg.payload;
        const subscriptionId = msg.payload.correlationId;

        this.subscriptions.set(subscriptionId, {
            filter,
            handler,
            traceContext: traceCtx
        });

        if (this.subscriptionRouter) {
            await this.context.send(this.subscriptionRouter, {
                type: 'router.add-routee',
                routee: msg.sender,
                traceId: traceCtx.traceId
            });
        }

        log.debug('Subscription added', {
            traceId: traceCtx.traceId,
            subscriptionId,
            filter
        });
    }

    private async handleUnsubscribe(msg: Message, traceCtx: TraceContext): Promise<void> {
        const subscriptionId = msg.payload.subscriptionId;
        const subscription = this.subscriptions.get(subscriptionId);

        log.debug('Processing unsubscribe request', {
            traceId: traceCtx.traceId,
            subscriptionId,
            hasSubscription: !!subscription,
            totalSubscriptions: this.subscriptions.size
        });

        if (subscription && this.subscriptionRouter) {
            try {
                // First remove from subscriptions to prevent any new messages
                this.subscriptions.delete(subscriptionId);

                // Then remove from router
                await this.context.send(this.subscriptionRouter, {
                    type: 'router.remove-routee',
                    routee: msg.sender,
                    traceId: traceCtx.traceId
                });

                log.debug('Successfully removed subscription', {
                    traceId: traceCtx.traceId,
                    subscriptionId,
                    remainingSubscriptions: this.subscriptions.size
                });
            } catch (error) {
                // If router removal fails, add back to subscriptions
                if (subscription) {
                    this.subscriptions.set(subscriptionId, subscription);
                }
                log.error('Failed to remove subscription routee', {
                    traceId: traceCtx.traceId,
                    subscriptionId,
                    error: error instanceof Error ? error.message : 'Unknown error'
                });
                throw error;
            }
        } else {
            log.warn('Unsubscribe requested for non-existent subscription', {
                traceId: traceCtx.traceId,
                subscriptionId
            });
        }
    }

    private async handlePublish(msg: Message, traceCtx: TraceContext): Promise<void> {
        const message = msg.payload.message as EnhancedMessage;

        if (this.subscriptionRouter) {
            const matchingSubscriptions = Array.from(this.subscriptions.entries())
                .filter(([_, sub]) => this.matchesFilter(message, sub.filter));

            log.debug('Publishing message', {
                traceId: traceCtx.traceId,
                messageType: message.type,
                matchingSubscriptions: matchingSubscriptions.length
            });

            for (const [id, subscription] of matchingSubscriptions) {
                try {
                    await subscription.handler(message);
                    log.debug('Successfully delivered message to subscriber', {
                        traceId: traceCtx.traceId,
                        subscriptionId: id
                    });
                } catch (error) {
                    log.error('Error delivering message to subscriber', {
                        traceId: traceCtx.traceId,
                        subscriptionId: id,
                        error: error instanceof Error ? error.message : 'Unknown error'
                    });
                }
            }
        }
    }

    private async handleRequest(msg: Message, traceCtx: TraceContext): Promise<void> {
        const { message, correlationId } = msg.payload;

        log.debug('Processing request', {
            traceId: traceCtx.traceId,
            correlationId,
            messageType: message.type,
            hasRequestRouter: !!this.requestRouter,
            sender: msg.sender?.id
        });

        if (this.requestRouter) {
            try {
                // Send the request first
                await this.context.send(this.requestRouter, {
                    type: 'REQUEST',
                    payload: {
                        originalMessage: message,
                        correlationId,
                        sender: msg.sender
                    },
                    traceId: traceCtx.traceId,
                    sender: msg.sender
                });

                // Then add sender as routee for response
                await this.context.send(this.requestRouter, {
                    type: 'router.add-routee',
                    routee: msg.sender,
                    traceId: traceCtx.traceId
                });

                log.debug('Request successfully routed', {
                    traceId: traceCtx.traceId,
                    correlationId,
                    messageType: message.type,
                    sender: msg.sender?.id
                });
            } catch (error) {
                // Clean up routee on error
                if (msg.sender) {
                    try {
                        await this.context.send(this.requestRouter, {
                            type: 'router.remove-routee',
                            routee: msg.sender,
                            traceId: traceCtx.traceId
                        });
                    } catch (cleanupError) {
                        log.error('Failed to clean up routee after request error', {
                            traceId: traceCtx.traceId,
                            correlationId,
                            sender: msg.sender.id,
                            error: cleanupError instanceof Error ? cleanupError.message : 'Unknown error'
                        });
                    }
                }

                log.error('Failed to route request', {
                    traceId: traceCtx.traceId,
                    correlationId,
                    messageType: message.type,
                    error: error instanceof Error ? error.message : 'Unknown error',
                    sender: msg.sender?.id
                });
                throw error;
            }
        } else {
            const error = new Error('Request router not initialized');
            log.error('Failed to process request', {
                traceId: traceCtx.traceId,
                correlationId,
                error: error.message
            });
            throw error;
        }
    }

    private async handleResponse(msg: Message, traceCtx: TraceContext): Promise<void> {
        const { response, correlationId } = msg.payload;

        log.debug('Processing response message', {
            traceId: traceCtx.traceId,
            correlationId,
            responseType: response?.type,
            senderId: msg.sender?.id,
            hasRequestRouter: !!this.requestRouter,
            priority: response?.context?.priority,
            senderRole: response?.sender?.role
        });

        if (msg.sender && this.requestRouter) {
            try {
                log.debug('Sending response to original requester', {
                    traceId: traceCtx.traceId,
                    correlationId,
                    senderId: msg.sender.id,
                    responseType: response?.type
                });

                await this.context.send(msg.sender, {
                    type: 'RESPONSE',
                    payload: {
                        response,
                        correlationId
                    },
                    traceId: traceCtx.traceId
                });

                log.debug('Response successfully sent, cleaning up routee', {
                    traceId: traceCtx.traceId,
                    correlationId,
                    senderId: msg.sender.id,
                    routerId: this.requestRouter.id
                });

                try {
                    await this.context.send(this.requestRouter, {
                        type: 'router.remove-routee',
                        routee: msg.sender,
                        traceId: traceCtx.traceId
                    });

                    log.debug('Successfully removed response routee', {
                        traceId: traceCtx.traceId,
                        correlationId,
                        senderId: msg.sender.id,
                        routerId: this.requestRouter.id
                    });
                } catch (cleanupError) {
                    log.error('Failed to remove routee after response', {
                        traceId: traceCtx.traceId,
                        correlationId,
                        senderId: msg.sender.id,
                        routerId: this.requestRouter.id,
                        error: cleanupError instanceof Error ? cleanupError.message : 'Unknown error',
                        stack: cleanupError instanceof Error ? cleanupError.stack : undefined
                    });
                }
            } catch (error) {
                log.error('Failed to send response', {
                    traceId: traceCtx.traceId,
                    correlationId,
                    senderId: msg.sender.id,
                    responseType: response?.type,
                    error: error instanceof Error ? error.message : 'Unknown error',
                    stack: error instanceof Error ? error.stack : undefined
                });
                throw error;
            }
        } else {
            log.warn('Cannot process response - missing sender or router', {
                traceId: traceCtx.traceId,
                correlationId,
                hasSender: !!msg.sender,
                hasRouter: !!this.requestRouter,
                responseType: response?.type
            });
        }
    }

    private handleClear(traceCtx: TraceContext): void {
        log.debug('Starting message bus clear operation', {
            traceId: traceCtx.traceId,
            currentSubscriptions: this.subscriptions.size,
            hasSubscriptionRouter: !!this.subscriptionRouter,
            hasRequestRouter: !!this.requestRouter
        });

        const subscriptionCount = this.subscriptions.size;
        this.subscriptions.clear();

        log.info('Message bus cleared', {
            traceId: traceCtx.traceId,
            clearedSubscriptions: subscriptionCount,
            remainingSubscriptions: this.subscriptions.size,
            actorId: this.context.self.id
        });
    }

    private matchesFilter(message: EnhancedMessage, filter: MessageFilter): boolean {
        // Match priority
        if (filter.priority && filter.priority.length > 0) {
            if (!message.context?.priority || !filter.priority.includes(message.context.priority)) {
                return false;
            }
        }

        // Match roles
        if (filter.roles && filter.roles.length > 0) {
            if (!message.sender?.role || !filter.roles.includes(message.sender.role)) {
                return false;
            }
        }

        return true;
    }

    // Public API implementation
    async subscribe(filter: MessageFilter, handler: MessageHandler): Promise<() => void> {
        const traceCtx = this.createTraceContext('subscribe');
        const subscriptionId = Math.random().toString(36).substring(7);

        await this.context.send(this.context.self, {
            type: 'SUBSCRIBE',
            payload: {
                filter,
                handler,
                correlationId: subscriptionId
            },
            traceId: traceCtx.traceId
        });

        log.debug('Subscribe request sent', {
            traceId: traceCtx.traceId,
            subscriptionId,
            filter
        });

        return () => {
            const unsubTraceCtx = this.createTraceContext('unsubscribe', traceCtx);
            this.context.send(this.context.self, {
                type: 'UNSUBSCRIBE',
                payload: { subscriptionId },
                traceId: unsubTraceCtx.traceId
            });

            log.debug('Unsubscribe request sent', {
                traceId: unsubTraceCtx.traceId,
                subscriptionId
            });
        };
    }

    async publish(message: EnhancedMessage): Promise<void> {
        const traceCtx = this.createTraceContext('publish');

        await this.context.send(this.context.self, {
            type: 'PUBLISH',
            payload: { message },
            traceId: traceCtx.traceId
        });

        log.debug('Publish request sent', {
            traceId: traceCtx.traceId,
            messageType: message.type
        });
    }

    async request(message: EnhancedMessage, timeout: number = 5000): Promise<EnhancedMessage> {
        const traceCtx = this.createTraceContext('request');
        const correlationId = Math.random().toString(36).substring(7);

        return new Promise((resolve, reject) => {
            const timeoutId = setTimeout(() => {
                log.error('Request timed out', {
                    traceId: traceCtx.traceId,
                    correlationId,
                    messageType: message.type,
                    timeout
                });
                reject(new Error('Request timed out'));
            }, timeout);

            this.context.send(this.context.self, {
                type: 'REQUEST',
                payload: {
                    message,
                    correlationId
                },
                traceId: traceCtx.traceId
            }).catch((error: Error) => {
                log.error('Error sending request', {
                    traceId: traceCtx.traceId,
                    correlationId,
                    error: error.message
                });
                clearTimeout(timeoutId);
                reject(error);
            });

            log.debug('Request initiated', {
                traceId: traceCtx.traceId,
                correlationId,
                messageType: message.type,
                timeout
            });
        });
    }

    clear(): void {
        const traceCtx = this.createTraceContext('clear');
        this.context.send(this.context.self, {
            type: 'CLEAR',
            traceId: traceCtx.traceId
        });

        log.debug('Clear request sent', {
            traceId: traceCtx.traceId
        });
    }
} 