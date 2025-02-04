import {
    RouterConfig,
    Message as CoreMessage,
    RouterType,
    Actor,
    PID,
    ActorContext,
    createRouter,
    IRouter,
    log,
    Message
} from '@bactor/core';
import {
    MessagePayload as AgentMessagePayload,
    MessageTypes as AgentMessageTypes,
    EnhancedMessage as AgentEnhancedMessage,
    MessageFilter as AgentMessageFilter,
    MessageHandler as AgentMessageHandler,
    MessageType as AgentMessageType
} from '../types/message';

// Common message fields
export interface MessageCommon {
    type: string;
    payload: any;
    sender?: PID;
    priority?: 'high' | 'normal' | 'low';
    correlationId?: string;
    traceId?: string;
    spanId?: string;
    parentSpanId?: string;
}

// Router message types from core
export const RouterMessageTypes = {
    SET_ROUTER: 'router.set-router',
    ADD_ROUTEE: 'router.add-routee',
    REMOVE_ROUTEE: 'router.remove-routee',
    GET_ROUTEES: 'router.get-routees',
    BROADCAST: 'router.broadcast'
} as const;

export type RouterMessageType = typeof RouterMessageTypes[keyof typeof RouterMessageTypes];

export interface RouterPayload {
    routerId?: string;
    routee?: PID;
    routerConfig?: {
        type: RouterType;
        config: RouterConfig;
        router?: IRouter;
    };
}

export interface RouterMessage extends MessageCommon {
    type: RouterMessageType;
    payload: RouterPayload;
}

// Message bus types
export const BusMessageTypes = {
    PUBLISH: 'PUBLISH',
    SUBSCRIBE: 'SUBSCRIBE',
    REQUEST: 'REQUEST',
    REGISTER_HANDLER: 'REGISTER_HANDLER'
} as const;

export type BusMessageType = typeof BusMessageTypes[keyof typeof BusMessageTypes];


// System message types
export const SystemMessageTypes = {
    ACTOR_STARTED: 'ACTOR_STARTED',
    ACTOR_STOPPED: 'ACTOR_STOPPED',
    ACTOR_ERROR: 'ACTOR_ERROR',
    ACTOR_SUPERVISION: 'ACTOR_SUPERVISION',
    TASK_ASSIGNED: 'TASK_ASSIGNED',
    TASK_STARTED: 'TASK_STARTED',
    TASK_COMPLETED: 'TASK_COMPLETED',
    TASK_FAILED: 'TASK_FAILED',
    KNOWLEDGE_SHARED: 'KNOWLEDGE_SHARED',
    KNOWLEDGE_REQUESTED: 'KNOWLEDGE_REQUESTED',
    KNOWLEDGE_UPDATED: 'KNOWLEDGE_UPDATED',
    WORKFLOW_STARTED: 'WORKFLOW_STARTED',
    WORKFLOW_STAGE_CHANGED: 'WORKFLOW_STAGE_CHANGED',
    WORKFLOW_COMPLETED: 'WORKFLOW_COMPLETED',
    COORDINATION_REQUEST: 'COORDINATION_REQUEST',
    COORDINATION_RESPONSE: 'COORDINATION_RESPONSE',
    SYSTEM_ERROR: 'SYSTEM_ERROR',
    SYSTEM_WARNING: 'SYSTEM_WARNING',
    SYSTEM_INFO: 'SYSTEM_INFO',
    REQUEST_RESPONSE: 'REQUEST_RESPONSE',
    CLEAR: 'CLEAR'
} as const;

export type SystemMessageType = typeof SystemMessageTypes[keyof typeof SystemMessageTypes];
export type MessageType = BusMessageType | RouterMessageType | SystemMessageType | AgentMessageType;

// Message filter interface
export interface MessageFilter {
    priority?: Array<'high' | 'normal' | 'low'>;
    roles?: string[];
    type?: string;
}

// Message interfaces
export interface PublishMessage extends MessageCommon {
    type: typeof BusMessageTypes.PUBLISH;
    payload: BusMessage;
}

export interface SubscribeMessage extends MessageCommon {
    type: typeof BusMessageTypes.SUBSCRIBE;
    payload: {
        filter: MessageFilter;
        handler: MessageHandler;
    };
}

export interface RequestMessage extends MessageCommon {
    type: typeof BusMessageTypes.REQUEST;
    payload: {
        request: BusMessage;
        timeout?: number;
    };
}

