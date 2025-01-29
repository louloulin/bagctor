import {
    RouterConfig,
    Message as CoreMessage,
    RouterType,
    Actor,
    PID,
    ActorContext,
    createRouter,
    IRouter
} from '@bactor/core';
import { log } from '@bactor/core/src/utils/logger';
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

// Re-export core router types
export { RouterConfig, RouterType, IRouter };

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

class HandlerActor extends Actor {
    constructor(context: ActorContext) {
        super(context);
        this.initialize();
    }

    protected behaviors(): void {
        this.addBehavior('default', async (message: CoreMessage) => {
            const busMessage = convertCoreMessage(message);
            const traceCtx: ExtendedTraceContext = {
                traceId: busMessage.traceId || generateTraceId(),
                spanId: generateSpanId(),
                parentSpanId: busMessage.spanId,
                timestamp: Date.now(),
                operation: 'handle_message',
                correlationId: busMessage.correlationId
            };

            try {
                const { type, payload } = busMessage;
                const priority = (payload as any)?.priority || 'normal';

                // 根据消息类型和优先级处理
                if (type === 'PUBLISH') {
                    await this.handlePublish(payload, priority, traceCtx);
                } else if (type === 'SUBSCRIBE') {
                    await this.handleSubscribe(payload, traceCtx);
                } else if (type === 'REQUEST') {
                    await this.handleRequest(payload, traceCtx);
                }

                log.info('Message handled successfully', {
                    traceId: traceCtx.traceId,
                    type,
                    priority
                });
            } catch (error) {
                log.error('Failed to handle message', {
                    traceId: traceCtx.traceId,
                    error: error instanceof Error ? error.message : 'Unknown error'
                });
                throw error;
            }
        });
    }

    private async handlePublish(payload: any, priority: string, traceCtx: ExtendedTraceContext): Promise<void> {
        const { message } = payload;
        if (!message) {
            throw new Error('Invalid publish payload');
        }

        // 根据优先级处理消息
        if (priority === 'high') {
            await this.handleHighPriorityMessage(message, traceCtx);
        } else {
            await this.handleNormalPriorityMessage(message, traceCtx);
        }
    }

    private async handleSubscribe(payload: any, traceCtx: ExtendedTraceContext): Promise<void> {
        const { pattern, handler } = payload;
        if (!pattern || !handler) {
            throw new Error('Invalid subscribe payload');
        }

        // 注册订阅处理器
        await this.context.send(this.context.parent, {
            type: 'REGISTER_HANDLER',
            payload: {
                pattern,
                handler
            },
            traceId: traceCtx.traceId
        });
    }

    private async handleRequest(payload: any, traceCtx: ExtendedTraceContext): Promise<void> {
        const { request, timeout } = payload;
        if (!request) {
            throw new Error('Invalid request payload');
        }

        // 处理请求
        const response = await Promise.race([
            this.processRequest(request),
            new Promise((_, reject) => setTimeout(() => reject(new Error('Request timed out')), timeout || 3000))
        ]);

        // 发送响应
        await this.context.send(this.context.sender, {
            type: 'RESPONSE',
            payload: response,
            traceId: traceCtx.traceId
        });
    }

    private async handleHighPriorityMessage(message: any, traceCtx: ExtendedTraceContext): Promise<void> {
        // 高优先级消息处理逻辑
        log.info('Processing high priority message', {
            traceId: traceCtx.traceId,
            message
        });

        // 调用注册的高优先级处理器
        const handler = (this.context.parent as MessageBusActor).getHighPriorityHandler();
        if (handler) {
            await handler(message);
        }
    }

    private async handleNormalPriorityMessage(message: any, traceCtx: ExtendedTraceContext): Promise<void> {
        // 普通优先级消息处理逻辑
        log.info('Processing normal priority message', {
            traceId: traceCtx.traceId,
            message
        });

        // 调用注册的普通优先级处理器
        const handler = (this.context.parent as MessageBusActor).getNormalPriorityHandler();
        if (handler) {
            await handler(message);
        }
    }

