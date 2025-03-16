# Messaging API

The messaging system in Bagctor enables actors to communicate with each other through typed messages. This document outlines the available message patterns, message types, and how to implement message handling in your actors.

## Message Types

Every message in Bagctor has a type and an optional payload. The basic structure of a message is:

```typescript
interface Message<T = any> {
  type: string;
  payload?: T;
}
```

For type-safe messaging, you can define your message types using the `MessageMap` interface:

```typescript
interface MessageMap {
  [key: string]: any;
}

// Example message map for a counter actor
interface CounterMessages extends MessageMap {
  'increment': { amount: number };
  'decrement': { amount: number };
  'get': void;
  'reset': void;
}
```

## Message Patterns

Bagctor supports different message patterns to handle various communication needs:

### Fire and Forget (One-way)

Send a message to an actor without waiting for a response:

```typescript
// Send a message with no response expected
await system.send(actorPid, { 
  type: 'increment', 
  payload: { amount: 1 } 
});

// In TypedActor
await this.context.send(targetPid, 'increment', { amount: 1 });
```

### Request-Response

Send a message and wait for a response:

```typescript
// Send a request and await response
const count = await system.request(actorPid, { 
  type: 'get' 
});

// In TypedActor
const count = await this.context.request(targetPid, 'get');
```

### Broadcast

Send a message to multiple actors:

```typescript
// Send a message to multiple actors
await system.broadcast([actor1Pid, actor2Pid, actor3Pid], { 
  type: 'reset' 
});

// In TypedActor
await this.context.broadcast([target1Pid, target2Pid], 'reset');
```

## Pattern Matching and Message Handling

Bagctor provides multiple ways to handle messages:

### In Basic Actors

```typescript
class CounterActor extends Actor {
  private count: number = 0;

  protected behaviors(): void {
    this.addBehavior('default', async (msg: Message) => {
      switch (msg.type) {
        case 'increment':
          this.count += msg.payload.amount;
          break;
        case 'decrement':
          this.count -= msg.payload.amount;
          break;
        case 'get':
          return this.count;
        case 'reset':
          this.count = 0;
          break;
      }
    });
  }
}
```

### In Typed Actors

```typescript
class CounterActor extends TypedActor<CounterMessages> {
  private count: number = 0;

  protected behaviors(): void {
    this.receive('increment', async ({ amount }) => {
      this.count += amount;
    });

    this.receive('decrement', async ({ amount }) => {
      this.count -= amount;
    });

    this.receive('get', async () => {
      return this.count;
    });

    this.receive('reset', async () => {
      this.count = 0;
    });
  }
}
```

### Using Decorators

```typescript
@initialState({ count: 0 })
class CounterActor extends Actor<{ count: number }> {
  @messageHandler('increment')
  async increment(msg: Message<{ amount: number }>): Promise<void> {
    this.setState({
      count: this.state.count + msg.payload.amount
    });
  }

  @messageHandler('decrement')
  async decrement(msg: Message<{ amount: number }>): Promise<void> {
    this.setState({
      count: this.state.count - msg.payload.amount
    });
  }

  @messageHandler('get')
  async getCount(): Promise<number> {
    return this.state.count;
  }

  @messageHandler('reset')
  async reset(): Promise<void> {
    this.setState({ count: 0 });
  }
}
```

## Functional Actors

Bagctor also supports functional actors that use a simpler API:

```typescript
// Create a functional counter actor
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

// Spawn the actor
const counterPid = await system.spawn(counterActor);
```

## System Messages

Bagctor uses special system messages for internal operations:

- `$system.start`: Sent when an actor starts
- `$system.stop`: Sent to stop an actor
- `$system.restart`: Sent to restart an actor
- `$system.failure`: Sent when an actor fails
- `$system.supervision`: Sent to apply supervision directives

System messages are handled automatically, but you can also intercept them in your actors:

```typescript
class MyActor extends Actor {
  protected behaviors(): void {
    this.addBehavior('default', async (msg: Message) => {
      // Handle regular messages
      
      // Also intercept system messages
      if (msg.type === '$system.start') {
        console.log('Actor started!');
      }
    });
  }
}
```

## Advanced Topics

### Dead Letters

Messages sent to non-existent actors are redirected to the dead letter mailbox:

```typescript
// Subscribe to dead letters
system.deadLetters.subscribe(async (msg: DeadLetter) => {
  console.log(`Message ${msg.message.type} to ${msg.recipient.id} was not delivered`);
});
```

### Message Serialization

For distributed actor systems, Bagctor supports message serialization:

```typescript
// Register serializers for custom message types
system.serialization.register('MyCustomType', {
  serialize: (obj) => JSON.stringify(obj),
  deserialize: (data) => JSON.parse(data)
});
```

### Message Routing

You can implement routing patterns for distributing messages:

