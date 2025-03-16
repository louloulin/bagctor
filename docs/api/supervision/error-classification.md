# Error Classification API

Error classification in Bagctor allows developers to create highly granular supervision strategies by categorizing errors and specifying how each type of error should be handled. This provides more fine-grained control over actor supervision compared to basic strategies.

## Overview

When building fault-tolerant actor systems, different types of errors often require different handling approaches. For example:

- Transient network errors might warrant a simple retry (restart)
- Data corruption might require stopping the affected actor
- Resource exhaustion might need to be escalated to a parent supervisor

The Error Classification API provides a structured way to define these different handling strategies based on the type or characteristics of errors.

## ErrorClassifier Interface

An `ErrorClassifier` is defined by the following interface:

```typescript
interface ErrorClassifier {
  name: string;
  matches: (error: Error) => boolean;
  directive: SupervisorDirective;
}
```

Where:
- `name`: A descriptive identifier for the classifier (useful for logging and debugging)
- `matches`: A function that determines if an error should be handled by this classifier
- `directive`: The supervisor directive to apply when the error matches

## Creating Error Classifiers

You can create error classifiers using the `createErrorClassifier` factory method:

```typescript
const networkErrorClassifier = SupervisorStrategies.createErrorClassifier(
  'network-errors',
  (error) => error instanceof NetworkError,
  SupervisorDirective.Restart
);
```

This creates a classifier that will match errors of type `NetworkError` and apply the `Restart` directive.

## Using Error Classifiers with Custom Supervisor Strategies

Error classifiers are used with custom supervisor strategies:

```typescript
// Create multiple classifiers
const databaseErrorClassifier = SupervisorStrategies.createErrorClassifier(
  'database-errors',
  (error) => error instanceof DatabaseError,
  SupervisorDirective.Stop
);

const validationErrorClassifier = SupervisorStrategies.createErrorClassifier(
  'validation-errors',
  (error) => error instanceof ValidationError,
  SupervisorDirective.Resume
);

// Create a custom strategy with the classifiers
const strategy = SupervisorStrategies.custom(
  // Default handler for non-classified errors
  (error, childPid, restartCount) => {
    if (restartCount > 10) {
      return SupervisorDirective.Stop;
    }
    return SupervisorDirective.Escalate;
  },
  {
    restartAll: false, // Only affect the failing actor
    errorClassifiers: [
      networkErrorClassifier,
      databaseErrorClassifier,
      validationErrorClassifier
    ]
  }
);

// Apply the strategy to a parent actor
const parentProps = PropsBuilder
  .fromClass(ParentActor)
  .withSupervisor(strategy)
  .build();

const parentPid = await system.spawn(parentProps);
```

## Common Classification Patterns

### Classification by Error Type

You can classify errors based on their type using `instanceof`:

```typescript
// Match specific error types
(error) => error instanceof DatabaseError
```

### Classification by Error Name

```typescript
// Match by error name
(error) => error.name === 'ConnectionError'
```

### Classification by Error Message

```typescript
// Match by error message content
(error) => error.message.includes('timeout')
```

### Classification by Error Properties

```typescript
// Match based on custom error properties
(error) => error.code === 'DB_CONN_ERROR' || error.severity === 'critical'
```

## Security-Related Classifications

Error classification is particularly useful for security-related errors:

```typescript
const securityErrorClassifier = SupervisorStrategies.createErrorClassifier(
  'security-errors',
  (error) => 
    error.message.includes('unauthorized') || 
    error.message.includes('forbidden') || 
    error.message.includes('authentication'),
  SupervisorDirective.Stop
);

const sensitiveDataErrorClassifier = SupervisorStrategies.createErrorClassifier(
  'sensitive-data-errors',
  (error) => 
    error.message.includes('password') || 
    error.message.includes('credit card') || 
    error.message.includes('SSN'),
  SupervisorDirective.Stop
);
```

## Cascading Classifiers

When using multiple classifiers, they are evaluated in order. The first classifier that matches an error will determine the directive to apply.

This allows for creating a cascading pattern of error handling:

```typescript
const strategy = SupervisorStrategies.custom(
  (error, childPid, restartCount) => SupervisorDirective.Escalate,
  {
    errorClassifiers: [
      // Most specific classifiers first
      specificNetworkErrorClassifier,
      // More general classifiers later
      generalNetworkErrorClassifier,
      // Catch-all classifiers last
      allErrorsClassifier
    ]
  }
);
```

