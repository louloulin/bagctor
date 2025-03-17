/**
 * @bactor/http Type Declarations
 */

import { ActorContext } from '@bactor/core';

// Fix Timer vs Timeout issue by extending NodeJS namespace
declare global {
    interface Timer {
        [Symbol.dispose](): void;
        unref(): Timer;
        ref(): Timer;
        refresh(): Timer;
        hasRef(): boolean;
    }
}

// Add missing imports that would normally come from @bactor/core
declare module '@bactor/core' {
    export interface Message {
        type: string;
        [key: string]: any;
    }

    export interface ActorContext {
        mailbox: any;
        system: ActorSystem;
        self: ActorRef;
        parent: ActorRef;
        children: ActorRef[];
        // Other required properties
        [key: string]: any;
        tell(callback: (sender: ActorRef) => any): void;
    }

    export interface ActorRef {
        id: string;
        tell(message: Message, callback?: (response: any) => void): void;
        send(message: Message): Promise<void>;
    }

    export interface ActorSystem {
        actorOf(factory: () => any): ActorRef;
        createActor(actorClass: any, options: any): Promise<ActorRef>;
        context: ActorContext;
        getActor(id: string): Actor<Message, any> | undefined;
    }

    export abstract class Actor<TMessage extends Message = Message, TState = any> {
        protected context: ActorContext;
        protected state: TState;

        constructor(context: ActorContext, initialState?: TState);

        protected abstract behaviors(): void;
        protected addBehavior(state: string, handler: (message: TMessage) => Promise<any> | any): void;
        protected become(state: string): void;
        receive(message: TMessage): Promise<any>;
        tell(message: Message, callback?: (response: any) => void): void;
    }

    export function createActor(actorClass: any, options: any): ActorRef;
}

// Core HTTP types
export interface HttpRequest {
    method: string;
    url: string;
    headers: Headers;
    body?: any;
    [key: string]: any;
}

export interface HttpResponse {
    statusCode: number;
    headers: Map<string, string>;
    body: string | Uint8Array | ReadableStream | null;
    setHeader(name: string, value: string): void;
    getHeader(name: string): string | null;
    removeHeader(name: string): void;
    end(data?: string | Uint8Array): void;
    [key: string]: any;
}

// Router interfaces
export interface RadixTreeRouter {
    insert(path: string, handler: any): void;
    lookup(path: string): any;
    routeCount: number;
}

export interface OptimizedRouter {
    addRoute(config: RouteConfig): void;
    handle(request: HttpRequest, response: HttpResponse): Promise<boolean>;
    routeCount: number;
    cacheHits: number;
    cacheMisses: number;
}

/**
 * HTTP路由配置
 */
export interface RouteConfig {
    /**
     * HTTP方法
     */
    method: string;

    /**
     * 路由路径
     */
    path: string;

    /**
     * 处理函数
     */
    handler: HandlerFunction;

    /**
     * 中间件列表
     */
    middleware?: MiddlewareFunction[];
}

// Handler and middleware types
export type HandlerFunction = (req: HttpRequest, params?: any) => any;
export type MiddlewareFunction = (req: HttpRequest, res: HttpResponse, next: () => Promise<void>) => Promise<void>;

// Reactor pool types
/**
 * 多反应器池配置选项
 */
export interface MultiReactorPoolOptions {
    /**
     * 反应器数量
     */
    reactorCount?: number;

    /**
     * 负载均衡策略
     */
    balancingStrategy?: 'round-robin' | 'least-busy' | 'consistent-hash';

    /**
     * 日志配置
     */
    logging?: {
        enabled: boolean;
        level: 'debug' | 'info' | 'warn' | 'error';
    };
}

// Server configuration
export interface ServerOptions {
    port?: number;
    hostname?: string;
    tls?: {
        cert: string;
        key: string;
    };
    [key: string]: any;
}

export interface HttpServerConfig extends ServerOptions {
    routerOptions?: any;
    logging?: {
        enabled: boolean;
        level: 'debug' | 'info' | 'warn' | 'error';
    };
}

// AdaptivePoolOptions interface
export interface AdaptivePoolOptions {
    initialSize: number;
    maxSize: number;
    growthFactor?: number;
    shrinkFactor?: number;
    adaptiveResizing?: boolean;
    minSize?: number;
    waiting?: number;
    // Other required properties
}

// AdaptivePoolStats interface
export interface AdaptivePoolStats {
    active: number;
    size: number;
    waiting: number;
    activeObjects: number;
}

// Server types
export interface HttpServer {
    server: any;
    router: any;
    middlewareManagerPid: any;
    config: any;
    [key: string]: any;
}

export interface HttpActorSystem {
    serverActorPid: any;
    config: any;
    start(): Promise<void>;
    stop(): Promise<void>;
    [key: string]: any;
}

export interface TestSenderActor {
    lastMessage: any;
    [key: string]: any;
}

// Message interfaces
export interface Message {
    type: string;
    [key: string]: any;
}

export interface HttpServerMessage extends Message {
    type: string;
    // Define specific message types
    path?: string;
    method?: string;
    handler?: HandlerFunction;
    middleware?: MiddlewareFunction[];
    config?: RouteConfig;
    configs?: RouteConfig[];
    options?: AdaptivePoolOptions;
    factor?: number;
}

export { }; 