import { Actor, ActorContext, PID, Props } from '@bactor/core';
import type { Server } from 'bun';
import { RouterActor } from './router_actor';
import { MiddlewareManagerActor } from './middleware/middleware_manager_actor';
import { HttpRequest, HttpResponse } from '../types';

export interface HttpServerProps extends Props {
    port?: number;
    hostname?: string;
}

/**
 * HTTP Server Actor
 * Handles incoming HTTP requests and manages the router and middleware chain
 */
export class HttpServerActor extends Actor {
    private server: Server | null = null;
    private routerActorPid: PID | null = null;
    private middlewareManagerPid: PID | null = null;
    private config: { port: number; hostname: string };
    private middlewareResolver: ((value: HttpResponse | null) => void) | null = null;

    constructor(context: ActorContext, props?: HttpServerProps) {
        super(context);
        this.config = {
            port: props?.port || 3000,
            hostname: props?.hostname || 'localhost'
        };
    }

    async preStart(): Promise<void> {
        try {
            // Create router actor
            this.routerActorPid = await this.context.spawn({
                actorClass: RouterActor
            });

            console.log(`[HttpServerActor] Created router actor with PID: ${this.routerActorPid.id}`);

            // Create middleware manager actor
            this.middlewareManagerPid = await this.context.spawn({
                actorClass: MiddlewareManagerActor
            });

            console.log(`[HttpServerActor] Created middleware manager with PID: ${this.middlewareManagerPid.id}`);
        } catch (error) {
            console.error('[HttpServerActor] Error creating child actors:', error);
            throw error;
        }
    }

    protected behaviors(): void {
        this.addBehavior('default', async (msg) => {
            console.log(`[HttpServerActor] Received message: ${msg.type}`);

            if (msg.type === 'http.start') {
                await this.startServer();
            }
            else if (msg.type === 'http.stop') {
                await this.stopServer();
            }
            else if (msg.type === 'http.addRoute' && this.routerActorPid) {
                await this.context.send(this.routerActorPid, {
                    type: 'router.addRoute',
                    payload: msg.payload,
                    sender: this.context.self
                });
            }
            else if (msg.type === 'http.addRouteGroup' && this.routerActorPid) {
                await this.context.send(this.routerActorPid, {
                    type: 'router.addRouteGroup',
                    payload: msg.payload,
                    sender: this.context.self
                });
            }
            else if (msg.type === 'http.addMiddleware' && this.middlewareManagerPid) {
                await this.context.send(this.middlewareManagerPid, {
                    type: 'middleware.add',
                    payload: msg.payload,
                    sender: this.context.self
                });
            }
            else if (msg.type === 'middleware.complete') {
                console.log('[HttpServerActor] Warning: Received middleware.complete in default behavior');
            }
        });

        this.addBehavior('await_middleware', async (msg) => {
            console.log(`[HttpServerActor] Received message in await_middleware: ${msg.type}`);

            if (msg.type === 'middleware.complete' && this.middlewareResolver) {
                console.log('[HttpServerActor] Middleware processing complete, payload:', msg.payload);
                const resolver = this.middlewareResolver;
                this.middlewareResolver = null;
                this.become('default');
                resolver(msg.payload as HttpResponse | null);
            } else {
                console.log('[HttpServerActor] Unexpected message in await_middleware:', msg.type);
            }
        });
    }

