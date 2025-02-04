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

async function runPluginDemo() {
    log.info('Starting plugin demo');

    // Initialize actor system
    const system = new ActorSystem();
    await system.start();
    log.info('Actor system started');

    // Create plugin manager
    const pluginsDir = path.join(__dirname, 'plugins');
    const tempDir = path.join(__dirname, 'temp');
    log.info('Plugin directories:', { pluginsDir, tempDir });

    const pluginManager = await system.spawn({
        producer: (context) => new PluginManager(context, {
            pluginsDir,
            tempDir
        })
    });
    log.info('Plugin manager created with ID:', pluginManager);

    try {
        // Install calculator plugin
        const calculatorPluginPath = path.join(pluginsDir, 'calculator');
        log.info('Installing calculator plugin from:', calculatorPluginPath);

        // Load plugin metadata
        const metadataPath = path.join(calculatorPluginPath, 'plugin.json');
        log.info('Loading plugin metadata from:', metadataPath);
        const metadata = await fs.readJson(metadataPath) as PluginMetadata;
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

        // Query plugin status
        log.info('Querying calculator plugin status');
        await system.send(pluginManager, {
            type: 'plugin.query',
            payload: { query: { id: 'calculator' } },
            sender: testActor
        });

        // Test addition
        log.info('Testing addition operation');
        const addMessage = {
            type: 'calculator.calculate',
            payload: {
                pluginId: 'calculator',
                operation: 'add',
                operands: [10, 5, 3]
            },
            sender: testActor
        };
        log.info('Sending addition message:', addMessage);
        await system.send(pluginManager, addMessage);

        // Test multiplication
        log.info('Testing multiplication operation');
        const mulMessage = {
            type: 'calculator.calculate',
            payload: {
                pluginId: 'calculator',
                operation: 'multiply',
                operands: [2, 3, 4]
            },
            sender: testActor
        };
        log.info('Sending multiplication message:', mulMessage);
        await system.send(pluginManager, mulMessage);

        // Test division by zero (should handle error)
        log.info('Testing division by zero (error case)');
        const divMessage = {
            type: 'calculator.calculate',
            payload: {
                pluginId: 'calculator',
                operation: 'divide',
                operands: [10, 0]
            },
            sender: testActor
        };
        log.info('Sending division message:', divMessage);
        await system.send(pluginManager, divMessage);

        // Wait longer for responses
        log.info('Waiting for responses...');
        await new Promise(resolve => setTimeout(resolve, 5000));

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

// Run the demo
if (require.main === module) {
    runPluginDemo().catch(error => {
        log.error('Demo failed:', error instanceof Error ? error.message : String(error));
        if (error instanceof Error && error.stack) {
            log.error('Stack trace:', error.stack);
        }
        process.exit(1);
    });
}

export { runPluginDemo }; 