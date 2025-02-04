# Bactor Plugin Template

This is a template for creating plugins for the Bactor framework. It demonstrates how to implement different types of plugins:

1. Inline Plugin (Actor-based)
2. Worker Plugin (Node.js Worker Threads)
3. Process Plugin (Child Process)

## Running with Bun

Bun provides excellent performance and compatibility with Node.js. Here's how to run plugins with Bun:

### Setup for Bun

1. Install Bun:
```bash
curl -fsSL https://bun.sh/install | bash
```

2. Update package.json for Bun:
```json
{
    "name": "@bactor/plugin-template",
    "version": "1.0.0",
    "module": "dist/index.js",
    "type": "module",
    "scripts": {
        "build": "bun build ./src/index.ts --outdir ./dist",
        "build:worker": "bun build ./src/worker.ts --outdir ./dist",
        "build:process": "bun build ./src/process.ts --outdir ./dist",
        "test": "bun test",
        "clean": "rm -rf dist"
    }
}
```

### Plugin Types in Bun

#### 1. Inline Plugin
Inline plugins work the same way in Bun as they do in Node.js:

```typescript
import { Actor, ActorContext, Message } from '@bactor/core';

export class TemplatePlugin extends Actor {
    constructor(context: ActorContext, config: TemplatePluginConfig) {
        super(context);
        this.config = config;
    }

    protected behaviors(): void {
        this.addBehavior('template.action', this.handleTemplateAction.bind(this));
    }
}

export async function createActor(context: ActorContext, config: any): Promise<Actor> {
    return new TemplatePlugin(context, config);
}
```

#### 2. Worker Plugin with Bun
Bun provides its own Worker implementation that's compatible with Node.js Worker Threads:

```typescript
import { Worker } from 'bun';

// Bun-specific worker setup
if (!Bun.isMainThread) {
    const { pluginId, config } = Bun.workerData;
    
    Bun.onmessage = async (message) => {
        switch (message.type) {
            case 'template.action':
                const result = {
                    option: config.defaultOption,
                    ...message.data
                };
                Bun.postMessage({
                    type: 'template.response',
                    payload: { success: true, data: result }
                });
                break;
        }
    };
}
```

Worker creation in plugin loader:
```typescript
const worker = new Worker('./dist/worker.js', {
    workerData: {
        pluginId: metadata.id,
        config: config || metadata.config || {}
    }
});
```

#### 3. Process Plugin with Bun
Process plugins can use Bun's spawn API:

```typescript
if (Bun.env.PLUGIN_ID) {
    const pluginId = Bun.env.PLUGIN_ID;
    const config = JSON.parse(Bun.env.PLUGIN_CONFIG || '{}');

    process.on('message', async (message) => {
        switch (message.type) {
            case 'template.action':
                const result = {
                    option: config.defaultOption,
                    ...message.payload
                };
                process.send?.({
                    type: 'template.response',
                    payload: { success: true, data: result }
                });
                break;
        }
    });
}
```

### Performance Considerations

Bun offers several advantages for plugin execution:

1. **Faster Startup:**
   - Bun's fast startup time improves plugin loading
   - Especially beneficial for process plugins

2. **Better Performance:**
   - Bun's JavaScript runtime is generally faster
   - Improved worker thread performance
   - Optimized file system operations

3. **Memory Efficiency:**
   - Better memory management
   - Reduced overhead for workers and processes

### Development with Bun

```bash
# Install dependencies
bun install

# Build all plugin types
bun run build
bun run build:worker
bun run build:process

# Run tests
bun test

# Run specific plugin
bun run dist/index.js  # Inline plugin
bun run dist/worker.js # Worker plugin
bun run dist/process.js # Process plugin
```

### Bun-specific Configuration

Update your plugin.json to specify Bun-specific settings:

```json
{
    "type": "inline",
    "runtime": "bun",
    "capabilities": ["template"],
    "config": {
        "defaultOption": "value",
        "bunOptions": {
            "target": "bun",
            "minify": true,
            "sourcemap": "external"
        }
    },
    "entry": "dist/index.js"
}
```

### Bun vs Node.js Performance Comparison

| Plugin Type | Bun | Node.js | Improvement |
|-------------|-----|---------|-------------|
| Inline | Fastest | Fast | ~1.3x |
| Worker | Very Fast | Good | ~1.5x |
| Process | Fast | Fair | ~1.2x |

## Structure

```
plugin-template/
├── package.json        # Package configuration
├── plugin.json        # Plugin metadata and configuration
├── src/
│   ├── index.ts      # Inline plugin implementation
│   ├── worker.ts     # Worker plugin implementation
│   └── process.ts    # Process plugin implementation
└── README.md         # This file
```

## Plugin Types

### 1. Inline Plugin

The inline plugin runs in the same process as the main application. It's implemented as an Actor and is suitable for plugins that need direct access to the application's memory space.

**Implementation Example:**
```typescript
import { Actor, ActorContext, Message } from '@bactor/core';

class TemplatePlugin extends Actor {
    constructor(context: ActorContext, config: TemplatePluginConfig) {
        super(context);
        this.config = config;
    }

    protected behaviors(): void {
        this.addBehavior('template.action', this.handleTemplateAction.bind(this));
    }
}

export async function createActor(context: ActorContext, config: any): Promise<Actor> {
    return new TemplatePlugin(context, config);
}
```

