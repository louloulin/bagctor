/**
 * Example demonstrating Actor Pools and Supervision Strategies 
 * in a high-performance HTTP API
 * 
 * NOTE: This is a conceptual example that shows how to combine Actor Pools
 * with Supervision Strategies. In a real implementation, you would:
 * 
 * 1. Import the actual types from your implementation:
 *    - ActorPool from '../src/pool/actor_pool'
 *    - SupervisorActor from '../src/supervision/supervisor_actor'
 *    - OneForOneStrategy from '../src/supervision/strategies'
 *    - Proper error classes from '../src/errors'
 * 
 * 2. Define proper type interfaces for your message payloads
 * 
 * 3. Handle messaging properly with appropriate message type checks
 * 
 * The example uses 'as any' type assertions to bypass TypeScript checks
 * for demonstration purposes only.
 */

import { ActorSystem, Actor, ActorContext } from '@bactor/core';
import {
    createHttpSystem,
    HttpResponses
} from '../src';

/**
 * This example demonstrates how to:
 * 1. Create an actor pool for load balancing HTTP requests
 * 2. Implement a supervisor with different strategies for different error types
 * 3. Handle errors in a fault-tolerant way
 */

// Custom error classes for demonstration
class BaseError extends Error {
    constructor(message: string) {
        super(message);
        this.name = this.constructor.name;
    }
}

class TemporaryError extends BaseError { }
class ResourceError extends BaseError { }
class NotFoundError extends BaseError { }

// Type definitions for our example
type Message = any;
type PID = any;
type HttpRequest = any;
type HttpContext = any;
type ActorPool = any;
type SupervisorActor = any;
type OneForOneStrategy = any;

// Worker actor for handling API requests
class ApiWorkerActor extends Actor {
    private database: Map<string, any>;
    private failureRate: number;
    private requestCount: number = 0;

    constructor(context: ActorContext, props?: any) {
        super(context);
        // Simulate a database
        this.database = new Map<string, any>();
        this.database.set('1', { id: '1', name: 'John Doe', email: 'john@example.com' });
        this.database.set('2', { id: '2', name: 'Jane Smith', email: 'jane@example.com' });

        // For demonstration: sometimes workers will fail
        this.failureRate = props?.failureRate || 0.1; // 10% failure rate by default
    }

    protected behaviors(): void {
        this.addBehavior('default', async (msg: Message) => {
            if (msg.type === 'work') {
                this.requestCount++;
                const { request, originalSender } = msg.payload;
                const url = new URL(request.url, 'http://localhost');
                const path = url.pathname;
                const method = request.method;

                console.log(`[Worker ${this.context.self.id}] Processing ${method} ${path} (Request #${this.requestCount})`);

                try {
                    // Randomly fail to demonstrate supervision
                    if (Math.random() < this.failureRate) {
                        if (Math.random() < 0.5) {
                            console.log(`[Worker ${this.context.self.id}] Simulating temporary failure`);
                            throw new TemporaryError('Temporary database connection issue');
                        } else {
                            console.log(`[Worker ${this.context.self.id}] Simulating resource failure`);
                            throw new ResourceError('Out of memory');
                        }
                    }

                    // Process request
                    let response;

                    if (path.startsWith('/api/users')) {
                        const userId = path.split('/')[3];

                        if (method === 'GET') {
                            if (userId) {
                                // Get user by ID
                                const user = this.database.get(userId);
                                if (!user) {
                                    throw new NotFoundError(`User with ID ${userId} not found`);
                                }
                                response = HttpResponses.json(user);
                            } else {
                                // List all users
                                const users = Array.from(this.database.values());
                                response = HttpResponses.json(users);
                            }
                        } else if (method === 'POST') {
                            // Create user (not implemented in this example)
                            response = HttpResponses.json({ message: 'User created' }, 201);
                        } else {
                            response = HttpResponses.json({ error: 'Method not allowed' }, 405);
                        }
                    } else {
                        response = HttpResponses.json({ error: 'Not found' }, 404);
                    }

                    // Send the result back
                    if (msg.sender) {
                        await this.context.send(msg.sender, {
                            type: 'work.complete',
                            payload: {
                                result: response,
                                originalSender
                            },
                            sender: this.context.self
                        });
                    }
                } catch (error: any) {
                    console.error(`[Worker ${this.context.self.id}] Error:`, error);

                    // Send error response first, then throw the error for supervision
                    if (originalSender) {
                        let errorResponse;

                        if (error instanceof NotFoundError) {
                            errorResponse = HttpResponses.json({ error: error.message }, 404);
                        } else {
                            errorResponse = HttpResponses.json({
                                error: 'Internal Server Error',
                                message: error instanceof Error ? error.message : String(error)
                            }, 500);
                        }

                        await this.context.send(originalSender, {
                            type: 'http.response',
                            payload: errorResponse,
                            sender: this.context.self
                        });
                    }

                    // Rethrow the error for the supervisor to handle
                    throw error;
                }
            }
        });
    }
}

