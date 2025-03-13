import { describe, test, expect, beforeEach, mock } from 'bun:test';
import { DefaultBackpressureController, BackpressureStrategy, BackpressureConfig, BackpressureError, BackpressureTimeoutError } from '../../../core/backpressure';
import { MessageEnvelope } from '../../../core/messaging/types';
import { v4 as uuidv4 } from 'uuid';
import { EventEmitter } from 'events';

describe('DefaultBackpressureController', () => {
    let controller: DefaultBackpressureController;
    let config: BackpressureConfig;

    // 创建一个消息测试函数
    const createTestMessage = (): MessageEnvelope => ({
        id: uuidv4(),
        sender: { id: 'sender-1', address: 'local://sender-1' },
        receiver: { id: 'receiver-1', address: 'local://receiver-1' },
        payload: { test: 'data' },
        metadata: {
            deliveryAttempt: 1,
            messageType: 'TEST',
        },
        timestamp: Date.now()
    });

    beforeEach(() => {
        // 默认配置
        config = {
            maxQueueSize: 10,
            highWatermark: 0.8, // 80%
            lowWatermark: 0.2,  // 20%
            strategy: BackpressureStrategy.DROP_NEW
        };
        controller = new DefaultBackpressureController(config);
    });

    test('should accept messages when queue is not full', async () => {
        const message = createTestMessage();
        const result = await controller.submit(message);

        expect(result).toBe(true);
        expect(controller.getQueueSize()).toBe(1);
        expect(controller.isBackpressureActive()).toBe(false);
    });

    test('should retrieve and complete messages correctly', async () => {
        const message1 = createTestMessage();
        const message2 = createTestMessage();

        await controller.submit(message1);
        await controller.submit(message2);

        expect(controller.getQueueSize()).toBe(2);

        const nextMessage = await controller.next();
        expect(nextMessage).not.toBeNull();
        if (nextMessage) {
            expect(nextMessage.id).toBe(message1.id);
        }
        expect(controller.getQueueSize()).toBe(2); // 仍然是2，因为一个在队列中，一个正在处理

        controller.complete(message1.id);
        expect(controller.getQueueSize()).toBe(1); // 完成一个后，降到1

        const nextMessage2 = await controller.next();
        if (nextMessage2) {
            expect(nextMessage2.id).toBe(message2.id);
        }

        controller.complete(message2.id);
        expect(controller.getQueueSize()).toBe(0); // 完成所有后，降到0
    });

    test('should activate backpressure when reaching high watermark', async () => {
        // 监听背压激活事件
        let backpressureActivated = false;
        (controller as unknown as EventEmitter).on('backpressure:activated', () => {
            backpressureActivated = true;
        });

        // 添加消息直到高水位线
        const messages = Array.from({ length: 8 }, () => createTestMessage()); // 80%

        for (const message of messages.slice(0, 7)) {
            await controller.submit(message);
            expect(controller.isBackpressureActive()).toBe(false); // 还没达到高水位线
        }

        // 添加第8个消息，达到80%，应该激活背压
        await controller.submit(messages[7]);
        expect(controller.isBackpressureActive()).toBe(true);
        expect(backpressureActivated).toBe(true);
    });

    test('should deactivate backpressure when reaching low watermark', async () => {
        // 先把队列填到高水位线
        const messages = Array.from({ length: 8 }, () => createTestMessage()); // 80%
        for (const message of messages) {
            await controller.submit(message);
        }
        expect(controller.isBackpressureActive()).toBe(true);

        // 监听背压停用事件
        let backpressureDeactivated = false;
        (controller as unknown as EventEmitter).on('backpressure:deactivated', () => {
            backpressureDeactivated = true;
        });

        // 处理消息直到低水位线
        for (const message of messages.slice(0, 6)) { // 处理6个，剩余2个(20%)
            const msg = await controller.next();
            if (msg) {
                controller.complete(msg.id);
            }
        }

        // 背压应该停用
        expect(controller.isBackpressureActive()).toBe(false);
        expect(backpressureDeactivated).toBe(true);
    });

    test('should apply DROP_NEW strategy when queue is full', async () => {
        // 创建一个DROP_NEW策略的控制器
        const dropNewController = new DefaultBackpressureController({
            ...config,
            strategy: BackpressureStrategy.DROP_NEW
        });

        // 监听消息丢弃事件
        let droppedMessage: MessageEnvelope | null = null;
        (dropNewController as unknown as EventEmitter).on('message:dropped', (message: any) => {
            droppedMessage = message as MessageEnvelope;
        });

        // 填满队列
        const messages = Array.from({ length: 10 }, () => createTestMessage()); // 100%
        for (const message of messages) {
            await dropNewController.submit(message);
        }

        // 尝试添加第11个消息，应该被拒绝
        const extraMessage = createTestMessage();
        const result = await dropNewController.submit(extraMessage);

        expect(result).toBe(false);
        expect(droppedMessage).not.toBeNull();
        if (droppedMessage) {
            expect(droppedMessage.id).toBe(extraMessage.id);
        }
        expect(dropNewController.getQueueSize()).toBe(10); // 队列大小不变
    });

    test('should apply DROP_OLD strategy when queue is full', async () => {
        // 创建一个DROP_OLD策略的控制器
        const dropOldController = new DefaultBackpressureController({
            ...config,
            strategy: BackpressureStrategy.DROP_OLD
        });

        // 监听消息丢弃事件
        let droppedMessage: MessageEnvelope | null = null;
        (dropOldController as unknown as EventEmitter).on('message:dropped', (message: any) => {
            droppedMessage = message as MessageEnvelope;
        });

        // 填满队列
        const messages = Array.from({ length: 10 }, () => createTestMessage()); // 100%
        for (const message of messages) {
            await dropOldController.submit(message);
        }

        // 记录第一个消息的ID，这是应该被丢弃的
        const firstMessageId = messages[0].id;

        // 尝试添加第11个消息，应该被接受，但第一个消息会被丢弃
        const extraMessage = createTestMessage();
        const result = await dropOldController.submit(extraMessage);

        expect(result).toBe(true);
        expect(droppedMessage).not.toBeNull();
        if (droppedMessage) {
            expect(droppedMessage.id).toBe(firstMessageId);
        }
        expect(dropOldController.getQueueSize()).toBe(10); // 队列大小不变

        // 如果我们获取下一个消息，它应该是第二个消息，而不是第一个
        const nextMessage = await dropOldController.next();
        if (nextMessage) {
            expect(nextMessage.id).toBe(messages[1].id);
        }
    });

    test('should apply THROW strategy when queue is full', async () => {
        // 创建一个THROW策略的控制器
        const throwController = new DefaultBackpressureController({
            ...config,
            strategy: BackpressureStrategy.THROW
        });

        // 填满队列
        const messages = Array.from({ length: 10 }, () => createTestMessage()); // 100%
        for (const message of messages) {
            await throwController.submit(message);
        }

        // 尝试添加第11个消息，应该抛出异常
        const extraMessage = createTestMessage();

        await expect(async () => {
            await throwController.submit(extraMessage);
        }).toThrow(BackpressureError);
    });

    test('should apply WAIT strategy when queue is full', async () => {
        // 创建一个WAIT策略的控制器，设置超时为100ms
        const waitController = new DefaultBackpressureController({
            ...config,
            strategy: BackpressureStrategy.WAIT,
            waitTimeout: 100
        });

        // 填满队列
        const messages = Array.from({ length: 10 }, () => createTestMessage()); // 100%
        for (const message of messages) {
            await waitController.submit(message);
        }

        // 第11个消息
        const extraMessage = createTestMessage();

        // 模拟在500ms后处理一个消息，这样队列就有空间了
        setTimeout(async () => {
            const msg = await waitController.next();
            if (msg) {
                waitController.complete(msg.id);
            }
        }, 50);

        // 等待消息提交成功，应该会等到有空间
        const result = await waitController.submit(extraMessage);
        expect(result).toBe(true);
        expect(waitController.getQueueSize()).toBe(10); // 队列大小不变
    });

    test('should timeout with WAIT strategy', async () => {
        // 使用Bun的mock替代jest的timer mock
        const originalSetTimeout = setTimeout;
        const mockSetTimeout = mock((callback: Function, ms: number) => {
            // 立即调用回调，模拟时间快进
            callback();
            return 0;
        });

        // 替换全局setTimeout
        global.setTimeout = mockSetTimeout as any;

        // 创建一个WAIT策略的控制器，设置超时为100ms
        const waitController = new DefaultBackpressureController({
            ...config,
            strategy: BackpressureStrategy.WAIT,
            waitTimeout: 100
        });

        // 监听消息丢弃事件
        let timeoutReason = '';
        (waitController as unknown as EventEmitter).on('message:dropped', (_: any, reason: string) => {
            timeoutReason = reason;
        });

        // 填满队列
        const messages = Array.from({ length: 10 }, () => createTestMessage()); // 100%
        for (const message of messages) {
            await waitController.submit(message);
        }

        // 第11个消息
        const extraMessage = createTestMessage();

        // 尝试提交，但不处理任何消息，让它超时
        const result = await waitController.submit(extraMessage);

        // 验证结果
        expect(result).toBe(false);
        expect(timeoutReason).toBe('backpressure:wait_timeout');

        // 恢复原始setTimeout
        global.setTimeout = originalSetTimeout;
    });

    test('should calculate queue utilization correctly', async () => {
        const message1 = createTestMessage();
        const message2 = createTestMessage();

        // 空队列应该是0%
        expect(controller.getQueueUtilization()).toBe(0);

        // 添加一个消息 (10%)
        await controller.submit(message1);
        expect(controller.getQueueUtilization()).toBe(0.1);

        // 添加另一个消息 (20%)
        await controller.submit(message2);
        expect(controller.getQueueUtilization()).toBe(0.2);

        // 处理但不完成一个消息，应该仍然算在利用率里
        await controller.next();
        expect(controller.getQueueUtilization()).toBe(0.2);

        // 完成一个消息后 (10%)
        controller.complete(message1.id);
        expect(controller.getQueueUtilization()).toBe(0.1);

        // 完成所有消息后 (0%)
        controller.complete(message2.id);
        expect(controller.getQueueUtilization()).toBe(0);
    });

    test('should validate configuration', () => {
        // 测试无效的最大队列大小
        expect(() => {
            new DefaultBackpressureController({
                ...config,
                maxQueueSize: 0
            });
        }).toThrow();

        // 测试无效的高水位线
        expect(() => {
            new DefaultBackpressureController({
                ...config,
                highWatermark: 1.5
            });
        }).toThrow();

        // 测试无效的低水位线
        expect(() => {
            new DefaultBackpressureController({
                ...config,
                lowWatermark: -0.1
            });
        }).toThrow();

        // 测试低水位线高于高水位线
        expect(() => {
            new DefaultBackpressureController({
                ...config,
                highWatermark: 0.5,
                lowWatermark: 0.6
            });
        }).toThrow();

        // 测试无效的等待超时
        expect(() => {
            new DefaultBackpressureController({
                ...config,
                strategy: BackpressureStrategy.WAIT,
                waitTimeout: -100
            });
        }).toThrow();
    });
}); 