# Bactor

A high-performance actor framework inspired by Proto.Actor, implemented in TypeScript.

## Features

- **High Performance Mailbox System**
  - Default FIFO mailbox for sequential message processing
  - Priority mailbox supporting multiple priority levels
  - System and user message separation
  - Non-blocking asynchronous message processing

- **Remote Communication**
  - Location transparency using gRPC
  - Remote actor spawning and management
  - Bidirectional streaming for actor lifecycle events
  - Cross-language support through Protocol Buffers
  - Secure communication channels (optional)

- **Error Handling & Fault Tolerance**
  - Supervisor hierarchy for error management
  - Mailbox suspension on system errors
  - Isolated user message error handling
  - Graceful error recovery mechanisms

- **Message Processing**
  - MPSC (Multiple Producer Single Consumer) message queues
  - Priority-based message ordering
  - Sequential message processing guarantees
  - Message type-based routing

- **Monitoring & Observability**
  - Queue size monitoring
  - Processing status reporting
  - Detailed debug logging
  - Error tracking and reporting

## Installation

```bash
bun install
```

## Usage

### Basic Actor System

```typescript
import { ActorSystem } from './src/core/system';
import { Actor } from './src/core/actor';
import { Message } from './src/core/types';

// Define an actor
class MyActor extends Actor {
  protected initializeBehaviors(): void {
    this.addBehavior('default', async (msg: Message) => {
      switch (msg.type) {
        case 'greet':
          console.log(`Hello, ${msg.payload.name}!`);
          break;
        case 'compute':
          const result = msg.payload.x + msg.payload.y;
          console.log(`Computation result: ${result}`);
          break;
        case 'status':
          console.log('Current status:', msg.payload.status);
          break;
      }
    });
  }
}

// Create actor system
const system = new ActorSystem();

// Spawn actor
const pid = await system.spawn({
  actorClass: MyActor
});

// Send messages with payloads
await system.send(pid, { 
  type: 'greet', 
  payload: { name: 'Alice' } 
});

await system.send(pid, { 
  type: 'compute', 
  payload: { x: 10, y: 20 } 
});

await system.send(pid, { 
  type: 'status', 
  payload: { status: 'active' } 
});
```

### Remote Communication

The framework supports distributed actor systems with location transparency:

```typescript
import { ActorSystem } from './src/core/system';
import { Actor } from './src/core/actor';
import { Message } from './src/core/types';

// Define an actor that can run locally or remotely
class CalculatorActor extends Actor {
  protected initializeBehaviors(): void {
    this.addBehavior('default', async (msg: Message) => {
      if (msg.type === 'add') {
        const { x, y } = msg.payload;
        const result = x + y;
        
        if (msg.sender) {
          await this.context.send(msg.sender, {
            type: 'result',
            payload: { result }
          });
        }
      }
    });
  }
}

// Start server system
const serverSystem = new ActorSystem('0.0.0.0:50051');
await serverSystem.start();

// Start client system
const clientSystem = new ActorSystem();

// Spawn a remote calculator actor
const calculatorPid = await clientSystem.spawn({
  actorClass: CalculatorActor,
  address: 'localhost:50051'  // This makes it remote
});

// Create a local actor that uses the remote calculator
class UserActor extends Actor {
  protected initializeBehaviors(): void {
    this.addBehavior('default', async (msg: Message) => {
      if (msg.type === 'calculate') {
        // Send message to remote actor - looks just like local communication
        await this.context.send(calculatorPid, {
          type: 'add',
          payload: { x: 5, y: 3 }
        });
      } else if (msg.type === 'result') {
        console.log('Received result:', msg.payload.result);
      }
    });
  }
}

// Spawn the local user actor
const userPid = await clientSystem.spawn({
  actorClass: UserActor
});

// Send a calculation request - the user actor will communicate with the remote calculator
await clientSystem.send(userPid, { type: 'calculate' });
```

The example above demonstrates location transparency - the code looks the same whether actors are local or remote. The only difference is the addition of an `address` property when spawning remote actors.

### Using Priority Mailbox

```typescript
import { PriorityMailbox } from './src/core/mailbox';

const pid = await system.spawn({
  actorClass: MyActor,
  mailboxType: PriorityMailbox
});

// Send messages with different priorities and payloads
await system.send(pid, { 
  type: '$priority.high.urgent', 
  payload: { task: 'critical_operation', deadline: Date.now() + 1000 }
});

await system.send(pid, { 
  type: 'normal_message',
  payload: { task: 'regular_task' }
});

await system.send(pid, { 
  type: '$priority.low.background',
  payload: { task: 'cleanup', scheduled: Date.now() }
});
```

## Performance

The framework is designed for high performance:
- Non-blocking message processing
- Efficient queue implementations
- Minimal memory overhead
- Optimized message routing

### Benchmarks

To run performance tests:

```bash
bun test:perf
```

Results on a typical machine:
- DefaultMailbox: ~800K messages/second
- PriorityMailbox: ~700K messages/second
- Concurrent (10 actors): ~700K total messages/second

## Remote Communication Architecture

The remote communication system is built on:

1. **Location Transparency**
   - Seamless communication between local and remote actors
   - Same API for both local and remote messaging
   - Transparent actor spawning across nodes

2. **gRPC Transport**
   - High-performance bidirectional streaming
   - Automatic reconnection handling
   - Built-in flow control
   - Protocol buffer serialization

3. **Actor Lifecycle Management**
   - Remote actor spawning and termination
   - Lifecycle event streaming
   - Error propagation
   - Resource cleanup

4. **Message Delivery**
   - At-most-once delivery semantics
   - Automatic message serialization
   - Payload type preservation
   - Error handling and reporting

## Testing

Run the test suite:

```bash
bun test
```

Run remote communication example:

```bash
bun run example:remote
```

## Contributing

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'feat: Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## License

This project is licensed under the MIT License - see the LICENSE file for details.

## Acknowledgments

- Inspired by [Proto.Actor](https://proto.actor/)
- Built with [Bun](https://bun.sh/)
- Uses [gRPC](https://grpc.io/) for remote communication