// Main function
async function main() {
    // Create actor system
    const system = new ActorSystem('pool-supervision-example');
    const httpSystem = await createHttpSystem(system, {
        port: 3000,
        hostname: 'localhost'
    });

    // Create a supervisor with different strategies for different error types
    // Note: In a real implementation, you would import the actual SupervisorActor class
    const supervisor = await system.spawn({
        actorClass: SupervisorActor as any,
        actorContext: {
            strategy: new (OneForOneStrategy as any)({
                directive: (error: Error) => {
                    console.log(`[Supervisor] Handling error: ${error.name} - ${error.message}`);

                    if (error instanceof TemporaryError) {
                        // For temporary errors, restart the actor
                        return 'restart';
                    } else if (error instanceof ResourceError) {
                        // For resource errors, stop the actor
                        return 'stop';
                    } else if (error instanceof NotFoundError) {
                        // For not found errors, just resume
                        return 'resume';
                    } else {
                        // For other errors, escalate to parent
                        return 'escalate';
                    }
                },
                maxRestarts: 10,
                withinTimeWindow: 60000 // 1 minute
            })
        }
    });

    // Create a pool of API worker actors
    // Note: In a real implementation, you would import the actual ActorPool class
    const workerPool = await system.spawn({
        actorClass: ActorPool as any,
        actorContext: {
            pooledActorClass: ApiWorkerActor,
            poolSize: 5,
            routingStrategy: 'round-robin',
            pooledActorProps: {
                failureRate: 0.2 // 20% chance of failure
            },
            supervise: false // We'll use our custom supervisor instead
        }
    });

    // Get the pool statistics for monitoring
    setInterval(async () => {
        try {
            // Use a dummy PID as sender for the message
            const dummySender = { id: 'dummy', address: 'local' };

            // Note: In a real implementation, you would properly type-check the response
            // and handle it with appropriate types rather than using type assertions
            const response: any = await system.send(workerPool, {
                type: 'pool.stats',
                sender: dummySender
            });

            if (response && typeof response === 'object' && 'payload' in response) {
                const stats = response.payload as { size: number; busy: number };
                console.log(`[Pool Stats] Size: ${stats.size}, Busy: ${stats.busy}`);
            }
        } catch (err) {
            console.error('Failed to get pool stats:', err);
        }
    }, 5000);

    // Tell supervisor to supervise worker pool
    await system.send(supervisor, {
        type: 'supervise',
        payload: { child: workerPool }
    });

    // Add route that uses the worker pool
    await httpSystem.addRoute({
        method: 'GET',
        pattern: '/api/users/:id?',
        handler: async (context: HttpContext) => {
            // Forward the request to the pool
            return new Promise((resolve) => {
                system.send(workerPool, {
                    type: 'work',
                    payload: {
                        request: context.req,
                        originalSender: {
                            resolve: (response: any) => resolve(response)
                        }
                    }
                });
            });
        }
    });

    // Start the server
    await httpSystem.start();
    console.log('Server running at http://localhost:3000');
    console.log('Try the following endpoints:');
    console.log('- GET /api/users');
    console.log('- GET /api/users/1');
    console.log('- GET /api/users/999 (Not Found)');
    console.log('');
    console.log('Some requests will randomly fail to demonstrate supervision.');
    console.log('Check the console logs to see how errors are handled.');
}

// Run the example
main().catch((error) => {
    console.error('Failed to start server:', error);
}); 