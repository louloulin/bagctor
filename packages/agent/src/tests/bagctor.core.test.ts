import { Agent } from '@mastra/core/agent';
import { Mastra } from '@mastra/core';
import { createQwen } from 'qwen-ai-provider';
import { Bagctor } from '../bagctor';
import { expect, describe, it, beforeAll } from 'bun:test';
import { MCPIntegrationOptions } from '../mcp';
import { SharedAgentMemory } from '../distributed-interaction';

describe('Bagctor Core Tests', () => {
    let qwen: any;

    beforeAll(() => {
        qwen = createQwen({
            baseURL: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
            apiKey: process.env.QWEN_API_KEY,
        });
    });

    describe('Initialization', () => {
        it('should initialize with empty config', () => {
            const bagctor = new Bagctor();
            expect(bagctor).toBeDefined();
            expect(bagctor.agents).toEqual({});
            expect(bagctor.distributedNodes).toEqual([]);
            expect(bagctor.mcpIntegration).toBeUndefined();
            expect(bagctor.memoryManager).toBeUndefined();
        });

        it('should initialize with agents array', () => {
            const agent1 = new Agent({
                name: 'Agent1',
                instructions: 'Test agent 1',
                model: qwen('qwen-plus-2024-12-20'),
            });

            const agent2 = new Agent({
                name: 'Agent2',
                instructions: 'Test agent 2',
                model: qwen('qwen-plus-2024-12-20'),
            });

            const bagctor = new Bagctor({
                agents: [agent1, agent2]
            });

            expect(bagctor.agents).toBeDefined();
            expect(Object.keys(bagctor.agents)).toHaveLength(2);
            expect(bagctor.agents['Agent1']).toBeDefined();
            expect(bagctor.agents['Agent2']).toBeDefined();
        });

        it('should initialize with agents object', () => {
            const agent1 = new Agent({
                name: 'Agent1',
                instructions: 'Test agent 1',
                model: qwen('qwen-plus-2024-12-20'),
            });

            const agent2 = new Agent({
                name: 'Agent2',
                instructions: 'Test agent 2',
                model: qwen('qwen-plus-2024-12-20'),
            });

            const bagctor = new Bagctor({
                agents: {
                    Agent1: agent1,
                    Agent2: agent2
                }
            });

            expect(bagctor.agents).toBeDefined();
            expect(Object.keys(bagctor.agents)).toHaveLength(2);
            expect(bagctor.agents['Agent1']).toBeDefined();
            expect(bagctor.agents['Agent2']).toBeDefined();
        });

        it('should initialize with Mastra instance', () => {
            const agent = new Agent({
                name: 'MastraAgent',
                instructions: 'Test agent',
                model: qwen('qwen-plus-2024-12-20'),
            });

            const mastra = new Mastra({
                agents: { MastraAgent: agent }
            });

            const bagctor = new Bagctor({
                mastra: mastra
            });

            expect(bagctor.agents).toBeDefined();
            expect(Object.keys(bagctor.agents)).toHaveLength(1);
            expect(bagctor.agents['MastraAgent']).toBeDefined();
        });

        it('should initialize with multiple Mastra instances', () => {
            const agent1 = new Agent({
                name: 'MastraAgent1',
                instructions: 'Test agent 1',
                model: qwen('qwen-plus-2024-12-20'),
            });

            const agent2 = new Agent({
                name: 'MastraAgent2',
                instructions: 'Test agent 2',
                model: qwen('qwen-plus-2024-12-20'),
            });

            const mastra1 = new Mastra({
                agents: { MastraAgent1: agent1 }
            });

            const mastra2 = new Mastra({
                agents: { MastraAgent2: agent2 }
            });

            const bagctor = new Bagctor({
                mastra: [mastra1, mastra2]
            });

            expect(bagctor.agents).toBeDefined();
            expect(Object.keys(bagctor.agents)).toHaveLength(2);
            expect(bagctor.agents['MastraAgent1']).toBeDefined();
            expect(bagctor.agents['MastraAgent2']).toBeDefined();
        });
    });

    describe('Memory Management', () => {
        it('should enable memory system', () => {
            const bagctor = new Bagctor();
            const memoryManager = bagctor.enableMemorySystem();
            expect(memoryManager).toBeDefined();
            expect(bagctor.memoryManager).toBeDefined();
        });

        it('should enable memory system with custom options', () => {
            const bagctor = new Bagctor();
            const memoryManager = bagctor.enableMemorySystem({
                cacheSize: 100
            });
            expect(memoryManager).toBeDefined();
            expect(bagctor.memoryManager).toBeDefined();
        });

        it('should create shared memory context', async () => {
            const bagctor = new Bagctor();
            bagctor.enableMemorySystem();

            const sharedMemory = await bagctor.createSharedMemory('test-context');
            expect(sharedMemory).toBeDefined();
        });
    });

    describe('MCP Integration', () => {
        it('should enable MCP integration', async () => {
            const bagctor = new Bagctor();
            const mcpOptions: MCPIntegrationOptions = {
                enabled: true,
                servers: {
                    'test-server': {
                        url: 'https://test-server.com',
                        apiKey: 'test-key'
                    }
                }
            };

            await bagctor.enableMCP(mcpOptions);
            expect(bagctor.mcpIntegration).toBeDefined();
        });

        it('should register MCP tools to agent', async () => {
            const agent = new Agent({
                name: 'TestAgent',
                instructions: 'Test agent',
                model: qwen('qwen-plus-2024-12-20'),
            });

            const bagctor = new Bagctor({
                agents: { TestAgent: agent }
            });

            const mcpOptions: MCPIntegrationOptions = {
                enabled: true,
                servers: {
                    'test-server': {
                        url: 'https://test-server.com',
                        apiKey: 'test-key'
                    }
                },
                autoDiscoverTools: true
            };

            await bagctor.enableMCP(mcpOptions);
            const registeredTools = await bagctor.registerMCPToolsToAgent('TestAgent');
            expect(registeredTools).toBeDefined();
        });
    });

    describe('Distributed Mode', () => {
        it('should initialize in distributed mode', () => {
            const bagctor = new Bagctor({
                distribution: {
                    clustered: true,
                    nodeType: 'primary',
                    serverPort: 9000
                }
            });

            expect(bagctor.distributedNodes).toBeDefined();
            expect(bagctor.distributedNodes.length).toBe(1);
            expect(bagctor.distributedNodes[0].type).toBe('primary');
        });

        it('should initialize as worker node', () => {
            const bagctor = new Bagctor({
                distribution: {
                    clustered: true,
                    nodeType: 'worker',
                    primaryHost: 'localhost',
                    primaryPort: 9000
                }
            });

            expect(bagctor.distributedNodes).toBeDefined();
            expect(bagctor.distributedNodes.length).toBe(1);
            expect(bagctor.distributedNodes[0].type).toBe('worker');
        });

        it('should throw error when registering remote agent in non-distributed mode', async () => {
            const bagctor = new Bagctor();
            await expect(bagctor.registerRemoteAgent('TestAgent')).rejects.toThrow();
        });
    });

    describe('Error Handling', () => {
        it('should throw error when initializing with invalid agent', () => {
            const invalidAgent = new Agent({
                name: 'InvalidAgent',
                instructions: 'Invalid agent',
                model: qwen('qwen-plus-2024-12-20'),
            });

            delete (invalidAgent as any).name;

            expect(() => {
                new Bagctor({
                    agents: [invalidAgent]
                });
            }).toThrow();
        });

        it('should throw error when registering MCP tools without initialization', async () => {
            const bagctor = new Bagctor();
            await expect(bagctor.registerMCPToolsToAgent('TestAgent')).rejects.toThrow();
        });

        it('should throw error when registering MCP tools for non-existent agent', async () => {
            const bagctor = new Bagctor();
            await bagctor.enableMCP({
                enabled: true,
                servers: {
                    'test-server': {
                        url: 'https://test-server.com',
                        apiKey: 'test-key'
                    }
                }
            });

            await expect(bagctor.registerMCPToolsToAgent('NonExistentAgent')).rejects.toThrow();
        });
    });
}); 