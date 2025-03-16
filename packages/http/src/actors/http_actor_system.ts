import { Actor, ActorSystem, ActorContext, PID, Props } from '@bactor/core';
import { HttpServerActor } from './server_actor';
import { RouteGroupConfig } from './router_actor';

export interface HttpActorSystemProps {
    port?: number;
    hostname?: string;
}

/**
 * The central actor system for HTTP components
 * Manages server instances and provides a clean API for HTTP functionality
 */
export class HttpActorSystem extends Actor {
    private serverActorPid: PID | null = null;
    private config: { port: number; hostname: string };

    constructor(context: ActorContext, props?: HttpActorSystemProps) {
        super(context);
        this.config = {
            port: props?.port || 3000,
            hostname: props?.hostname || 'localhost'
        };
    }

    async preStart(): Promise<void> {
        // Create the server actor
        try {
            this.serverActorPid = await this.context.spawn({
                actorClass: HttpServerActor,
                // Pass server configuration as constructor args for HttpServerActor
                actorContext: {
                    port: this.config.port,
                    hostname: this.config.hostname
                }
            });
            console.log(`[HttpActorSystem] Created server actor with PID: ${this.serverActorPid.id}`);
        } catch (error) {
            console.error('[HttpActorSystem] Failed to create server actor:', error);
            throw error;
        }
    }

    protected behaviors(): void {
        this.addBehavior('default', async (msg) => {
            console.log(`[HttpActorSystem] Received message: ${msg.type}`);

            if (msg.type === 'http.start' && this.serverActorPid) {
                await this.context.send(this.serverActorPid, {
                    type: 'http.start',
                    sender: this.context.self
                });
            }
            else if (msg.type === 'http.stop' && this.serverActorPid) {
                await this.context.send(this.serverActorPid, {
                    type: 'http.stop',
                    sender: this.context.self
                });
            }
            else if (msg.type === 'http.addRoute' && this.serverActorPid) {
                await this.context.send(this.serverActorPid, {
                    type: 'http.addRoute',
                    payload: msg.payload,
                    sender: this.context.self
                });
            }
            else if (msg.type === 'http.addRouteGroup' && this.serverActorPid) {
                await this.context.send(this.serverActorPid, {
                    type: 'http.addRouteGroup',
                    payload: msg.payload,
                    sender: this.context.self
                });
            }
            else if (msg.type === 'http.addMiddleware' && this.serverActorPid) {
                await this.context.send(this.serverActorPid, {
                    type: 'http.addMiddleware',
                    payload: msg.payload,
                    sender: this.context.self
                });
            }
        });
    }

    /**
     * Start the HTTP server
     */
    async start(): Promise<void> {
        await this.context.send(this.context.self, {
            type: 'http.start',
            sender: this.context.self
        });
    }

    /**
     * Stop the HTTP server
     */
    async stop(): Promise<void> {
        await this.context.send(this.context.self, {
            type: 'http.stop',
            sender: this.context.self
        });
    }

    /**
     * Add a route to the HTTP server
     * @param route Route configuration
     */
    async addRoute(route: any): Promise<void> {
        await this.context.send(this.context.self, {
            type: 'http.addRoute',
            payload: route,
            sender: this.context.self
        });
    }

    /**
     * Add a route group to the HTTP server
     * @param routeGroup Route group configuration
     */
    async addRouteGroup(routeGroup: RouteGroupConfig): Promise<void> {
        await this.context.send(this.context.self, {
            type: 'http.addRouteGroup',
            payload: routeGroup,
            sender: this.context.self
        });
    }

    /**
     * Add middleware to the HTTP server
     * @param middleware Middleware configuration
     */
    async addMiddleware(middleware: any): Promise<void> {
        await this.context.send(this.context.self, {
            type: 'http.addMiddleware',
            payload: middleware,
            sender: this.context.self
        });
    }
}

/**
 * Create a new HTTP actor system
 * @param system Actor system to use
 * @param props Configuration properties
 * @returns Promise resolving to the HttpActorSystem instance
 */
export async function createHttpSystem(system: ActorSystem, props?: HttpActorSystemProps): Promise<HttpActorSystem> {
    // Create props for the HTTP actor system
    const httpSystemProps: Props = {
        actorClass: HttpActorSystem,
        actorContext: props
    };

    // Spawn the HTTP actor system
    const httpSystemRef = await system.spawn(httpSystemProps);

    // Get the actor reference
    const httpSystem = system.getActor(httpSystemRef.id) as HttpActorSystem;
    return httpSystem;
} 