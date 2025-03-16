import { Actor, Props, PID, ActorContext } from '@bactor/core';
import { HttpRequest, HttpResponse } from '../../types';

/**
 * Context object passed to middleware
 */
export interface MiddlewareContext {
    request: HttpRequest;
    response?: HttpResponse;
    state: Map<string, any>;
}

/**
 * Result returned by middleware
 */
export interface MiddlewareResult {
    context: MiddlewareContext;
    handled: boolean;
}

/**
 * Props for middleware actors
 */
export interface MiddlewareProps extends Props {
    name?: string;
}

/**
 * Message for middleware processing
 */
export interface MiddlewareMessage {
    type: 'process';
    payload: MiddlewareContext;
    sender?: PID;
}

/**
 * Base class for middleware actors
 */
export abstract class MiddlewareActor extends Actor {
    protected name: string;

    constructor(context: ActorContext, props?: MiddlewareProps) {
        super(context);
        this.name = props?.name || 'middleware';
    }

    protected behaviors(): void {
        this.addBehavior('default', async (msg) => {
            console.log(`[${this.name}] Received message: ${msg.type}`);

            if (msg.type === 'process') {
                try {
                    console.log(`[${this.name}] Processing request`);

                    const result = await this.process((msg as MiddlewareMessage).payload);
                    console.log(`[${this.name}] Processing complete, handled: ${result.handled}`);

                    if (msg.sender) {
                        try {
                            await this.context.send(msg.sender, {
                                type: 'middleware.result',
                                payload: result,
                                sender: this.context.self
                            });
                            console.log(`[${this.name}] Result sent successfully`);
                        } catch (error) {
                            console.error(`[${this.name}] Error sending result:`, error);
                            // Try to send error result
                            await this.context.send(msg.sender, {
                                type: 'middleware.result',
                                payload: {
                                    context: (msg as MiddlewareMessage).payload,
                                    handled: false
                                },
                                sender: this.context.self
                            });
                        }
                    }
                } catch (error) {
                    console.error(`[${this.name}] Error processing request:`, error);
                    if (msg.sender) {
                        try {
                            await this.context.send(msg.sender, {
                                type: 'middleware.result',
                                payload: {
                                    context: (msg as MiddlewareMessage).payload,
                                    handled: false
                                },
                                sender: this.context.self
                            });
                        } catch (sendError) {
                            console.error(`[${this.name}] Error sending error result:`, sendError);
                        }
                    }
                }
            }
        });
    }

    /**
     * Process the middleware request
     * @param context Middleware context
     * @returns Middleware result
     */
    protected abstract process(context: MiddlewareContext): Promise<MiddlewareResult>;
} 