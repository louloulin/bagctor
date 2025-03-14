import { describe, expect, it, test, beforeEach, mock } from 'bun:test';
import { LockFreeMap } from '../../core/concurrent/lock-free-map';

describe('LockFreeMap', () => {
    describe('基本操作', () => {
        test('初始状态', () => {
            const map = new LockFreeMap<string, number>();
            expect(map.isEmpty()).toBe(true);
            expect(map.size()).toBe(0);
            expect(map.isClosed()).toBe(false);
        });

        test('设置和获取值', () => {
            const map = new LockFreeMap<string, number>();

            // 设置值
            map.set('one', 1);
            map.set('two', 2);
            map.set('three', 3);

            // 获取值
            expect(map.get('one')).toBe(1);
            expect(map.get('two')).toBe(2);
            expect(map.get('three')).toBe(3);
            expect(map.get('four')).toBeUndefined();

            // 检查大小
            expect(map.size()).toBe(3);
            expect(map.isEmpty()).toBe(false);
        });

        test('更新值', () => {
            const map = new LockFreeMap<string, number>();

            map.set('key', 1);
            expect(map.get('key')).toBe(1);

            map.set('key', 2);
            expect(map.get('key')).toBe(2);

            expect(map.size()).toBe(1);
        });

        test('删除值', () => {
            const map = new LockFreeMap<string, number>();

            map.set('one', 1);
            map.set('two', 2);

            expect(map.delete('one')).toBe(true);
            expect(map.get('one')).toBeUndefined();
            expect(map.size()).toBe(1);

            // 删除不存在的键
            expect(map.delete('three')).toBe(false);

            // 再次删除已删除的键
            expect(map.delete('one')).toBe(false);
        });

        test('检查键是否存在', () => {
            const map = new LockFreeMap<string, number>();

            map.set('key', 1);

            expect(map.has('key')).toBe(true);
            expect(map.has('nonexistent')).toBe(false);
        });

        test('清空字典', () => {
            const map = new LockFreeMap<string, number>();

            map.set('one', 1);
            map.set('two', 2);

            expect(map.size()).toBe(2);

            map.clear();

            expect(map.size()).toBe(0);
            expect(map.isEmpty()).toBe(true);
            expect(map.get('one')).toBeUndefined();
        });
    });

    describe('迭代器和集合操作', () => {
        test('entries 方法', () => {
            const map = new LockFreeMap<string, number>();

            map.set('one', 1);
            map.set('two', 2);

            const entries = map.entries();
            expect(entries.length).toBe(2);

            // 验证内容，但不假设顺序
            expect(entries).toContainEqual(['one', 1]);
            expect(entries).toContainEqual(['two', 2]);
        });

        test('keys 方法', () => {
            const map = new LockFreeMap<string, number>();

            map.set('one', 1);
            map.set('two', 2);

            const keys = map.keys();
            expect(keys.length).toBe(2);
            expect(keys).toContain('one');
            expect(keys).toContain('two');
        });

        test('values 方法', () => {
            const map = new LockFreeMap<string, number>();

            map.set('one', 1);
            map.set('two', 2);

            const values = map.values();
            expect(values.length).toBe(2);
            expect(values).toContain(1);
            expect(values).toContain(2);
        });

        test('forEach 方法', () => {
            const map = new LockFreeMap<string, number>();

            map.set('one', 1);
            map.set('two', 2);

            const keys: string[] = [];
            const values: number[] = [];

            map.forEach((value, key) => {
                keys.push(key);
                values.push(value);
            });

            expect(keys.length).toBe(2);
            expect(values.length).toBe(2);
            expect(keys).toContain('one');
            expect(keys).toContain('two');
            expect(values).toContain(1);
            expect(values).toContain(2);
        });

        test('迭代器 (for...of)', () => {
            const map = new LockFreeMap<string, number>();

            map.set('one', 1);
            map.set('two', 2);

            const entries: Array<[string, number]> = [];

            for (const entry of map) {
                entries.push(entry);
            }

            expect(entries.length).toBe(2);
            expect(entries).toContainEqual(['one', 1]);
            expect(entries).toContainEqual(['two', 2]);
        });
    });

    describe('高级功能', () => {
        test('关闭字典', () => {
            const map = new LockFreeMap<string, number>();

            map.set('one', 1);

            map.close();

            // 关闭后不能写入但可以读取
            map.set('two', 2);
            expect(map.get('one')).toBe(1);
            expect(map.get('two')).toBeUndefined();
            expect(map.size()).toBe(1);

            // 删除所有内容后字典应该标记为完全关闭
            expect(map.delete('one')).toBe(false); // 关闭后不能删除

            // 使用清晰的测试数据
            const closingMap = new LockFreeMap<string, number>();
            closingMap.set('key', 1);
            closingMap.close();
            // 让子测试访问私有状态
            expect((closingMap as any).state).toBe(1); // CLOSING

            // 测试空字典关闭时直接进入CLOSED状态
            const emptyMap = new LockFreeMap<string, number>();
            emptyMap.close();
            expect(emptyMap.isClosed()).toBe(true);
        });

        test('自定义哈希和相等函数', () => {
            const hashFn = (obj: { id: number }) => obj.id;
            const equalsFn = (a: { id: number }, b: { id: number }) => a.id === b.id;

            const map = new LockFreeMap<{ id: number }, string>({
                hashFn,
                equalsFn
            });

            const key1 = { id: 1 };
            const key2 = { id: 2 };
            const key1Dup = { id: 1 }; // 相同id的不同对象

            map.set(key1, 'value1');
            map.set(key2, 'value2');

            expect(map.get(key1)).toBe('value1');
            expect(map.get(key1Dup)).toBe('value1'); // 应该找到相同id的值
            expect(map.get(key2)).toBe('value2');
        });

        test('配置选项', () => {
            const map = new LockFreeMap<string, number>({
                initialCapacity: 32,
                loadFactor: 0.5,
                concurrencyLevel: 8,
                debug: false
            });

            // 添加一些数据
            for (let i = 0; i < 20; i++) {
                map.set(`key${i}`, i);
            }

            expect(map.size()).toBe(20);

            // 检查统计信息
            const stats = map.getStats();
            expect(stats.size).toBe(20);
            expect(stats.addCount).toBe(20);
            expect(stats.updateCount).toBe(0);
            expect(stats.segments).toBe(8); // concurrencyLevel
        });
    });

    describe('边缘情况', () => {
        test('不同类型的键', () => {
            const map = new LockFreeMap<any, string>();

            // 测试不同类型的键
            map.set('string', 'string value');
            map.set(123, 'number value');
            map.set(true, 'boolean value');
            map.set(null, 'null value');
            map.set(undefined, 'undefined value');
            map.set({ id: 1 }, 'object value');
            map.set([1, 2, 3], 'array value');

            expect(map.get('string')).toBe('string value');
            expect(map.get(123)).toBe('number value');
            expect(map.get(true)).toBe('boolean value');
            expect(map.get(null)).toBe('null value');
            expect(map.get(undefined)).toBe('undefined value');

            // 对象和数组比较需要使用相同引用
            const obj = { id: 1 };
            const arr = [1, 2, 3];

            map.set(obj, 'object value');
            map.set(arr, 'array value');

            expect(map.get(obj)).toBe('object value');
            expect(map.get(arr)).toBe('array value');
            expect(map.get({ id: 1 })).toBeUndefined(); // 不同对象引用，默认不相等
            expect(map.get([1, 2, 3])).toBeUndefined(); // 不同数组引用，默认不相等
        });

        test('哈希冲突处理', () => {
            // 创建一个简单的哈希函数，故意制造冲突
            const collisionHashFn = () => 1; // 所有键都映射到同一个桶

            const map = new LockFreeMap<string, number>({
                hashFn: collisionHashFn
            });

            // 添加多个键，它们都将Hash到同一个桶
            map.set('one', 1);
            map.set('two', 2);
            map.set('three', 3);
            map.set('four', 4);

            // 验证所有值能够正确读取
            expect(map.get('one')).toBe(1);
            expect(map.get('two')).toBe(2);
            expect(map.get('three')).toBe(3);
            expect(map.get('four')).toBe(4);

            // 删除中间的值
            expect(map.delete('two')).toBe(true);

            // 确认其他值仍然可访问
            expect(map.get('one')).toBe(1);
            expect(map.get('two')).toBeUndefined();
            expect(map.get('three')).toBe(3);
            expect(map.get('four')).toBe(4);
        });
    });

    describe('性能测试', () => {
        test('批量操作性能', () => {
            const map = new LockFreeMap<string, number>();
            const iterations = 10000;

            // 计时开始
            const startTime = Date.now();

            // 批量添加
            for (let i = 0; i < iterations; i++) {
                map.set(`key${i}`, i);
            }

            // 批量读取
            for (let i = 0; i < iterations; i++) {
                const value = map.get(`key${i}`);
                expect(value).toBe(i);
            }

            // 批量删除
            for (let i = 0; i < iterations; i++) {
                map.delete(`key${i}`);
            }

            expect(map.size()).toBe(0);

            // 计时结束
            const endTime = Date.now();
            const elapsedMs = endTime - startTime;

            // 输出性能信息但不做硬性断言
            console.log(`处理 ${iterations * 3} 个操作用时: ${elapsedMs}ms (${(iterations * 3) / (elapsedMs / 1000)} ops/sec)`);

            // 检查统计信息
            const stats = map.getStats();
            console.log('Map 统计信息:', JSON.stringify(stats, null, 2));
        });

        test('内存占用', () => {
            const map = new LockFreeMap<string, Object>({
                concurrencyLevel: 4,  // 减少分段数量以减少基本开销
                initialCapacity: 8    // 从小容量开始
            });

            // 添加少量数据点
            for (let i = 0; i < 100; i++) {
                map.set(`key${i}`, { value: i });
            }

            // 验证容量调整
            const stats = map.getStats();

            // 确保至少有一些扩容发生
            expect(stats.resizeCount).toBeGreaterThan(0);

            // 验证总容量合理
            console.log('内存使用统计:', JSON.stringify(stats, null, 2));
        });
    });
}); 