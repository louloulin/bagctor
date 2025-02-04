import { ActorSystem, log } from '@bactor/core';
import * as path from 'path';
import { PluginManager } from '../../plugin_manager';
import { PluginMetadata } from '../../types';

async function runPluginDemo() {
    // Initialize actor system
    const system = new ActorSystem();
    await system.start();

    // Create plugin manager
    const pluginsDir = path.join(__dirname, 'plugins');
    const tempDir = path.join(__dirname, 'temp');
    const pluginManager = await system.createActor(PluginManager, {
        pluginsDir,
        tempDir
    });

    try {
        // Install calculator plugin
        const calculatorPluginPath = path.join(pluginsDir, 'calculator');
        await pluginManager.tell({
            type: 'plugin.install',
            data: { pluginPath: calculatorPluginPath }
        });

        log.info('Calculator plugin installed successfully');

        // Query plugin status
        const response = await pluginManager.ask({
            type: 'plugin.query',
            data: { query: { id: 'calculator' } }
        });
        log.info('Plugin status:', response.data);

        // Test addition
        const addResult = await pluginManager.ask({
            type: 'calculator.calculate',
            data: {
                operation: 'add',
                operands: [10, 5, 3]
            }
        });
        log.info('Addition result:', addResult.data);

        // Test multiplication
        const mulResult = await pluginManager.ask({
            type: 'calculator.calculate',
            data: {
                operation: 'multiply',
                operands: [2, 3, 4]
            }
        });
        log.info('Multiplication result:', mulResult.data);

        // Test division by zero (should handle error)
        const divResult = await pluginManager.ask({
            type: 'calculator.calculate',
            data: {
                operation: 'divide',
                operands: [10, 0]
            }
        });
        log.info('Division result:', divResult.data);

    } catch (error) {
        log.error('Error during plugin demo:', error);
    } finally {
        // Clean up
        await system.stop();
        log.info('Plugin demo completed');
    }
}

// Run the demo
if (require.main === module) {
    runPluginDemo().catch(error => {
        log.error('Demo failed:', error);
        process.exit(1);
    });
}

export { runPluginDemo }; 