    private async startServer(): Promise<void> {
        if (this.server) {
            console.log('[HttpServerActor] Server already running');
            return;
        }

        const { port, hostname } = this.config;

        this.server = Bun.serve({
            port,
            hostname,
            fetch: async (request: Request) => {
                console.log(`[HttpServerActor] Received ${request.method} request to ${request.url}`);

                const httpRequest: HttpRequest = {
                    method: request.method,
                    url: new URL(request.url).pathname,
                    headers: request.headers,
                    body: request.body,
                    state: new Map()
                };

                try {
                    // Process middleware first
                    if (this.middlewareManagerPid) {
                        console.log('[HttpServerActor] Processing middleware...');
                        const middlewareResponse = await this.processMiddleware(httpRequest);

                        // If middleware handled the request, return its response
                        if (middlewareResponse) {
                            console.log('[HttpServerActor] Request handled by middleware');
                            return new Response(middlewareResponse.body, {
                                status: middlewareResponse.status,
                                headers: middlewareResponse.headers
                            });
                        }
                    }

                    // Process route handler if middleware didn't handle it
                    if (this.routerActorPid) {
                        console.log('[HttpServerActor] Processing route handler');
                        const routeResponse = await this.processRoute(httpRequest);

                        // Add any headers from middleware state
                        if (routeResponse && routeResponse.headers && httpRequest.state) {
                            // Add CORS headers if present
                            const corsHeaders = httpRequest.state.get('cors');
                            if (corsHeaders) {
                                Object.entries(corsHeaders).forEach(([key, value]) => {
                                    routeResponse.headers.set(key, value as string);
                                });
                            }
                        }

                        console.log('[HttpServerActor] Returning response from router');
                        return new Response(routeResponse.body, {
                            status: routeResponse.status,
                            headers: routeResponse.headers
                        });
                    }

                    // Fallback if no router
                    return new Response(JSON.stringify({ error: 'Not Found' }), {
                        status: 404,
                        headers: { 'Content-Type': 'application/json' }
                    });
                } catch (error) {
                    console.error('[HttpServerActor] Error processing request:', error);
                    return new Response(JSON.stringify({ error: 'Internal Server Error' }), {
                        status: 500,
                        headers: { 'Content-Type': 'application/json' }
                    });
                }
            }
        });

        console.log(`[HttpServerActor] Server running at http://${hostname}:${port}`);
    }

    private async stopServer(): Promise<void> {
        if (this.server) {
            this.server.stop();
            this.server = null;
            console.log('[HttpServerActor] Server stopped');
        }
    }

    private async processMiddleware(httpRequest: HttpRequest): Promise<HttpResponse | null> {
        if (!this.middlewareManagerPid) {
            return null;
        }

        return new Promise<HttpResponse | null>((resolve, reject) => {
            let isResolved = false;
            const timeoutId = setTimeout(() => {
                if (this.middlewareResolver && !isResolved) {
                    console.log('[HttpServerActor] Middleware timeout');
                    const resolver = this.middlewareResolver;
                    this.middlewareResolver = null;
                    this.become('default');
                    isResolved = true;
                    resolver({
                        status: 504,
                        headers: new Headers({ 'Content-Type': 'application/json' }),
                        body: JSON.stringify({ error: 'Gateway Timeout' })
                    });
                }
            }, 5000);

            this.middlewareResolver = (response: HttpResponse | null) => {
                if (!isResolved) {
                    clearTimeout(timeoutId);
                    isResolved = true;
                    resolve(response);
                } else {
                    console.log('[HttpServerActor] Warning: Middleware resolver called after timeout');
                }
            };

            this.become('await_middleware');

            this.context.send(this.middlewareManagerPid!, {
                type: 'middleware.process',
                payload: httpRequest,
                sender: this.context.self
            }).catch((error: Error) => {
                if (!isResolved) {
                    clearTimeout(timeoutId);
                    isResolved = true;
                    this.become('default');
                    this.middlewareResolver = null;
                    reject(error);
                }
            });
        });
    }

    private async processRoute(httpRequest: HttpRequest): Promise<HttpResponse> {
        if (!this.routerActorPid) {
            return {
                status: 404,
                headers: new Headers({ 'Content-Type': 'application/json' }),
                body: JSON.stringify({ error: 'Router not available' })
            };
        }

        return new Promise<HttpResponse>((resolve, reject) => {
            this.context.request(this.routerActorPid!, {
                type: 'router.handle',
                payload: httpRequest,
                sender: this.context.self
            }, 5000)
                .then((response) => {
                    if (response && response.type === 'router.response') {
                        resolve(response.payload as HttpResponse);
                    } else {
                        reject(new Error('Invalid response from router'));
                    }
                })
                .catch((error) => {
                    console.error('[HttpServerActor] Error processing route:', error);
                    reject(error);
                });
        });
    }
} 