# Actor Lifecycle API

This document outlines the lifecycle of actors in Bagctor, including creation, state management, and termination, as well as the hooks available at each stage of the lifecycle.

## Actor Lifecycle Overview

Actors in Bagctor go through several lifecycle stages:

1. **Creation**: Actor is instantiated
2. **Initialization**: Actor is initialized with props and context
3. **Starting**: `preStart` hook is called
4. **Running**: Actor processes messages
5. **Restarting** (if error occurs): `preRestart` and `postRestart` hooks are called
6. **Stopping**: `postStop` hook is called
7. **Termination**: Actor is removed from the system

## Creating Actors

Actors can be created in several ways:

### Using PropsBuilder

```typescript
const props = PropsBuilder
  .fromClass(MyActor)
  .withArgs({ initialCount: 0 })
  .withSupervisor(SupervisorStrategies.oneForOne(3, 1000))
  .build();

const actorPid = await system.spawn(props, 'my-counter');
```

### From an Existing Actor

```typescript
class ParentActor extends Actor {
  async createChild(): Promise<PID> {
    const props = PropsBuilder.fromClass(ChildActor).build();
    return this.spawn(props, 'child');
  }
}
```

### Functional Actors

```typescript
const myActor = createFunctionalActor<MyState>(
  // Initial state
  { count: 0 },
  // Message handlers
  {
    increment: (state, { amount }) => ({ count: state.count + amount })
  }
);

const pid = await system.spawn(myActor);
```

## Lifecycle Hooks

Bagctor provides several lifecycle hooks that you can override in your actor classes:

### preStart

Called when an actor is started, before it processes any messages.

```typescript
class MyActor extends Actor {
  async preStart(): Promise<void> {
    console.log(`Actor ${this.self.id} is starting`);
    
    // Initialize resources
    this.db = await Database.connect();
    
    // You can spawn child actors here
    const childProps = PropsBuilder.fromClass(ChildActor).build();
    this.child = await this.spawn(childProps);
    
    await super.preStart();
  }
}
```

### postStop

Called when an actor is stopped, after it has processed its last message.

```typescript
class MyActor extends Actor {
  async postStop(): Promise<void> {
    console.log(`Actor ${this.self.id} is stopping`);
    
    // Clean up resources
    await this.db.disconnect();
    
    await super.postStop();
  }
}
```

### preRestart

Called before an actor is restarted due to an error.

```typescript
class MyActor extends Actor {
  async preRestart(reason: Error): Promise<void> {
    console.log(`Actor ${this.self.id} is restarting due to: ${reason.message}`);
    
    // Save any state that needs to persist across restarts
    this.persistentData = { ...this.state };
    
    // Clean up resources
    await this.db.disconnect();
    
    await super.preRestart(reason);
  }
}
```

### postRestart

Called after an actor is restarted due to an error.

```typescript
class MyActor extends Actor {
  async postRestart(reason: Error): Promise<void> {
    console.log(`Actor ${this.self.id} has restarted due to: ${reason.message}`);
    
    // Reconnect to resources
    this.db = await Database.connect();
    
    // Restore any saved state
    if (this.persistentData) {
      this.setState(this.persistentData);
    }
    
    await super.postRestart(reason);
  }
}
```

## Stopping Actors

Actors can be stopped in several ways:

### From the System

```typescript
// Stop an actor
await system.stop(actorPid);
```

### From within an Actor

```typescript
class MyActor extends Actor {
  async shutdown(): Promise<void> {
    // Stop this actor
    await this.context.stop(this.self);
  }
  
  async stopChild(): Promise<void> {
    // Stop a child actor
    await this.context.stop(this.childPid);
  }
}
```

### Automatically via Supervision

When using supervision strategies, actors may be stopped automatically in response to errors:

```typescript
const props = PropsBuilder
  .fromClass(ParentActor)
  .withSupervisor(
    SupervisorStrategies.custom((error, childPid, restartCount) => {
      if (error.message.includes('fatal')) {
        // Stop the actor on fatal errors
        return SupervisorDirective.Stop;
      }
      return SupervisorDirective.Restart;
    })
  )
  .build();
```

## State Management

Actors in Bagctor maintain internal state that can be managed throughout their lifecycle:

### Setting Initial State

