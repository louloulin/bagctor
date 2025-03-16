# Error Handling in Bagctor

This document explains how error handling works in the Bagctor framework, detailing supervision strategies, error classification, and best practices.

## Overview

Error handling in Bagctor follows the "let it crash" philosophy pioneered by Erlang, where errors are expected and handled at a higher level. This approach isolates failures and allows the system to recover automatically from errors.

## Supervision Strategies

Supervision strategies define how parent actors respond when child actors encounter errors. Bagctor provides several built-in strategies:

### Built-in Strategies

```typescript
// Import the supervision strategies
import { SupervisorStrategies } from 'bagctor';

// Available strategies
const strategy = SupervisorStrategies.oneForOne; // Restart only the failed child
const strategy = SupervisorStrategies.allForOne; // Restart all children when one fails
const strategy = SupervisorStrategies.restartWith(maxRetries, withinTimeWindow); // Limit restart attempts
const strategy = SupervisorStrategies.escalate; // Escalate the error to the parent's parent
const strategy = SupervisorStrategies.stop; // Stop the failed child actor
```

### Supervision Directives

When a child actor fails, the supervisor evaluates the error and returns one of the following directives:

- `SupervisorDirective.Restart`: Restart the failed actor
- `SupervisorDirective.Stop`: Stop the failed actor permanently
- `SupervisorDirective.Escalate`: Escalate the error to the parent's supervisor
- `SupervisorDirective.Resume`: Resume the actor, maintaining its current state

## Error Classification

Bagctor's error classification system allows more refined error handling by categorizing errors and applying specific directives based on the error type or message pattern.

### Creating Error Classifiers

```typescript
import { SupervisorStrategies, SupervisorDirective } from 'bagctor';

// Create a custom supervision strategy with error classifiers
const strategy = SupervisorStrategies.custom({
  errorClassifiers: [
    // Handle network errors by restarting
    SupervisorStrategies.createErrorClassifier(
      'network-errors',
      (error) => error instanceof NetworkError || 
                error.message.includes('network') || 
                error.message.includes('connection'),
      SupervisorDirective.Restart
    ),
    
    // Handle database errors by restarting
    SupervisorStrategies.createErrorClassifier(
      'database-errors',
      (error) => error instanceof DatabaseError || 
                error.message.includes('database') || 
                error.message.includes('query'),
      SupervisorDirective.Restart
    ),
    
    // Handle security errors by stopping the actor
    SupervisorStrategies.createErrorClassifier(
      'security-errors',
      (error) => error.message.includes('security') || 
                error.message.includes('password') || 
                error.message.includes('authentication'),
      SupervisorDirective.Stop
    )
  ],
  // Default directive for errors that don't match any classifier
  defaultDirective: SupervisorDirective.Escalate
});
```

### Using Error Classifiers

Error classifiers are most commonly used when spawning child actors:

```typescript
import { PropsBuilder, SupervisorStrategies, SupervisorDirective } from 'bagctor';

// Define a custom strategy with classifiers
const securityStrategy = SupervisorStrategies.custom({
  errorClassifiers: [
    SupervisorStrategies.createErrorClassifier(
      'critical-errors',
      (error) => error.message.includes('critical') || error.message.includes('security'),
      SupervisorDirective.Stop
    )
  ],
  defaultDirective: SupervisorDirective.Restart
});

// Use the strategy when creating a child actor
const childProps = PropsBuilder.fromClass(WorkerActor)
  .withSupervisor(securityStrategy);

const child = this.spawn(childProps);
```

## Best Practices for Error Handling

1. **Define custom error classes** - Create specific error classes to make classification easier:

```typescript
class DatabaseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DatabaseError';
  }
}

class NetworkError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'NetworkError';
  }
}
```

2. **Use descriptive error messages** - Include relevant information that helps with classification and debugging.

3. **Create granular error classifiers** - Define specific classifiers for different types of errors.

4. **Set appropriate default directives** - Choose a sensible fallback strategy for unclassified errors.

5. **Log errors appropriately** - Use logging middleware to capture error details for later analysis.

6. **Handle expected failures in actors** - Catch and handle expected errors within actors where appropriate.

