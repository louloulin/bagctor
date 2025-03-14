import { describe, expect, test } from 'bun:test';
import { ConcurrentSet } from '../../core/concurrent/concurrent-set';

describe('ConcurrentSet', () => {
    describe('基本操作', () => {
        test('初始状态', () => {
            const set = new ConcurrentSet<string>();
            expect(set.isEmpty()).toBe(true);
            expect(set.size()).toBe(0);
            expect(set.isClosed()).toBe(false);
        });

        test('添加元素', () => {
            const set = new ConcurrentSet<string>();

            // 添加新元素返回 true
            expect(set.add('a')).toBe(true);
            expect(set.add('b')).toBe(true);
            expect(set.add('c')).toBe(true);

            // 添加已存在元素返回 false
            expect(set.add('a')).toBe(false);

            expect(set.size()).toBe(3);
            expect(set.isEmpty()).toBe(false);
        });

        test('检查元素是否存在', () => {
            const set = new ConcurrentSet<string>();

            set.add('a');
            set.add('b');

            expect(set.has('a')).toBe(true);
            expect(set.has('b')).toBe(true);
            expect(set.has('c')).toBe(false);
        });

        test('删除元素', () => {
            const set = new ConcurrentSet<string>();

            set.add('a');
            set.add('b');

            // 删除存在的元素返回 true
            expect(set.delete('a')).toBe(true);
            expect(set.has('a')).toBe(false);
            expect(set.size()).toBe(1);

            // 删除不存在的元素返回 false
            expect(set.delete('c')).toBe(false);

            // 再次删除已删除的元素返回 false
            expect(set.delete('a')).toBe(false);
        });

        test('清空集合', () => {
            const set = new ConcurrentSet<string>();

            set.add('a');
            set.add('b');

            expect(set.size()).toBe(2);

            set.clear();

            expect(set.size()).toBe(0);
            expect(set.isEmpty()).toBe(true);
            expect(set.has('a')).toBe(false);
        });

        test('转换为数组', () => {
            const set = new ConcurrentSet<string>();

            set.add('a');
            set.add('b');
            set.add('c');

            const array = set.toArray();
            expect(array.length).toBe(3);
            expect(array).toContain('a');
            expect(array).toContain('b');
            expect(array).toContain('c');
        });

        test('forEach方法', () => {
            const set = new ConcurrentSet<string>();

            set.add('a');
            set.add('b');

            const items: string[] = [];

            set.forEach(item => {
                items.push(item);
            });

            expect(items.length).toBe(2);
            expect(items).toContain('a');
            expect(items).toContain('b');
        });

        test('迭代器', () => {
            const set = new ConcurrentSet<string>();

            set.add('a');
            set.add('b');

            const items: string[] = [];

            for (const item of set) {
                items.push(item);
            }

            expect(items.length).toBe(2);
            expect(items).toContain('a');
            expect(items).toContain('b');
        });

        test('关闭集合', () => {
            const set = new ConcurrentSet<string>();

            set.add('a');

            set.close();

            // 关闭后不能添加但可以查询
            set.add('b');
            expect(set.has('a')).toBe(true);
            expect(set.has('b')).toBe(false);
            expect(set.size()).toBe(1);

            // 确认已关闭
            expect(set.isClosed()).toBe(true);
        });
    });

    describe('集合操作', () => {
        test('子集检查', () => {
            const set1 = new ConcurrentSet<string>();
            set1.add('a');
            set1.add('b');

            const set2 = new ConcurrentSet<string>();
            set2.add('a');
            set2.add('b');
            set2.add('c');

            const set3 = new ConcurrentSet<string>();
            set3.add('a');
            set3.add('d');

            expect(set1.isSubsetOf(set2)).toBe(true);
            expect(set2.isSubsetOf(set1)).toBe(false);
            expect(set1.isSubsetOf(set3)).toBe(false);
            expect(set1.isSubsetOf(set1)).toBe(true); // 自身是自身的子集
        });

        test('交集操作', () => {
            const set1 = new ConcurrentSet<string>();
            set1.add('a');
            set1.add('b');
            set1.add('c');

            const set2 = new ConcurrentSet<string>();
            set2.add('b');
            set2.add('c');
            set2.add('d');

            const intersection = set1.intersection(set2);

            expect(intersection.size()).toBe(2);
            expect(intersection.has('b')).toBe(true);
            expect(intersection.has('c')).toBe(true);
            expect(intersection.has('a')).toBe(false);
            expect(intersection.has('d')).toBe(false);
        });

        test('并集操作', () => {
            const set1 = new ConcurrentSet<string>();
            set1.add('a');
            set1.add('b');

            const set2 = new ConcurrentSet<string>();
            set2.add('b');
            set2.add('c');

            const union = set1.union(set2);

            expect(union.size()).toBe(3);
            expect(union.has('a')).toBe(true);
            expect(union.has('b')).toBe(true);
            expect(union.has('c')).toBe(true);
        });

        test('差集操作', () => {
            const set1 = new ConcurrentSet<string>();
            set1.add('a');
            set1.add('b');
            set1.add('c');

            const set2 = new ConcurrentSet<string>();
            set2.add('b');
            set2.add('c');
            set2.add('d');

            const difference = set1.difference(set2);

            expect(difference.size()).toBe(1);
            expect(difference.has('a')).toBe(true);
            expect(difference.has('b')).toBe(false);
            expect(difference.has('c')).toBe(false);
        });
    });

    describe('高级功能', () => {
        test('自定义哈希和相等函数', () => {
            const hashFn = (obj: { id: number }) => obj.id;
            const equalsFn = (a: { id: number }, b: { id: number }) => a.id === b.id;

            const set = new ConcurrentSet<{ id: number }>({
                hashFn,
                equalsFn
            });

            const obj1 = { id: 1 };
            const obj2 = { id: 2 };
            const obj1Dup = { id: 1 }; // 相同id的不同对象

            set.add(obj1);
            set.add(obj2);

            expect(set.has(obj1)).toBe(true);
            expect(set.has(obj1Dup)).toBe(true); // 应该找到相同id的值
            expect(set.has(obj2)).toBe(true);
            expect(set.size()).toBe(2); // 只有两个元素，因为 obj1 和 obj1Dup 被认为是相等的
        });

        test('性能统计', () => {
            const set = new ConcurrentSet<string>({
                initialCapacity: 16,
                loadFactor: 0.75,
                concurrencyLevel: 4
            });

            // 添加一些数据
            for (let i = 0; i < 10; i++) {
                set.add(`item${i}`);
            }

            const stats = set.getStats();
            expect(stats.size).toBe(10);
            expect(stats.addCount).toBe(10);
        });

        test('批量操作性能', () => {
            const set = new ConcurrentSet<number>();
            const iterations = 1000;

            console.time('批量添加');
            for (let i = 0; i < iterations; i++) {
                set.add(i);
            }
            console.timeEnd('批量添加');

            expect(set.size()).toBe(iterations);

            console.time('批量查询');
            for (let i = 0; i < iterations; i++) {
                expect(set.has(i)).toBe(true);
            }
            console.timeEnd('批量查询');

            console.time('批量删除');
            for (let i = 0; i < iterations; i++) {
                set.delete(i);
            }
            console.timeEnd('批量删除');

            expect(set.size()).toBe(0);
        });
    });
}); 