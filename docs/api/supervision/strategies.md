# Supervisor Strategies API

Supervision strategies in Bagctor provide a way to handle errors that occur in actors. When an actor encounters an error, its parent actor can use a supervisor strategy to decide what to do - whether to restart the actor, stop it, or handle the error in some other way.

## Overview

Supervision is a core concept in the actor model that allows for building fault-tolerant systems. When an actor fails (throws an exception), the failure is propagated to its parent, which then decides how to handle the failure according to its supervision strategy.

## SupervisorDirective

The `SupervisorDirective` enum defines the possible directives that a supervisor can return when handling an actor failure:

```typescript
export enum SupervisorDirective {
  Resume,   // Continue processing messages, ignore the error
  Restart,  // Restart the actor
  Stop,     // Stop the actor
  Escalate  // Escalate the error to the parent's parent
}
```

## SupervisorStrategy Interface

All supervisor strategies implement the `SupervisorStrategy` interface:

```typescript
export interface SupervisorStrategy {
  handleError(
    error: Error, 
    childPID: PID, 
    restartCount: number
  ): SupervisorDirective;
}
```

## Built-in Strategies

Bagctor provides several built-in supervisor strategies:

### OneForOne Strategy

The OneForOne strategy only restarts the actor that failed, leaving other siblings untouched.

```typescript
// Create a OneForOne strategy with max 3 restarts within 1000ms
const strategy = SupervisorStrategies.oneForOne(3, 1000);

// Usage with PropsBuilder
const props = PropsBuilder
  .fromClass(ParentActor)
  .withSupervisor(strategy)
  .build();

const parentPid = await system.spawn(props);
```

### AllForOne Strategy

The AllForOne strategy restarts all child actors when one of them fails. This is useful when child actors have dependencies on each other.

```typescript
// Create an AllForOne strategy with max 3 restarts within 1000ms
const strategy = SupervisorStrategies.allForOne(3, 1000);

// Usage with PropsBuilder
const props = PropsBuilder
  .fromClass(ParentActor)
  .withSupervisor(strategy)
  .build();

const parentPid = await system.spawn(props);
```

### Custom Strategy

You can create a custom supervisor strategy by providing a handler function:

```typescript
// Create a custom strategy
const strategy = SupervisorStrategies.custom((error, childPid, restartCount) => {
  if (error.message.includes('fatal')) {
    return SupervisorDirective.Stop;
  } else if (restartCount > 5) {
    return SupervisorDirective.Escalate;
  }
  return SupervisorDirective.Restart;
});

// Optionally set the restartAll flag to make it behave like AllForOne
const allForOneCustomStrategy = SupervisorStrategies.custom(
  (error, childPid, restartCount) => {
    // Your logic here
    return SupervisorDirective.Restart;
  },
  { restartAll: true }
);
```

### Error Classification

For more granular error handling, you can use error classifiers with custom strategies. Error classifiers allow you to categorize errors and specify different handling directives for each category:

```typescript
// Define error classifiers for different types of errors
const networkErrorClassifier = SupervisorStrategies.createErrorClassifier(
  'network-errors',
  (error) => error instanceof NetworkError,
  SupervisorDirective.Restart
);

const databaseErrorClassifier = SupervisorStrategies.createErrorClassifier(
  'database-errors',
  (error) => error instanceof DatabaseError,
  SupervisorDirective.Stop
);

// Create a custom strategy with error classifiers
const strategyWithClassifiers = SupervisorStrategies.custom(
  // This default handler is used when no classifier matches
  (error, childPid, restartCount) => SupervisorDirective.Escalate,
  {
    restartAll: false,
    errorClassifiers: [
      networkErrorClassifier,
      databaseErrorClassifier
    ]
  }
);
```

For more detailed information about error classification, see the [Error Classification API](./error-classification.md).

## Using Supervisor Strategies

To use a supervisor strategy, you need to assign it to a parent actor:

```typescript
// Create a supervisor strategy
const strategy = SupervisorStrategies.oneForOne(3, 1000);

// Assign it to a parent actor
const parentProps = PropsBuilder
  .fromClass(ParentActor)
  .withSupervisor(strategy)
  .build();

const parentPid = await system.spawn(parentProps);

// Create child actors without specifying a strategy
// They will use the parent's strategy
const childProps = PropsBuilder
  .fromClass(ChildActor)
  .build();

// Spawn child from parent
const childPid = await system.request(parentPid, {
  type: 'create-child',
  payload: {}
});
```

## Actor Lifecycle During Supervision

When an actor fails and its supervisor decides to restart it, the following lifecycle events occur:

1. `preRestart` is called on the actor with the error as an argument
2. `postRestart` is called on the actor with the error as an argument

You can override these methods in your actor to customize the restart behavior:

```typescript
class MyActor extends Actor {
  public restartCount = 0;
  
  // ... other methods ...
  
  async preRestart(reason: Error): Promise<void> {
    console.log(`Actor is about to restart due to: ${reason.message}`);
    await super.preRestart(reason);
  }
  
  async postRestart(reason: Error): Promise<void> {
    this.restartCount++;
    console.log(`Actor restarted (count: ${this.restartCount}) due to: ${reason.message}`);
    await super.postRestart(reason);
  }
}
```

## Best Practices

1. **Choose the right strategy**: Use OneForOne when child actors are independent, and AllForOne when they depend on each other.