```typescript
class CounterActor extends Actor<{ count: number }> {
  constructor() {
    super({ count: 0 }); // Initial state
  }
}
```

### Using initialState Decorator

```typescript
@initialState({ count: 0 })
class CounterActor extends Actor<{ count: number }> {
  // No need to set initial state in constructor
}
```

### Updating State

```typescript
class CounterActor extends Actor<{ count: number }> {
  protected behaviors(): void {
    this.addBehavior('default', async (msg: Message) => {
      if (msg.type === 'increment') {
        // Update state immutably
        this.setState({
          count: this.state.count + msg.payload.amount
        });
      }
    });
  }
}
```

### State Persistence Across Restarts

```typescript
class PersistentActor extends Actor<MyState> {
  private persistentState: MyState | null = null;
  
  async preRestart(reason: Error): Promise<void> {
    // Save state before restart
    this.persistentState = { ...this.state };
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

## Changing Behaviors

Actors can change their behavior at runtime:

```typescript
class StatefulActor extends Actor {
  private count: number = 0;
  
  protected behaviors(): void {
    // Initial behavior
    this.addBehavior('empty', async (msg: Message) => {
      if (msg.type === 'add') {
        this.count += msg.payload.amount;
        
        // Change behavior when count becomes positive
        if (this.count > 0) {
          this.changeBehavior('active');
        }
        
        return this.count;
      }
    });
    
    // Active behavior
    this.addBehavior('active', async (msg: Message) => {
      if (msg.type === 'add') {
        this.count += msg.payload.amount;
        return this.count;
      }
      
      if (msg.type === 'subtract') {
        this.count -= msg.payload.amount;
        
        // Change back to empty behavior when count returns to zero
        if (this.count <= 0) {
          this.changeBehavior('empty');
        }
        
        return this.count;
      }
    });
    
    // Set initial behavior
    this.changeBehavior('empty');
  }
}
```

## Actor References

Actor references (PIDs) are lightweight handles that can be passed around safely:

```typescript
// Create an actor
const props = PropsBuilder.fromClass(MyActor).build();
const actorPid: PID = await system.spawn(props);

// Store the PID
const storedPid = { id: actorPid.id, address: actorPid.address };

// Later, reconstruct a PID
const reconstructedPid = system.pidFrom(storedPid.id, storedPid.address);

// Send a message using the reconstructed PID
await system.send(reconstructedPid, { type: 'hello' });
```

## Actor System Lifecycle

The actor system itself has a lifecycle that affects all actors within it:

```typescript
// Create a system
const system = new ActorSystem();

// Spawn root actors
const rootActorPid = await system.spawn(rootActorProps);

// ... application logic ...

// Shutdown the entire system
await system.shutdown();
// This will call postStop on all actors
```

## Watch and Monitor

Actors can monitor other actors to be notified when they terminate:

```typescript
class WatcherActor extends Actor {
  async watchChild(childPid: PID): Promise<void> {
    // Start watching the child
    this.watch(childPid);
  }
  
  protected behaviors(): void {
    this.addBehavior('default', async (msg: Message) => {
      // Handle regular messages
      
      // Handle termination notifications
      if (msg.type === '$system.terminated') {
        const { pid } = msg.payload;
        console.log(`Actor ${pid.id} has terminated`);
        
        // Maybe spawn a replacement
        const newChildProps = PropsBuilder.fromClass(ChildActor).build();
        const newChildPid = await this.spawn(newChildProps);
        this.watch(newChildPid);
      }
    });
  }
}
```

## Example: Database Connection Manager

Here's a complete example of an actor that manages database connections throughout its lifecycle:

```typescript
interface DbMessages extends MessageMap {
  'query': { sql: string, params: any[] };
  'transaction': { operations: { sql: string, params: any[] }[] };
}

class DatabaseActor extends TypedActor<DbMessages> {
  private db: Database | null = null;
  private connectionAttempts: number = 0;
  private readonly maxConnectionAttempts: number = 3;
  
  async preStart(): Promise<void> {
    await this.connectToDatabase();
    await super.preStart();
  }
  
  async postStop(): Promise<void> {
    await this.disconnectFromDatabase();
    await super.postStop();
  }
  
