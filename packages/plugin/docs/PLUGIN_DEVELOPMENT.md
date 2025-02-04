# Bactor Plugin Development Guide

This guide explains how to develop plugins for the Bactor framework. Plugins can be developed in three different types and can run on both Node.js and Bun runtimes.

## Plugin Types

### 1. Inline Plugin (Actor-based)
Best for plugins that need direct access to the main application.

```typescript
import { Actor, ActorContext, Message } from '@bactor/core';

class MyPlugin extends Actor {
    constructor(context: ActorContext, config: any) {
        super(context);
        // Initialize your plugin
    }

    protected behaviors(): void {
        this.addBehavior('my.action', this.handleAction.bind(this));
    }

    private async handleAction(message: Message): Promise<void> {
        // Handle the action
        if (message.sender) {
            await this.context.send(message.sender, {
                type: 'my.response',
                payload: { success: true, data: result }
            });
        }
    }
}

export async function createActor(context: ActorContext, config: any): Promise<Actor> {
    return new MyPlugin(context, config);
}
```

### 2. Worker Plugin (Thread-based)
Best for CPU-intensive tasks.

```typescript
// Node.js Worker
import { parentPort, workerData } from 'worker_threads';

parentPort.on('message', async (message) => {
    try {
        const result = await processMessage(message);
        parentPort?.postMessage({
            type: 'my.response',
            payload: { success: true, data: result }
        });
    } catch (error) {
        parentPort?.postMessage({
            type: 'my.response',
            payload: { success: false, error: String(error) }
        });
    }
});

// Bun Worker
if (!Bun.isMainThread) {
    const { config } = Bun.workerData;
    
    Bun.onmessage = async (message) => {
        try {
            const result = await processMessage(message);
            Bun.postMessage({
                type: 'my.response',
                payload: { success: true, data: result }
            });
        } catch (error) {
            Bun.postMessage({
                type: 'my.response',
                payload: { success: false, error: String(error) }
            });
        }
    };
}
```

### 3. Process Plugin (Isolated Process)
Best for untrusted or potentially unstable plugins.

```typescript
// Get configuration
const pluginId = process.env.PLUGIN_ID;
const config = JSON.parse(process.env.PLUGIN_CONFIG || '{}');

// Handle messages
process.on('message', async (message) => {
    try {
        const result = await processMessage(message);
        process.send?.({
            type: 'my.response',
            payload: { success: true, data: result }
        });
    } catch (error) {
        process.send?.({
            type: 'my.response',
            payload: { success: false, error: String(error) }
        });
    }
});

// Handle cleanup
process.on('SIGTERM', () => process.exit(0));
process.on('SIGINT', () => process.exit(0));
```

## Project Structure

```
my-plugin/
├── package.json        # Package configuration
├── plugin.json        # Plugin metadata
├── src/
│   ├── index.ts      # Inline plugin
│   ├── worker.ts     # Worker plugin
│   └── process.ts    # Process plugin
├── tests/            # Plugin tests
└── README.md         # Plugin documentation
```

## Configuration Files

### package.json
```json
{
    "name": "@bactor/my-plugin",
    "version": "1.0.0",
    "description": "My Bactor plugin",
    "main": "dist/index.js",
    "module": "dist/index.js",
    "type": "module",
    "scripts": {
        "build": "tsc",
        "build:bun": "bun build ./src/index.ts --outdir ./dist",
        "test": "jest",
        "test:bun": "bun test"
    },
    "dependencies": {
        "@bactor/core": "^1.0.0"
    }
}
```

### plugin.json
```json
{
    "type": "inline",
    "runtime": "node",  // or "bun"
    "capabilities": ["my-feature"],
    "config": {
        "option1": "value1"
    },
    "entry": "dist/index.js"
}
```

## Development Workflow

1. Create Project Structure
```bash
mkdir my-plugin
cd my-plugin
npm init
```

2. Install Dependencies
```bash
npm install @bactor/core typescript @types/node
```

