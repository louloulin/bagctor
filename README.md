# Bactor

A high-performance actor framework inspired by Proto.Actor, implemented in TypeScript.

## Features

- **High Performance Mailbox System**
  - Default FIFO mailbox for sequential message processing
  - Priority mailbox supporting multiple priority levels
  - System and user message separation
  - Non-blocking asynchronous message processing

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

## Testing

Run the test suite:

```bash
bun test
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
