import { test, expect, describe, beforeAll, afterAll } from 'bun:test';
import { ActorSystem } from '@bactor/core';
import { AgentMemoryActor, MemoryItem } from '../src';

describe('Agent Memory', () => {
    let system: ActorSystem;
    let memoryActorRef: any;

    beforeAll(async () => {
        system = new ActorSystem();
        memoryActorRef = await system.spawn({
            actorClass: AgentMemoryActor
        });
    });

    afterAll(async () => {
        await system.shutdown();
    });

    test('应该能够添加内存项', async () => {
        const response = await system.ask(memoryActorRef, {
            type: 'add_memory',
            item: {
                content: 'This is a test memory',
                metadata: { source: 'test' },
                type: 'message',
                agentId: 'test-agent'
            }
        });

        expect(response).toBeDefined();
        expect(response.type).toBe('memory_result');
        expect(response.items).toBeInstanceOf(Array);
        expect(response.items.length).toBe(1);
        expect(response.items[0].content).toBe('This is a test memory');
    });

    test('应该能够查询内存项', async () => {
        // 首先添加一些内存项
        await system.ask(memoryActorRef, {
            type: 'add_memory',
            item: {
                content: 'Memory item one',
                metadata: { tag: 'first' },
                type: 'message',
                agentId: 'agent-1'
            }
        });

        await system.ask(memoryActorRef, {
            type: 'add_memory',
            item: {
                content: 'Memory item two',
                metadata: { tag: 'second' },
                type: 'observation',
                agentId: 'agent-1'
            }
        });

        await system.ask(memoryActorRef, {
            type: 'add_memory',
            item: {
                content: 'Memory from agent two',
                metadata: { important: true },
                type: 'message',
                agentId: 'agent-2'
            }
        });

        // 测试按类型查询
        const response1 = await system.ask(memoryActorRef, {
            type: 'query_memory',
            options: {
                type: 'message'
            }
        });

        expect(response1.type).toBe('memory_result');
        expect(response1.items.length).toBeGreaterThanOrEqual(2);
        expect(response1.items.every((item: MemoryItem) => item.type === 'message')).toBe(true);

        // 测试按元数据查询
        const response2 = await system.ask(memoryActorRef, {
            type: 'query_memory',
            options: {
                metadata: { important: true }
            }
        });

        expect(response2.items.length).toBeGreaterThanOrEqual(1);
        expect(response2.items.some((item: MemoryItem) =>
            item.metadata.important === true &&
            item.content === 'Memory from agent two'
        )).toBe(true);

        // 测试按代理ID查询
        const response3 = await system.ask(memoryActorRef, {
            type: 'query_memory',
            options: {},
            threadId: 'agent-1'
        });

        expect(response3.items.length).toBeGreaterThanOrEqual(2);
        expect(response3.items.every((item: MemoryItem) => item.agentId === 'agent-1')).toBe(true);
    });

    test('应该能执行语义搜索', async () => {
        // 添加样本内存
        await system.ask(memoryActorRef, {
            type: 'add_memory',
            item: {
                content: 'The weather in New York is sunny today',
                metadata: { topic: 'weather' },
                type: 'observation',
                agentId: 'weather-agent'
            }
        });

        await system.ask(memoryActorRef, {
            type: 'add_memory',
            item: {
                content: 'The stock market is volatile this week',
                metadata: { topic: 'finance' },
                type: 'observation',
                agentId: 'finance-agent'
            }
        });

        // 测试语义搜索
        const response = await system.ask(memoryActorRef, {
            type: 'query_memory',
            options: {
                query: 'weather in New York',
                limit: 1
            }
        });

        expect(response.type).toBe('memory_result');
        expect(response.items.length).toBeGreaterThanOrEqual(1);
        // 由于我们的模拟实现是基于简单的文本匹配，所以我们期望第一个结果包含"weather"和"New York"
        expect(response.items[0].content).toContain('weather');
        expect(response.items[0].content).toContain('New York');
    });
}); 