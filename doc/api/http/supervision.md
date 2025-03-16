# Supervision Strategies in @bactor/http

The Supervision Strategies feature provides robust error handling and recovery mechanisms for HTTP actors, allowing the system to gracefully handle failures.

## Overview

Supervision is a core concept in the Actor model that allows parent actors to monitor and manage their child actors. When a child actor fails, the parent can decide how to handle the failure based on a predefined strategy. This approach provides resilience and fault tolerance to the application.

## Features

- Multiple supervision strategies: One-for-One and All-for-One
- Customizable error handling policies
- Automatic restart/recovery of failed actors
- Configurable restart limits and windows
- Custom error classes for HTTP-specific errors

## Usage

### Creating a Supervisor

```typescript
import { ActorSystem, createHttpSystem } from '@bactor/http';
import { 
    SupervisorActor, 
    OneForOneStrategy, 
    TemporaryError 
} from '@bactor/http';

// Create the actor system
const system = new ActorSystem('my-http-system');
const httpSystem = await createHttpSystem(system, { port: 3000 });

// Create a supervisor with a custom strategy
const supervisor = await system.spawn({
    actorClass: SupervisorActor,
    actorContext: {
        strategy: new OneForOneStrategy({
            directive: (error) => {
                if (error instanceof TemporaryError) {
                    return 'restart'; // Temporary errors restart the actor
                } else if (error.name === 'ResourceError') {
                    return 'stop'; // Resource errors stop the actor
                } else {
                    return 'escalate'; // Unknown errors escalate to parent
                }
            },
            maxRestarts: 5,
            withinTimeWindow: 60000 // 1 minute
        })
    }
});
```

### Supervising an Actor

```typescript
// Create an actor to be supervised
const workerRef = await system.spawn({
    actorClass: MyWorkerActor,
    actorContext: {
        // Worker configuration
    }
});

// Tell the supervisor to supervise this actor
await system.send(supervisor, {
    type: 'supervise',
    payload: { child: workerRef },
    sender: context.self
});
```

### Stopping Supervision

```typescript
// Stop supervising an actor
await system.send(supervisor, {
    type: 'unsupervise',
    payload: { child: workerRef },
    sender: context.self
});
```

### Using Custom Error Classes

```typescript
import { 
    TemporaryError, 
    ResourceError, 
    FatalError,
    HttpError,
    NotFoundError
} from '@bactor/http';

// In your actor code
protected behaviors(): void {
    this.addBehavior('default', async (msg) => {
        try {
            // Attempt to process the request
            if (!userExists) {
                throw new NotFoundError('User not found');
            }
            
            if (databaseUnavailable) {
                throw new TemporaryError('Database connection lost');
            }
            
            if (outOfMemory) {
                throw new ResourceError('Out of memory');
            }
        } catch (error) {
            // Error will be handled by supervisor
            throw error;
        }
    });
}
```

## Supervision Strategies

The HTTP module supports two types of supervision strategies:

### One-for-One Strategy

With the One-for-One strategy, each child is treated independently. When a child fails, the directive is applied only to that specific child. This is useful when child actors are independent of each other.

```typescript
const strategy = new OneForOneStrategy({
    directive: (error) => {
        // Return directive based on error
        return 'restart';
    },
    maxRestarts: 10,
    withinTimeWindow: 60000 // 1 minute
});
```

### All-for-One Strategy

With the All-for-One strategy, when one child fails, the directive is applied to all children. This is useful when child actors are dependent on each other and the failure of one child would affect the others.

```typescript
const strategy = new AllForOneStrategy({
    directive: (error) => {
        // Return directive based on error
        return 'restart';
    },
    maxRestarts: 10,
    withinTimeWindow: 60000 // 1 minute
});
```

## Directives

Supervision strategies can issue the following directives:

- **resume**: Resume the actor, keeping its current state
- **restart**: Stop the actor and create a new instance
- **stop**: Permanently stop the actor
- **escalate**: Escalate the error to the parent supervisor

## Error Classes

The HTTP module provides several error classes to help with error handling:

### Base Error Classes

- **HttpError**: Base class for HTTP errors with status code
- **TemporaryError**: For temporary failures that can be resolved by retrying
- **ResourceError**: For resource allocation failures
- **FatalError**: For fatal errors that cannot be recovered from

### HTTP-Specific Error Classes

