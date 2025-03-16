# Bagctor API Documentation

Bagctor (Bactor + AI Agent) is a powerful actor framework combining the Actor model and AI Agent capabilities. This documentation covers the core API of Bagctor, organized by feature categories.

## Table of Contents

1. [Actor System](#actor-system)
2. [Actors](#actors)
   - [Base Actor](#base-actor)
   - [Typed Actor](#typed-actor)
   - [Functional Actor](#functional-actor)
   - [Decorator-based Actor](#decorator-based-actor)
3. [Messaging](#messaging)
   - [Message Types](#message-types)
   - [Message Patterns](#message-patterns)
   - [Pattern Matching](#pattern-matching)
4. [Supervision](#supervision)
   - [Supervisor Strategies](#supervisor-strategies)
   - [Error Handling](#error-handling)
   - [Lifecycle Management](#lifecycle-management)
5. [Props](#props)
6. [Actor References](#actor-references)
7. [Utilities](#utilities)

## Actor System

The ActorSystem is the main entry point for working with Bagctor. It manages the lifecycle of actors, dispatches messages, and provides the core functionality of the actor model.

```typescript
// Create a new actor system
const system = new ActorSystem();

// Create an actor
const props = PropsBuilder.fromClass(MyActor).build();
const pid = await system.spawn(props);

// Send a message to an actor
await system.send(pid, { type: 'greet', payload: { name: 'World' } });

// Request-response pattern
const response = await system.request(pid, { type: 'calculate', payload: { a: 1, b: 2 } });

// Stop an actor
await system.stop(pid);
```

For more details, see [Actor System API](./actor-system.md).

## Actors

Bagctor provides several ways to define actors, each with different trade-offs:

### Base Actor

The traditional class-based approach:

```typescript
class CounterActor extends Actor<CounterState, CounterMessage> {
  constructor(context: ActorContext) {
    super(context, { count: 0 });
  }
  
  protected behaviors(): void {
    this.addBehavior('default', async (message: CounterMessage) => {
      switch (message.type) {
        case 'increment':
          this.setState({ count: this.state.count + (message.payload || 1) });
          return this.state.count;
        case 'get':
          return this.state.count;
      }
    });
  }
}
```

For more details, see [Base Actor API](./actors/base-actor.md).

### Typed Actor

Strongly-typed actors with compile-time safety:

```typescript
// Define message types
interface CounterMessages extends MessageMap {
  increment: number;
  decrement: number;
  get: void;
}

// Define state type
interface CounterState {
  count: number;
}

class TypedCounterActor extends TypedActor<CounterState, CounterMessages> {
  protected behaviors(): void {
    this.on('increment', (amount, ctx) => {
      this.setState({ count: this.state.count + amount });
    });
    
    this.on('decrement', (amount, ctx) => {
      this.setState({ count: this.state.count - amount });
    });
    
    this.on('get', (_, ctx) => {
      return this.state.count;
    });
  }
}
```

For more details, see [Typed Actor API](./actors/typed-actor.md).

### Functional Actor

A functional approach to defining actors:

```typescript
const CounterActor = defineActor<CounterState, CounterMessage>(
  { count: 0 },
  {
    default: (state, message, context) => {
      switch (message.type) {
        case 'increment':
          return { count: state.count + (message.payload || 1) };
        case 'get':
          context.respond(message, state.count);
          return state;
      }
    }
  }
);
```

For more details, see [Functional Actor API](./actors/functional-actor.md).

### Decorator-based Actor

Using decorators for a more declarative style:

```typescript
@initialState<CounterState>({ count: 0 })
class DecoratedCounterActor extends Actor<CounterState, CounterMessage> {
  @messageHandler('increment')
  handleIncrement(msg: CounterMessage): CounterState {
    return { count: this.state.count + (msg.payload || 1) };
  }
  
  @messageHandler('get')
  handleGet(): number {
    return this.state.count;
  }
  
  @behavior('readonly')
  readonlyBehavior(msg: CounterMessage): any {
    if (msg.type === 'get') {
      return this.state.count;
    }
    throw new Error('In readonly mode, only get is allowed');
  }
  
  protected behaviors(): void {
    // Auto-configured by decorators
  }
}
```

For more details, see [Decorator-based Actor API](./actors/decorator-actor.md).

## Messaging

### Message Types

Bagctor supports various message types and patterns:

```typescript
// Basic message
{ type: 'greet', payload: { name: 'World' } }

// Typed message
interface UserMessages extends MessageMap {
  createUser: { name: string, email: string };
  deleteUser: { id: string };
  getUser: { id: string };
}

// Creating typed messages
const message = createMessage('createUser', { name: 'John', email: 'john@example.com' });
```

For more details, see [Message Types API](./messaging/message-types.md).

### Message Patterns

Bagctor supports various messaging patterns:

```typescript
// Fire and forget
await actor.send(targetPid, 'notify', { message: 'Hello' });

// Request-response
const result = await actor.ask(targetPid, { type: 'calculate', payload: { a: 1, b: 2 } });

// Typed request-response with protocols
const userInfo = await actor.ask(userServicePid, UserServiceProtocol.GET_USER, { id: '123' });
```

For more details, see [Message Patterns API](./messaging/message-patterns.md).

### Pattern Matching

For sophisticated message handling:

```typescript
// Using match for pattern matching
this.addBehavior('default', match<CounterState, CounterMessage>({
  increment: (state, message) => ({ 
    count: state.count + message.payload 
  }),
  
  get: (state, message, context) => {
    context.respond(message, state.count);
    return state;
  },
  
  // Complex condition
  reset: {
    condition: (message) => message.payload.force === true || state.count > 100,
    handler: (state) => ({ count: 0 })
  }
}));
```

For more details, see [Pattern Matching API](./messaging/pattern-matching.md).

## Supervision

### Supervisor Strategies

Handle errors with different strategies:

```typescript
// One-for-one strategy (only restart the failed child)
const oneForOne = SupervisorStrategies.oneForOne(3, 1000);

// All-for-one strategy (restart all children when one fails)
const allForOne = SupervisorStrategies.allForOne(3, 1000);

// Custom strategy with error classifiers
const customStrategy = SupervisorStrategies.custom({
  errorClassifiers: [
    SupervisorStrategies.createErrorClassifier(
      'network-errors',
      (error) => error instanceof NetworkError,
      SupervisorDirective.Restart
    ),
    SupervisorStrategies.createErrorClassifier(
      'database-errors',
      (error) => error instanceof DatabaseError,
      SupervisorDirective.Stop
    )
  ],
  defaultDirective: SupervisorDirective.Escalate
});

// Apply the strategy when creating an actor
const props = PropsBuilder.fromClass(ParentActor)
  .withSupervisor(customStrategy)
  .build();
```

For more details, see:
- [Supervision Strategies](./supervision/strategies.md)
- [Error Classification](./supervision/error-classification.md)
- [Error Handling](./error-handling.md)

## Props

Configure actor creation with Props:

```typescript
// Using the Props builder
const props = PropsBuilder.fromClass(MyActor)
  .withMailbox(PriorityMailbox)
  .withSupervisor(SupervisorStrategies.oneForOne(3, 1000))
  .withDispatcher(CustomDispatcher)
  .build();

const pid = await system.spawn(props);
```

For more details, see [Props API](./props.md).

## Actor References

Work with actor references:

```typescript
// Basic actor references
const pid = await system.spawn(props);

// Typed actor references
const userActorRef = actorRef<UserMessages>(pid);

// Enhanced actor proxy
const userActor = createEnhancedActorProxy<UserMessages, UserResponses>(
  system,
  pid,
  { timeout: 3000 }
);

// Using the proxy
await userActor.sendCreateUser({ name: 'John', email: 'john@example.com' });
const user = await userActor.requestGetUser({ id: '123' });
```

For more details, see [Actor References API](./actor-references.md).

## Utilities

Various utility functions:

```typescript
// Creating messages
const msg = createMessage('greet', { name: 'World' });

// Ask pattern
const result = await ask<number>(system, calculatorPid, { type: 'add', payload: { a: 1, b: 2 } });
```

For more details, see [Utilities API](./utilities.md). 