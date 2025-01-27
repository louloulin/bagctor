import { describe, test, expect } from 'bun:test';
import { KnowledgeBase, Knowledge } from '../knowledge';

describe('KnowledgeBase', () => {
    test('should learn and query knowledge', async () => {
        const kb = new KnowledgeBase();
        const knowledge: Knowledge = {
            id: 'test1',
            topic: 'testing',
            content: { data: 'test data' },
            metadata: {
                source: 'test',
                timestamp: Date.now(),
                confidence: 0.9,
                tags: ['test', 'unit']
            }
        };

        await kb.learn(knowledge);
        const results = await kb.query({ topic: 'testing' });

        expect(results.length).toBe(1);
        expect(results[0]).toEqual(knowledge);
    });

    test('should query by tags', async () => {
        const kb = new KnowledgeBase();
        const knowledge1: Knowledge = {
            id: 'test1',
            topic: 'testing',
            content: { data: 'test data 1' },
            metadata: {
                source: 'test',
                timestamp: Date.now(),
                confidence: 0.9,
                tags: ['test', 'unit']
            }
        };
        const knowledge2: Knowledge = {
            id: 'test2',
            topic: 'testing',
            content: { data: 'test data 2' },
            metadata: {
                source: 'test',
                timestamp: Date.now(),
                confidence: 0.8,
                tags: ['test', 'integration']
            }
        };

        await kb.learn(knowledge1);
        await kb.learn(knowledge2);

        const results = await kb.query({ tags: ['unit'] });
        expect(results.length).toBe(1);
        expect(results[0].id).toBe('test1');
    });

    test('should query by confidence', async () => {
        const kb = new KnowledgeBase();
        const knowledge1: Knowledge = {
            id: 'test1',
            topic: 'testing',
            content: { data: 'test data 1' },
            metadata: {
                source: 'test',
                timestamp: Date.now(),
                confidence: 0.9,
                tags: ['test']
            }
        };
        const knowledge2: Knowledge = {
            id: 'test2',
            topic: 'testing',
            content: { data: 'test data 2' },
            metadata: {
                source: 'test',
                timestamp: Date.now(),
                confidence: 0.7,
                tags: ['test']
            }
        };

        await kb.learn(knowledge1);
        await kb.learn(knowledge2);

        const results = await kb.query({ minConfidence: 0.8 });
        expect(results.length).toBe(1);
        expect(results[0].id).toBe('test1');
    });

    test('should query by time range', async () => {
        const kb = new KnowledgeBase();
        const now = Date.now();
        const knowledge1: Knowledge = {
            id: 'test1',
            topic: 'testing',
            content: { data: 'test data 1' },
            metadata: {
                source: 'test',
                timestamp: now - 1000,
                confidence: 0.9,
                tags: ['test']
            }
        };
        const knowledge2: Knowledge = {
            id: 'test2',
            topic: 'testing',
            content: { data: 'test data 2' },
            metadata: {
                source: 'test',
                timestamp: now - 3000,
                confidence: 0.9,
                tags: ['test']
            }
        };

        await kb.learn(knowledge1);
        await kb.learn(knowledge2);

        const results = await kb.query({
            timeRange: {
                start: now - 2000,
                end: now
            }
        });
        expect(results.length).toBe(1);
        expect(results[0].id).toBe('test1');
    });

    test('should forget knowledge', async () => {
        const kb = new KnowledgeBase();
        const knowledge: Knowledge = {
            id: 'test1',
            topic: 'testing',
            content: { data: 'test data' },
            metadata: {
                source: 'test',
                timestamp: Date.now(),
                confidence: 0.9,
                tags: ['test']
            }
        };

        await kb.learn(knowledge);
        await kb.forget('test1');

        const results = await kb.query({ topic: 'testing' });
        expect(results.length).toBe(0);
    });

    test('should share knowledge', async () => {
        const kb = new KnowledgeBase();
        const knowledge: Knowledge = {
            id: 'test1',
            topic: 'testing',
            content: { data: 'test data' },
            metadata: {
                source: 'test',
                timestamp: Date.now(),
                confidence: 0.9,
                tags: ['test']
            }
        };

        await kb.learn(knowledge);
        await expect(kb.share('agent1', 'test1')).resolves.toBeUndefined();
        await expect(kb.share('agent1', 'nonexistent')).rejects.toThrow();
    });

    test('should get stats', async () => {
        const kb = new KnowledgeBase();
        const knowledge: Knowledge = {
            id: 'test1',
            topic: 'testing',
            content: { data: 'test data' },
            metadata: {
                source: 'test',
                timestamp: Date.now(),
                confidence: 0.9,
                tags: ['test', 'unit']
            }
        };

        await kb.learn(knowledge);
        const stats = kb.getStats();

        expect(stats.totalKnowledge).toBe(1);
        expect(stats.topics).toBe(1);
        expect(stats.tags).toBe(2);
    });

    test('should clear knowledge base', async () => {
        const kb = new KnowledgeBase();
        const knowledge: Knowledge = {
            id: 'test1',
            topic: 'testing',
            content: { data: 'test data' },
            metadata: {
                source: 'test',
                timestamp: Date.now(),
                confidence: 0.9,
                tags: ['test']
            }
        };

        await kb.learn(knowledge);
        await kb.clear();

        const stats = kb.getStats();
        expect(stats.totalKnowledge).toBe(0);
        expect(stats.topics).toBe(0);
        expect(stats.tags).toBe(0);
    });
}); 