7. **Use supervision hierarchy effectively** - Structure your actors so that related components share a supervisor.

## Complex Example: Database Connection Pool

Here's a complete example of an actor system using error classification to handle database connection issues:

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
class ConnectionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ConnectionError';
  }
}

class QueryError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'QueryError';
  }
}

// Database connection actor
class DatabaseConnectionActor extends Actor {
  private connection: any = null;
  
  protected behaviors(): void {
    this.addBehavior('default', async (msg: Message) => {
      switch (msg.type) {
        case 'connect':
          try {
            // Simulate connecting to database
            this.connection = { id: Math.random(), isConnected: true };
            return { connected: true, connectionId: this.connection.id };
          } catch (error) {
            throw new ConnectionError('Failed to establish database connection');
          }
        
        case 'query':
          if (!this.connection) {
            throw new ConnectionError('No active connection');
          }
          
          try {
            // Simulate database query
            if (Math.random() < 0.1) {
              throw new QueryError('Query timeout');
            }
            return { result: 'query executed successfully' };
          } catch (error) {
            throw error instanceof Error ? error : new QueryError(String(error));
          }
          
        case 'disconnect':
          this.connection = null;
          return { disconnected: true };
      }
    });
  }
  
  protected async postStop(): Promise<void> {
    // Clean up connection if actor is stopped
    if (this.connection) {
      this.connection = null;
      console.log('Connection closed during actor shutdown');
    }
  }
}

// Connection pool manager actor
class ConnectionPoolManagerActor extends Actor {
  private connections: Map<string, any> = new Map();
  
  protected behaviors(): void {
    this.addBehavior('default', async (msg: Message) => {
      switch (msg.type) {
        case 'get-connection':
          const id = this.getAvailableConnectionId();
          return { connectionId: id };
          
        case 'release-connection':
          this.connections.set(msg.connectionId, { ...this.connections.get(msg.connectionId), inUse: false });
          return { released: true };
      }
    });
  }
  
  protected async preStart(): Promise<void> {
    // Create supervision strategy with error classifiers
    const databaseStrategy = SupervisorStrategies.custom({
      errorClassifiers: [
        // For connection errors, restart the actor
        SupervisorStrategies.createErrorClassifier(
          'connection-errors',
          (error) => error instanceof ConnectionError || 
                    error.name === 'ConnectionError',
          SupervisorDirective.Restart
        ),
        // For query errors, resume the actor
        SupervisorStrategies.createErrorClassifier(
          'query-errors',
          (error) => error instanceof QueryError || 
                    error.name === 'QueryError',
          SupervisorDirective.Resume
        )
      ],
      defaultDirective: SupervisorDirective.Escalate
    });
    
    // Create a pool of database connections
    for (let i = 0; i < 5; i++) {
      const props = PropsBuilder.fromClass(DatabaseConnectionActor)
        .withSupervisor(databaseStrategy);
        
      const connection = this.spawn(props, `db-connection-${i}`);
      this.connections.set(connection.id, { actor: connection, inUse: false });
    }
  }
  
  private getAvailableConnectionId(): string {
    for (const [id, conn] of this.connections.entries()) {
      if (!conn.inUse) {
        this.connections.set(id, { ...conn, inUse: true });
        return id;
      }
    }
    
    // All connections in use, return a random one
    const ids = Array.from(this.connections.keys());
    return ids[Math.floor(Math.random() * ids.length)];
  }
}

// Usage
const system = ActorSystem.create('database-system');
const poolManager = system.spawn(
  PropsBuilder.fromClass(ConnectionPoolManagerActor),
  'connection-pool'
);

// Now you can send messages to get database connections
```

## Error Handling Workflow

When an error occurs in an actor, the following process takes place:

1. The error is caught by the actor's message processing system
2. The actor's supervisor is notified of the error
3. The supervisor applies error classifiers (if any) to determine the appropriate directive
4. Based on the directive, the actor is restarted, stopped, resumed, or the error is escalated
5. If restarted, the actor's lifecycle hooks (`preRestart` and `postRestart`) are called

This workflow ensures that errors are handled in a consistent and predictable manner throughout the application. 