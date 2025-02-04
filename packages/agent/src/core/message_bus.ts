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
export type MessageHandler = (message: BusMessage) => Promise<void>;
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
    }

    protected behaviors(): void {
        this.addBehavior('default', async (message: Message) => {
            const busMessage = message as RequestMessage;
            const { request, timeout = 3000 } = busMessage.payload;
            const priority = request.priority || 'normal';
            let handler = priority === 'high' ? this.highPriorityHandler : this.normalPriorityHandler;

            try {
                if (!handler) {
                    log.warn('No handler available for request, using default behavior');
                    const response = { success: true, data: request };
                    await this.context.send(busMessage.sender, {
                        type: SystemMessageTypes.REQUEST_RESPONSE,
                        payload: response
                    });
                    return;
                }

                const response = await Promise.race([
                    handler(request),
                    new Promise((_, reject) => setTimeout(() => reject(new Error('Request timed out')), timeout))
                ]);

                await this.context.send(busMessage.sender, {
                    type: SystemMessageTypes.REQUEST_RESPONSE,
                    payload: response
                });
            } catch (error) {
                log.error('Request handler error', {
                    error: error instanceof Error ? error.message : 'Unknown error'
                });
                throw error;
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
    }

    protected behaviors(): void {
        this.addBehavior('default', async (message: Message) => {
            const busMessage = message as BusMessage;

            if (isPublishMessage(busMessage)) {
                const handler = this.subscriptions.get(busMessage.type);
                if (handler) {
                    await handler(busMessage);
                }
            } else if (isSubscribeMessage(busMessage)) {
                const { filter, handler } = busMessage.payload;
                if (filter.type) {
                    this.subscriptions.set(filter.type, handler);
                }
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
            const busMessage = message as BusMessage;
            if (busMessage.type === BusMessageTypes.REQUEST && 'correlationId' in busMessage && busMessage.correlationId) {
                const pendingRequest = this.pendingRequests.get(busMessage.correlationId);
                if (pendingRequest) {
                    clearTimeout(pendingRequest.timeoutId);
                    pendingRequest.resolve(busMessage.payload);
                    this.pendingRequests.delete(busMessage.correlationId);
                }
            } else {
                await this.handleMessage(busMessage);
            }
        });
    }

    private async handleMessage(message: BusMessage): Promise<void> {
        if (!this.requestRouter || !this.subscriptionRouter) {
            throw new Error('Routers not initialized');
        }

        const startTime = performance.now();
        try {
            if (isRequestMessage(message)) {
                await this.context.send(this.requestRouter, message);
            } else if (isPublishMessage(message) || isSubscribeMessage(message)) {
                await this.context.send(this.subscriptionRouter, message);
            }
            this.updateMetrics(performance.now() - startTime, false);
        } catch (error) {
            this.updateMetrics(performance.now() - startTime, true);
            throw error;
        }
    }

    public async request(message: RequestMessage): Promise<any> {
        if (!this.requestRouter) {
            throw new Error('Request router not initialized');
        }

        // Wait for initialization to complete
        if (this.initializationPromise) {
            await this.initializationPromise;
        }

        const timeout = message.payload.timeout || 3000;
        const correlationId = Math.random().toString(36).substring(7);

        return new Promise((resolve, reject) => {
            const timeoutId = setTimeout(() => {
                this.pendingRequests.delete(correlationId);
                reject(new Error('Request timed out'));
            }, timeout);

            this.pendingRequests.set(correlationId, { resolve, reject, timeoutId });

            // Send the request with correlation ID
            this.context.send(this.requestRouter, {
                ...message,
                correlationId
            } as RequestMessage).catch((error: Error) => {
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
            throw new Error('Request router not initialized');
        }

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
    }

    public async setNormalPriorityHandler(handler: MessageHandler): Promise<void> {
        if (!this.requestRouter) {
            throw new Error('Request router not initialized');
        }

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
    }

    protected async initialize(): Promise<void> {
        if (this.initialized) {
            return;
        }

        try {
            // Create initial routees for request router
            const requestRoutee = await this.context.system.spawn({
                producer: (context: ActorContext) => new RequestHandlerActor(context)
            });

            // Create initial routees for subscription router
            const subscriptionRoutee = await this.context.system.spawn({
                producer: (context: ActorContext) => new SubscriptionHandlerActor(context)
            });

            // Create request router with round-robin strategy
            const requestRouter = createRouter('round-robin', {
                system: this.context.system,
                routees: [requestRoutee],
                routingConfig: {
                    createRoutee: async (system) => {
                        return await system.spawn({
                            producer: (context: ActorContext) => new RequestHandlerActor(context)
                        });
                    }
                }
            });

            // Create subscription router with broadcast strategy
            const subscriptionRouter = createRouter('broadcast', {
                system: this.context.system,
                routees: [subscriptionRoutee],
                routingConfig: {
                    createRoutee: async (system) => {
                        return await system.spawn({
                            producer: (context: ActorContext) => new SubscriptionHandlerActor(context)
                        });
                    }
                }
            });

            // Spawn routers
            this.requestRouter = await this.context.spawn({
                producer: () => requestRouter
            });

            this.subscriptionRouter = await this.context.spawn({
                producer: () => subscriptionRouter
            });

            this.initialized = true;
            log.info('MessageBus initialized successfully');
        } catch (error) {
            log.error('Failed to initialize MessageBus', {
                error: error instanceof Error ? error.message : 'Unknown error'
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