# Bactor

Bactor is a distributed systems framework based on the Actor model, focused on building scalable and reactive applications. It includes a core Actor system implementation and a MetaGPT-style intelligent agent system.

[中文文档](README-zh.md)

## Project Structure

```
bactor/
├── packages/
│   ├── core/           # Core actor system implementation
│   │   ├── src/
│   │   │   ├── core/     # Core components
│   │   │   ├── remote/   # Remote functionality
│   │   │   └── examples/ # Example code
│   │   └── package.json
│   │
│   └── agent/          # MetaGPT-style agent system
│       ├── src/
│       │   ├── agents/   # Specific agent implementations
│       │   └── types.ts  # Agent system types
│       └── package.json
├── package.json        # Workspace management
└── bun.workspace.ts    # Bun workspace configuration
```

## Core Features

### @bactor/core

The core Actor system provides:

1. Actor Model Infrastructure
   - Message passing and handling
   - Lifecycle management (preStart, postStop, preRestart, postRestart)
   - State management and behavior switching
   - Supervision strategies

2. Message Routing System
   - Round Robin Router
   - Random Router
   - Broadcast Router
   - Consistent Hash Router

3. Dispatching System
   - Default Dispatcher (synchronous execution)
   - Thread Pool Dispatcher (parallel execution)
   - Throughput Dispatcher (batch processing)

4. Mailbox System
   - Default Mailbox (FIFO)
   - Priority Mailbox
   - Custom Queue Support

5. Remote Communication
   - gRPC Transport Layer
   - Remote Actor Creation and Management
   - Location Transparency

### @bactor/agent

The intelligent agent system provides:

1. Agent Abstraction Layer
   - Base Agent Class
   - Message Processing Framework
   - Memory Management (Short-term/Long-term)

2. Specialized Agents
   - Planner Agent
   - Executor Agent (planned)
   - Reviewer Agent (planned)
   - Critic Agent (planned)

3. Agent Coordination
   - Task Decomposition and Assignment
   - Result Aggregation
   - Error Handling and Recovery
   - Feedback Processing

## Quick Start

### Installation

```bash
# Install dependencies
bun install
```

### Building

```bash
# Build all packages
bun run build

# Build specific packages
bun run build:core
bun run build:agent
```

### Testing

```bash
# Run all tests
bun run test

# Run specific package tests
bun run test:core
bun run test:agent
```

## Usage Examples

### Creating a Simple Actor

```typescript
import { Actor, PropsBuilder, ActorSystem } from '@bactor/core';

// Create an Actor system
const system = new ActorSystem();

// Define an Actor class
class GreetingActor extends Actor {
  protected initializeBehaviors(): void {
    this.addBehavior('default', async (message) => {
      console.log(`Hello, ${message.payload}!`);
    });
  }
}

// Create an Actor instance
const props = PropsBuilder.fromClass(GreetingActor).build();
const pid = await system.spawn(props);

// Send a message
await system.send(pid, { type: 'greet', payload: 'World' });
```

### Using Intelligent Agents

```typescript
import { AgentSystem, PlannerAgent } from '@bactor/agent';

// Create an agent system
const system = new AgentSystem();

// Create a planner agent
const plannerConfig = {
  role: 'planner',
  capabilities: ['task_planning', 'coordination']
};

const plannerId = await system.createAgent(PlannerAgent, plannerConfig);

// Assign a task
const task = {
  type: 'TASK',
  sender: { id: 'user' },
  timestamp: Date.now(),
  payload: {
    description: 'Complete project documentation',
    requirements: ['Architecture overview', 'API documentation', 'Deployment guide']
  }
};

await system.send(plannerId, task);
```

## Technical Specifications

1. Runtime Requirements
   - Node.js >= 16.0.0
   - Bun >= 1.0.0

2. Dependency Versions
   - TypeScript >= 5.0.0
   - gRPC >= 1.9.0
   - UUID >= 9.0.0

3. Performance Metrics
   - Message Processing Latency < 1ms
   - Message Throughput > 100K/s
   - Memory Footprint < 100MB

## Future Roadmap

1. Core Enhancements
   - [ ] Cluster Support
   - [ ] Persistence
   - [ ] Performance Monitoring
   - [ ] Failover

2. Agent System Extensions
   - [ ] Additional Specialized Agents
   - [ ] Knowledge Graph Integration
   - [ ] Learning Capabilities
   - [ ] Multi-model Support

3. Tools and Ecosystem
   - [ ] CLI Tools
   - [ ] Visualization Dashboard
   - [ ] Example Applications
   - [ ] Plugin System

## Contributing

1. Fork the Project
2. Create your Feature Branch (`git checkout -b feature/amazing-feature`)
3. Commit your Changes (`git commit -m 'feat: add amazing feature'`)
4. Push to the Branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## License

MIT

## Contact

- Project Homepage: [GitHub](https://github.com/yourusername/bactor)
- Issue Tracker: [Issues](https://github.com/yourusername/bactor/issues)
