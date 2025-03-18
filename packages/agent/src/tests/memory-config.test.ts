/**
 * 内存配置测试
 * 
 * 测试Bagctor的内存配置和增强型Agent功能
 */

import { expect, describe, it, vi, beforeEach, afterEach } from 'vitest';
import { Agent } from '@mastra/core/agent';
import { createMemoryManager, ImportanceLevel } from '../memory';
import { createEnhancedAgent } from '../agent-adapters';
import { MemoryOptions } from '../memory-config';

// Mock Agent类
class MockAgent {
    name?: string;
    instructions?: string;

    constructor(config: { name?: string; instructions?: string }) {
        this.name = config.name;
        this.instructions = config.instructions;
    }

    async generate(input: string) {
        return {
            text: `Response to: ${input}`
        };
    }

    async stream(input: string, options: any) {
        if (options.onStart) options.onStart();
        if (options.onToken) options.onToken("Streaming ");
        if (options.onToken) options.onToken("response");
        if (options.onComplete) options.onComplete({ text: "Streaming response" });
        return Promise.resolve();
    }
}

describe('Memory Configuration Tests', () => {
    let mockAgent: any;
    let memoryManager: any;
    let enhancedAgent: any;

    beforeEach(() => {
        mockAgent = new MockAgent({
            name: "TestBot",
            instructions: "You are a test assistant"
        });

        memoryManager = createMemoryManager();
        enhancedAgent = createEnhancedAgent(mockAgent, memoryManager);

        // Mock memory functions
        vi.spyOn(memoryManager, 'addMemory').mockImplementation(async (item) => {
            return `mem_${Date.now()}`;
        });

        vi.spyOn(memoryManager, 'getRelevantMemories').mockImplementation(async (options) => {
            return [
                {
                    id: 'mem_1',
                    type: 'fact',
                    content: 'User likes programming',
                    timestamp: Date.now(),
                    source: 'test',
                    importance: ImportanceLevel.Medium
                }
            ];
        });
    });

    afterEach(() => {
        vi.clearAllMocks();
    });

    it('应该在generate方法中使用内存配置', async () => {
        const addMemorySpy = vi.spyOn(memoryManager, 'addMemory');
        const generateSpy = vi.spyOn(mockAgent, 'generate');

        const result = await enhancedAgent.generate('Test input', {
            resourceId: 'user_1',
            threadId: 'thread_1',
            memoryOptions: {
                lastMessages: 5,
                semanticRecall: {
                    topK: 3
                }
            }
        });

        expect(result).toBeDefined();
        expect(generateSpy).toHaveBeenCalled();
        expect(addMemorySpy).toHaveBeenCalled();
    });

    it('应该在stream方法中使用内存配置', async () => {
        const addMemorySpy = vi.spyOn(memoryManager, 'addMemory');
        const streamSpy = vi.spyOn(mockAgent, 'stream');

        let tokensReceived = '';

        await enhancedAgent.stream('Test stream', {
            resourceId: 'user_1',
            threadId: 'thread_1',
            memoryOptions: {
                lastMessages: 5
            },
            onToken: (token: string) => {
                tokensReceived += token;
            }
        });

        expect(streamSpy).toHaveBeenCalled();
        expect(addMemorySpy).toHaveBeenCalled();
        expect(tokensReceived).toBe('Streaming response');
    });

    it('应该添加记忆到存储', async () => {
        const addMemorySpy = vi.spyOn(memoryManager, 'addMemory');

        await enhancedAgent.addToMemory('Important fact', {
            type: 'fact',
            importance: ImportanceLevel.High,
            resourceId: 'user_1',
            threadId: 'thread_1'
        });

        expect(addMemorySpy).toHaveBeenCalled();
        expect(addMemorySpy.mock.calls[0][0].content).toBe('Important fact');
        expect(addMemorySpy.mock.calls[0][0].type).toBe('fact');
        expect(addMemorySpy.mock.calls[0][0].importance).toBe(ImportanceLevel.High);
    });

    it('应该获取上下文记忆', async () => {
        const getRelevantSpy = vi.spyOn(memoryManager, 'getRelevantMemories');

        const context = await enhancedAgent.getContextMemories('Query input', {
            memoryOptions: {
                lastMessages: 10,
                semanticRecall: {
                    topK: 5
                }
            },
            resourceId: 'user_1',
            threadId: 'thread_1'
        });

        expect(getRelevantSpy).toHaveBeenCalled();
        expect(context).toContain('User likes programming');
    });

    it('缺少resourceId或threadId时应该抛出错误', async () => {
        await expect(enhancedAgent.addToMemory('Test', {
            type: 'fact'
            // 缺少resourceId和threadId
        })).rejects.toThrow();
    });
}); 