import { describe, expect, test, it } from 'bun:test';
import { AtomicReference } from '../../core/concurrent/atomic-reference';

describe('AtomicReference', () => {
    describe('基本操作', () => {
        test('初始化和获取值', () => {
            const ref = new AtomicReference<number>(42);
            expect(ref.get()).toBe(42);

            const nullRef = new AtomicReference<string | null>(null);
            expect(nullRef.get()).toBeNull();
        });

        test('设置值', () => {
            const ref = new AtomicReference<string>('initial');
            const oldValue = ref.set('updated');
            expect(oldValue).toBe('initial');
            expect(ref.get()).toBe('updated');
        });

        test('getAndSet', () => {
            const ref = new AtomicReference<number>(10);
            const oldValue = ref.getAndSet(20);
            expect(oldValue).toBe(10);
            expect(ref.get()).toBe(20);
        });
    });

    describe('原子更新操作', () => {
        test('compareAndSet - 成功案例', () => {
            const ref = new AtomicReference<string>('value1');
            const result = ref.compareAndSet('value1', 'value2');
            expect(result).toBe(true);
            expect(ref.get()).toBe('value2');
        });

        test('compareAndSet - 失败案例', () => {
            const ref = new AtomicReference<string>('value1');
            const result = ref.compareAndSet('wrongValue', 'value2');
            expect(result).toBe(false);
            expect(ref.get()).toBe('value1');
        });

        test('updateAndGet', () => {
            const ref = new AtomicReference<number>(10);
            const newValue = ref.updateAndGet(current => current * 2);
            expect(newValue).toBe(20);
            expect(ref.get()).toBe(20);
        });

        test('getAndUpdate', () => {
            const ref = new AtomicReference<number>(10);
            const oldValue = ref.getAndUpdate(current => current * 2);
            expect(oldValue).toBe(10);
            expect(ref.get()).toBe(20);
        });

        test('tryUpdate - 成功案例', () => {
            const ref = new AtomicReference<number>(10);
            const result = ref.tryUpdate(current => current + 5);
            expect(result).toBe(true);
            expect(ref.get()).toBe(15);
        });

        test('transform', () => {
            const ref = new AtomicReference<string>('state1');

            // 成功案例
            const result1 = ref.transform('state1', 'state2');
            expect(result1).toBe('state2');
            expect(ref.get()).toBe('state2');

            // 失败案例
            const result2 = ref.transform('state1', 'state3');
            expect(result2).toBe('state2');
            expect(ref.get()).toBe('state2');
        });
    });

    describe('特殊值处理', () => {
        test('setIfNull - null 初始值', () => {
            const ref = new AtomicReference<string | null>(null);
            const result = ref.setIfNull('notNull');
            expect(result).toBe(true);
            expect(ref.get()).toBe('notNull');
        });

        test('setIfNull - undefined 初始值', () => {
            const ref = new AtomicReference<string | undefined>(undefined);
            const result = ref.setIfNull('notUndefined');
            expect(result).toBe(true);
            expect(ref.get()).toBe('notUndefined');
        });

        test('setIfNull - 非空初始值', () => {
            const ref = new AtomicReference<string>('initial');
            const result = ref.setIfNull('notSet');
            expect(result).toBe(false);
            expect(ref.get()).toBe('initial');
        });

        test('null 和 undefined 比较', () => {
            const nullRef = new AtomicReference<null>(null);
            expect(nullRef.compareAndSet(null, null)).toBe(true);

            const undefinedRef = new AtomicReference<undefined>(undefined);
            expect(undefinedRef.compareAndSet(undefined, undefined)).toBe(true);

            // null !== undefined
            const ref = new AtomicReference<null | undefined>(null);
            expect(ref.compareAndSet(undefined, null)).toBe(false);
        });
    });

    describe('复杂对象引用', () => {
        test('对象引用更新', () => {
            const obj1 = { id: 1, name: 'Object 1' };
            const obj2 = { id: 2, name: 'Object 2' };

            const ref = new AtomicReference<object>(obj1);
            expect(ref.get()).toBe(obj1);

            ref.set(obj2);
            expect(ref.get()).toBe(obj2);

            // 确保引用比较而不是值比较
            const obj1Copy = { ...obj1 };
            expect(ref.compareAndSet(obj1Copy, obj1)).toBe(false);
            expect(ref.compareAndSet(obj2, obj1)).toBe(true);
        });

        test('修改被引用对象的属性', () => {
            interface User {
                name: string;
                age: number;
            }

            const user: User = { name: 'Alice', age: 30 };
            const ref = new AtomicReference<User>(user);

            // 修改引用的对象
            ref.get().age = 31;

            // 验证原子引用包含了修改后的对象
            expect(ref.get().age).toBe(31);

            // 验证原始对象也被修改了（因为是引用）
            expect(user.age).toBe(31);
        });
    });

    describe('函数式更新', () => {
        test('数字增量更新', () => {
            const ref = new AtomicReference<number>(0);

            // 原子性地进行十次增量操作
            for (let i = 0; i < 10; i++) {
                ref.updateAndGet(n => n + 1);
            }

            expect(ref.get()).toBe(10);
        });

        test('字符串拼接', () => {
            const ref = new AtomicReference<string>('');

            // 原子性地拼接字符串
            ref.updateAndGet(s => s + 'A');
            ref.updateAndGet(s => s + 'B');
            ref.updateAndGet(s => s + 'C');

            expect(ref.get()).toBe('ABC');
        });

        test('数组操作', () => {
            const ref = new AtomicReference<number[]>([]);

            // 添加元素到数组
            ref.updateAndGet(arr => [...arr, 1]);
            ref.updateAndGet(arr => [...arr, 2]);
            ref.updateAndGet(arr => [...arr, 3]);

            expect(ref.get()).toEqual([1, 2, 3]);

            // 移除一个元素
            ref.updateAndGet(arr => arr.filter(n => n !== 2));
            expect(ref.get()).toEqual([1, 3]);
        });
    });
}); 