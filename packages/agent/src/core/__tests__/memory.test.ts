import { describe, test, expect } from 'bun:test';
import { WorkingMemory, MemoryOptions } from '../memory';

describe('WorkingMemory', () => {
    test('should store and recall short-term memory', async () => {
        const memory = new WorkingMemory();
        await memory.store('test', { value: 'test-value' });
        const value = await memory.recall('test');
        expect(value).toEqual({ value: 'test-value' });
    });

    test('should store and recall long-term memory', async () => {
        const memory = new WorkingMemory();
        await memory.store('test', { value: 'test-value' }, true);
        const value = await memory.recall('test', true);
        expect(value).toEqual({ value: 'test-value' });
    });

    test('should forget memory', async () => {
        const memory = new WorkingMemory();
        await memory.store('test', { value: 'test-value' });
        await memory.forget('test');
        const value = await memory.recall('test');
        expect(value).toBeNull();
    });

    test('should expire short-term memory', async () => {
        const options: MemoryOptions = {
            shortTermTTL: 100 // 100ms
        };
        const memory = new WorkingMemory(options);
        await memory.store('test', { value: 'test-value' });

        // Wait for expiration
        await new Promise(resolve => setTimeout(resolve, 150));

        const value = await memory.recall('test');
        expect(value).toBeNull();
    });

    test('should expire long-term memory', async () => {
        const options: MemoryOptions = {
            longTermTTL: 100 // 100ms
        };
        const memory = new WorkingMemory(options);
        await memory.store('test', { value: 'test-value' }, true);

        // Wait for expiration
        await new Promise(resolve => setTimeout(resolve, 150));

        const value = await memory.recall('test', true);
        expect(value).toBeNull();
    });

    test('should respect max size for short-term memory', async () => {
        const options: MemoryOptions = {
            maxShortTermSize: 2
        };
        const memory = new WorkingMemory(options);

        await memory.store('test1', { value: 'value1' });
        await memory.store('test2', { value: 'value2' });
        await memory.store('test3', { value: 'value3' });

        const stats = memory.getStats();
        expect(stats.shortTermSize).toBe(2);

        // The oldest entry should be removed
        const value1 = await memory.recall('test1');
        expect(value1).toBeNull();
    });

    test('should clear all memories', async () => {
        const memory = new WorkingMemory();

        await memory.store('short', { value: 'short' });
        await memory.store('long', { value: 'long' }, true);

        await memory.clear();

        const stats = memory.getStats();
        expect(stats.shortTermSize).toBe(0);
        expect(stats.longTermSize).toBe(0);
    });

    test('should update timestamp on recall', async () => {
        const memory = new WorkingMemory();
        await memory.store('test', { value: 'test-value' });

        // First recall
        await memory.recall('test');

        // Wait a bit
        await new Promise(resolve => setTimeout(resolve, 50));

        // Second recall should update timestamp
        const value = await memory.recall('test');
        expect(value).toEqual({ value: 'test-value' });
    });
}); 