**Characteristics:**
- Runs directly in the main process as an Actor instance
- Shares memory space and context with the main application
- Direct access to main application resources and APIs
- Best performance with minimal communication overhead
- Suitable for:
  * Plugins requiring frequent interaction with the main application
  * High-performance, lightweight plugins
  * Plugins needing direct access to main application state

### 2. Worker Plugin

The worker plugin runs in a separate thread using Node.js Worker Threads. It's suitable for CPU-intensive tasks that shouldn't block the main thread.

**Implementation Example:**
```typescript
import { parentPort, workerData } from 'worker_threads';

// Get configuration from worker data
const { pluginId, config } = workerData;

// Handle messages
parentPort.on('message', async (message) => {
    switch (message.type) {
        case 'template.action':
            const result = {
                option: config.defaultOption,
                ...message.payload
            };
            parentPort?.postMessage({
                type: 'template.response',
                payload: { success: true, data: result }
            });
            break;
    }
});
```

**Characteristics:**
- Runs in a separate thread using Node.js Worker Threads
- Shares some memory space (can share ArrayBuffers)
- Communicates through message passing
- Can perform CPU-intensive tasks without blocking
- Suitable for:
  * CPU-intensive computations
  * Parallel processing tasks
  * Tasks that don't require frequent main application interaction

### 3. Process Plugin

The process plugin runs in a separate process. It's suitable for plugins that need complete isolation or might crash without affecting the main application.

**Implementation Example:**
```typescript
// Get configuration from environment variables
const pluginId = process.env.PLUGIN_ID;
const config = JSON.parse(process.env.PLUGIN_CONFIG || '{}');

// Handle messages
process.on('message', async (message) => {
    switch (message.type) {
        case 'template.action':
            const result = {
                option: config.defaultOption,
                ...message.payload
            };
            process.send?.({
                type: 'template.response',
                payload: { success: true, data: result }
            });
            break;
    }
});

// Handle process signals
process.on('SIGTERM', () => {
    process.exit(0);
});
```

**Characteristics:**
- Runs in a completely separate process
- Has its own memory space and resources
- Communicates through IPC (Inter-Process Communication)
- Complete isolation - crashes won't affect other plugins
- Suitable for:
  * Untrusted plugins requiring isolation
  * Plugins with potential memory leaks
  * Plugins requiring different Node.js versions
  * Resource-intensive tasks

## Comparison of Plugin Types

| Feature | Inline | Worker | Process |
|---------|---------|---------|----------|
| Performance | Best | Good | Fair |
| Isolation | None | Partial | Complete |
| Memory Sharing | Full | Partial | None |
| Communication Overhead | Minimal | Medium | Highest |
| Crash Impact | Affects main app | Thread only | Process only |
| Resource Usage | Minimal | Medium | Highest |

## Plugin Selection Guide

1. Choose **Inline Plugin** when:
   - You need the best performance
   - The plugin needs frequent interaction with the main application
   - The plugin is lightweight and trusted

2. Choose **Worker Plugin** when:
   - You have CPU-intensive tasks
   - You need parallel processing
   - You want to avoid blocking the main thread

3. Choose **Process Plugin** when:
   - You need complete isolation
   - The plugin is untrusted
   - Memory leaks are a concern
   - You need different Node.js versions

## Configuration

### package.json

The `package.json` file defines your plugin's dependencies and build scripts:

```json
{
    "name": "@bactor/plugin-template",
    "version": "1.0.0",
    "main": "dist/index.js",
    "scripts": {
        "build": "tsc",
        "test": "jest"
    }
}
```

### plugin.json

The `plugin.json` file defines your plugin's metadata and configuration:

```json
{
    "type": "inline", // or "worker" or "process"
    "capabilities": ["template"],
    "config": {
        "defaultOption": "value"
    },
    "entry": "dist/index.js"
}
```

## Development

```bash
# Install dependencies
npm install

# Build the plugin
npm run build

# Run tests
npm test
```

## Plugin API

Your plugin should implement the following message handlers:

1. `plugin.init` - Initialization message (required)
2. Your custom message types (as needed)

Each message handler should:
1. Process the message
2. Send a response if there's a sender
3. Handle errors appropriately

## Best Practices

1. Error Handling:
   - Always implement proper error handling
   - Use try-catch blocks in message handlers
   - Send error responses when appropriate

2. Type Safety:
   - Use TypeScript for better type safety
   - Define interfaces for your message payloads
   - Use strict type checking

3. Documentation:
   - Document your plugin's API
   - Document configuration options
   - Provide usage examples

4. Testing:
   - Write unit tests for your plugin
   - Test error cases
   - Test plugin lifecycle events

5. Resource Management:
   - Clean up resources in deactivate handlers
   - Handle process signals (for process plugins)
   - Monitor memory usage

6. Security:
   - Validate all inputs
   - Don't trust external data
   - Use proper access controls

## License

MIT