- **ClientError**: Base class for 4xx errors
- **ServerError**: Base class for 5xx errors
- **UnauthorizedError**: 401 Unauthorized error
- **ForbiddenError**: 403 Forbidden error
- **NotFoundError**: 404 Not Found error
- **TooManyRequestsError**: 429 Too Many Requests error
- **ServiceUnavailableError**: 503 Service Unavailable error

## Example: HTTP Server with Supervision

Here's a complete example of using supervision in an HTTP server:

```typescript
import { ActorSystem, Actor, ActorContext } from '@bactor/core';
import { 
    createHttpSystem, 
    SupervisorActor, 
    OneForOneStrategy,
    TemporaryError,
    NotFoundError
} from '@bactor/http';

// Define a worker actor that can fail
class ApiHandlerActor extends Actor {
    constructor(context: ActorContext, props?: any) {
        super(context);
    }
    
    protected behaviors(): void {
        this.addBehavior('default', async (msg) => {
            if (msg.type === 'http.request') {
                const { request, replyTo } = msg.payload;
                
                try {
                    // Simulate a failure based on the URL
                    if (request.url.includes('/fail/temporary')) {
                        throw new TemporaryError('Temporary failure');
                    }
                    
                    if (request.url.includes('/fail/notfound')) {
                        throw new NotFoundError('Resource not found');
                    }
                    
                    // Normal processing
                    await this.context.send(replyTo, {
                        type: 'http.response',
                        payload: {
                            status: 200,
                            body: 'Success'
                        },
                        sender: this.context.self
                    });
                } catch (error) {
                    // The error will be caught by the supervisor
                    throw error;
                }
            }
        });
    }
}

// Main function
async function main() {
    const system = new ActorSystem('supervised-api-system');
    const httpSystem = await createHttpSystem(system, { port: 3000 });
    
    // Create a supervisor
    const supervisor = await system.spawn({
        actorClass: SupervisorActor,
        actorContext: {
            strategy: new OneForOneStrategy({
                directive: (error) => {
                    console.log(`Handling error: ${error.name} - ${error.message}`);
                    
                    if (error instanceof TemporaryError) {
                        return 'restart';
                    } else if (error instanceof NotFoundError) {
                        return 'resume'; // Continue with 404 response
                    } else {
                        return 'escalate';
                    }
                },
                maxRestarts: 5,
                withinTimeWindow: 60000
            })
        }
    });
    
    // Create API handler
    const apiHandler = await system.spawn({
        actorClass: ApiHandlerActor
    });
    
    // Tell supervisor to supervise the handler
    await system.send(supervisor, {
        type: 'supervise',
        payload: { child: apiHandler }
    });
    
    // Add routes
    await httpSystem.addRoute({
        method: 'GET',
        pattern: '/api/*',
        handler: async (context) => {
            // Forward to API handler
            // ...
        }
    });
    
    // Start the server
    await httpSystem.start();
    console.log('Server running at http://localhost:3000');
}

main().catch(console.error);
```

## Best Practices

1. **Choose the right strategy**: Use One-for-One when actors are independent, and All-for-One when they're interdependent.

2. **Define meaningful error classes**: Create domain-specific error classes that inherit from the base error classes to make error handling more semantic.

3. **Set appropriate restart limits**: Configure `maxRestarts` and `withinTimeWindow` to prevent endless restart loops.

4. **Use escalation wisely**: Escalate errors that can't be handled at the current level to a higher-level supervisor.

5. **Log supervisor actions**: Add logging to track supervisor decisions for debugging and monitoring.

## API Reference

### SupervisorActor

The main class for supervising child actors.

**Messages:**

- `supervise`: Start supervising a child actor
- `unsupervise`: Stop supervising a child actor

### SupervisorStrategy

Base class for supervision strategies.

**Methods:**

- `handleFailure(error, child)`: Handle a failure in a child actor
- `resetRestartCount(child)`: Reset the restart count for a child

### OneForOneStrategy and AllForOneStrategy

Concrete strategy implementations.

**Configuration:**

- `directive`: Function that returns a directive based on the error
- `maxRestarts`: Maximum number of restarts allowed
- `withinTimeWindow`: Time window in milliseconds for counting restarts

### SupervisorDirective

Available directives:

- `'resume'`
- `'restart'`
- `'stop'`
- `'escalate'` 