3. Configure TypeScript
```json
{
    "compilerOptions": {
        "target": "ES2020",
        "module": "ESNext",
        "outDir": "./dist",
        "strict": true,
        "esModuleInterop": true
    },
    "include": ["src"]
}
```

4. Implement Plugin
- Create src/index.ts for inline plugin
- Create src/worker.ts for worker plugin
- Create src/process.ts for process plugin

5. Test Plugin
```bash
# Node.js
npm test

# Bun
bun test
```

6. Build Plugin
```bash
# Node.js
npm run build

# Bun
bun run build
```

## Best Practices

1. Type Safety
```typescript
interface PluginConfig {
    option1: string;
    option2: number;
}

interface ActionPayload {
    data: string;
}

interface ResponsePayload {
    result: number;
}
```

2. Error Handling
```typescript
try {
    const result = await processData();
    return { success: true, data: result };
} catch (error) {
    log.error('Operation failed:', error);
    return { 
        success: false, 
        error: error instanceof Error ? error.message : String(error)
    };
}
```

3. Resource Management
```typescript
class MyPlugin extends Actor {
    private resources: Resource[] = [];

    async cleanup(): Promise<void> {
        await Promise.all(
            this.resources.map(r => r.dispose())
        );
    }
}
```

4. Message Validation
```typescript
function validateMessage(message: unknown): asserts message is ValidMessage {
    if (!message || typeof message !== 'object') {
        throw new Error('Invalid message format');
    }
    // Add more validation
}
```

5. Performance Optimization
```typescript
// Use batch processing when possible
async function processBatch(items: Item[]): Promise<Result[]> {
    return Promise.all(items.map(processItem));
}

// Cache expensive operations
const cache = new Map<string, Result>();
function getCachedResult(key: string): Result {
    if (!cache.has(key)) {
        cache.set(key, computeResult(key));
    }
    return cache.get(key)!;
}
```

## Testing

1. Unit Tests
```typescript
describe('MyPlugin', () => {
    it('should process action correctly', async () => {
        const plugin = new MyPlugin(mockContext, config);
        const result = await plugin.handleAction(testMessage);
        expect(result.success).toBe(true);
    });
});
```

2. Integration Tests
```typescript
describe('Plugin Integration', () => {
    it('should work with actor system', async () => {
        const system = new ActorSystem();
        const plugin = await system.spawn(MyPlugin, config);
        const response = await system.send(plugin, testMessage);
        expect(response.success).toBe(true);
    });
});
```

## Debugging

1. Enable Debug Logging
```typescript
log.setLevel('debug');
log.debug('Processing message:', message);
```

2. Use Performance Monitoring
```typescript
const start = performance.now();
await processData();
log.debug('Processing took:', performance.now() - start);
```

## Security Considerations

1. Input Validation
```typescript
function validateInput(data: unknown): void {
    if (typeof data !== 'string') {
        throw new Error('Invalid input type');
    }
    if (data.length > MAX_LENGTH) {
        throw new Error('Input too long');
    }
}
```

2. Resource Limits
```typescript
const MAX_MEMORY = 1024 * 1024 * 100; // 100MB
const MAX_CPU_TIME = 1000; // 1 second

function checkResourceLimits(): void {
    if (process.memoryUsage().heapUsed > MAX_MEMORY) {
        throw new Error('Memory limit exceeded');
    }
}
```

## Documentation

1. API Documentation
```typescript
/**
 * Processes the input data and returns a result
 * @param data The input data to process
 * @returns The processed result
 * @throws {ValidationError} If the input is invalid
 */
async function processData(data: InputData): Promise<Result> {
    // Implementation
}
```

2. Usage Examples
```typescript
// Example 1: Basic usage
const plugin = new MyPlugin(context, { option1: 'value1' });
await plugin.handleAction({ type: 'my.action', data: 'test' });

// Example 2: Advanced usage
const plugin = new MyPlugin(context, {
    option1: 'value1',
    option2: { advanced: true }
});
await plugin.handleBatchAction([
    { type: 'my.action', data: 'test1' },
    { type: 'my.action', data: 'test2' }
]);
``` 