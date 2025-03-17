# Bagctor Agent

Bagctor Agent is a distributed agent system that extends Mastra with Actor model capabilities.

## Features

- **100% Mastra API compatible**: Fully compliant with the Mastra API for seamless migration
- **Multiple Agent Sources**: Support for passing arrays of agents and Mastra instances
- **Workflow Support**: Create and execute workflows with multiple agents
- **Agent Orchestration**: Coordinate multiple agents with different orchestration strategies
- **Distributed Deployment**: Deploy agents across multiple nodes for scalability

## Installation

```bash
npm install @bagctor/agent
```

## Basic Usage

```typescript
import { Agent } from '@mastra/core/agent';
import { openai } from '@ai-sdk/openai';
import { Bagctor } from '@bagctor/agent';

// Create agents
const myAgent = new Agent({
  name: 'MyAgent',
  instructions: 'You are a helpful assistant.',
  model: openai('gpt-4o'),
});

// Create Bagctor instance
const bagctor = new Bagctor({
  agents: { myAgent },
  distribution: {
    clustered: true,
    serverPort: 9000
  }
});

// Use the agent
const response = await bagctor.agents.myAgent.generate('Hello, how can you help me?');
console.log(response.text);
```

## Multiple Agents and Mastra Instances

Bagctor supports passing agents as both an object map and an array:

```typescript
// Using an array of agents
const bagctor = new Bagctor({
  agents: [agent1, agent2, agent3],
  distribution: {
    clustered: true
  }
});

// Using Mastra instances
const bagctor = new Bagctor({
  mastra: [mastraInstance1, mastraInstance2],
  distribution: {
    clustered: true
  }
});

// Using both
const bagctor = new Bagctor({
  agents: { customAgent },
  mastra: [mastraInstance1, mastraInstance2],
  distribution: {
    clustered: true
  }
});
```

## Agent Orchestration

Orchestrate multiple agents with different strategies:

```typescript
const orchestrator = bagctor.createOrchestrator({
  agents: ['researchAgent', 'writingAgent', 'codeAgent'],
  orchestrationStrategy: 'hierarchical'
});

const result = await orchestrator.execute('Create a guide on distributed systems');
```

## Distributed Deployment

Bagctor supports distributed deployment across multiple nodes:

```typescript
// Primary node
const primary = new Bagctor({
  agents: { myAgent },
  distribution: {
    nodeType: 'primary',
    serverPort: 9000
  }
});

// Worker node
const worker = new Bagctor({
  distribution: {
    nodeType: 'worker',
    primaryHost: 'primary-host-address',
    primaryPort: 9000
  }
});

// Register remote agent
const remoteAgent = await worker.registerRemoteAgent('myAgent');
```

## API Service

Start an API service to expose your agents:

```typescript
await bagctor.serve({
  port: 4111,
  enablePlayground: true
});
```

## License

MIT 