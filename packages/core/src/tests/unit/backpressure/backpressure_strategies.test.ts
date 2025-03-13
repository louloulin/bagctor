import { describe, test, expect, mock } from 'bun:test';
import { BackpressureStrategy, BackpressureConfig } from '../../../core/backpressure/types';
import { DefaultBackpressureController } from '../../../core/backpressure/default_backpressure_controller';
import { BackpressureError } from '../../../core/backpressure/backpressure_error';
import { v4 as uuidv4 } from 'uuid';
import { MessageEnvelope } from '../../../core/messaging/types';
import { EventEmitter } from 'events';

describe('Backpressure Strategies', () => {
    // 创建测试消息
    const createTestMessage = (id?: string): MessageEnvelope => ({
        id: id || uuidv4(),
        sender: { id: 'sender-1', address: 'local://sender-1' },
        receiver: { id: 'receiver-1', address: 'local://receiver-1' },
        payload: { test: 'data' },
        metadata: {
            deliveryAttempt: 1,
            messageType: 'TEST',
        },
        timestamp: Date.now()
    });

    describe('DROP_NEW Strategy', () => {
        test('should drop new messages when queue is full', async () => {
            // 创建一个小队列容量的控制器
            const controller = new DefaultBackpressureController({
                maxQueueSize: 3,
                highWatermark: 0.8,
                lowWatermark: 0.2,
                strategy: BackpressureStrategy.DROP_NEW
            });

            // 监听消息丢弃事件
            let droppedMessage: MessageEnvelope | null = null;
            let dropReason: string | null = null;
            (controller as unknown as EventEmitter).on('message:dropped', (message: any, reason: string) => {
                droppedMessage = message as MessageEnvelope;
                dropReason = reason;
            });

            // 填满队列
            const message1 = createTestMessage('msg-1');
            const message2 = createTestMessage('msg-2');
            const message3 = createTestMessage('msg-3');
            const message4 = createTestMessage('msg-4');

            // 前三个消息应该被接受
            expect(await controller.submit(message1)).toBe(true);
            expect(await controller.submit(message2)).toBe(true);
            expect(await controller.submit(message3)).toBe(true);

            // 第四个消息应该被丢弃
            expect(await controller.submit(message4)).toBe(false);
            expect(droppedMessage).not.toBeNull();
            if (droppedMessage) {
                expect(droppedMessage.id).toBe(message4.id);
            }
            expect(dropReason).toBe('backpressure:drop_new');

            // 队列大小应该仍然是3
            expect(controller.getQueueSize()).toBe(3);

            // 验证队列中的消息顺序
            const next1 = await controller.next();
            const next2 = await controller.next();
            const next3 = await controller.next();
            const next4 = await controller.next();

            expect(next1?.id).toBe(message1.id);
            expect(next2?.id).toBe(message2.id);
            expect(next3?.id).toBe(message3.id);
            expect(next4).toBeNull(); // 没有第四个消息
        });
    });

    describe('DROP_OLD Strategy', () => {
        test('should drop oldest messages when queue is full', async () => {
            // 创建一个小队列容量的控制器
            const controller = new DefaultBackpressureController({
                maxQueueSize: 3,
                highWatermark: 0.8,
                lowWatermark: 0.2,
                strategy: BackpressureStrategy.DROP_OLD
            });

            // 监听消息丢弃事件
            let droppedMessage: MessageEnvelope | null = null;
            let dropReason: string | null = null;
            (controller as unknown as EventEmitter).on('message:dropped', (message: any, reason: string) => {
                droppedMessage = message as MessageEnvelope;
                dropReason = reason;
            });

            // 填满队列
            const message1 = createTestMessage('msg-1');
            const message2 = createTestMessage('msg-2');
            const message3 = createTestMessage('msg-3');
            const message4 = createTestMessage('msg-4');

            // 前三个消息应该被接受
            expect(await controller.submit(message1)).toBe(true);
            expect(await controller.submit(message2)).toBe(true);
            expect(await controller.submit(message3)).toBe(true);

            // 第四个消息应该被接受，但会导致最旧的消息被丢弃
            expect(await controller.submit(message4)).toBe(true);
            expect(droppedMessage).not.toBeNull();
            if (droppedMessage) {
                expect(droppedMessage.id).toBe(message1.id); // 最旧的消息被丢弃
            }
            expect(dropReason).toBe('backpressure:drop_old');

            // 队列大小应该仍然是3
            expect(controller.getQueueSize()).toBe(3);

            // 验证队列中的消息顺序
            const next1 = await controller.next();
            const next2 = await controller.next();
            const next3 = await controller.next();
            const next4 = await controller.next();

            expect(next1?.id).toBe(message2.id); // 现在message2是最旧的
            expect(next2?.id).toBe(message3.id);
            expect(next3?.id).toBe(message4.id);
            expect(next4).toBeNull(); // 没有第四个消息
        });
    });

    describe('THROW Strategy', () => {
        test('should throw error when queue is full', async () => {
            // 创建一个小队列容量的控制器
            const controller = new DefaultBackpressureController({
                maxQueueSize: 3,
                highWatermark: 0.8,
                lowWatermark: 0.2,
                strategy: BackpressureStrategy.THROW
            });

            // 填满队列
            const message1 = createTestMessage('msg-1');
            const message2 = createTestMessage('msg-2');
            const message3 = createTestMessage('msg-3');
            const message4 = createTestMessage('msg-4');

            // 前三个消息应该被接受
            expect(await controller.submit(message1)).toBe(true);
            expect(await controller.submit(message2)).toBe(true);
            expect(await controller.submit(message3)).toBe(true);

            // 第四个消息应该抛出异常
            await expect(async () => {
                await controller.submit(message4);
            }).toThrow(BackpressureError);

            // 队列大小应该仍然是3
            expect(controller.getQueueSize()).toBe(3);

            // 验证队列中的消息顺序
            const next1 = await controller.next();
            const next2 = await controller.next();
            const next3 = await controller.next();
            const next4 = await controller.next();

            expect(next1?.id).toBe(message1.id);
            expect(next2?.id).toBe(message2.id);
            expect(next3?.id).toBe(message3.id);
            expect(next4).toBeNull(); // 没有第四个消息
        });
    });

    describe('WAIT Strategy', () => {
        test('should wait until space is available', async () => {
            // 创建一个小队列容量的控制器，使用非常短的超时
            const controller = new DefaultBackpressureController({
                maxQueueSize: 3,
                highWatermark: 0.8,
                lowWatermark: 0.2,
                strategy: BackpressureStrategy.WAIT,
                waitTimeout: 5000 // 设置一个较长的超时，确保不会超时
            });

            // 填满队列
            const message1 = createTestMessage('msg-1');
            const message2 = createTestMessage('msg-2');
            const message3 = createTestMessage('msg-3');
            const message4 = createTestMessage('msg-4');

            // 前三个消息应该被接受
            await controller.submit(message1);
            await controller.submit(message2);
            await controller.submit(message3);

            // 先获取并完成一个消息，为第四个消息腾出空间
            const firstMessage = await controller.next();
            if (firstMessage) {
                controller.complete(firstMessage.id);
            }

            // 现在应该可以提交第四个消息
            const result = await controller.submit(message4);
            expect(result).toBe(true);

            // 队列大小应该仍然是3（一个被处理，一个新加入）
            expect(controller.getQueueSize()).toBe(3);

            // 清空队列
            while (await controller.next() !== null) {
                // 不需要完成消息，只是清空队列
            }
        });

        test('should timeout if space is not available within timeout period', async () => {
            // 使用Bun的mock替代jest的timer mock
            const originalSetTimeout = setTimeout;
            const mockSetTimeout = mock((callback: Function, ms: number) => {
                // 立即调用回调，模拟时间快进
                if (ms > 100) { // 只有超时回调会立即执行
                    callback();
                }
                return 0;
            });

            // 替换全局setTimeout
            global.setTimeout = mockSetTimeout as any;

            // 创建一个小队列容量的控制器
            const controller = new DefaultBackpressureController({
                maxQueueSize: 3,
                highWatermark: 0.8,
                lowWatermark: 0.2,
                strategy: BackpressureStrategy.WAIT,
                waitTimeout: 200 // 设置一个较短的超时
            });

            // 监听消息丢弃事件
            let droppedMessage: MessageEnvelope | null = null;
            let dropReason: string | null = null;
            (controller as unknown as EventEmitter).on('message:dropped', (message: any, reason: string) => {
                droppedMessage = message as MessageEnvelope;
                dropReason = reason;
            });

            // 填满队列
            const message1 = createTestMessage('msg-1');
            const message2 = createTestMessage('msg-2');
            const message3 = createTestMessage('msg-3');
            const message4 = createTestMessage('msg-4');

            // 前三个消息应该被接受
            expect(await controller.submit(message1)).toBe(true);
            expect(await controller.submit(message2)).toBe(true);
            expect(await controller.submit(message3)).toBe(true);

            // 第四个消息应该超时
            const result = await controller.submit(message4);
            expect(result).toBe(false);
            expect(dropReason).toBe('backpressure:wait_timeout');
            expect(droppedMessage).not.toBeNull();
            if (droppedMessage) {
                expect(droppedMessage.id).toBe(message4.id);
            }

            // 恢复原始setTimeout
            global.setTimeout = originalSetTimeout;
        });
    });
}); 