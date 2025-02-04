import { parentPort, workerData } from 'worker_threads';
import { log } from '@bactor/core';

interface WorkerConfig {
    pluginId: string;
    config: {
        defaultOption: string;
        [key: string]: any;
    };
}

if (!parentPort) {
    throw new Error('This module must be run as a worker');
}

// Get configuration from worker data
const { pluginId, config } = workerData as WorkerConfig;

// Initialize worker
log.info('Initializing worker plugin:', { pluginId, config });

// Handle messages
parentPort.on('message', async (message: any) => {
    try {
        switch (message.type) {
            case 'plugin.init':
                log.info('Worker plugin initialized:', message.payload);
                parentPort?.postMessage({ type: 'plugin.ready' });
                break;

            case 'template.action':
                const result = {
                    option: config.defaultOption,
                    ...message.payload
                };
                parentPort?.postMessage({
                    type: 'template.response',
                    payload: {
                        success: true,
                        data: result
                    }
                });
                break;

            default:
                throw new Error(`Unknown message type: ${message.type}`);
        }
    } catch (error) {
        log.error('Worker plugin error:', error);
        parentPort?.postMessage({
            type: 'template.response',
            payload: {
                success: false,
                error: error instanceof Error ? error.message : String(error)
            }
        });
    }
}); 