export interface RegisterHandlerMessage extends MessageCommon {
    type: typeof BusMessageTypes.REGISTER_HANDLER;
    payload: {
        handler: MessageHandler;
        priority: 'high' | 'normal' | 'low';
    };
}

// Message types
export type BusMessage = RouterMessage | PublishMessage | SubscribeMessage | RequestMessage | RegisterHandlerMessage;
export type MessageResponse = { success: boolean; data?: any; error?: string };
export type MessageHandler = (message: BusMessage) => Promise<MessageResponse | void>;
export type RouterHandler = (message: RouterMessage) => Promise<void>;

// Trace context for tracking message lifecycle
export interface TraceContext {
    traceId: string;
    spanId: string;
    parentSpanId?: string;
    timestamp: number;
    operation: string;
}

// Extended trace context with additional fields
export interface ExtendedTraceContext extends TraceContext {
    correlationId?: string;
}

// Message with trace context
export interface MessageWithTrace {
    message: BusMessage;
    traceContext: ExtendedTraceContext;
}

// Type guards
export function isRouterMessage(message: BusMessage): message is RouterMessage {
    return message.type === RouterMessageTypes.ADD_ROUTEE ||
        message.type === RouterMessageTypes.REMOVE_ROUTEE ||
        message.type === RouterMessageTypes.GET_ROUTEES ||
        message.type === RouterMessageTypes.BROADCAST;
}

export function isPublishMessage(message: BusMessage): message is PublishMessage {
    return message.type === BusMessageTypes.PUBLISH;
}

export function isSubscribeMessage(message: BusMessage): message is SubscribeMessage {
    return message.type === BusMessageTypes.SUBSCRIBE;
}

export function isRequestMessage(message: BusMessage): message is RequestMessage {
    return message.type === BusMessageTypes.REQUEST;
}

export function isRegisterHandlerMessage(message: BusMessage): message is RegisterHandlerMessage {
    return message.type === BusMessageTypes.REGISTER_HANDLER;
}

// Helper functions
export function createMessage<T extends BusMessage>(type: T['type'], payload: T['payload'], options: Partial<MessageCommon> = {}): T {
    return {
        type,
        payload,
        ...options
    } as T;
}

// Convert core message to bus message
export function convertCoreMessage(message: CoreMessage): BusMessage {
    const { type, payload, sender } = message;
    const options: Partial<MessageCommon> = { sender };

    switch (type) {
        case BusMessageTypes.PUBLISH:
            return createMessage<PublishMessage>(BusMessageTypes.PUBLISH, payload as BusMessage, options);
        case BusMessageTypes.SUBSCRIBE:
            return createMessage<SubscribeMessage>(BusMessageTypes.SUBSCRIBE, payload as { filter: MessageFilter; handler: MessageHandler }, options);
        case BusMessageTypes.REQUEST:
            return createMessage<RequestMessage>(BusMessageTypes.REQUEST, payload as { request: BusMessage; timeout?: number }, options);
        case BusMessageTypes.REGISTER_HANDLER:
            return createMessage<RegisterHandlerMessage>(BusMessageTypes.REGISTER_HANDLER, payload as { handler: MessageHandler; priority: 'high' | 'normal' | 'low' }, options);
        case RouterMessageTypes.ADD_ROUTEE:
        case RouterMessageTypes.REMOVE_ROUTEE:
            return createMessage<RouterMessage>(type as RouterMessageType, payload as RouterPayload, options);
        case SystemMessageTypes.CLEAR:
            return createMessage<RegisterHandlerMessage>(BusMessageTypes.REGISTER_HANDLER, {
                handler: async () => { },
                priority: 'normal'
            }, options);
        default:
            throw new Error(`Unknown message type: ${type}`);
    }
}

// Convert bus message to core message
export function convertToCore(message: BusMessage): CoreMessage {
    return {
        type: message.type,
        payload: message.payload,
        sender: message.sender
    };
}

// Router actor class
class RouterActor extends Actor {
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
            routerId: this.context.self.id
        });
    }

    protected behaviors(): void {
        this.addBehavior('default', async (message: CoreMessage) => {
            const busMessage = convertCoreMessage(message);
            if (!this.router) {
                throw new Error('Router not initialized');
            }

            try {
                const routees = (this.router as any).getRoutees?.() || [];
                await this.router.route(busMessage, routees);
            } catch (error) {
                log.error('Failed to route message', {
                    error: error instanceof Error ? error.message : 'Unknown error'
                });
                throw error;
            }
        });
    }
}

