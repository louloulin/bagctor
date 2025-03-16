# @bactor/http Documentation

## Overview

The `@bactor/http` module provides a high-performance HTTP server based on the Actor model, offering excellent concurrency, fault tolerance, and message-driven architecture. It combines the best practices from Akka HTTP, Hono.js, and Actix-web to create a robust HTTP server for Node.js applications.

## Features

- **Actor-based Architecture**: Built on the actor model for superior concurrency and fault tolerance
- **High-performance Routing**: Using RegExpRouter for fast route matching
- **Middleware System**: Onion model middleware with actor-based implementation
- **Route Groups**: Organize API endpoints with common prefixes
- **Response Helpers**: Utilities for generating common HTTP responses
- **Actor Pools**: Load balancing and improved performance for request handling
- **Supervision Strategies**: Robust error handling and recovery mechanisms
- **HTTP-specific Error Classes**: Structured error handling for HTTP applications

## Installation

```bash
npm install @bactor/http @bactor/core
```

## Quick Start

```typescript
import { ActorSystem } from '@bactor/core';
import { createHttpSystem, HttpResponses } from '@bactor/http';

async function main() {
  // Create the core actor system
  const system = new ActorSystem('my-http-system');
  
  // Create the HTTP actor system
  const httpSystem = await createHttpSystem(system, {
    port: 3000,
    hostname: 'localhost'
  });
  
  // Add a route
  await httpSystem.addRoute({
    method: 'GET',
    pattern: '/',
    handler: async (context) => {
      return HttpResponses.json({
        message: 'Hello, Actor HTTP!'
      });
    }
  });
  
  // Start the server
  await httpSystem.start();
  console.log('Server running at http://localhost:3000');
}

main().catch(console.error);
```

## Core Components

### HTTP Actor System

The HTTP Actor System is the central component that manages the HTTP server and its interactions with other actors. It provides a clean API for managing routes, middleware, and other HTTP functionality.

```typescript
import { ActorSystem } from '@bactor/core';
import { createHttpSystem } from '@bactor/http';

const system = new ActorSystem('my-http-system');
const httpSystem = await createHttpSystem(system, {
  port: 3000,
  hostname: 'localhost'
});

await httpSystem.start();
```

### Router

The Router is responsible for matching incoming requests to the appropriate handler based on method and URL patterns.

```typescript
// Adding a route
await httpSystem.addRoute({
  method: 'GET',
  pattern: '/users/:id',
  handler: async (context) => {
    const userId = context.params.id;
    return HttpResponses.json({ id: userId, name: 'User ' + userId });
  }
});
```

### Middleware

Middleware functions can perform operations before and after request handling, following the "onion model" pattern.

```typescript
// Adding middleware
await httpSystem.addMiddleware({
  actorClass: LoggerMiddleware
});

await httpSystem.addMiddleware({
  actorClass: CorsMiddleware,
  props: {
    origin: '*',
    methods: 'GET, POST, PUT, DELETE'
  }
});
```

## Advanced Features

### Route Groups

Group related routes under a common prefix:

```typescript
const userRoutes = {
  prefix: '/api/users',
  routes: [
    {
      method: 'GET',
      pattern: '/',
      handler: listUsersHandler
    },
    {
      method: 'GET',
      pattern: '/:id',
      handler: getUserHandler
    }
  ]
};

await httpSystem.addRouteGroup(userRoutes);
```

### RegExpRouter

High-performance routing with pre-compiled regular expressions:

```typescript
import { RegExpRouter } from '@bactor/http';

const router = new RegExpRouter({ cacheSize: 1000 });
router.add('GET', '/users/:id', getUserHandler);

const match = router.match('GET', '/users/123');
if (match) {
  const { handler, params } = match;
  // params would be { id: '123' }
}
```

### Actor Pools

Distribute work across multiple worker actors for improved performance:

```typescript
import { ActorPool } from '@bactor/http';

const handlerPool = await system.spawn({
  actorClass: ActorPool,
  actorContext: {
    pooledActorClass: ApiHandlerActor,
    poolSize: 10,
    routingStrategy: 'round-robin'
  }
});

// Send work to the pool
await system.send(handlerPool, {
  type: 'work',
  payload: {
    request: httpRequest,
    originalSender: responseSender
  }
});
```

For more details, see the [Actor Pool documentation](./actor-pool.md).

### Supervision Strategies

Robust error handling and recovery for actors:

```typescript
import { 
  SupervisorActor, 
  OneForOneStrategy, 
  TemporaryError 
} from '@bactor/http';

const supervisor = await system.spawn({
  actorClass: SupervisorActor,
  actorContext: {
    strategy: new OneForOneStrategy({
      directive: (error) => {
        if (error instanceof TemporaryError) {
          return 'restart';
        } else {
          return 'stop';
        }
      },
      maxRestarts: 5,
      withinTimeWindow: 60000 // 1 minute
    })
  }
});

// Supervise an actor
await system.send(supervisor, {
  type: 'supervise',
  payload: { child: workerActor }
});
```

For more details, see the [Supervision Strategies documentation](./supervision.md).

## Error Handling

The HTTP module provides a comprehensive set of error classes:

```typescript
import { 
  HttpError, 
  NotFoundError, 
  UnauthorizedError 
} from '@bactor/http';

// In your handler
if (!user) {
  throw new NotFoundError('User not found');
}

if (!isAuthorized) {
  throw new UnauthorizedError('Unauthorized access');
}
```

## Examples

### Basic REST API

```typescript
// User routes
await httpSystem.addRouteGroup({
  prefix: '/api/users',
  routes: [
    {
      method: 'GET',
      pattern: '/',
      handler: async (context) => {
        return HttpResponses.json([
          { id: 1, name: 'John' },
          { id: 2, name: 'Jane' }
        ]);
      }
    },
    {
      method: 'GET',
      pattern: '/:id',
      handler: async (context) => {
        const userId = context.params.id;
        return HttpResponses.json({ id: userId, name: 'User ' + userId });
      }
    },
    {
      method: 'POST',
      pattern: '/',
      handler: async (context) => {
        const body = await context.req.json();
        // Create user logic
        return HttpResponses.json({ id: 3, ...body }, 201);
      }
    }
  ]
});
```

### API with Authentication

```typescript
// Add authentication middleware
await httpSystem.addMiddleware({
  actorClass: AuthMiddleware,
  props: {
    secret: 'your-jwt-secret'
  }
});

// Protected routes
await httpSystem.addRoute({
  method: 'GET',
  pattern: '/api/profile',
  handler: async (context) => {
    // User info is added by the auth middleware
    const user = context.state.get('user');
    return HttpResponses.json({ user });
  }
});
```

## API Reference

For detailed API documentation, see the following pages:

- [HTTP Actor System](./http-actor-system.md)
- [Router](./router.md)
- [Middleware](./middleware.md)
- [Response Helpers](./response-helpers.md)
- [Actor Pool](./actor-pool.md)
- [Supervision Strategies](./supervision.md)
- [Error Classes](./errors.md)

## Implementation Status

For a detailed overview of implemented and planned features, see the [Implementation Status](./implementation-status.md) document. 