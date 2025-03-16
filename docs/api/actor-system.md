# Actor System API

The Actor System is the foundation of Bagctor's runtime environment. It manages all actors, handles message routing, and provides the infrastructure for creating, monitoring, and supervising actors.

## Creating an Actor System

To use Bagctor, you start by creating an Actor System:

```typescript
import { ActorSystem } from 'bagctor';

// Create a default Actor System
const system = new ActorSystem();

// With custom configuration
const configuredSystem = new ActorSystem({
  name: 'my-application',
  // System-wide configuration
  config: {
    dispatchers: {
      default: {
        throughput: 100
      },
      blocking: {
        threadPoolSize: 10
      }
    },
    serialization: {
      // Serialization settings
    },
    remoting: {
      // Remoting settings
    }
  }
});
```

## Spawning Actors

The primary function of the Actor System is to spawn actors:

```typescript
// Create Props for an actor
const props = PropsBuilder
  .fromClass(MyActor)
  .build();

// Spawn the actor
const actorPid = await system.spawn(props);

// Spawn with a specific name
const namedActorPid = await system.spawn(props, 'my-named-actor');

// Spawn with a specific parent
const childActorPid = await system.spawnChild(parentPid, props, 'child-actor');
```

## Sending Messages

The Actor System provides methods for sending messages to actors:

```typescript
// Fire and forget (one-way)
await system.send(actorPid, { 
  type: 'process', 
  payload: { data: 'some data' } 
});

// Request-response (two-way)
const result = await system.request(actorPid, { 
  type: 'calculate', 
  payload: { x: 5, y: 10 } 
});

// With timeout
const resultWithTimeout = await system.request(
  actorPid, 
  { type: 'slowOperation' },
  { timeout: 5000 } // 5 second timeout
);

// Broadcast to multiple actors
await system.broadcast(
  [actor1Pid, actor2Pid, actor3Pid], 
  { type: 'notify', payload: { message: 'Update available' } }
);
```

## Actor Lifecycle Management

The Actor System manages the lifecycle of actors:

```typescript
// Stop an actor
await system.stop(actorPid);

// Restart an actor
await system.restart(actorPid, new Error('Restarting for a specific reason'));

// Check if an actor exists
const exists = await system.exists(actorPid);
```

## Finding Actors

You can find actors in the system:

```typescript
// Find an actor by name
const actorPid = await system.actorOf('my-named-actor');

// Find all actors with a specific path pattern
const actors = await system.actorsMatching('/user/workers/*');

// Reconstruct a PID from its components
const reconstructedPid = system.pidFrom('actor-id', 'actor-address');
```

## Dead Letters

Messages sent to non-existent actors are sent to the dead letter mailbox:

```typescript
// Subscribe to dead letters
system.deadLetters.subscribe(async (deadLetter) => {
  console.log(`Message to ${deadLetter.recipient.id} was not delivered:`, deadLetter.message);
});

// You can also send messages directly to dead letters
await system.send(system.deadLetters.address, { 
  type: 'test-message' 
});
```

## Event Stream

The Actor System has an event stream for system-wide events:

```typescript
// Subscribe to all events
system.eventStream.subscribe('*', async (event) => {
  console.log('System event:', event);
});

// Subscribe to specific event types
system.eventStream.subscribe('actor.started', async (event) => {
  console.log(`Actor started: ${event.actorId}`);
});

system.eventStream.subscribe('actor.stopped', async (event) => {
  console.log(`Actor stopped: ${event.actorId}`);
});

// Publish custom events
system.eventStream.publish({
  type: 'custom.event',
  payload: { data: 'Custom event data' }
});
```

## Schedulers

The Actor System provides scheduling capabilities:

```typescript
// Schedule a one-time message
const scheduledId = await system.scheduler.scheduleOnce(
  1000, // 1 second delay
  actorPid,
  { type: 'reminder', payload: { task: 'Do something' } }
);

// Schedule a recurring message
const recurringId = await system.scheduler.schedule(
  1000, // Initial delay
  5000, // Recurring interval
  actorPid,
  { type: 'heartbeat' }
);

// Cancel a scheduled message
await system.scheduler.cancel(scheduledId);
```

## System Guardian Actors

The Actor System has built-in guardian actors:

```typescript
// Access the user guardian (parent of all user-created actors)
const userGuardian = system.userGuardian;

// Access the system guardian (parent of all system actors)
const systemGuardian = system.systemGuardian;

// Access the root guardian (parent of user and system guardians)
const rootGuardian = system.rootGuardian;
```

## Graceful Shutdown

To shut down an Actor System gracefully:

```typescript
// Shut down the entire system
await system.shutdown();

// Shut down with a timeout
await system.shutdown(10000); // 10 second timeout
```

## System Extensions

You can extend the Actor System with plugins and extensions:

```typescript
// Register a plugin
system.registerExtension('metrics', metricsPlugin);

// Use the extension
const metrics = system.extension<MetricsPlugin>('metrics');
metrics.recordLatency('actor-operation', 100);
```

## Configuration

The Actor System provides access to its configuration:

```typescript
// Get the system name
const systemName = system.name;

// Access configuration
const dispatcherConfig = system.config.dispatchers.default;
```

## System Metrics

The Actor System can provide metrics about its operation:

```typescript
// Get system metrics
const metrics = await system.metrics();

console.log(`
  Active actors: ${metrics.actors.active}
  Messages processed: ${metrics.messages.processed}
  Messages in flight: ${metrics.messages.inFlight}
  Dead letters: ${metrics.deadLetters}
`);
```

## Remote Actor Systems

For distributed systems, you can connect Actor Systems:

```typescript
// Connect to a remote system
const remoteSystem = await system.connectTo('other-system', 'hostname:port');

// Get a reference to a remote actor
const remoteActorPid = await remoteSystem.actorOf('remote-actor');

// Send messages to remote actors just like local ones
await system.send(remoteActorPid, { type: 'remote-message' });
```

## Supervisor Hierarchy

The Actor System enforces a supervision hierarchy:

```typescript
// Custom supervision for a top-level actor
const rootActorProps = PropsBuilder
  .fromClass(RootActor)
  .withSupervisor(SupervisorStrategies.oneForOne(3, 1000))
  .build();

const rootActorPid = await system.spawn(rootActorProps, 'root');

// Any children spawned under this actor will be supervised by it
```

## Example: Complete System Setup

Here's a complete example of setting up an Actor System:

```typescript
import { 
  ActorSystem, 
  PropsBuilder, 
  SupervisorStrategies,
  Actor,
  Message 
} from 'bagctor';

// Create the system
const system = new ActorSystem({
  name: 'inventory-system'
});

// Subscribe to system events
system.eventStream.subscribe('actor.started', async (event) => {
  console.log(`Actor started: ${event.actorId}`);
});

system.eventStream.subscribe('actor.stopped', async (event) => {
  console.log(`Actor stopped: ${event.actorId}`);
});

// Subscribe to dead letters
system.deadLetters.subscribe(async (deadLetter) => {
  console.log(`Dead letter: ${deadLetter.message.type} to ${deadLetter.recipient.id}`);
});

// Create a root supervisor actor
class RootSupervisor extends Actor {
  protected behaviors(): void {
    this.addBehavior('default', async (msg: Message) => {
      if (msg.type === 'initialize') {
        // Spawn child actors
        const inventoryProps = PropsBuilder
          .fromClass(InventoryActor)
          .build();
        
        const orderProps = PropsBuilder
          .fromClass(OrderActor)
          .build();
        
        const inventoryPid = await this.spawn(inventoryProps, 'inventory');
        const orderPid = await this.spawn(orderProps, 'orders');
        
        // Return the references to the child actors
        return {
          inventory: inventoryPid,
          orders: orderPid
        };
      }
    });
  }
}

// Create and spawn the root supervisor
const rootProps = PropsBuilder
  .fromClass(RootSupervisor)
  .withSupervisor(
    SupervisorStrategies.oneForOne(3, 10000)
  )
  .build();

const rootPid = await system.spawn(rootProps, 'root');

// Initialize the actor tree
const { inventory, orders } = await system.request(rootPid, {
  type: 'initialize'
});

// Set up a recurring inventory check
await system.scheduler.schedule(
  5000,  // Start after 5 seconds
  60000, // Check every minute
  inventory,
  { type: 'check-inventory-levels' }
);

// Application logic...

// When shutting down
process.on('SIGINT', async () => {
  console.log('Shutting down actor system...');
  await system.shutdown(5000);
  process.exit(0);
});
```

## Best Practices

1. **Create a single system per application**: One Actor System per application is usually sufficient and avoids resource duplication.

2. **Name your actors**: Use meaningful names for top-level actors to make them easier to find and debug.

3. **Structure your actor hierarchy**: Design a clear supervision tree with well-defined responsibilities.

4. **Handle dead letters**: Subscribe to dead letters to detect misconfigured message flows.

5. **Use system events**: Subscribe to system events for monitoring and metrics.

6. **Shutdown gracefully**: Always provide enough time for graceful shutdown to allow actors to clean up resources.

7. **Choose appropriate dispatchers**: Configure dispatchers based on the processing needs of different actors.

8. **Monitor system metrics**: Regularly check system metrics to identify bottlenecks.

9. **Use schedulers instead of timers**: Use the system's scheduler instead of JavaScript timers for better integration with the actor lifecycle.

10. **Avoid blocking the event loop**: Long-running operations should be performed in dedicated dispatchers to avoid blocking the main thread. 