class RequestHandlerActor extends Actor {
    private highPriorityHandler: MessageHandler | null = null;
    private normalPriorityHandler: MessageHandler | null = null;

    constructor(context: ActorContext) {
        super(context);
        log.debug('RequestHandlerActor created', {
            actorId: context.self.id,
            hasHighPriorityHandler: !!this.highPriorityHandler,
            hasNormalPriorityHandler: !!this.normalPriorityHandler
        });
    }

    protected behaviors(): void {
        this.addBehavior('default', async (message: Message) => {
            try {
                log.debug('RequestHandlerActor received message', {
                    actorId: this.context.self.id,
                    messageType: message.type,
                    sender: message.sender?.id,
                    hasHighPriorityHandler: !!this.highPriorityHandler,
                    hasNormalPriorityHandler: !!this.normalPriorityHandler,
                    messagePayload: message.payload,
                    correlationId: (message as any).correlationId
                });

                if (message.type === 'SET_HIGH_PRIORITY_HANDLER') {
                    log.debug('Setting high priority handler', {
                        actorId: this.context.self.id,
                        previousHandler: !!this.highPriorityHandler
                    });
                    this.highPriorityHandler = message.payload.handler;
                    log.debug('High priority handler set', {
                        actorId: this.context.self.id,
                        hasHandler: !!this.highPriorityHandler
                    });
                    await this.context.send(message.sender!, {
                        type: BusMessageTypes.REQUEST,
                        payload: { success: true },
                        correlationId: (message as any).correlationId
                    });
                    return;
                }

                if (message.type === 'SET_NORMAL_PRIORITY_HANDLER') {
                    log.debug('Setting normal priority handler', {
                        actorId: this.context.self.id,
                        previousHandler: !!this.normalPriorityHandler
                    });
                    this.normalPriorityHandler = message.payload.handler;
                    log.debug('Normal priority handler set', {
                        actorId: this.context.self.id,
                        hasHandler: !!this.normalPriorityHandler
                    });
                    await this.context.send(message.sender!, {
                        type: BusMessageTypes.REQUEST,
                        payload: { success: true },
                        correlationId: (message as any).correlationId
                    });
                    return;
                }

                const busMessage = message as RequestMessage;
                const { request, timeout = 3000 } = busMessage.payload;
                const priority = request.priority || 'normal';
                let handler = priority === 'high' ? this.highPriorityHandler : this.normalPriorityHandler;

                log.debug('Selecting handler for request', {
                    actorId: this.context.self.id,
                    priority,
                    hasHighPriorityHandler: !!this.highPriorityHandler,
                    hasNormalPriorityHandler: !!this.normalPriorityHandler,
                    selectedHandler: !!handler,
                    messageType: request.type,
                    correlationId: (busMessage as any).correlationId
                });

                if (!handler) {
                    log.warn('No handler available for request, using default behavior', {
                        actorId: this.context.self.id,
                        priority,
                        messageType: request.type,
                        correlationId: (busMessage as any).correlationId
                    });
                    const response = { success: true, data: request };
                    await this.context.send(busMessage.sender!, {
                        type: BusMessageTypes.REQUEST,
                        payload: response,
                        correlationId: (busMessage as any).correlationId
                    });
                    return;
                }

                log.debug('Executing request handler', {
                    actorId: this.context.self.id,
                    priority,
                    messageType: request.type,
                    correlationId: (busMessage as any).correlationId
                });

                let handlerCompleted = false;
                const timeoutPromise = new Promise<never>((_, reject) => {
                    setTimeout(() => {
                        if (!handlerCompleted) {
                            reject(new Error('Request timed out'));
                        }
                    }, timeout);
                });

                try {
                    const handlerResult = await Promise.race([
                        handler(request).then(result => {
                            handlerCompleted = true;
                            if (result === undefined) {
                                return { success: true, data: request };
                            }
                            return result;
                        }),
                        timeoutPromise
                    ]);

                    if (handlerCompleted) {
                        log.debug('Handler execution completed successfully', {
                            actorId: this.context.self.id,
                            success: true,
                            correlationId: (busMessage as any).correlationId
                        });

                        if (!busMessage.sender) {
                            log.warn('No sender found for response', {
                                actorId: this.context.self.id,
                                correlationId: (busMessage as any).correlationId
                            });
                            return;
                        }

                        await this.context.send(busMessage.sender, {
                            type: BusMessageTypes.REQUEST,
                            payload: handlerResult,
                            correlationId: (busMessage as any).correlationId
                        });
                    } else {
                        log.error('Handler execution timed out', {
                            actorId: this.context.self.id,
                            correlationId: (busMessage as any).correlationId
                        });

                        if (!busMessage.sender) {
                            log.warn('No sender found for timeout response', {
                                actorId: this.context.self.id,
                                correlationId: (busMessage as any).correlationId
                            });
                            return;
                        }

                        await this.context.send(busMessage.sender, {
                            type: BusMessageTypes.REQUEST,
                            payload: {
                                success: false,
                                error: 'Handler execution timed out'
                            },
                            correlationId: (busMessage as any).correlationId
                        });
                    }
                } catch (error) {
                    log.error('Handler execution failed', {
                        actorId: this.context.self.id,
                        error: error instanceof Error ? error.message : 'Unknown error',
                        correlationId: (busMessage as any).correlationId
                    });

                    if (!busMessage.sender) {
                        log.warn('No sender found for error response', {
                            actorId: this.context.self.id,
                            correlationId: (busMessage as any).correlationId
                        });
                        return;
                    }

                    await this.context.send(busMessage.sender, {
                        type: BusMessageTypes.REQUEST,
                        payload: {
                            success: false,
                            error: error instanceof Error ? error.message : 'Unknown error'
                        },
                        correlationId: (busMessage as any).correlationId
                    });
                }
            } catch (error) {
                log.error('Error in RequestHandlerActor', {
                    actorId: this.context.self.id,
                    error: error instanceof Error ? error.message : 'Unknown error',
                    stack: error instanceof Error ? error.stack : undefined,
                    messageType: message.type,
                    correlationId: (message as any).correlationId
                });
                if (message.sender) {
                    await this.context.send(message.sender, {
                        type: BusMessageTypes.REQUEST,
                        payload: {
                            success: false,
                            error: error instanceof Error ? error.message : 'Unknown error'
                        },
                        correlationId: (message as any).correlationId
                    });
                }
            }
        });
    }

