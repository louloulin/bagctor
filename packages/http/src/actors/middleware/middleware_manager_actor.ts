import { Actor, ActorContext, PID } from '@bactor/core';
import { HttpRequest, HttpResponse } from '../../types';
import { MiddlewareContext, MiddlewareResult } from './middleware_types';

/**
 * Middleware Manager Actor
 * Manages the middleware chain and processes HTTP requests through middleware
 */
export class MiddlewareManagerActor extends Actor {
    private middlewares: PID[] = [];
    private currentContext: MiddlewareContext | null = null;
    private currentMiddlewareIndex: number = 0;
    private originalSender: PID | undefined;

    constructor(context: ActorContext) {
        super(context);
        console.log('[MiddlewareManagerActor] Initializing');
    }

    protected behaviors(): void {
        this.addBehavior('default', async (msg) => {
            console.log(`[MiddlewareManagerActor] Received message: ${msg.type}`);

            if (msg.type === 'middleware.add') {
                // Add middleware to the chain
                this.middlewares.push(msg.payload as PID);
                console.log(`[MiddlewareManagerActor] Added middleware: ${(msg.payload as PID).id}`);
                console.log(`[MiddlewareManagerActor] Current middleware chain: ${this.middlewares.length} middleware(s)`);
            }
            else if (msg.type === 'middleware.process') {
                // Process request through middleware chain
                console.log('[MiddlewareManagerActor] Processing middleware chain');

                // Initialize context
                this.currentContext = {
                    request: msg.payload as HttpRequest,
                    state: new Map()
                };
                this.currentMiddlewareIndex = 0;
                this.originalSender = msg.sender;

                if (this.middlewares.length > 0) {
                    console.log(`[MiddlewareManagerActor] Starting middleware chain with ${this.middlewares.length} middleware(s)`);
                    try {
                        await this.processNextMiddleware();
                    } catch (error) {
                        console.error('[MiddlewareManagerActor] Error processing middleware:', error);
                        if (this.originalSender) {
                            await this.context.send(this.originalSender, {
                                type: 'middleware.complete',
                                payload: null,
                                sender: this.context.self
                            });
                        }
                        this.resetState();
                    }
                } else {
                    console.log('[MiddlewareManagerActor] No middlewares registered, completing chain');
                    if (this.originalSender) {
                        await this.context.send(this.originalSender, {
                            type: 'middleware.complete',
                            payload: null,
                            sender: this.context.self
                        });
                    }
                    this.resetState();
                }
            }
            else if (msg.type === 'middleware.result') {
                console.log('[MiddlewareManagerActor] Received middleware result');

                const result = msg.payload as MiddlewareResult;
                console.log(`[MiddlewareManagerActor] Result handled: ${result.handled}`);

                if (!this.currentContext) {
                    console.log('[MiddlewareManagerActor] No current context, ignoring result');
                    return;
                }

                // Update context with middleware result
                this.currentContext.response = result.context.response;
                this.currentContext.state = result.context.state;

                // Check if middleware handled the request or if we've reached the end of the chain
                if (result.handled || this.currentMiddlewareIndex >= this.middlewares.length) {
                    console.log('[MiddlewareManagerActor] Middleware chain complete');

                    if (this.originalSender) {
                        try {
                            await this.context.send(this.originalSender, {
                                type: 'middleware.complete',
                                payload: result.handled ? this.currentContext.response : null,
                                sender: this.context.self
                            });
                            console.log('[MiddlewareManagerActor] Complete message sent');
                        } catch (error) {
                            console.error('[MiddlewareManagerActor] Error sending complete message:', error);
                        }
                    }
                    this.resetState();
                } else {
                    console.log('[MiddlewareManagerActor] Processing next middleware');
                    try {
                        await this.processNextMiddleware();
                    } catch (error) {
                        console.error('[MiddlewareManagerActor] Error processing next middleware:', error);
                        if (this.originalSender) {
                            await this.context.send(this.originalSender, {
                                type: 'middleware.complete',
                                payload: null,
                                sender: this.context.self
                            });
                        }
                        this.resetState();
                    }
                }
            }
        });
    }

    /**
     * Process the next middleware in the chain
     */
    private async processNextMiddleware(): Promise<void> {
        if (!this.currentContext || this.currentMiddlewareIndex >= this.middlewares.length) {
            console.log('[MiddlewareManagerActor] No more middlewares to process');

            // Ensure we complete the chain if we somehow get here
            if (this.originalSender && this.currentContext) {
                try {
                    await this.context.send(this.originalSender, {
                        type: 'middleware.complete',
                        payload: this.currentContext.response || null,
                        sender: this.context.self
                    });
                } catch (error) {
                    console.error('[MiddlewareManagerActor] Error sending final complete message:', error);
                }
            }
            this.resetState();
            return;
        }

        const middleware = this.middlewares[this.currentMiddlewareIndex++];
        console.log(`[MiddlewareManagerActor] Processing middleware ${this.currentMiddlewareIndex} of ${this.middlewares.length}`);

        try {
            await this.context.send(middleware, {
                type: 'process',
                payload: this.currentContext,
                sender: this.context.self
            });
        } catch (error) {
            console.error('[MiddlewareManagerActor] Error sending process message to middleware:', error);
            throw error;
        }
    }

    /**
     * Reset the state after completing middleware chain processing
     */
    private resetState(): void {
        console.log('[MiddlewareManagerActor] Resetting state');
        this.currentContext = null;
        this.currentMiddlewareIndex = 0;
        this.originalSender = undefined;
    }
} 