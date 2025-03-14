import { describe, expect, it, test, beforeEach, mock } from 'bun:test';
import { LockFreeQueue } from '../../core/concurrent/lock-free-queue';

describe('LockFreeQueue', () => {
    describe('基本操作', () => {
        test('初始状态', () => {
            const queue = new LockFreeQueue<number>();
            expect(queue.isEmpty()).toBe(true);
            expect(queue.size()).toBe(0);
            expect(queue.capacity()).toBeGreaterThan(0);
            expect(queue.isClosed()).toBe(false);
        });

        test('入队和出队', () => {
            const queue = new LockFreeQueue<number>();

            // 入队
            expect(queue.enqueue(1)).toBe(true);
            expect(queue.enqueue(2)).toBe(true);
            expect(queue.enqueue(3)).toBe(true);

            expect(queue.isEmpty()).toBe(false);
            expect(queue.size()).toBe(3);

            // 出队
            expect(queue.dequeue()).toBe(1);
            expect(queue.dequeue()).toBe(2);
            expect(queue.dequeue()).toBe(3);

            expect(queue.isEmpty()).toBe(true);
            expect(queue.size()).toBe(0);
            expect(queue.dequeue()).toBeUndefined();
        });

        test('查看队首元素', () => {
            const queue = new LockFreeQueue<number>();

            // 空队列
            expect(queue.peek()).toBeUndefined();

            // 入队后查看
            queue.enqueue(42);
            expect(queue.peek()).toBe(42);

            // 不改变队列状态
            expect(queue.size()).toBe(1);
            expect(queue.isEmpty()).toBe(false);

            // 出队后查看
            queue.dequeue();
            expect(queue.peek()).toBeUndefined();
        });

        test('清空队列', () => {
            const queue = new LockFreeQueue<number>();

            queue.enqueue(1);
            queue.enqueue(2);
            queue.enqueue(3);

            expect(queue.size()).toBe(3);

            queue.clear();

            expect(queue.isEmpty()).toBe(true);
            expect(queue.size()).toBe(0);
            expect(queue.dequeue()).toBeUndefined();
        });
    });

    describe('高级功能', () => {
        test('关闭队列', () => {
            const queue = new LockFreeQueue<number>();

            queue.enqueue(1);
            queue.enqueue(2);

            queue.close();

            // 关闭后不能入队
            expect(queue.enqueue(3)).toBe(false);

            // 但可以出队
            expect(queue.dequeue()).toBe(1);
            expect(queue.dequeue()).toBe(2);

            // 队列为空后标记为完全关闭
            expect(queue.isClosed()).toBe(true);
        });

        test('自动扩容', () => {
            // 创建小容量队列
            const queue = new LockFreeQueue<number>({ initialCapacity: 3 });

            expect(queue.capacity()).toBe(3);

            // 填满队列
            queue.enqueue(1);
            queue.enqueue(2);
            queue.enqueue(3);

            // 继续入队触发扩容
            queue.enqueue(4);

            // 容量应该变大
            expect(queue.capacity()).toBeGreaterThan(3);
            expect(queue.size()).toBe(4);

            // 验证元素顺序正确
            expect(queue.dequeue()).toBe(1);
            expect(queue.dequeue()).toBe(2);
            expect(queue.dequeue()).toBe(3);
            expect(queue.dequeue()).toBe(4);
        });

        test('禁用自动扩容', () => {
            // 创建不允许自动扩容的队列
            const queue = new LockFreeQueue<number>({
                initialCapacity: 2,
                autoResize: false
            });

            expect(queue.capacity()).toBe(2);

            // 填满队列
            queue.enqueue(1);
            queue.enqueue(2);

            // 队列已满，不能继续入队
            expect(queue.enqueue(3)).toBe(false);

            // 容量应该不变
            expect(queue.capacity()).toBe(2);
            expect(queue.size()).toBe(2);

            // 出队后可以继续入队
            queue.dequeue();
            expect(queue.enqueue(3)).toBe(true);
        });

        test('溢出回调', () => {
            const onOverflowMock = mock((item: number) => { });

            const queue = new LockFreeQueue<number>({
                initialCapacity: 2,
                autoResize: false,
                onOverflow: onOverflowMock
            });

            queue.enqueue(1);
            queue.enqueue(2);

            // 触发溢出
            queue.enqueue(3);

            // 应该调用回调函数
            expect(onOverflowMock).toHaveBeenCalledWith(3);
        });

        test('队列为空回调', () => {
            const onEmptyMock = mock(() => { });

            const queue = new LockFreeQueue<number>({
                onEmpty: onEmptyMock
            });

            // 空队列出队会触发回调
            queue.dequeue();
            expect(onEmptyMock).toHaveBeenCalled();

            // 重置mock计数
            onEmptyMock.mockClear();

            // 入队后出队到空也会触发
            queue.enqueue(1);
            queue.dequeue();
            expect(onEmptyMock).toHaveBeenCalled();
        });
    });

    describe('性能统计', () => {
        test('统计信息', () => {
            const queue = new LockFreeQueue<number>();

            const initialStats = queue.getStats();
            expect(initialStats.enqueueCount).toBe(0);
            expect(initialStats.dequeueCount).toBe(0);
            expect(initialStats.overflowCount).toBe(0);

            // 执行一些操作
            queue.enqueue(1);
            queue.enqueue(2);
            queue.dequeue();

            const updatedStats = queue.getStats();
            expect(updatedStats.enqueueCount).toBe(2);
            expect(updatedStats.dequeueCount).toBe(1);
            expect(updatedStats.length).toBe(1);
        });
    });

    describe('边缘情况', () => {
        test('环形缓冲区边界', () => {
            // 创建小容量队列以测试环形边界
            const queue = new LockFreeQueue<number>({ initialCapacity: 3 });

            // 填满再清空几次，测试环形行为
            for (let i = 0; i < 3; i++) {
                queue.enqueue(1);
                queue.enqueue(2);
                queue.enqueue(3);

                expect(queue.size()).toBe(3);

                queue.dequeue();
                queue.dequeue();
                queue.dequeue();

                expect(queue.isEmpty()).toBe(true);
            }

            // 交替入队出队，测试头尾指针在环形缓冲区中的移动
            queue.enqueue(1);
            queue.dequeue();
            queue.enqueue(2);
            queue.enqueue(3);
            queue.dequeue();
            queue.enqueue(4);

            expect(queue.size()).toBe(2);
            expect(queue.dequeue()).toBe(3);
            expect(queue.dequeue()).toBe(4);
        });
    });

    describe('性能测试', () => {
        test('高吞吐量场景', () => {
            const queue = new LockFreeQueue<number>({ initialCapacity: 1000 });
            const iterations = 10000;

            // 计时开始
            const startTime = Date.now();

            // 入队大量元素
            for (let i = 0; i < iterations; i++) {
                queue.enqueue(i);
            }

            expect(queue.size()).toBe(iterations);

            // 出队大量元素
            for (let i = 0; i < iterations; i++) {
                expect(queue.dequeue()).toBe(i);
            }

            expect(queue.isEmpty()).toBe(true);

            // 计时结束
            const endTime = Date.now();
            const elapsedMs = endTime - startTime;

            // 输出性能信息但不做硬性断言（避免在不同环境中测试失败）
            console.log(`处理 ${iterations} 个元素用时: ${elapsedMs}ms (${iterations / (elapsedMs / 1000)} ops/sec)`);
        });
    });
}); 