# Error Classifiers

Error classifiers provide a powerful mechanism for categorizing and handling different types of errors in a more refined way within Bagctor's supervision system.

## Overview

Error classifiers allow supervisors to apply different directives based on the type of error, its message content, or any other criteria you define. This enables more granular error handling compared to using a single strategy for all errors.

## Benefits

1. **Targeted Error Handling**: Apply different recovery strategies based on error characteristics
2. **Improved Resilience**: Handle expected failure modes appropriately
3. **Error Isolation**: Ensure that critical errors don't trigger unnecessary restarts
4. **Error Classification**: Categorize errors into meaningful groups

## Creating Error Classifiers

Error classifiers are created using the `SupervisorStrategies.createErrorClassifier` method:

```typescript
import { SupervisorStrategies, SupervisorDirective } from 'bagctor';

// Create an error classifier for network errors
const networkErrorClassifier = SupervisorStrategies.createErrorClassifier(
  'network-errors',                           // Classifier name
  (error) => error instanceof NetworkError,   // Matching function
  SupervisorDirective.Restart                 // Directive to apply
);
```

The classifier consists of:
- **name**: A descriptive identifier for the classifier
- **matching function**: A function that returns `true` if the error should be handled by this classifier
- **directive**: The supervision directive to apply if the error matches

## Using Error Classifiers

Error classifiers are used within a custom supervision strategy:

```typescript
import { SupervisorStrategies, SupervisorDirective } from 'bagctor';

// Create a custom supervision strategy with multiple classifiers
const customStrategy = SupervisorStrategies.custom({
  errorClassifiers: [
    // Database errors - restart the actor
    SupervisorStrategies.createErrorClassifier(
      'database-errors',
      (error) => error instanceof DatabaseError || 
                error.message.toLowerCase().includes('database'),
      SupervisorDirective.Restart
    ),
    
    // Security errors - stop the actor
    SupervisorStrategies.createErrorClassifier(
      'security-errors',
      (error) => error.message.toLowerCase().includes('security') || 
                error.message.toLowerCase().includes('unauthorized'),
      SupervisorDirective.Stop
    ),
    
    // Temporary failures - resume the actor
    SupervisorStrategies.createErrorClassifier(
      'temporary-errors',
      (error) => error.message.toLowerCase().includes('temporary') || 
                error.message.toLowerCase().includes('retry'),
      SupervisorDirective.Resume
    )
  ],
  // Default directive for unclassified errors
  defaultDirective: SupervisorDirective.Escalate
});

// Use the strategy when creating a child actor
const childProps = PropsBuilder.fromClass(SomeActor)
  .withSupervisor(customStrategy);

const child = this.spawn(childProps);
```

## Error Classifier Evaluation

When an error occurs, the supervision system evaluates it against each classifier in order:

1. Each classifier's matching function is called with the error
2. If a classifier's matching function returns `true`, its directive is applied
3. If no classifier matches, the `defaultDirective` is applied
4. If no `defaultDirective` is specified, `SupervisorDirective.Restart` is used

## Matching Patterns

You can build sophisticated matching patterns for error classifiers:

### 1. Check Error Type

```typescript
// Match specific error types
(error) => error instanceof DatabaseError
```

### 2. Check Error Name

```typescript
// Match by error name
(error) => error.name === 'ConnectionError'
```

### 3. Check Error Message

```typescript
// Match by error message content
(error) => error.message.includes('timeout')
```

### 4. Combine Multiple Conditions

```typescript
// Complex matching with multiple conditions
(error) => (
  (error instanceof NetworkError || error.name === 'NetworkError') &&
  !error.message.includes('recoverable')
)
```

### 5. Check Error Properties

```typescript
// Match based on custom error properties
(error) => error.code === 'DB_CONN_ERROR' || error.severity === 'critical'
```

## Complete Example

Here's a complete example showing error classifiers in action:

```typescript
import { 
  ActorSystem, 
  Actor, 
  PropsBuilder, 
  SupervisorStrategies, 
  SupervisorDirective,
  Message 
} from 'bagctor';

// Custom error types
class NetworkError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'NetworkError';
  }
}

class DatabaseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DatabaseError';
  }
}

class ValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ValidationError';
  }
}

// Worker actor that might throw different errors
class WorkerActor extends Actor {
  protected behaviors(): void {
    this.addBehavior('default', async (msg: Message) => {
      switch (msg.type) {
        case 'process-data':
          // Simulate random errors
          const rand = Math.random();
          if (rand < 0.2) {
            throw new NetworkError('Connection refused');
          } else if (rand < 0.4) {
            throw new DatabaseError('Query timeout');
          } else if (rand < 0.6) {
            throw new ValidationError('Invalid input format');
          }
          return { processed: true };
      }
    });
  }
}

// Supervisor actor
class SupervisorActor extends Actor {
  private child: any;
  
  protected async preStart(): Promise<void> {
    // Create a supervision strategy with error classifiers
    const strategy = SupervisorStrategies.custom({
      errorClassifiers: [
        // Network errors - restart
        SupervisorStrategies.createErrorClassifier(
          'network-errors',
          (error) => error instanceof NetworkError,
          SupervisorDirective.Restart
        ),
        
        // Database errors - resume (assume they're temporary)
        SupervisorStrategies.createErrorClassifier(
          'database-errors',
          (error) => error instanceof DatabaseError,
          SupervisorDirective.Resume
        ),
        
        // Validation errors - stop (bad input needs human intervention)
        SupervisorStrategies.createErrorClassifier(
          'validation-errors',
          (error) => error instanceof ValidationError,
          SupervisorDirective.Stop
        )
      ],
      defaultDirective: SupervisorDirective.Escalate
    });
    
    // Create the worker with our custom strategy
    const props = PropsBuilder.fromClass(WorkerActor)
      .withSupervisor(strategy);
      
    this.child = this.spawn(props, 'worker');
  }
  
  protected behaviors(): void {
    this.addBehavior('default', async (msg: Message) => {
      if (msg.type === 'start-work') {
        // Forward the message to the child
        return this.child.tell('process-data');
      }
    });
  }
}

// Create the actor system and supervisor
const system = ActorSystem.create('demo-system');
const supervisor = system.spawn(
  PropsBuilder.fromClass(SupervisorActor),
  'supervisor'
);

// Start the work
supervisor.tell('start-work');
```

## Best Practices

1. **Prioritize Error Classifiers Carefully**
   - List the most specific classifiers first
   - More general classifiers should come later

2. **Use Descriptive Names**
   - Choose clear, descriptive names for your classifiers
   - This improves debugging and observability

3. **Set Appropriate Default Directive**
   - Always specify a sensible default directive
   - Consider escalation for unclassified errors

4. **Create Reusable Classifier Libraries**
   - Build libraries of common classifiers
   - Share them across different parts of your application

5. **Combine with Custom Error Classes**
   - Define custom error classes for specific failure modes
   - Makes classification more reliable than string matching

6. **Test Error Classifiers**
   - Write unit tests for your error classifiers
   - Verify they match the expected errors
   - Confirm they apply the correct directives 