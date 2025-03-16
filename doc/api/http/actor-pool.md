# Actor Pool in @bactor/http

The Actor Pool feature provides load balancing and improved performance for HTTP request handling by distributing work across multiple worker actors.

## Overview

Actor pools allow you to create a group of worker actors that can process requests in parallel. This is especially useful for handling high volumes of HTTP requests or CPU-intensive operations. The pool automatically distributes work to worker actors using configurable routing strategies.

## Features

- Multiple worker actors processing requests in parallel
- Various routing strategies: round-robin, random, least-busy
- Dynamic pool resizing
- Worker supervision and automatic replacement of failed workers
- Pool statistics for monitoring

## Usage

### Creating an Actor Pool

```typescript
import { ActorSystem, createHttpSystem } from '@bactor/http';
import { MyHandlerActor } from './my-handler';

// Create the actor system
const system = new ActorSystem('my-http-system');
const httpSystem = await createHttpSystem(system, { port: 3000 });

// Create an actor pool for request handlers
const handlerPool = await system.spawn({
  actorClass: ActorPool,
  actorContext: {
    pooledActorClass: MyHandlerActor,
    poolSize: 10,
    routingStrategy: 'round-robin',
    pooledActorProps: {
      // Props to pass to each worker actor
      db: dbConnection
    },
    supervise: true  // Enable worker supervision
  }
});
```

### Sending Work to the Pool

```typescript
// Send work to the pool
await system.send(handlerPool, {
  type: 'work',
  payload: {
    request: httpRequest,
    // Additional data needed for processing
    originalSender: responseSender
  },
  sender: context.self
});
```

### Receiving Results from the Pool

The pool forwards the worker's response to the original sender:

```typescript
// In your actor that received the result
protected behaviors(): void {
  this.addBehavior('default', async (msg) => {
    if (msg.type === 'work.result') {
      const result = msg.payload;
      // Process the result
      console.log('Received result:', result);
    }
  });
}
```

### Resizing the Pool

You can dynamically resize the pool based on load:

```typescript
// Resize the pool to have 20 workers
await system.send(handlerPool, {
  type: 'pool.resize',
  payload: { size: 20 },
  sender: context.self
});
```

### Getting Pool Statistics

```typescript
// Get pool statistics
const response = await system.ask(handlerPool, {
  type: 'pool.stats',
  sender: context.self
});

console.log(`Pool size: ${response.payload.size}`);
console.log(`Busy workers: ${response.payload.busy}`);
console.log(`Strategy: ${response.payload.strategy}`);
```

## Routing Strategies

The Actor Pool supports multiple routing strategies:

- **Round-Robin**: Workers are selected in sequence, ensuring an even distribution of work
- **Random**: Workers are selected randomly, which can help avoid hot spots
- **Least-Busy**: The least busy worker is selected, which optimizes for worker utilization

## Example: HTTP API with Actor Pool

Here's a complete example of using an Actor Pool to handle HTTP API requests:

```typescript
import { ActorSystem, Actor, ActorContext, PID } from '@bactor/core';
import { 
  createHttpSystem, 
  HttpResponses, 
  ActorPool, 
  HttpContext 
} from '@bactor/http';

// Define a worker actor
class ApiHandlerActor extends Actor {
  constructor(context: ActorContext, props?: any) {
    super(context);
  }
  
  protected behaviors(): void {
    this.addBehavior('default', async (msg) => {
      if (msg.type === 'work') {
        const { request, originalSender } = msg.payload;
        
        // Process the request
        let response;
        try {
          // Simulate some processing time
          await new Promise(resolve => setTimeout(resolve, 50));
          
          // Generate a response
          response = HttpResponses.json({ 
            message: 'Success', 
            worker: this.context.self.id,
            timestamp: Date.now()
          });
        } catch (error) {
          response = HttpResponses.json({ 
            error: 'Failed to process request' 
          }, 500);
        }
        
        // Send the result back
        await this.context.send(msg.sender, {
          type: 'work.complete',
          payload: {
            result: response,
            originalSender
          },
          sender: this.context.self
        });
      }
    });
  }
}

// Main function
async function main() {
  const system = new ActorSystem('api-system');
  const httpSystem = await createHttpSystem(system, { port: 3000 });
  
  // Create the worker pool
  const apiPool = await system.spawn({
    actorClass: ActorPool,
    actorContext: {
      pooledActorClass: ApiHandlerActor,
      poolSize: 5,
      routingStrategy: 'least-busy'
    }
  });
  
  // Add a route that uses the pool
  await httpSystem.addRoute({
    method: 'GET',
    pattern: '/api/data',
    handler: async (context: HttpContext) => {
      // Forward the request to the pool
      const response = await system.ask(apiPool, {
        type: 'work',
        payload: {
          request: context.req,
          originalSender: system.deadLetter
        },
        sender: system.deadLetter
      });
      
      return response.payload;
    }
  });
  
  // Start the HTTP server
  await httpSystem.start();
  console.log('Server running at http://localhost:3000');
}

main().catch(console.error);
```

## Best Practices

1. **Pool Size**: Set the pool size based on the expected load and resource constraints. Typically, a good starting point is the number of CPU cores.

2. **Routing Strategy**: Use 'round-robin' for balanced distribution, 'least-busy' for optimizing worker utilization, and 'random' for avoiding hot spots.

3. **Worker Design**: Keep worker actors stateless to maximize the benefits of pooling. If you need state, consider using an external store.

4. **Supervision**: Enable supervision for production environments to automatically handle worker failures.

5. **Monitoring**: Regularly check pool statistics to ensure it's operating efficiently and adjust the pool size as needed.

## API Reference

### ActorPool

The main class for creating and managing actor pools.

**Properties:**

- `pooledActorClass`: The actor class to use for pool members
- `poolSize`: The initial size of the pool (default: 10)
- `routingStrategy`: The routing strategy to use (default: 'round-robin')
- `pooledActorProps`: Properties to pass to the pooled actors
- `supervise`: Whether to supervise the pooled actors (default: true)

**Message Types:**

- `work`: Send work to the pool
- `work.complete`: Worker has completed the work
- `pool.resize`: Resize the pool
- `pool.stats`: Get statistics about the pool
- `pool.stats.result`: Statistics response

### PoolRoutingStrategy

Available routing strategies:

- `'round-robin'`
- `'random'`
- `'least-busy'`