    public setHighPriorityHandler(handler: MessageHandler): void {
        this.highPriorityHandler = handler;
    }

    public setNormalPriorityHandler(handler: MessageHandler): void {
        this.normalPriorityHandler = handler;
    }
}

class SubscriptionHandlerActor extends Actor {
    private subscriptions: Map<string, MessageHandler> = new Map();

    constructor(context: ActorContext) {
        super(context);
        log.debug('SubscriptionHandlerActor created', { actorId: context.self.id });
    }

    protected behaviors(): void {
        this.addBehavior('default', async (message: Message) => {
            try {
                log.debug('SubscriptionHandlerActor received message', {
                    actorId: this.context.self.id,
                    messageType: message.type,
                    sender: message.sender?.id
                });

                const busMessage = message as BusMessage;

                if (isPublishMessage(busMessage)) {
                    const handler = this.subscriptions.get(busMessage.type);
                    if (handler) {
                        log.debug('Executing subscription handler', {
                            actorId: this.context.self.id,
                            messageType: busMessage.type
                        });
                        await handler(busMessage);
                        log.debug('Subscription handler completed', {
                            actorId: this.context.self.id,
                            messageType: busMessage.type
                        });
                    } else {
                        log.debug('No handler found for message type', {
                            actorId: this.context.self.id,
                            messageType: busMessage.type
                        });
                    }
                } else if (isSubscribeMessage(busMessage)) {
                    const { filter, handler } = busMessage.payload;
                    if (filter.type) {
                        log.debug('Registering subscription handler', {
                            actorId: this.context.self.id,
                            messageType: filter.type
                        });
                        this.subscriptions.set(filter.type, handler);
                    }
                }
            } catch (error) {
                log.error('Error in SubscriptionHandlerActor', {
                    actorId: this.context.self.id,
                    error: error instanceof Error ? error.message : 'Unknown error',
                    stack: error instanceof Error ? error.stack : undefined
                });
            }
        });
    }
}

