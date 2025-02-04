import { expect, describe, test } from 'bun:test';
import { ActorContext, Message, Actor, ActorSystem, PID, log } from '@bactor/core';
import { createActor } from '../index';

class ResponseCollector extends Actor {
    private responses: Map<string, Message> = new Map();

    constructor(context: ActorContext) {
        super(context);
        log.info('ResponseCollector constructed');
    }

    protected behaviors(): void {
        this.addBehavior('default', async (msg: Message) => {
            log.info('ResponseCollector received message:', {
                type: msg.type,
                payload: msg.payload,
                sender: msg.sender
            });

            // Store response based on the original message type
            const responseType = msg.type.replace('.response', '');
            this.responses.set(responseType, msg);
            log.info('ResponseCollector stored response for:', responseType);
        });
        log.info('ResponseCollector behaviors registered');
    }

    public getResponse(type: string): Message | undefined {
        return this.responses.get(type);
    }
}

describe('Template Plugin Tests', () => {
    test('should create plugin with custom config', async () => {
        const system = new ActorSystem();
        await system.start();

        const config = {
            name: 'test-plugin',
            version: '1.0.0',
            description: 'Test plugin instance',
            defaultOption: 'custom-option'
        };

        const plugin = await system.spawn({
            producer: async (context) => await createActor(context, config)
        });

        expect(plugin).toBeDefined();
        await system.stop();
    });

    test('should handle plugin action', async () => {
        const system = new ActorSystem();
        await system.start();
        log.info('Actor system started');

        const collector = await system.spawn({
            producer: (context) => new ResponseCollector(context)
        });

        const plugin = await system.spawn({
            producer: async (context) => await createActor(context, {
                name: 'test-plugin',
                defaultOption: 'test-option'
            })
        });

        // Test plugin action
        await system.send(plugin, {
            type: 'plugin.action',
            payload: { data: 'test-data' },
            sender: collector
        });

        // Wait for response
        const response = await waitForResponse(system, collector, 'plugin.action');
        expect(response).toBeDefined();
        expect(response?.payload.success).toBe(true);
        expect(response?.payload.data.option).toBe('test-option');
        expect(response?.payload.data.data).toBe('test-data');
        expect(response?.payload.timestamp).toBeDefined();

        await system.stop();
    });

    test('should handle status request', async () => {
        const system = new ActorSystem();
        await system.start();

        const collector = await system.spawn({
            producer: (context) => new ResponseCollector(context)
        });

        const plugin = await system.spawn({
            producer: async (context) => await createActor(context, {
                name: 'test-plugin',
                version: '1.0.0'
            })
        });

        // Request status
        await system.send(plugin, {
            type: 'plugin.status',
            sender: collector
        });

        // Wait for response
        const response = await waitForResponse(system, collector, 'plugin.status');
        expect(response).toBeDefined();
        expect(response?.payload.success).toBe(true);
        expect(response?.payload.data.name).toBe('test-plugin');
        expect(response?.payload.data.version).toBe('1.0.0');
        expect(response?.payload.data.status).toBe('active');
        expect(response?.payload.data.uptime).toBeDefined();

        await system.stop();
    });

    test('should handle config update', async () => {
        const system = new ActorSystem();
        await system.start();

        const collector = await system.spawn({
            producer: (context) => new ResponseCollector(context)
        });

        const plugin = await system.spawn({
            producer: async (context) => await createActor(context, {
                name: 'test-plugin',
                defaultOption: 'initial-option'
            })
        });

        // Update config
        await system.send(plugin, {
            type: 'plugin.config',
            payload: {
                defaultOption: 'updated-option'
            },
            sender: collector
        });

        // Wait for response
        const response = await waitForResponse(system, collector, 'plugin.config');
        expect(response).toBeDefined();
        expect(response?.payload.success).toBe(true);
        expect(response?.payload.data.config.defaultOption).toBe('updated-option');

        await system.stop();
    });

    test('should handle unknown message type', async () => {
        const system = new ActorSystem();
        await system.start();

        const collector = await system.spawn({
            producer: (context) => new ResponseCollector(context)
        });

        const plugin = await system.spawn({
            producer: async (context) => await createActor(context, {
                name: 'test-plugin'
            })
        });

        // Send unknown message type
        await system.send(plugin, {
            type: 'unknown.action',
            sender: collector
        });

        // Wait for response
        const response = await waitForResponse(system, collector, 'unknown.action');
        expect(response).toBeDefined();
        expect(response?.payload.success).toBe(false);
        expect(response?.payload.error).toContain('Unknown message type');

        await system.stop();
    });
});

// Helper function to wait for response
async function waitForResponse(system: ActorSystem, collector: PID, type: string, timeout: number = 1000): Promise<Message | undefined> {
    const startTime = Date.now();
    while (Date.now() - startTime < timeout) {
        const collectorInstance = system.getActor(collector.id) as ResponseCollector;
        const response = collectorInstance.getResponse(type);
        if (response) {
            return response;
        }
        await new Promise(resolve => setTimeout(resolve, 50));
    }
    throw new Error(`No response received for ${type} after ${timeout}ms`);
} 