# Props API

Props in Bagctor define how actors are created and configured. This document outlines the Props API, which provides a fluent interface for configuring actor creation parameters.

## Overview

The Props API is a key abstraction in Bagctor that encapsulates all the information needed to create an actor:

- The actor implementation (class or function)
- Constructor arguments and dependencies
- Supervisor strategy
- Special configuration flags
- Middleware

## PropsBuilder

The `PropsBuilder` class provides a fluent interface for creating Props objects:

```typescript
const props = PropsBuilder
  .fromClass(MyActor)          // Specify the actor class
  .withArgs({ count: 0 })      // Pass constructor arguments
  .withSupervisor(strategy)    // Set supervisor strategy
  .withMiddleware(middleware)  // Add middleware
  .build();                    // Create the Props object

const actorPid = await system.spawn(props, 'my-actor');
```

## Actor Instantiation

### FromClass

The most common way to create actors is from a class:

```typescript
const props = PropsBuilder
  .fromClass(CounterActor)
  .build();
```

### FromFunction

For simpler actors, you can create them from a function:

```typescript
const props = PropsBuilder
  .fromFunction(async (context) => {
    return {
      // Return a behavior function
      behavior: async (msg) => {
        if (msg.type === 'ping') {
          return 'pong';
        }
      }
    };
  })
  .build();
```

### FromProducer

For more dynamic actor creation, you can use a producer function:

```typescript
const props = PropsBuilder
  .fromProducer(() => new CounterActor())
  .build();
```

### FromInstance

You can also create Props from an existing instance:

```typescript
const actor = new CounterActor();
const props = PropsBuilder
  .fromInstance(actor)
  .build();
```

## Constructor Arguments

You can pass arguments to the actor's constructor using `withArgs`:

```typescript
interface CounterActorArgs {
  initialCount: number;
  incrementBy: number;
}

class CounterActor extends Actor {
  private count: number;
  private incrementBy: number;
  
  constructor(args: CounterActorArgs) {
    super();
    this.count = args.initialCount;
    this.incrementBy = args.incrementBy;
  }
  
  // ...
}

// Create Props with constructor arguments
const props = PropsBuilder
  .fromClass(CounterActor)
  .withArgs({
    initialCount: 10,
    incrementBy: 2
  })
  .build();
```

## Supervisor Strategy

You can configure the supervisor strategy for an actor using `withSupervisor`:

```typescript
const props = PropsBuilder
  .fromClass(ParentActor)
  .withSupervisor(
    SupervisorStrategies.oneForOne(3, 1000)
  )
  .build();
```

## Middleware

Middleware allows you to intercept and modify messages before they're processed by the actor:

```typescript
// Create a logging middleware
const loggingMiddleware: ActorMiddleware = {
  onReceive: async (ctx, msg, next) => {
    console.log(`Actor ${ctx.self.id} received message: ${msg.type}`);
    
    // Measure processing time
    const startTime = Date.now();
    const result = await next(msg);
    const endTime = Date.now();
    
    console.log(`Actor ${ctx.self.id} processed message: ${msg.type} in ${endTime - startTime}ms`);
    
    return result;
  }
};

// Add the middleware to an actor
const props = PropsBuilder
  .fromClass(MyActor)
  .withMiddleware(loggingMiddleware)
  .build();
```

You can add multiple middleware, which will be applied in order:

```typescript
const props = PropsBuilder
  .fromClass(MyActor)
  .withMiddleware(authMiddleware)
  .withMiddleware(loggingMiddleware)
  .withMiddleware(metricMiddleware)
  .build();
```

## Dispatcher Configuration

The dispatcher determines how messages are processed. By default, Bagctor uses a single-threaded dispatcher, but you can configure different dispatchers for different concurrency models:

```typescript
const props = PropsBuilder
  .fromClass(MyActor)
  .withDispatcher('thread-pool')  // Use a thread pool for this actor
  .build();
```

## Named Actors

When spawning an actor, you can provide a name to make it easier to find:

```typescript
const props = PropsBuilder.fromClass(CounterActor).build();
const pid = await system.spawn(props, 'main-counter');
```

## Mailbox Configuration

You can configure the actor's mailbox to control how messages are queued:

```typescript
const props = PropsBuilder
  .fromClass(MyActor)
  .withMailbox({
    capacity: 1000,           // Maximum number of messages in the mailbox
    overflowStrategy: 'drop'  // What to do when the mailbox is full
  })
  .build();
```

## Combining Props

You can create a base Props object and extend it for different actors:

```typescript
// Base Props with common configuration
const baseProps = PropsBuilder
  .fromClass(BaseActor)
  .withMiddleware(loggingMiddleware)
  .withSupervisor(SupervisorStrategies.oneForOne(3, 1000))
  .build();

// Extend with specific configuration
const specificProps = PropsBuilder
  .fromProps(baseProps)
  .withClass(SpecificActor)
  .withArgs({ specificSetting: true })
  .build();
```

## Functional Actor Props

For functional actors, you use the `createFunctionalActor` helper:

```typescript
const counterActor = createFunctionalActor<{ count: number }>(
  // Initial state
  { count: 0 },
  // Message handlers
  {
    increment: (state, { amount }) => ({ count: state.count + amount }),
    decrement: (state, { amount }) => ({ count: state.count - amount }),
    get: (state) => state.count,
    reset: () => ({ count: 0 })
  }
);

// Create props for the functional actor
const props = PropsBuilder
  .fromInstance(counterActor)
  .build();
```

## TypedActor Props

For TypedActors, the process is similar to regular actors:

```typescript
interface CounterMessages extends MessageMap {
  'increment': { amount: number };
  'get': void;
}

class TypedCounterActor extends TypedActor<CounterMessages> {
  private count: number = 0;
  
  protected behaviors(): void {
    this.receive('increment', async ({ amount }) => {
      this.count += amount;
    });
    
    this.receive('get', async () => {
      return this.count;
    });
  }
}

const props = PropsBuilder
  .fromClass(TypedCounterActor)
  .build();
```

## Advanced Configuration

### Dependency Injection

You can use the Props API for dependency injection:

```typescript
interface ServiceDependencies {
  database: Database;
  logger: Logger;
  config: Config;
}

class ServiceActor extends Actor {
  private db: Database;
  private logger: Logger;
  private config: Config;
  
  constructor(deps: ServiceDependencies) {
    super();
    this.db = deps.database;
    this.logger = deps.logger;
    this.config = deps.config;
  }
  
  // ...
}

// Create dependencies
const database = new Database(/* ... */);
const logger = new Logger(/* ... */);
const config = new Config(/* ... */);

// Create Props with dependencies
const props = PropsBuilder
  .fromClass(ServiceActor)
  .withArgs({ database, logger, config })
  .build();
```

### Custom Configuration

For more specific configuration needs, you can use `withConfig`:

```typescript
const props = PropsBuilder
  .fromClass(MyActor)
  .withConfig({
    custom: {
      timeout: 5000,
      retries: 3,
      apiKey: process.env.API_KEY
    }
  })
  .build();
```

Then access the configuration in your actor:

```typescript
class MyActor extends Actor {
  async preStart(): Promise<void> {
    const config = this.context.props.config.custom;
    console.log(`Configured with timeout: ${config.timeout}`);
    
    await super.preStart();
  }
}
```

## Example: Configuring a Web Service Actor

Here's a complete example of configuring an actor that handles HTTP requests:

```typescript
interface WebServiceActorConfig {
  port: number;
  basePath: string;
  rateLimits: {
    requestsPerMinute: number;
    burstSize: number;
  };
  timeout: number;
}

class WebServiceActor extends Actor {
  private server: HttpServer | null = null;
  private config: WebServiceActorConfig;
  
  constructor(config: WebServiceActorConfig) {
    super();
    this.config = config;
  }
  
  async preStart(): Promise<void> {
    // Create HTTP server with configuration
    this.server = new HttpServer({
      port: this.config.port,
      basePath: this.config.basePath,
      timeout: this.config.timeout
    });
    
    // Set up rate limiting
    this.server.useRateLimiter(
      this.config.rateLimits.requestsPerMinute,
      this.config.rateLimits.burstSize
    );
    
    // Register route handlers
    this.server.get('/users', async (req, res) => {
      // Forward to a UserManager actor
      const userProps = PropsBuilder.fromClass(UserManagerActor).build();
      const userManager = await this.spawn(userProps);
      
      const users = await this.context.request(userManager, { 
        type: 'get-users' 
      });
      
      res.json(users);
    });
    
    // Start the server
    await this.server.start();
    console.log(`Web service started on port ${this.config.port}`);
    
    await super.preStart();
  }
  
  async postStop(): Promise<void> {
    // Clean up the server on actor stop
    if (this.server) {
      await this.server.stop();
    }
    
    await super.postStop();
  }
  
  protected behaviors(): void {
    this.addBehavior('default', async (msg: Message) => {
      // Handle messages
    });
  }
}

// Create and spawn the web service actor
const webServiceProps = PropsBuilder
  .fromClass(WebServiceActor)
  .withArgs({
    port: 3000,
    basePath: '/api',
    rateLimits: {
      requestsPerMinute: 100,
      burstSize: 20
    },
    timeout: 30000
  })
  .withSupervisor(SupervisorStrategies.oneForOne(3, 10000))
  .build();

const webServicePid = await system.spawn(webServiceProps, 'web-service');
```

## Best Practices

1. **Use PropsBuilder fluent API**: The fluent API makes it easier to read and understand the actor configuration.

2. **Create base Props**: For actors with similar configuration, create a base Props object and extend it.

3. **Separate configuration from behavior**: Use the Props API to inject configuration, keeping the actor implementation focused on behavior.

4. **Name your actors**: Using meaningful names when spawning actors makes debugging easier.

5. **Consider middleware**: Use middleware for cross-cutting concerns like logging, metrics, and authentication.

6. **Inject dependencies**: Use the Props API to inject dependencies rather than creating them inside actors.

7. **Configure supervision appropriately**: Choose the right supervisor strategy based on the actor's failure modes.

8. **Document your Props**: When creating complex Props configurations, document what each setting does.

9. **Use TypedActors**: For better type safety, use TypedActors with properly defined message types. 