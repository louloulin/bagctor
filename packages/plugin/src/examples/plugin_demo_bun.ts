import { ActorSystem, log, Actor, Message, ActorContext } from '@bactor/core';
import * as path from 'path';
import * as fs from 'fs-extra';
import { PluginManager } from '../plugin_manager';
import { PluginMetadata } from '../types';

class TestActor extends Actor {
    constructor(context: ActorContext) {
        super(context);
        log.info('Test actor constructed');
    }

    protected behaviors(): void {
        log.info('Registering test actor behaviors');
        this.addBehavior('default', async (msg: Message) => {
            log.info('Test actor received message:', {
                type: msg.type,
                payload: msg.payload,
                sender: msg.sender
            });
            switch (msg.type) {
                case 'plugin.response':
                    if (msg.payload.success) {
                        log.info('Plugin operation succeeded:', msg.payload.data);
                    } else {
                        log.error('Plugin operation failed:', msg.payload.error);
                    }
                    break;
                case 'calculator.result':
                    if (msg.payload.success) {
                        log.info('Calculation result:', {
                            result: msg.payload.result,
                            operation: msg.payload.operation,
                            operands: msg.payload.operands
                        });
                    } else {
                        log.error('Calculation failed:', msg.payload.error);
                    }
                    break;
                default:
                    log.info('Received unknown response:', msg);
            }
        });
    }
}

async function runPluginDemoBun() {
    log.info('Starting plugin demo with Bun runtime');

    // Initialize actor system
    const system = new ActorSystem();
    await system.start();
    log.info('Actor system started');

    // Create plugin manager with Bun configuration
    const currentDir = import.meta.dir || __dirname;
    const pluginsDir = path.join(currentDir, 'calculator');
    const tempDir = path.join(currentDir, 'temp');
    log.info('Plugin directories:', { pluginsDir, tempDir });

    const pluginManager = await system.spawn({
        producer: (context) => new PluginManager(context, {
            pluginsDir,
            tempDir,
            runtime: 'bun'
        })
    });
    log.info('Plugin manager created with ID:', pluginManager);

    try {
        // Install calculator plugin with Bun runtime
        const calculatorPluginPath = path.join(pluginsDir);
        log.info('Installing calculator plugin from:', calculatorPluginPath);

        // Load and modify plugin metadata for Bun
        const metadataPath = path.join(calculatorPluginPath, 'src', 'plugin.json');
        log.info('Loading plugin metadata from:', metadataPath);
        const metadata = await fs.readJson(metadataPath) as PluginMetadata;
        metadata.runtime = 'bun'; // Specify Bun runtime
        log.info('Plugin metadata loaded:', metadata);

        // Install plugin with metadata
        log.info('Sending plugin install message');
        await system.send(pluginManager, {
            type: 'plugin.install',
            payload: { metadata }
        });
        log.info('Calculator plugin installed successfully');

        // Activate the plugin
        log.info('Activating calculator plugin');
        await system.send(pluginManager, {
            type: 'plugin.activate',
            payload: { pluginId: 'calculator' }
        });
        log.info('Calculator plugin activated');

        // Create a test actor to receive responses
        log.info('Creating test actor');
        const testActor = await system.spawn({
            producer: (context) => new TestActor(context)
        });
        log.info('Test actor created with ID:', testActor);

        // Run performance tests
        log.info('Running performance tests');

        // Test inline plugin performance
        log.info('Testing inline plugin performance');
        const startInline = performance.now();
        for (let i = 0; i < 1000; i++) {
            await system.send(pluginManager, {
                type: 'calculator.calculate',
                payload: {
                    pluginId: 'calculator',
                    operation: 'add',
                    operands: [i, i + 1]
                },
                sender: testActor
            });
        }
        const inlineTime = performance.now() - startInline;
        log.info('Inline plugin performance:', { operations: 1000, time: inlineTime });

        // Test worker plugin performance
        log.info('Testing worker plugin performance');
        metadata.type = 'worker';
        await system.send(pluginManager, {
            type: 'plugin.install',
            payload: { metadata }
        });
        await system.send(pluginManager, {
            type: 'plugin.activate',
            payload: { pluginId: 'calculator' }
        });

        const startWorker = performance.now();
        for (let i = 0; i < 1000; i++) {
            await system.send(pluginManager, {
                type: 'calculator.calculate',
                payload: {
                    pluginId: 'calculator',
                    operation: 'multiply',
                    operands: [i, i + 1]
                },
                sender: testActor
            });
        }
        const workerTime = performance.now() - startWorker;
        log.info('Worker plugin performance:', { operations: 1000, time: workerTime });

        // Test process plugin performance
        log.info('Testing process plugin performance');
        metadata.type = 'process';
        await system.send(pluginManager, {
            type: 'plugin.install',
            payload: { metadata }
        });
        await system.send(pluginManager, {
            type: 'plugin.activate',
            payload: { pluginId: 'calculator' }
        });

        const startProcess = performance.now();
        for (let i = 0; i < 1000; i++) {
            await system.send(pluginManager, {
                type: 'calculator.calculate',
                payload: {
                    pluginId: 'calculator',
                    operation: 'divide',
                    operands: [i + 1, 1]
                },
                sender: testActor
            });
        }
        const processTime = performance.now() - startProcess;
        log.info('Process plugin performance:', { operations: 1000, time: processTime });

        // Compare performance
        log.info('Performance comparison:', {
            inline: { time: inlineTime, opsPerSecond: 1000 / (inlineTime / 1000) },
            worker: { time: workerTime, opsPerSecond: 1000 / (workerTime / 1000) },
            process: { time: processTime, opsPerSecond: 1000 / (processTime / 1000) }
        });

    } catch (error) {
        log.error('Error during plugin demo:', error instanceof Error ? error.message : String(error));
        if (error instanceof Error && error.stack) {
            log.error('Stack trace:', error.stack);
        }
    } finally {
        // Clean up
        log.info('Stopping actor system');
        await system.stop();
        log.info('Plugin demo completed');
    }
}

// Run the demo if this is the main module
if (import.meta.main || require.main === module) {
    runPluginDemoBun().catch(error => {
        log.error('Demo failed:', error instanceof Error ? error.message : String(error));
        if (error instanceof Error && error.stack) {
            log.error('Stack trace:', error.stack);
        }
        process.exit(1);
    });
}

export { runPluginDemoBun }; 