```typescript
class RouterActor extends Actor {
  private workers: PID[] = [];

  async preStart(): Promise<void> {
    // Create worker actors
    for (let i = 0; i < 5; i++) {
      const workerProps = PropsBuilder.fromClass(WorkerActor).build();
      const worker = await this.spawn(workerProps);
      this.workers.push(worker);
    }
  }

  protected behaviors(): void {
    this.addBehavior('default', async (msg: Message) => {
      if (msg.type === 'process-task') {
        // Round-robin routing
        const index = msg.payload.taskId % this.workers.length;
        return this.send(this.workers[index], msg);
      }
    });
  }
}
```

## Best Practices

1. **Define message types clearly**: Use interfaces to define message payloads for better type safety.

2. **Keep messages immutable**: Don't modify message objects after sending them.

3. **Handle all message types**: Ensure your actors handle all possible message types they might receive.

4. **Use appropriate message patterns**: Choose the right pattern (fire-and-forget, request-response, or broadcast) based on your needs.

5. **Consider message size**: Keep messages small and pass references or IDs instead of large data structures when possible.

6. **Avoid circular references in messages**: Messages should be serializable, so avoid circular references.

7. **Use timeouts for requests**: When using the request-response pattern, always include timeouts to prevent hanging.

```typescript
try {
  const result = await system.request(
    actorPid, 
    { type: 'longOperation' },
    { timeout: 5000 } // 5 second timeout
  );
  console.log(result);
} catch (error) {
  if (error.name === 'TimeoutError') {
    console.log('Request timed out');
  } else {
    console.error('Other error:', error);
  }
}
```

## Example: Chat Room

Here's a complete example of a chat room system using Bagctor's messaging capabilities:

```typescript
// Define message types
interface ChatRoomMessages extends MessageMap {
  'join': { userId: string, username: string };
  'leave': { userId: string };
  'message': { userId: string, text: string };
  'getUsers': void;
}

// Chat room actor
class ChatRoomActor extends TypedActor<ChatRoomMessages> {
  private users: Map<string, { pid: PID, username: string }> = new Map();

  protected behaviors(): void {
    this.receive('join', async ({ userId, username }) => {
      const userProps = PropsBuilder.fromClass(UserActor).build();
      const userPid = await this.spawn(userProps, `user-${userId}`);
      
      this.users.set(userId, { pid: userPid, username });
      
      // Notify everyone about the new user
      this.broadcast(`${username} has joined the chat`);
      
      return userPid;
    });

    this.receive('leave', async ({ userId }) => {
      const user = this.users.get(userId);
      if (user) {
        this.users.delete(userId);
        
        // Notify everyone
        this.broadcast(`${user.username} has left the chat`);
        
        // Stop the user actor
        await this.context.stop(user.pid);
      }
    });

    this.receive('message', async ({ userId, text }) => {
      const user = this.users.get(userId);
      if (user) {
        // Broadcast the message to all users
        this.broadcast(`${user.username}: ${text}`);
      }
    });

    this.receive('getUsers', async () => {
      return Array.from(this.users.entries()).map(([id, data]) => ({
        userId: id,
        username: data.username
      }));
    });
  }

  private async broadcast(text: string): Promise<void> {
    const message = { 
      type: 'newMessage', 
      payload: { text } 
    };
    
    // Send to all user actors
    for (const [_, user] of this.users) {
      await this.context.send(user.pid, message);
    }
  }
}

// User actor
class UserActor extends Actor {
  protected behaviors(): void {
    this.addBehavior('default', async (msg: Message) => {
      if (msg.type === 'newMessage') {
        // In a real app, this might push to a WebSocket
        console.log(`[User] Received: ${msg.payload.text}`);
      }
    });
  }
}

// Usage
const system = new ActorSystem();
const roomProps = PropsBuilder.fromClass(ChatRoomActor).build();
const chatRoomPid = await system.spawn(roomProps, 'chat-room');

// Join the chat
const alicePid = await system.request(chatRoomPid, {
  type: 'join',
  payload: { userId: 'alice123', username: 'Alice' }
});

const bobPid = await system.request(chatRoomPid, {
  type: 'join',
  payload: { userId: 'bob456', username: 'Bob' }
});

// Send messages
await system.send(chatRoomPid, {
  type: 'message',
  payload: { userId: 'alice123', text: 'Hello everyone!' }
});

await system.send(chatRoomPid, {
  type: 'message',
  payload: { userId: 'bob456', text: 'Hi Alice!' }
});

// Get users in the room
const users = await system.request(chatRoomPid, { type: 'getUsers' });
console.log(users); // [{ userId: 'alice123', username: 'Alice' }, { userId: 'bob456', username: 'Bob' }]

// Leave the chat
await system.send(chatRoomPid, {
  type: 'leave',
  payload: { userId: 'alice123' }
});
``` 