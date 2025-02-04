import { Actor, ActorContext, Message, log, ActorSystem } from '@bactor/core';
import { PluginManager } from '../plugin_manager';
import path from 'path';
import fs from 'fs-extra';

class TestActor extends Actor {
    constructor(context: ActorContext) {
        super(context);
    }

    protected behaviors(): void {
        this.addBehavior('default', async (msg: Message) => {
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
                        log.info('Calculation result:', msg.payload.result);
                    } else {
                        log.error('Calculation error:', msg.payload.error);
                    }
                    break;
            }
        });
    }
}

async function main() {
    const system = new ActorSystem();
    await system.start();

    const pluginManager = await system.spawn({
        producer: (context) => new PluginManager(context, {
            pluginsDir: path.resolve(__dirname, 'plugins'),
            tempDir: path.resolve(__dirname, 'temp')
        })
    });

    const testActor = await system.spawn({
        producer: (context) => new TestActor(context)
    });

    // Load calculator plugin metadata
    const calculatorPluginPath = path.resolve(__dirname, 'plugins/calculator');
    const metadataPath = path.join(calculatorPluginPath, 'plugin.json');
    const metadata = await fs.readJson(metadataPath);

    // Install calculator plugin
    await system.send(pluginManager, {
        type: 'plugin.install',
        payload: {
            metadata,
            config: {
                precision: 2,
                maxOperands: 5
            }
        },
        sender: testActor
    });

    // Wait for plugin to be installed
    await new Promise(resolve => setTimeout(resolve, 1000));

    // Query plugin status
    await system.send(pluginManager, {
        type: 'plugin.query',
        payload: {
            query: { id: metadata.id }
        },
        sender: testActor
    });

    // Wait for query response
    await new Promise(resolve => setTimeout(resolve, 1000));

    // Test calculator operations
    const calculatorId = metadata.id;

    // Test addition
    await system.send(pluginManager, {
        type: 'calculator.calculate',
        payload: {
            operation: 'add',
            operands: [1, 2, 3]
        },
        sender: testActor
    });

    // Test multiplication
    await system.send(pluginManager, {
        type: 'calculator.calculate',
        payload: {
            operation: 'multiply',
            operands: [2, 3, 4]
        },
        sender: testActor
    });

    // Test division
    await system.send(pluginManager, {
        type: 'calculator.calculate',
        payload: {
            operation: 'divide',
            operands: [100, 2, 2]
        },
        sender: testActor
    });

    // Wait for all calculations to complete
    await new Promise(resolve => setTimeout(resolve, 2000));
    await system.stop();
}

main().catch(error => {
    log.error('Demo failed:', error);
    process.exit(1);
}); 