// 生成追踪 ID
function generateTraceId(): string {
    return Math.random().toString(36).substring(2, 15);
}

// 生成 Span ID
function generateSpanId(): string {
    return Math.random().toString(36).substring(2, 10);
}

export interface MessageBusMetrics {
    messageCount: number;
    errorCount: number;
    avgProcessingTime: number;
    lastProcessingTimes: number[];
    currentIndex: number;
}

// Message bus interface
export interface IMessageBus {
    publish(message: BusMessage): Promise<void>;
    subscribe(pattern: string, handler: MessageHandler): Promise<void>;
    request(message: BusMessage, timeout?: number): Promise<any>;
    registerHandler(handler: MessageHandler, priority?: 'high' | 'normal'): Promise<void>;
}

// Message bus actor class
export class MessageBusActor extends Actor {
    private requestRouter: PID | null = null;
    private subscriptionRouter: PID | null = null;
    private metrics: MessageBusMetrics = {
        messageCount: 0,
        errorCount: 0,
        avgProcessingTime: 0,
        lastProcessingTimes: new Array(100).fill(0),
        currentIndex: 0
    };
    private initialized: boolean = false;
    private initializationPromise: Promise<void> | null = null;
    private pendingRequests: Map<string, { resolve: (value: any) => void; reject: (error: Error) => void; timeoutId: ReturnType<typeof setTimeout> }> = new Map();

    constructor(context: ActorContext) {
        super(context);
        this.initializationPromise = this.initialize().catch(error => {
            log.error('Failed to initialize MessageBus', {
                error: error instanceof Error ? error.message : 'Unknown error'
            });
            throw error;
        });
    }

    protected behaviors(): void {
        this.addBehavior('default', async (message: Message) => {
            // Wait for initialization to complete before handling any messages
            if (this.initializationPromise) {
                log.debug('Waiting for initialization in behavior', {
                    messageType: message.type,
                    sender: message.sender?.id,
                    initialized: this.initialized,
                    hasRequestRouter: !!this.requestRouter,
                    hasSubscriptionRouter: !!this.subscriptionRouter
                });
                await this.initializationPromise;
            }

            const busMessage = message as BusMessage;
            if (busMessage.type === BusMessageTypes.REQUEST && 'correlationId' in busMessage && busMessage.correlationId) {
                log.debug('Received response for correlated request', {
                    correlationId: busMessage.correlationId,
                    messageType: busMessage.type,
                    pendingRequestsCount: this.pendingRequests.size,
                    hasPendingRequest: this.pendingRequests.has(busMessage.correlationId),
                    pendingRequestIds: Array.from(this.pendingRequests.keys()),
                    payload: busMessage.payload
                });

                const pendingRequest = this.pendingRequests.get(busMessage.correlationId);
                if (pendingRequest) {
                    log.debug('Resolving pending request', {
                        correlationId: busMessage.correlationId,
                        messageType: busMessage.type,
                        payload: busMessage.payload,
                        remainingPendingRequests: this.pendingRequests.size - 1
                    });
                    clearTimeout(pendingRequest.timeoutId);
                    pendingRequest.resolve(busMessage.payload);
                    this.pendingRequests.delete(busMessage.correlationId);
                } else {
                    log.warn('No pending request found for correlation', {
                        correlationId: busMessage.correlationId,
                        messageType: busMessage.type,
                        pendingRequests: Array.from(this.pendingRequests.keys()),
                        payload: busMessage.payload
                    });
                }
            } else {
                await this.handleMessage(busMessage);
            }
        });
    }