    private async processRequest(request: any): Promise<any> {
        // 请求处理逻辑
        return { success: true, data: request };
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
    private subscriptionRouter: PID | null = null;
    private requestRouter: PID | null = null;
    private routerConfigs: Map<string, RouterConfig> = new Map();
    private subscriptions: Map<string, MessageHandler> = new Map();
    private highPriorityHandler?: MessageHandler;
    private normalPriorityHandler?: MessageHandler;
    private metrics: MessageBusMetrics = {
        messageCount: 0,
        errorCount: 0,
        avgProcessingTime: 0,
        lastProcessingTimes: new Array(100).fill(0),
        currentIndex: 0
    };

    constructor(context: ActorContext) {
        super(context);
        this.initialize().catch(error => {
            log.error('Failed to initialize MessageBus', {
                error: error instanceof Error ? error.message : 'Unknown error'
            });
            throw error;
        });
    }

    protected async initialize(): Promise<void> {
        try {
            await this.initializeRouters();
            log.info('MessageBus initialized successfully');
        } catch (error) {
            log.error('Failed to initialize MessageBus', {
                error: error instanceof Error ? error.message : 'Unknown error'
            });
            throw error;
        }
    }

    private async initializeRouters(): Promise<void> {
        // Initialize subscription router
        this.subscriptionRouter = await this.context.spawn({
            producer: (context: ActorContext) => new RouterActor(context)
        });

        // Initialize request router
        this.requestRouter = await this.context.spawn({
            producer: (context: ActorContext) => new RouterActor(context)
        });

        log.debug('Routers initialized', {
            subscriptionRouter: this.subscriptionRouter?.id,
            requestRouter: this.requestRouter?.id
        });
    }

    protected behaviors(): void {
        // Handle router messages
        this.addBehavior('router', async (message: CoreMessage) => {
            const busMessage = convertCoreMessage(message);
            const traceCtx = this.createTraceContext('router.handle', busMessage);
            try {
                if (!isRouterMessage(busMessage)) {
                    throw new Error('Invalid router message');
                }

                log.debug('Router handling message', {
                    traceId: traceCtx.traceId,
                    type: busMessage.type,
                    routerId: busMessage.payload.routerId
                });

                await this.handleRouterMessage(busMessage, traceCtx);
            } catch (error) {
                log.error('Failed to handle router message', {
                    traceId: traceCtx.traceId,
                    error: error instanceof Error ? error.message : 'Unknown error'
                });
                throw error;
            }
        });

        // Handle regular messages
        this.addBehavior('default', async (message: CoreMessage) => {
            const busMessage = convertCoreMessage(message);
            const traceCtx = this.createTraceContext('message.handle', busMessage);
            const startTime = performance.now();

            try {
                log.debug('Handling message', {
                    traceId: traceCtx.traceId,
                    type: busMessage.type
                });

                if (isPublishMessage(busMessage)) {
                    await this.handlePublish(busMessage, traceCtx);
                } else if (isSubscribeMessage(busMessage)) {
                    await this.handleSubscribe(busMessage, traceCtx);
                } else if (isRequestMessage(busMessage)) {
                    await this.handleRequest(busMessage, traceCtx);
                } else if (isRegisterHandlerMessage(busMessage)) {
                    await this.handleRegisterHandler(busMessage, traceCtx);
                } else {
                    throw new Error(`Unsupported message type: ${busMessage.type}`);
                }

                const processingTime = performance.now() - startTime;
                this.updateMetrics(processingTime, false);
            } catch (error) {
                const processingTime = performance.now() - startTime;
                this.updateMetrics(processingTime, true);

                log.error('Failed to handle message', {
                    traceId: traceCtx.traceId,
                    error: error instanceof Error ? error.message : 'Unknown error'
                });
                throw error;
            }
        });
    }

    private createTraceContext(operation: string, message: BusMessage): TraceContext {
        return {
            traceId: message.traceId || crypto.randomUUID(),
            spanId: crypto.randomUUID(),
            parentSpanId: message.spanId,
            timestamp: Date.now(),
            operation
        };
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

    private async handleRouterMessage(message: RouterMessage, traceCtx: TraceContext): Promise<void> {
        switch (message.type) {
            case RouterMessageTypes.SET_ROUTER:
                if (!message.payload.routerConfig?.router) {
                    throw new Error('Router not provided in router.set message');
                }
                await this.setRouter(message.payload.routerConfig.router, traceCtx);
                break;

            case RouterMessageTypes.ADD_ROUTEE:
                if (!message.payload.routee) {
                    throw new Error('Routee not provided in router.add-routee message');
                }
                await this.addRoutee(message.payload.routee, traceCtx);
                break;

            case RouterMessageTypes.REMOVE_ROUTEE:
                if (!message.payload.routee) {
                    throw new Error('Routee not provided in router.remove-routee message');
                }
                await this.removeRoutee(message.payload.routee, traceCtx);
                break;

            default:
                throw new Error(`Unsupported router message type: ${message.type}`);
        }
    }

    private async handlePublish(message: PublishMessage, traceCtx: TraceContext): Promise<void> {
        if (!this.subscriptionRouter) {
            throw new Error('Subscription router not initialized');
        }

        const { payload: publishedMessage } = message;
        const matchingSubscriptions = Array.from(this.subscriptions.entries())
            .filter(([_, handler]) => this.matchesFilter(publishedMessage, handler))
            .map(([id, _]) => id);

        if (matchingSubscriptions.length === 0) {
            log.warn('No matching subscriptions found', {
                traceId: traceCtx.traceId,
                messageType: publishedMessage.type
            });
            return;
        }

        await Promise.all(
            matchingSubscriptions.map(async (subscriptionId) => {
                const handler = this.subscriptions.get(subscriptionId);
                if (handler) {
                    try {
                        await handler(publishedMessage);
                    } catch (error) {
                        log.error('Failed to handle published message', {
                            traceId: traceCtx.traceId,
                            subscriptionId,
                            error: error instanceof Error ? error.message : 'Unknown error'
                        });
                    }
                }
            })
        );
    }

    private async handleSubscribe(message: SubscribeMessage, traceCtx: TraceContext): Promise<void> {
        const { filter, handler } = message.payload;
        const subscriptionId = crypto.randomUUID();

        this.subscriptions.set(subscriptionId, handler);
        log.debug('Subscription registered', {
            traceId: traceCtx.traceId,
            subscriptionId,
            filter
        });
    }

    private async handleRequest(message: RequestMessage, traceCtx: TraceContext): Promise<void> {
        if (!this.requestRouter) {
            throw new Error('Request router not initialized');
        }

        const { request, timeout = 5000 } = message.payload;
        const requestId = crypto.randomUUID();

        try {
            const response = await Promise.race([
                new Promise((_, reject) =>
                    setTimeout(() => reject(new Error(`Request timed out after ${timeout}ms`)), timeout)
                ),
                this.processRequest(request, requestId, traceCtx)
            ]);

            if (message.sender) {
                await this.context.send(message.sender, {
                    type: 'REQUEST_RESPONSE' as MessageType,
                    payload: response,
                    correlationId: message.correlationId
                });
            }
        } catch (error) {
            log.error('Failed to handle request', {
                traceId: traceCtx.traceId,
                requestId,
                error: error instanceof Error ? error.message : 'Unknown error'
            });
            throw error;
        }
    }

    private async handleRegisterHandler(message: RegisterHandlerMessage, traceCtx: TraceContext): Promise<void> {
        const { handler, priority } = message.payload;

        if (priority === 'high') {
            this.highPriorityHandler = handler;
        } else {
            this.normalPriorityHandler = handler;
        }

        log.debug('Handler registered', {
            traceId: traceCtx.traceId,
            priority
        });
    }

    private async processRequest(request: BusMessage, requestId: string, traceCtx: TraceContext): Promise<any> {
        const startTime = performance.now();

        try {
            if (request.priority === 'high' && this.highPriorityHandler) {
                await this.highPriorityHandler(request);
            } else if (this.normalPriorityHandler) {
                await this.normalPriorityHandler(request);
            } else {
                throw new Error('No handler available for request');
            }

            const processingTime = performance.now() - startTime;
            this.updateMetrics(processingTime, false);

            return {
                success: true,
                requestId,
                processingTime
            };
        } catch (error) {
            const processingTime = performance.now() - startTime;
            this.updateMetrics(processingTime, true);

            log.error('Failed to process request', {
                traceId: traceCtx.traceId,
                requestId,
                error: error instanceof Error ? error.message : 'Unknown error'
            });
            throw error;
        }
    }

    private matchesFilter(message: BusMessage, handler: MessageHandler): boolean {
        // TODO: Implement filter matching logic
        return true;
    }

    private async setRouter(router: IRouter, traceCtx: TraceContext): Promise<void> {
        // TODO: Implement router setting logic
        log.debug('Setting router', {
            traceId: traceCtx.traceId,
            routerType: router.constructor.name
        });
    }

    private async addRoutee(routee: PID, traceCtx: TraceContext): Promise<void> {
        // TODO: Implement routee addition logic
        log.debug('Adding routee', {
            traceId: traceCtx.traceId,
            routeeId: routee.id
        });
    }

    private async removeRoutee(routee: PID, traceCtx: TraceContext): Promise<void> {
        // TODO: Implement routee removal logic
        log.debug('Removing routee', {
            traceId: traceCtx.traceId,
            routeeId: routee.id
        });
    }

    public getHighPriorityHandler(): MessageHandler | undefined {
        return this.highPriorityHandler;
    }

    public getNormalPriorityHandler(): MessageHandler | undefined {
        return this.normalPriorityHandler;
    }

    public setHighPriorityHandler(handler: MessageHandler): void {
        this.highPriorityHandler = handler;
    }

    public setNormalPriorityHandler(handler: MessageHandler): void {
        this.normalPriorityHandler = handler;
    }

    public async publish(message: BusMessage): Promise<void> {
        const traceCtx = this.createTraceContext('publish', message);
        await this.handlePublish(message as PublishMessage, traceCtx);
    }

    public async subscribe(pattern: string, handler: MessageHandler): Promise<() => void> {
        const message: SubscribeMessage = {
            type: 'SUBSCRIBE',
            payload: {
                filter: { type: pattern },
                handler
            }
        };
        const traceCtx = this.createTraceContext('subscribe', message);
        await this.handleSubscribe(message, traceCtx);
        return () => {
            // TODO: Implement unsubscribe
        };
    }

    public async request(message: BusMessage, timeout: number = 5000): Promise<any> {
        const traceCtx = this.createTraceContext('request', message);
        return this.handleRequest(message as RequestMessage, traceCtx);
    }

    public clear(): void {
        const clearMessage: RegisterHandlerMessage = {
            type: BusMessageTypes.REGISTER_HANDLER,
            payload: {
                handler: async () => { },
                priority: 'normal'
            }
        };
        const traceCtx = this.createTraceContext('clear', clearMessage);
        this.context.send(this.context.self, {
            type: BusMessageTypes.REGISTER_HANDLER,
            payload: {
                handler: async () => { },
                priority: 'normal'
            }
        });
    }
} 