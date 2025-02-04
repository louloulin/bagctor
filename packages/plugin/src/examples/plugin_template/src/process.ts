import { log } from '@bactor/core';

interface ProcessConfig {
    defaultOption: string;
    [key: string]: any;
}

// Get configuration from environment variables
const pluginId = process.env.PLUGIN_ID;
const config = JSON.parse(process.env.PLUGIN_CONFIG || '{}') as ProcessConfig;

if (!pluginId) {
    throw new Error('PLUGIN_ID environment variable is required');
}

// Initialize process
log.info('Initializing process plugin:', { pluginId, config });

// Send ready signal
process.send?.({ type: 'plugin.ready' });

// Handle messages
process.on('message', async (message: any) => {
    try {
        switch (message.type) {
            case 'template.action':
                const result = {
                    option: config.defaultOption,
                    ...message.payload
                };
                process.send?.({
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
        log.error('Process plugin error:', error);
        process.send?.({
            type: 'template.response',
            payload: {
                success: false,
                error: error instanceof Error ? error.message : String(error)
            }
        });
    }
});

// Handle process signals
process.on('SIGTERM', () => {
    log.info('Process plugin received SIGTERM signal');
    process.exit(0);
});

process.on('SIGINT', () => {
    log.info('Process plugin received SIGINT signal');
    process.exit(0);
}); 