    private async handleMessage(message: BusMessage): Promise<void> {
        // Wait for initialization to complete before handling any messages
        if (this.initializationPromise) {
            log.debug('Waiting for MessageBus initialization before handling message', {
                messageType: message.type
            });
            await this.initializationPromise;
        }

        if (!this.requestRouter || !this.subscriptionRouter) {
            const error = new Error('Routers not initialized');
            log.error('Router initialization error', {
                requestRouterExists: !!this.requestRouter,
                subscriptionRouterExists: !!this.subscriptionRouter,
                error: error.message
            });
            throw error;
        }

        const startTime = performance.now();
        try {
            log.debug('Processing message', {
                messageType: message.type,
                sender: message.sender?.id
            });

            if (isRequestMessage(message)) {
                const requestRouter = this.requestRouter;
                log.debug('Forwarding request message to request router', {
                    routerId: requestRouter.id,
                    messageType: message.type,
                    correlationId: message.correlationId
                });
                await this.context.send(requestRouter, message);
            } else if (isPublishMessage(message) || isSubscribeMessage(message)) {
                const subscriptionRouter = this.subscriptionRouter;
                log.debug('Forwarding publish/subscribe message to subscription router', {
                    routerId: subscriptionRouter.id,
                    messageType: message.type
                });
                await this.context.send(subscriptionRouter, message);
            }

            const processingTime = performance.now() - startTime;
            log.debug('Message processed successfully', {
                messageType: message.type,
                processingTime: `${processingTime.toFixed(2)}ms`
            });
            this.updateMetrics(processingTime, false);
        } catch (error) {
            const processingTime = performance.now() - startTime;
            log.error('Error processing message', {
                messageType: message.type,
                error: error instanceof Error ? error.message : 'Unknown error',
                stack: error instanceof Error ? error.stack : undefined,
                processingTime: `${processingTime.toFixed(2)}ms`
            });
            this.updateMetrics(processingTime, true);
            throw error;
        }
    }

    public async request(message: RequestMessage): Promise<any> {
        // Wait for initialization to complete before handling any messages
        if (this.initializationPromise) {
            log.debug('Waiting for MessageBus initialization before request', {
                messageType: message.type,
                sender: message.sender?.id
            });
            await this.initializationPromise;
        }

        if (!this.requestRouter) {
            const error = new Error('Request router not initialized');
            log.error('Request router not initialized', {
                messageType: message.type,
                sender: message.sender?.id
            });
            throw error;
        }

        const timeout = message.payload.timeout || 3000;
        const correlationId = Math.random().toString(36).substring(7);

        log.debug('Creating new request with correlation', {
            correlationId,
            messageType: message.type,
            timeout,
            sender: message.sender?.id
        });

        return new Promise((resolve, reject) => {
            const timeoutId = setTimeout(() => {
                log.warn('Request timed out', {
                    correlationId,
                    messageType: message.type,
                    timeout,
                    pendingRequests: Array.from(this.pendingRequests.keys())
                });
                this.pendingRequests.delete(correlationId);
                reject(new Error('Request timed out'));
            }, timeout);

            this.pendingRequests.set(correlationId, { resolve, reject, timeoutId });
            log.debug('Added pending request', {
                correlationId,
                pendingRequestsCount: this.pendingRequests.size,
                pendingRequests: Array.from(this.pendingRequests.keys())
            });

            // Send the request with correlation ID
            const requestRouter = this.requestRouter!;
            const requestWithCorrelation = {
                ...message,
                correlationId,
                sender: this.context.self // Ensure we set the sender to this actor
            };

            log.debug('Sending request to router', {
                correlationId,
                routerId: requestRouter.id,
                messageType: message.type,
                sender: requestWithCorrelation.sender?.id
            });

            this.context.send(requestRouter, requestWithCorrelation).catch((error: Error) => {
                log.error('Failed to send request', {
                    correlationId,
                    messageType: message.type,
                    error: error.message,
                    stack: error.stack
                });
                clearTimeout(timeoutId);
                this.pendingRequests.delete(correlationId);
                reject(error);
            });
        });
    }

    public async publish(message: PublishMessage): Promise<void> {
        if (!this.subscriptionRouter) {
            throw new Error('Subscription router not initialized');
        }
        await this.context.send(this.subscriptionRouter, message);
    }

    public async subscribe(type: string, handler: MessageHandler): Promise<void> {
        if (!this.subscriptionRouter) {
            throw new Error('Subscription router not initialized');
        }

        const subscribeMessage: SubscribeMessage = {
            type: BusMessageTypes.SUBSCRIBE,
            payload: {
                filter: { type },
                handler
            }
        };

        await this.context.send(this.subscriptionRouter, subscribeMessage);
    }

    public async setHighPriorityHandler(handler: MessageHandler): Promise<void> {
        if (!this.requestRouter) {
            const error = new Error('Request router not initialized');
            log.error('Failed to set high priority handler', {
                error: error.message,
                routerExists: !!this.requestRouter
            });
            throw error;
        }

        log.debug('Setting high priority handler', {
            routerId: this.requestRouter.id,
            hasHandler: !!handler
        });

        // Broadcast to all request handlers
        await this.context.send(this.requestRouter, {
            type: RouterMessageTypes.BROADCAST,
            payload: {
                message: {
                    type: 'SET_HIGH_PRIORITY_HANDLER',
                    handler
                }
            }
        });

        log.debug('High priority handler broadcast completed');
    }