2. **Set reasonable restart limits**: Setting appropriate `maxRestarts` and `withinTimeWindow` values prevents restart loops.

3. **Handle state during restarts**: Use `preRestart` and `postRestart` to save and restore state as needed.

4. **Consider escalation**: For errors that cannot be handled at the current level, use `SupervisorDirective.Escalate` to let a higher-level supervisor decide.

5. **Assign strategies to parents**: Always set the supervisor strategy on the parent actor, not on the children.

6. **Use error classification for fine-grained control**: When dealing with complex error scenarios, use error classifiers to provide targeted handling strategies.

## Example

Here's a complete example of using a supervisor strategy:

```typescript
// Define a parent actor with children
class ParentActor extends Actor {
  public childPids: PID[] = [];
  
  protected behaviors(): void {
    this.addBehavior('default', async (msg: Message) => {
      if (msg.type === 'create-child') {
        const childProps = PropsBuilder.fromClass(ChildActor).build();
        const childPid = await this.spawn(childProps);
        this.childPids.push(childPid);
        return childPid;
      }
      
      if (msg.type === 'send-to-child') {
        const { childIndex, message } = msg.payload;
        if (childIndex >= 0 && childIndex < this.childPids.length) {
          await this.send(this.childPids[childIndex], message);
          return true;
        }
        return false;
      }
      
      // Handle system failure message (from children)
      if (msg.type === '$system.failure') {
        console.log(`Child actor ${msg.payload.child.id} failed: ${msg.payload.error.message}`);
        // The context will handle this message using the supervisor strategy
        await (this.context as any).invokeSystemMessage(msg);
      }
    });
  }
}

// Create the system and actors with supervision
const system = new ActorSystem();

// Create a supervisor strategy
const strategy = SupervisorStrategies.oneForOne(3, 1000);

// Create the parent with the strategy
const parentProps = PropsBuilder
  .fromClass(ParentActor)
  .withSupervisor(strategy)
  .build();

const parentPid = await system.spawn(parentProps);

// Create a child
const childPid = await system.request<PID>(parentPid, {
  type: 'create-child'
});

// Send a message that will cause an error
await system.send(parentPid, {
  type: 'send-to-child',
  payload: {
    childIndex: 0,
    message: { type: 'throw-error' }
  }
});

// The child will throw an error, the parent will handle it based on the strategy
// In this case, the child will be restarted
```

## Advanced Topics

### Supervision Trees

In Bagctor, you can build hierarchical supervision trees where actors at each level supervise their children. This allows for compartmentalizing failure handling and building more resilient systems.

### Custom State Persistence During Restarts

For stateful actors, you might want to persist state across restarts:

```typescript
class StatefulActor extends Actor<MyState> {
  // Store for persistent state that survives restarts
  private persistentState: any;
  
  async preRestart(reason: Error): Promise<void> {
    // Save state before restart
    this.persistentState = {...this.state};
    await super.preRestart(reason);
  }
  
  async postRestart(reason: Error): Promise<void> {
    // Restore state after restart
    if (this.persistentState) {
      this.setState(this.persistentState);
    }
    await super.postRestart(reason);
  }
}
```

### Circuit Breaker Pattern

You can implement the circuit breaker pattern using supervisor strategies:

```typescript
const circuitBreakerStrategy = SupervisorStrategies.custom((error, childPid, restartCount) => {
  if (restartCount > 5) {
    // Circuit is open - stop the actor for a while
    setTimeout(() => {
      // Reset circuit after timeout and restart the actor
      system.restart(childPid, new Error("Circuit reset"));
    }, 10000);
    return SupervisorDirective.Stop;
  }
  return SupervisorDirective.Restart;
});
```

### Advanced Error Handling with Classification

For systems with complex error handling requirements, you can combine supervisor strategies with error classification:

```typescript
// Create classifiers for different error scenarios
const transientErrorClassifier = SupervisorStrategies.createErrorClassifier(
  'transient-errors',
  (error) => {
    // Classify network timeouts and similar errors as transient
    return error.message.includes('timeout') || 
           error.message.includes('connection reset');
  },
  SupervisorDirective.Restart
);

const permanentErrorClassifier = SupervisorStrategies.createErrorClassifier(
  'permanent-errors',
  (error) => {
    // Classify fatal errors as permanent
    return error.message.includes('fatal') || 
           error.message.includes('invalid configuration');
  },
  SupervisorDirective.Stop
);

const securityErrorClassifier = SupervisorStrategies.createErrorClassifier(
  'security-errors',
  (error) => {
    // Security issues should be escalated to higher-level supervisors
    return error.message.includes('unauthorized') || 
           error.message.includes('authentication failed');
  },
  SupervisorDirective.Escalate
);

// Create a sophisticated strategy with multiple error classifiers
const advancedStrategy = SupervisorStrategies.custom(
  // Default handler for non-classified errors
  (error, childPid, restartCount) => {
    console.warn(`Unclassified error: ${error.message}`);
    return SupervisorDirective.Restart;
  },
  {
    restartAll: false,
    errorClassifiers: [
      transientErrorClassifier,
      permanentErrorClassifier,
      securityErrorClassifier
    ]
  }
);

// Apply to a parent actor
const advancedParentProps = PropsBuilder
  .fromClass(AdvancedParentActor)
  .withSupervisor(advancedStrategy)
  .build();

const advancedParentPid = await system.spawn(advancedParentProps);
```