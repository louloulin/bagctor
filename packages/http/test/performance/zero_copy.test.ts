/**
 * zero_copy.test.ts
 * 
 * 零拷贝(Zero Copy)优化的测试文件
 */

import {
    BufferView,
    BufferViewImpl,
    ZeroCopyBufferPool,
    ZeroCopyMessage,
    ZeroCopyMessageImpl,
    createBufferView,
    allocateBuffer,
    recycleBuffer,
    createZeroCopyMessage,
    concatBuffers,
    bufferFromString
} from '../../src/core/performance/zero_copy';
import { Buffer } from 'buffer';

// 引入Jest类型
import '@types/jest';

describe('零拷贝优化', () => {
    describe('BufferView', () => {
        it('应该能够创建缓冲区视图', () => {
            const originalBuffer = Buffer.from('Hello, World!');
            const view = createBufferView(originalBuffer);

            expect(view).toBeDefined();
            expect(view.buffer).toBe(originalBuffer);
            expect(view.offset).toBe(0);
            expect(view.length).toBe(originalBuffer.length);
        });

        it('应该能够创建指定偏移和长度的视图', () => {
            const originalBuffer = Buffer.from('Hello, World!');
            const view = createBufferView(originalBuffer, 7, 5); // "World"

            expect(view.buffer).toBe(originalBuffer);
            expect(view.offset).toBe(7);
            expect(view.length).toBe(5);
            expect(view.toString()).toBe('World');
        });

        it('应该能够切片视图而不复制数据', () => {
            const originalBuffer = Buffer.from('Hello, World!');
            const view = createBufferView(originalBuffer);
            const slice = view.slice(7, 12); // "World"

            expect(slice.buffer).toBe(originalBuffer); // 应该引用相同的底层缓冲区
            expect(slice.offset).toBe(7);
            expect(slice.length).toBe(5);
            expect(slice.toString()).toBe('World');
        });

        it('应该能够正确地转换为Buffer', () => {
            const originalBuffer = Buffer.from('Hello, World!');
            const view = createBufferView(originalBuffer, 7, 5); // "World"
            const buffer = view.toBuffer();

            expect(Buffer.isBuffer(buffer)).toBe(true);
            expect(buffer.toString()).toBe('World');

            // 验证是否共享底层内存
            originalBuffer[7] = 'w'.charCodeAt(0); // 修改为"wORLD"
            expect(buffer.toString()).toBe('world');
        });
    });

    describe('ZeroCopyBufferPool', () => {
        it('应该能够分配缓冲区', () => {
            const bufferView = allocateBuffer(100);

            expect(bufferView).toBeDefined();
            expect(bufferView.length).toBe(100);
            expect(Buffer.isBuffer(bufferView.buffer)).toBe(true);
        });

        it('应该能够回收缓冲区', () => {
            const pool = ZeroCopyBufferPool.getInstance();
            const statsBeforeAlloc = pool.getStats();

            // 分配和回收多个缓冲区
            for (let i = 0; i < 10; i++) {
                const bufferView = allocateBuffer(100);
                recycleBuffer(bufferView);
            }

            const statsAfterRecycle = pool.getStats();

            // 回收次数应该增加
            expect(statsAfterRecycle.recycled).toBeGreaterThan(statsBeforeAlloc.recycled);
        });

        it('应该根据大小选择适当的缓冲区类别', () => {
            // 分配不同大小的缓冲区
            const small = allocateBuffer(1000);  // 应该选择1KB类别
            const medium = allocateBuffer(10000); // 应该选择16KB类别
            const large = allocateBuffer(100000); // 应该选择256KB类别

            // 验证缓冲区大小
            expect(small.buffer.length).toBeGreaterThanOrEqual(1000);
            expect(medium.buffer.length).toBeGreaterThanOrEqual(10000);
            expect(large.buffer.length).toBeGreaterThanOrEqual(100000);

            // 清理
            recycleBuffer(small);
            recycleBuffer(medium);
            recycleBuffer(large);
        });

        it('应该正确从字符串创建缓冲区', () => {
            const str = '零拷贝优化测试';
            const bufferView = bufferFromString(str);

            expect(bufferView.toString()).toBe(str);
        });

        it('应该能够连接多个缓冲区', () => {
            const part1 = bufferFromString('Hello, ');
            const part2 = bufferFromString('World!');

            const combined = concatBuffers([part1, part2]);

            expect(combined.toString()).toBe('Hello, World!');
        });
    });

    describe('ZeroCopyMessage', () => {
        it('应该能够创建消息', () => {
            const data = bufferFromString('消息数据');
            const message = createZeroCopyMessage('test', data, { key: 'value' });

            expect(message.type).toBe('test');
            expect(message.data).toBe(data);
            expect(message.metadata).toEqual({ key: 'value' });
        });

        it('应该能够将消息转换为Buffer', () => {
            const data = bufferFromString('消息数据');
            const message = createZeroCopyMessage('test', data);

            const buffer = message.toBuffer();
            expect(Buffer.isBuffer(buffer)).toBe(true);
            expect(buffer.toString()).toBe('消息数据');
        });

        it('应该能够正确释放资源', () => {
            const pool = ZeroCopyBufferPool.getInstance();
            const statsBeforeAlloc = pool.getStats();

            const data = bufferFromString('消息数据');
            const message = createZeroCopyMessage('test', data);

            // 释放消息
            message.release();

            // 再次调用release应该不会抛出错误
            expect(() => message.release()).not.toThrow();

            // 释放后调用toBuffer应该抛出错误
            expect(() => message.toBuffer()).toThrow();
        });
    });
}); 