    public async setNormalPriorityHandler(handler: MessageHandler): Promise<void> {
        if (!this.requestRouter) {
            const error = new Error('Request router not initialized');
            log.error('Failed to set normal priority handler', {
                error: error.message,
                routerExists: !!this.requestRouter
            });
            throw error;
        }

        log.debug('Setting normal priority handler', {
            routerId: this.requestRouter.id,
            hasHandler: !!handler
        });

        // Broadcast to all request handlers
        await this.context.send(this.requestRouter, {
            type: RouterMessageTypes.BROADCAST,
            payload: {
                message: {
                    type: 'SET_NORMAL_PRIORITY_HANDLER',
                    handler
                }
            }
        });

        log.debug('Normal priority handler broadcast completed');
    }

    protected async initialize(): Promise<void> {
        if (this.initialized) {
            log.info('MessageBus already initialized');
            return;
        }

        try {
            log.debug('Starting MessageBus initialization');

            // Create initial routees for request router
            const requestRoutee = await this.context.system.spawn({
                producer: (context: ActorContext) => new RequestHandlerActor(context)
            });
            log.debug('Created initial request routee', { routeeId: requestRoutee.id });

            // Create initial routees for subscription router
            const subscriptionRoutee = await this.context.system.spawn({
                producer: (context: ActorContext) => new SubscriptionHandlerActor(context)
            });
            log.debug('Created initial subscription routee', { routeeId: subscriptionRoutee.id });

            // Create request router with round-robin strategy
            const requestRouter = createRouter('round-robin', {
                system: this.context.system,
                routees: [requestRoutee],
                routingConfig: {
                    createRoutee: async (system) => {
                        const newRoutee = await system.spawn({
                            producer: (context: ActorContext) => new RequestHandlerActor(context)
                        });
                        log.debug('Created new request routee', { routeeId: newRoutee.id });
                        return newRoutee;
                    }
                }
            });
            log.debug('Created request router');

            // Create subscription router with broadcast strategy
            const subscriptionRouter = createRouter('broadcast', {
                system: this.context.system,
                routees: [subscriptionRoutee],
                routingConfig: {
                    createRoutee: async (system) => {
                        const newRoutee = await system.spawn({
                            producer: (context: ActorContext) => new SubscriptionHandlerActor(context)
                        });
                        log.debug('Created new subscription routee', { routeeId: newRoutee.id });
                        return newRoutee;
                    }
                }
            });
            log.debug('Created subscription router');

            // Spawn routers
            this.requestRouter = await this.context.spawn({
                producer: () => requestRouter
            });

            this.subscriptionRouter = await this.context.spawn({
                producer: () => subscriptionRouter
            });

            // Assert routers are initialized
            if (!this.requestRouter || !this.subscriptionRouter) {
                throw new Error('Failed to initialize routers');
            }

            log.debug('Spawned request router', { routerId: this.requestRouter.id });
            log.debug('Spawned subscription router', { routerId: this.subscriptionRouter.id });

            this.initialized = true;
            log.info('MessageBus initialized successfully', {
                requestRouterId: this.requestRouter.id,
                subscriptionRouterId: this.subscriptionRouter.id
            });
        } catch (error) {
            log.error('Failed to initialize MessageBus', {
                error: error instanceof Error ? error.message : 'Unknown error',
                stack: error instanceof Error ? error.stack : undefined
            });
            throw error;
        }
    }

    private updateMetrics(processingTime: number, isError: boolean): void {
        this.metrics.messageCount++;
        if (isError) {
            this.metrics.errorCount++;
        }

        this.metrics.lastProcessingTimes[this.metrics.currentIndex] = processingTime;
        this.metrics.currentIndex = (this.metrics.currentIndex + 1) % this.metrics.lastProcessingTimes.length;

        const sum = this.metrics.lastProcessingTimes.reduce((a, b) => a + b, 0);
        this.metrics.avgProcessingTime = sum / this.metrics.lastProcessingTimes.length;
    }
} 