import { describe, expect, test, beforeEach, afterEach } from 'bun:test';
import { GenericObjectPool, BufferPool, memoryPoolManager, ObjectPool } from '../core/memory_pool';

class TestObject {
    public value: number = 0;
    public data: string = '';

    reset(): void {
        this.value = 0;
        this.data = '';
    }
}

describe('内存池管理测试', () => {
    describe('GenericObjectPool', () => {
        let pool: GenericObjectPool<TestObject>;

        beforeEach(() => {
            pool = new GenericObjectPool<TestObject>(
                // 工厂函数：创建TestObject
                () => new TestObject(),
                // 重置函数：调用reset方法
                (obj) => obj.reset(),
                // 配置
                {
                    initialSize: 5,
                    maxSize: 10,
                    name: 'test-pool'
                }
            );
        });

        test('初始化和基本操作', () => {
            // 验证初始大小
            expect(pool.size()).toBe(5);

            // 获取对象
            const obj1 = pool.acquire();
            expect(pool.size()).toBe(4);
            expect(obj1).toBeInstanceOf(TestObject);

            // 修改对象并归还
            obj1.value = 42;
            obj1.data = 'test data';
            pool.release(obj1);

            // 验证对象已重置并归还到池中
            expect(pool.size()).toBe(5);

            // 获取归还的对象
            const obj2 = pool.acquire();
            expect(obj2.value).toBe(0);
            expect(obj2.data).toBe('');
        });

        test('超过初始大小', () => {
            // 获取所有对象
            const objects = [];
            for (let i = 0; i < 5; i++) {
                objects.push(pool.acquire());
            }
            expect(pool.size()).toBe(0);

            // 获取更多对象（将创建新对象）
            const extraObj = pool.acquire();
            expect(extraObj).toBeInstanceOf(TestObject);

            // 检查统计信息
            const stats = pool.stats();
            expect(stats.created).toBeGreaterThanOrEqual(6);
            expect(stats.acquired).toBe(6);
            expect(stats.missCount).toBeGreaterThanOrEqual(1);
        });

        test('池满时的行为', () => {
            // 获取所有对象
            const objects = [];
            for (let i = 0; i < 5; i++) {
                objects.push(pool.acquire());
            }

            // 创建更多对象并全部归还（池容量为10）
            for (let i = 0; i < 7; i++) {
                pool.release(new TestObject());
            }

            // 验证池大小不会超过最大值
            expect(pool.size()).toBeLessThanOrEqual(10);

            // 验证对象回收机制
            const stats = pool.stats();
            expect(stats.released).toBe(7);
        });

        test('清空池', () => {
            // 获取几个对象
            const obj1 = pool.acquire();
            const obj2 = pool.acquire();

            // 归还一个
            pool.release(obj1);

            // 清空池
            pool.clear();
            expect(pool.size()).toBe(0);

            // 获取新对象
            const obj3 = pool.acquire();
            expect(obj3).toBeInstanceOf(TestObject);
        });
    });

    describe('BufferPool', () => {
        let bufferPool: BufferPool;

        beforeEach(() => {
            bufferPool = new BufferPool({
                bufferSize: 1024,
                initialSize: 2,
                maxSize: 5,
                name: 'test-buffer-pool'
            });
        });

        test('缓冲区操作', () => {
            // 验证初始大小
            expect(bufferPool.size()).toBe(2);

            // 获取缓冲区
            const buffer1 = bufferPool.acquire();
            expect(buffer1).toBeInstanceOf(Buffer);
            expect(buffer1.length).toBe(1024);

            // 写入数据
            buffer1.write('Hello, world!');

            // 归还缓冲区
            bufferPool.release(buffer1);
            expect(bufferPool.size()).toBe(2);

            // 获取可能是同一个缓冲区
            const buffer2 = bufferPool.acquire();
            // 验证缓冲区已被重置（全为零）
            for (let i = 0; i < 13; i++) {
                expect(buffer2[i]).toBe(0);
            }
        });

        test('错误大小的缓冲区', () => {
            // 尝试归还错误大小的缓冲区
            const wrongBuffer = Buffer.alloc(512);
            bufferPool.release(wrongBuffer);

            // 验证池大小没有变化
            expect(bufferPool.size()).toBe(2);
        });
    });

    describe('MemoryPoolManager', () => {
        afterEach(() => {
            // 清理所有测试池
            memoryPoolManager.clearAll();
        });

        test('创建和获取对象池', () => {
            // 创建对象池
            const pool = memoryPoolManager.createObjectPool<TestObject>(
                'test-managed-pool',
                () => new TestObject(),
                (obj) => obj.reset()
            );

            // 验证池已注册
            const retrievedPool = memoryPoolManager.getPool<TestObject>('test-managed-pool');
            expect(retrievedPool).toBe(pool);

            // 使用获取的池
            const obj = retrievedPool!.acquire();
            expect(obj).toBeInstanceOf(TestObject);
        });

        test('创建和获取缓冲区池', () => {
            // 创建缓冲区池
            const bufferPool = memoryPoolManager.createBufferPool('test-managed-buffer', 2048);

            // 验证池已注册
            const retrievedPool = memoryPoolManager.getPool<Buffer>('test-managed-buffer');
            expect(retrievedPool).toBe(bufferPool);

            // 使用获取的池
            const buffer = retrievedPool!.acquire();
            expect(buffer).toBeInstanceOf(Buffer);
            expect(buffer.length).toBe(2048);
        });

        test('获取所有池统计信息', () => {
            // 创建多个池
            memoryPoolManager.createObjectPool<TestObject>(
                'stats-test-pool-1',
                () => new TestObject()
            );

            memoryPoolManager.createBufferPool('stats-test-pool-2', 512);

            // 获取统计信息
            const stats = memoryPoolManager.getAllStats();
            expect(Object.keys(stats).length).toBeGreaterThanOrEqual(2);
            expect(stats['stats-test-pool-1']).toBeDefined();
            expect(stats['stats-test-pool-2']).toBeDefined();
        });

        test('替换现有池', () => {
            // 创建池
            memoryPoolManager.createObjectPool<TestObject>(
                'replace-test',
                () => new TestObject()
            );

            // 再次创建同名池
            const newPool = memoryPoolManager.createObjectPool<string>(
                'replace-test',
                () => 'test string'
            );

            // 验证池已被替换
            const retrievedPool = memoryPoolManager.getPool<string>('replace-test');
            expect(retrievedPool).toBe(newPool);

            // 使用获取的池
            const value = retrievedPool!.acquire();
            expect(typeof value).toBe('string');
        });
    });

    describe('性能测试', () => {
        test('对象创建性能比较', () => {
            const iterations = 10000;
            const pool = new GenericObjectPool<TestObject>(
                () => new TestObject(),
                (obj) => obj.reset(),
                { initialSize: 100, maxSize: 1000 }
            );

            // 预热
            for (let i = 0; i < 100; i++) {
                const obj = pool.acquire();
                pool.release(obj);
            }

            // 测试不使用对象池的性能
            const startWithoutPool = performance.now();
            for (let i = 0; i < iterations; i++) {
                const obj = new TestObject();
                obj.value = i;
                // 模拟使用对象
                const value = obj.value;
            }
            const endWithoutPool = performance.now();

            // 测试使用对象池的性能
            const startWithPool = performance.now();
            for (let i = 0; i < iterations; i++) {
                const obj = pool.acquire();
                obj.value = i;
                // 模拟使用对象
                const value = obj.value;
                pool.release(obj);
            }
            const endWithPool = performance.now();

            const timeWithoutPool = endWithoutPool - startWithoutPool;
            const timeWithPool = endWithPool - startWithPool;

            console.log(`不使用对象池: ${timeWithoutPool.toFixed(2)}ms`);
            console.log(`使用对象池: ${timeWithPool.toFixed(2)}ms`);
            console.log(`性能改进: ${((timeWithoutPool - timeWithPool) / timeWithoutPool * 100).toFixed(2)}%`);

            // 不一定要求池总是更快，但应记录性能对比
            const stats = pool.stats();
            console.log(`对象池统计: 创建=${stats.created}, 命中率=${(stats.hitRate * 100).toFixed(2)}%`);
        });
    });
}); 