  async preRestart(reason: Error): Promise<void> {
    console.log(`Database actor restarting due to: ${reason.message}`);
    await this.disconnectFromDatabase();
    await super.preRestart(reason);
  }
  
  async postRestart(reason: Error): Promise<void> {
    this.connectionAttempts = 0;
    await this.connectToDatabase();
    await super.postRestart(reason);
  }
  
  protected behaviors(): void {
    this.receive('query', async ({ sql, params }) => {
      if (!this.db) {
        throw new Error('Database not connected');
      }
      
      try {
        const result = await this.db.query(sql, params);
        return result;
      } catch (error) {
        console.error('Query error:', error);
        throw error; // This will trigger the supervision strategy
      }
    });
    
    this.receive('transaction', async ({ operations }) => {
      if (!this.db) {
        throw new Error('Database not connected');
      }
      
      const transaction = await this.db.beginTransaction();
      
      try {
        const results = [];
        
        for (const op of operations) {
          const result = await transaction.query(op.sql, op.params);
          results.push(result);
        }
        
        await transaction.commit();
        return results;
      } catch (error) {
        await transaction.rollback();
        console.error('Transaction error:', error);
        throw error; // This will trigger the supervision strategy
      }
    });
  }
  
  private async connectToDatabase(): Promise<void> {
    try {
      this.connectionAttempts++;
      console.log(`Connecting to database (attempt ${this.connectionAttempts})`);
      this.db = await Database.connect({
        host: 'localhost',
        user: 'user',
        password: 'password',
        database: 'mydb'
      });
      console.log('Connected to database');
    } catch (error) {
      console.error('Database connection error:', error);
      
      if (this.connectionAttempts >= this.maxConnectionAttempts) {
        console.error('Max connection attempts reached, giving up');
        // Stop this actor
        await this.context.stop(this.self);
      } else {
        // Retry after a delay
        setTimeout(() => this.connectToDatabase(), 1000);
      }
    }
  }
  
  private async disconnectFromDatabase(): Promise<void> {
    if (this.db) {
      try {
        await this.db.disconnect();
        console.log('Disconnected from database');
      } catch (error) {
        console.error('Database disconnect error:', error);
      } finally {
        this.db = null;
      }
    }
  }
}

// Usage
const system = new ActorSystem();

const dbProps = PropsBuilder
  .fromClass(DatabaseActor)
  .withSupervisor(SupervisorStrategies.oneForOne(3, 5000))
  .build();

const dbActorPid = await system.spawn(dbProps, 'database');

// Query the database
try {
  const results = await system.request(dbActorPid, {
    type: 'query',
    payload: {
      sql: 'SELECT * FROM users WHERE id = ?',
      params: [123]
    }
  });
  
  console.log('Query results:', results);
} catch (error) {
  console.error('Failed to execute query:', error);
}

// Run a transaction
try {
  const results = await system.request(dbActorPid, {
    type: 'transaction',
    payload: {
      operations: [
        {
          sql: 'INSERT INTO users (name, email) VALUES (?, ?)',
          params: ['Alice', 'alice@example.com']
        },
        {
          sql: 'INSERT INTO profiles (user_id, bio) VALUES (LAST_INSERT_ID(), ?)',
          params: ['Alice is a software engineer']
        }
      ]
    }
  });
  
  console.log('Transaction results:', results);
} catch (error) {
  console.error('Failed to execute transaction:', error);
}

// Stop the actor when done
await system.stop(dbActorPid);

// Shutdown the system
await system.shutdown();
```

## Best Practices

1. **Initialize resources in preStart**: Set up connections, files, and other resources in the preStart method.

2. **Clean up in postStop**: Ensure all resources are properly closed in the postStop method to prevent leaks.

3. **Use supervision strategically**: Choose the right supervision strategy based on how dependent actors are on each other.

4. **Preserve important state during restarts**: Save critical state in preRestart and restore it in postRestart.

5. **Handle termination notifications**: Use watch/unwatch to monitor important actors and react to their termination.

6. **Manage actor references carefully**: Store PIDs for later use, but be aware they may become invalid if the actor stops.

7. **Favor immutable state**: Use immutable patterns when updating actor state to prevent concurrency issues.

8. **Be careful with blocking operations**: Long-running operations can block the actor from processing other messages. 