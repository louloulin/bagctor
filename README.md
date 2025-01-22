# Bactor Monorepo

A monorepo containing the Bactor actor system and its extensions.

## Project Structure

```
bactor/
├── packages/
│   ├── core/           # Core actor system implementation
│   │   ├── src/
│   │   │   ├── core/     # Core actor system components
│   │   │   └── remote/   # Remote actor system functionality
│   │   └── package.json
│   │
│   └── agent/          # MetaGPT-style agent system
│       ├── src/
│       │   ├── agents/   # Specific agent implementations
│       │   └── types.ts  # Agent system types
│       └── package.json
├── package.json        # Root package.json for workspace management
└── bun.workspace.ts    # Bun workspace configuration
```

## Packages

### @bactor/core

The core actor system implementation, providing:
- Actor model primitives
- Message passing infrastructure
- Remote actor capabilities
- Supervision strategies

### @bactor/agent

A MetaGPT-style multi-agent system built on top of Bactor, featuring:
- Agent abstraction layer
- Memory management
- Task planning and execution
- Agent coordination

## Development

### Setup

```bash
# Install dependencies
bun install

# Build all packages
bun run build

# Run tests
bun run test
```

### Package Scripts

Each package can be built and tested individually:

```bash
# Build specific package
bun run build:core
bun run build:agent

# Test specific package
bun run test:core
bun run test:agent
```

## License

MIT
