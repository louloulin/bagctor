/**
 * 高级记忆系统单元测试
 */
import { test, expect, describe, beforeEach, afterEach } from 'bun:test';
import { MemoryStore, MemoryItem } from '../memory/memory_system';

describe('记忆系统测试', () => {
    let memory: MemoryStore;

    beforeEach(() => {
        // 创建一个记忆存储实例用于测试
        memory = new MemoryStore({
            shortTermCapacity: 5,
            longTermCapacity: 10,
            accessThreshold: 2,
            importanceThreshold: 0.8
        });
    });

    afterEach(() => {
        // 清理资源
        memory.dispose();
    });

    test('短期记忆存储和获取', () => {
        // 存储多个短期记忆
        memory.setShortTerm('test1', 'value1');
        memory.setShortTerm('test2', { key: 'value2' });

        // 获取存储的记忆
        const value1 = memory.getShortTerm('test1');
        const value2 = memory.getShortTerm('test2');

        // 验证
        expect(value1).toBe('value1');
        expect(value2).toEqual({ key: 'value2' });

        // 获取不存在的记忆
        const nonExistent = memory.getShortTerm('nonExistent');
        expect(nonExistent).toBeUndefined();
    });

    test('长期记忆存储和获取', () => {
        // 存储多个长期记忆
        memory.setLongTerm('test1', 'long-term-value1');
        memory.setLongTerm('test2', { key: 'long-term-value2' });

        // 获取存储的记忆
        const value1 = memory.getLongTerm('test1');
        const value2 = memory.getLongTerm('test2');

        // 验证
        expect(value1).toBe('long-term-value1');
        expect(value2).toEqual({ key: 'long-term-value2' });
    });

    test('短期记忆超过访问阈值时自动转移到长期记忆', () => {
        // 存储短期记忆
        memory.setShortTerm('threshold_test', 'auto-promote-value');

        // 访问多次，超过访问阈值（设置为2）
        memory.getShortTerm('threshold_test'); // 第1次访问
        memory.getShortTerm('threshold_test'); // 第2次访问

        // 验证已转移到长期记忆
        const shortTermValue = memory.getShortTerm('threshold_test');
        const longTermValue = memory.getLongTerm('threshold_test');

        expect(shortTermValue).toBeUndefined(); // 已从短期记忆移除
        expect(longTermValue).toBe('auto-promote-value'); // 已转移到长期记忆
    });

    test('高重要性的短期记忆自动转移到长期记忆', () => {
        // 存储高重要性的短期记忆（设置的阈值为0.8）
        memory.setShortTerm('important_memory', 'important-value', { importance: 0.9 });

        // 只需访问一次，但因为重要性高，应自动转移
        memory.getShortTerm('important_memory');

        // 验证已转移到长期记忆
        const shortTermValue = memory.getShortTerm('important_memory');
        const longTermValue = memory.getLongTerm('important_memory');

        expect(shortTermValue).toBeUndefined(); // 已从短期记忆移除
        expect(longTermValue).toBe('important-value'); // 已转移到长期记忆
    });

    test('记忆应按标签查询', () => {
        // 存储带标签的记忆
        memory.setShortTerm('tag_test1', 'tag-value1', { tags: ['tag1', 'tag2'] });
        memory.setShortTerm('tag_test2', 'tag-value2', { tags: ['tag2', 'tag3'] });
        memory.setShortTerm('tag_test3', 'tag-value3', { tags: ['tag3'] });

        // 按标签查询
        const tag2Results = memory.queryShortTerm({ tags: ['tag2'] });

        // 验证
        expect(tag2Results.length).toBe(2);
        expect(tag2Results.some(item => item.value === 'tag-value1')).toBe(true);
        expect(tag2Results.some(item => item.value === 'tag-value2')).toBe(true);
        expect(tag2Results.some(item => item.value === 'tag-value3')).toBe(false);
    });

    test('记忆应按重要性查询', () => {
        // 存储不同重要性的记忆
        memory.setShortTerm('importance_low', 'low-value', { importance: 0.3 });
        memory.setShortTerm('importance_medium', 'medium-value', { importance: 0.6 });
        memory.setShortTerm('importance_high', 'high-value', { importance: 0.9 });

        // 按重要性过滤查询
        const highImportanceResults = memory.queryShortTerm({ minImportance: 0.7 });

        // 验证
        expect(highImportanceResults.length).toBe(1);
        expect(highImportanceResults[0].value).toBe('high-value');
    });

    test('记忆容量应受限制', () => {
        // 短期记忆容量设置为5
        // 存储超过容量的记忆
        for (let i = 0; i < 10; i++) {
            memory.setShortTerm(`capacity_test_${i}`, `value-${i}`);
        }

        // 获取统计
        const stats = memory.getStats();

        // 验证短期记忆容量限制
        expect(stats.shortTermCount).toBeLessThanOrEqual(5);
    });

    test('记忆应能手动从短期到长期转移', () => {
        // 存储短期记忆
        memory.setShortTerm('manual_promote', 'manual-value');

        // 手动促进到长期记忆
        const result = memory.promoteToLongTerm('manual_promote');

        // 验证
        expect(result).toBe(true);
        expect(memory.getShortTerm('manual_promote')).toBeUndefined();
        expect(memory.getLongTerm('manual_promote')).toBe('manual-value');
    });

    test('删除记忆', () => {
        // 存储记忆
        memory.setShortTerm('to_remove', 'remove-me');
        memory.setLongTerm('long_to_remove', 'long-remove-me');

        // 删除记忆
        const shortRemoveResult = memory.removeShortTerm('to_remove');
        const longRemoveResult = memory.removeLongTerm('long_to_remove');

        // 验证
        expect(shortRemoveResult).toBe(true);
        expect(longRemoveResult).toBe(true);
        expect(memory.getShortTerm('to_remove')).toBeUndefined();
        expect(memory.getLongTerm('long_to_remove')).toBeUndefined();
    });

    test('记忆统计信息', () => {
        // 存储一些记忆
        memory.setShortTerm('stats_test1', 'stats-value1');
        memory.setShortTerm('stats_test2', 'stats-value2');
        memory.setLongTerm('long_stats_test1', 'long-stats-value1');

        // 获取统计信息
        const stats = memory.getStats();

        // 验证
        expect(stats.shortTermCount).toBe(2);
        expect(stats.longTermCount).toBe(1);
        expect(stats.shortTermCapacity).toBe(5);
        expect(stats.longTermCapacity).toBe(10);
    });

    test('清理所有记忆', () => {
        // 存储一些记忆
        memory.setShortTerm('clear_test1', 'clear-value1');
        memory.setLongTerm('long_clear_test1', 'long-clear-value1');

        // 清理所有记忆
        memory.clear();

        // 获取统计信息
        const stats = memory.getStats();

        // 验证
        expect(stats.shortTermCount).toBe(0);
        expect(stats.longTermCount).toBe(0);
    });
}); 