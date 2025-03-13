# Bagctor

Bagctor (Bactor + AI Agent) is a hybrid framework that combines the Actor model with AI Agent capabilities, designed for building intelligent, distributed systems. It seamlessly integrates traditional actor-based concurrency with modern AI agent architectures, enabling the development of scalable, reactive, and intelligent applications.

[中文文档](README-zh.md)

## Overview

Bagctor provides two main components:
1. A robust Actor system for handling concurrency and distribution
2. An AI Agent framework that leverages the Actor model for coordinating intelligent agents

This unique combination allows you to:
- Build distributed systems with actor-based message passing
- Create AI agent networks that can collaborate and communicate
- Develop hybrid applications that mix traditional actors with AI capabilities
- Scale from single-machine deployments to distributed clusters

## Project Structure

```
bagctor/
├── packages/
│   ├── core/           # Core actor system implementation
│   │   ├── src/
│   │   │   ├── core/     # Core components
│   │   │   ├── remote/   # Remote functionality
│   │   │   └── examples/ # Example code
│   │   └── package.json
│   │
│   └── agent/          # AI Agent framework
│       ├── src/
│       │   ├── agents/   # AI Agent implementations
│       │   └── types.ts  # Agent system types
│       └── package.json
├── package.json        # Workspace management
├── turbo.json          # Turborepo configuration
└── bunfig.toml         # Bun configuration
```

## Development Setup

This project uses [Bun](https://bun.sh) as the JavaScript runtime and package manager, combined with [Turborepo](https://turbo.build) for optimized monorepo management.

### Prerequisites

- Install Bun: `curl -fsSL https://bun.sh/install | bash`

### Getting Started

1. Clone the repository:
```bash
git clone https://github.com/yourusername/bagctor.git
cd bagctor
```

2. Install dependencies:
```bash
bun install
```

3. Build all packages:
```bash
bun run build
```

### Development Workflow

- Start development mode for all packages:
```bash
bun run dev
```

- Run tests:
```bash
bun run test
```

- Clean build artifacts:
```bash
bun run clean
```

- Run a specific example:
```bash
bun run example:match
# or
bun run example:web
```

### Using the Helper Script

For operations not covered by Turborepo, you can use the helper script:

```bash
# Run a specific command in all packages
bun scripts/turbo-helper.js run-all <command>

# Clean all packages
bun scripts/turbo-helper.js clean-all

# Show help
bun scripts/turbo-helper.js help
```

## Core Features

### @bagctor/core

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

### @bagctor/agent

The AI Agent framework provides:

1. Agent Abstraction Layer
   - Base Agent Class with Actor Model Integration
   - AI-focused Message Processing Framework
   - Memory Management (Short-term/Long-term)
   - Model Integration Interface

2. Specialized AI Agents
   - Planner Agent with LLM Support
   - Executor Agent (planned)
   - Reviewer Agent (planned)
   - Critic Agent (planned)

3. Agent Coordination
   - Task Decomposition and Assignment
   - Result Aggregation with AI Processing
   - Error Handling and Recovery
   - Feedback Processing and Learning

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
import { Actor, PropsBuilder, ActorSystem } from '@bagctor/core';

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

### Using AI Agents

```typescript
import { AgentSystem, PlannerAgent } from '@bagctor/agent';

// Create an agent system
const system = new AgentSystem();

// Create a planner agent with AI capabilities
const plannerConfig = {
  role: 'planner',
  capabilities: ['task_planning', 'coordination'],
  model: 'gpt-4',
  parameters: {
    temperature: 0.7,
    maxTokens: 2000
  }
};

const plannerId = await system.createAgent(PlannerAgent, plannerConfig);

// Assign a complex task
const task = {
  type: 'TASK',
  sender: { id: 'user' },
  timestamp: Date.now(),
  payload: {
    description: 'Design a microservices architecture',
    requirements: [
      'Service decomposition',
      'API design',
      'Data consistency patterns',
      'Deployment strategy'
    ],
    context: {
      constraints: ['cloud-native', 'high-availability'],
      preferences: ['event-driven', 'domain-driven-design']
    }
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
   - Actor Message Processing Latency < 1ms
   - Actor Message Throughput > 100K/s
   - AI Agent Response Time: Configurable based on model
   - Memory Footprint < 100MB (excluding AI models)

## Future Roadmap

1. Core Enhancements
   - [ ] Cluster Support with AI-powered Load Balancing
   - [ ] Intelligent Persistence Strategies
   - [ ] AI-enhanced Performance Monitoring
   - [ ] Smart Failover Mechanisms

2. AI Agent System Extensions
   - [ ] Additional Specialized AI Agents
   - [ ] Knowledge Graph Integration
   - [ ] Multi-model Support with Model Switching
   - [ ] Federated Learning Capabilities
   - [ ] Agent Memory Optimization

3. Tools and Ecosystem
   - [ ] AI-powered CLI Tools
   - [ ] Smart Visualization Dashboard
   - [ ] Example Applications with AI Integration
   - [ ] Plugin System for Custom AI Models

## Contributing

1. Fork the Project
2. Create your Feature Branch (`git checkout -b feature/amazing-feature`)
3. Commit your Changes (`git commit -m 'feat: add amazing feature'`)
4. Push to the Branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## License

MIT

## Contact

- Project Homepage: [GitHub](https://github.com/yourusername/bagctor)
- Issue Tracker: [Issues](https://github.com/yourusername/bagctor/issues)
