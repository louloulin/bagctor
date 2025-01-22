# Bactor Agent System

A MetaGPT-style multi-agent system implementation using Bactor for agent communication and coordination.

## Overview

This package implements a multi-agent system where each agent is represented as a Bactor actor. The system enables agents to:

- Communicate asynchronously through message passing
- Maintain their own state and memory
- Execute specialized roles and tasks
- Coordinate in a distributed manner

## Core Components

1. **BaseAgent**: Abstract base class for all agents implementing common functionality
2. **AgentSystem**: Manages agent lifecycle and coordination
3. **AgentTypes**:
   - PlannerAgent: Creates and manages execution plans
   - ExecutorAgent: Handles task execution
   - ReviewerAgent: Reviews and provides feedback
   - CriticAgent: Evaluates outputs and suggests improvements

## Message Types

- TaskMessage: Represents a task to be performed
- ResultMessage: Contains task execution results
- FeedbackMessage: Provides review/criticism feedback
- CoordinationMessage: Used for agent coordination

## Usage Example

```typescript
import { AgentSystem, PlannerAgent, ExecutorAgent } from '@bactor/agent';

// Create agent system
const system = new AgentSystem();

// Initialize agents
const planner = await system.createAgent(PlannerAgent, {
  role: "planner",
  capabilities: ["task_decomposition", "planning"]
});

const executor = await system.createAgent(ExecutorAgent, {
  role: "executor",
  capabilities: ["code_generation", "task_execution"]
});

// Start a task
await planner.tell({
  type: "TASK",
  description: "Implement a new API endpoint",
  requirements: [...]
});
```

## Architecture

The system uses Bactor's actor model to implement:

1. Message-based communication between agents
2. State isolation and management
3. Concurrent task execution
4. Fault tolerance and supervision

Each agent runs in its own actor context, maintaining isolation while allowing coordinated behavior through message passing.

## Implementation Details

- Uses Bactor's core actor system for agent implementation
- Leverages router capabilities for message distribution
- Implements custom mailbox processing for agent-specific logic
- Provides supervision strategies for fault tolerance 