## Testing Error Classifiers

When testing error classifiers, it's important to verify:

1. That errors are correctly classified
2. That the right directive is applied
3. That the actor system behaves correctly in response

Here's an example test pattern:

```typescript
test('network errors are restarted automatically', async () => {
  // Create a classifier for network errors
  const networkErrorClassifier = SupervisorStrategies.createErrorClassifier(
    'network-errors',
    (error) => error instanceof NetworkError,
    SupervisorDirective.Restart
  );
  
  // Create a custom strategy with the classifier
  const strategy = SupervisorStrategies.custom(
    (error) => SupervisorDirective.Stop, // Default is to stop
    { errorClassifiers: [networkErrorClassifier] }
  );
  
  // Set up parent with the strategy
  // ...
  
  // Cause the child to throw a network error
  // ...
  
  // Verify that the child was restarted, not stopped
  // ...
});
```

## Best Practices

1. **Be specific in your classifiers**: Define narrow, specific classifiers rather than overly broad ones.

2. **Order matters**: Place more specific classifiers before more general ones.

3. **Provide meaningful names**: Descriptive classifier names help with debugging and logging.

4. **Consider error recovery needs**: Match the directive to what the system needs to recover from that type of error.

5. **Test thoroughly**: Test all error paths to ensure classifiers work as expected.

6. **Consider performance**: Keep matcher functions efficient as they'll be called for every error.

7. **Log classifier matches**: Add logging to track which classifiers are being triggered.

## Example: Full Error Classification System

Here's a complete example of a sophisticated error classification system:

```typescript
// Define custom error types
class NetworkError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'NetworkError';
  }
}

class DatabaseError extends Error {
  constructor(message: string, public readonly table: string) {
    super(message);
    this.name = 'DatabaseError';
  }
}

class ValidationError extends Error {
  constructor(message: string, public readonly field: string) {
    super(message);
    this.name = 'ValidationError';
  }
}

// Create classifiers
const temporaryNetworkErrorClassifier = SupervisorStrategies.createErrorClassifier(
  'temporary-network-errors',
  (error) => {
    if (error instanceof NetworkError) {
      return error.message.includes('timeout') || 
             error.message.includes('connection reset');
    }
    return false;
  },
  SupervisorDirective.Restart
);

const permanentNetworkErrorClassifier = SupervisorStrategies.createErrorClassifier(
  'permanent-network-errors',
  (error) => {
    if (error instanceof NetworkError) {
      return error.message.includes('host unreachable') || 
             error.message.includes('network unavailable');
    }
    return false;
  },
  SupervisorDirective.Stop
);

const criticalDatabaseErrorClassifier = SupervisorStrategies.createErrorClassifier(
  'critical-database-errors',
  (error) => {
    if (error instanceof DatabaseError) {
      return error.message.includes('corruption') || 
             error.table === 'users' || 
             error.table === 'accounts';
    }
    return false;
  },
  SupervisorDirective.Escalate
);

const minorDatabaseErrorClassifier = SupervisorStrategies.createErrorClassifier(
  'minor-database-errors',
  (error) => error instanceof DatabaseError,
  SupervisorDirective.Restart
);

const validationErrorClassifier = SupervisorStrategies.createErrorClassifier(
  'validation-errors',
  (error) => error instanceof ValidationError,
  SupervisorDirective.Resume
);

// Create the strategy with all classifiers
const detailedStrategy = SupervisorStrategies.custom(
  // Default handler as a fallback
  (error, childPid, restartCount) => {
    console.error('Unclassified error:', error);
    return SupervisorDirective.Restart;
  },
  {
    errorClassifiers: [
      // Order from most specific to most general
      temporaryNetworkErrorClassifier,
      permanentNetworkErrorClassifier,
      criticalDatabaseErrorClassifier,
      minorDatabaseErrorClassifier,
      validationErrorClassifier
    ]
  }
);

// Apply the strategy to a parent actor
const parentProps = PropsBuilder
  .fromClass(ParentActor)
  .withSupervisor(detailedStrategy)
  .build();

const parentPid = await system.spawn(parentProps);
```

This example shows how to build a comprehensive error classification system that handles different types of errors with appropriate directives. 