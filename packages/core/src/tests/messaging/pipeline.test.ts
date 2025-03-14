import { MessagePipeline, LocalActorTarget, RemoteActorTarget, DeadLetterTarget } from '../../core/messaging/pipeline';
import { MiddlewareChain } from '../../core/messaging/middleware';
import { Message, PID } from '../../core/types';
import { ActorSystem } from '../../core/system';

// Mock ActorSystem
jest.mock('../../core/system');

describe('消息处理管道', () => {
    let system: jest.Mocked<ActorSystem>;
    let pipeline: MessagePipeline;
    const localTarget: PID = { id: 'local-actor' };
    const remoteTarget: PID = { id: 'remote-actor', address: 'remote-node' };
    const testMessage: Message = { type: 'test', payload: { data: 'test-data' } };

    beforeEach(() => {
        // 创建模拟的 ActorSystem
        system = new ActorSystem() as jest.Mocked<ActorSystem>;
        system.send = jest.fn().mockResolvedValue(undefined);

        // 创建消息管道
        pipeline = new MessagePipeline(system);
    });

    describe('单条消息发送', () => {
        test('应该能成功发送消息到本地Actor', async () => {
            const result = await pipeline.send(localTarget, testMessage);

            expect(system.send).toHaveBeenCalledWith(localTarget, testMessage);
            expect(result).toBe(true);
        });

        test('应该能成功发送消息到远程Actor', async () => {
            const result = await pipeline.send(remoteTarget, testMessage);

            expect(system.send).toHaveBeenCalledWith(remoteTarget, testMessage);
            expect(result).toBe(true);
        });

        test('当发送失败时应该返回false', async () => {
            system.send = jest.fn().mockRejectedValue(new Error('发送失败'));

            const result = await pipeline.send(localTarget, testMessage);

            expect(result).toBe(false);
        });

        test('应该更新处理指标', async () => {
            await pipeline.send(localTarget, testMessage);

            const metrics = pipeline.getMetrics();
            expect(metrics.messagesProcessed).toBe(1);
        });
    });

    describe('批量消息发送', () => {
        test('应该能批量发送消息到同一目标', async () => {
            const targets = [localTarget, localTarget];
            const messages = [testMessage, { ...testMessage, type: 'test2' }];

            const results = await pipeline.sendBatch(targets, messages);

            expect(system.send).toHaveBeenCalledTimes(2);
            expect(results).toEqual([true, true]);
        });

        test('应该能处理混合目标的批量消息', async () => {
            const targets = [localTarget, remoteTarget];
            const messages = [testMessage, { ...testMessage, type: 'test2' }];

            const results = await pipeline.sendBatch(targets, messages);

            expect(system.send).toHaveBeenCalledTimes(2);
            expect(results).toEqual([true, true]);
        });

        test('当部分发送失败时应该返回正确的结果', async () => {
            const targets = [localTarget, remoteTarget];
            const messages = [testMessage, { ...testMessage, type: 'test2' }];

            // 第一次调用成功，第二次调用失败
            system.send
                .mockResolvedValueOnce(undefined)
                .mockRejectedValueOnce(new Error('发送失败'));

            const results = await pipeline.sendBatch(targets, messages);

            expect(results).toEqual([true, false]);
        });

        test('应该更新批处理指标', async () => {
            const targets = [localTarget, remoteTarget];
            const messages = [testMessage, { ...testMessage, type: 'test2' }];

            await pipeline.sendBatch(targets, messages);

            const metrics = pipeline.getMetrics();
            expect(metrics.messagesProcessed).toBe(2);
            expect(metrics.batchesProcessed).toBe(1);
        });

        test('当目标数量与消息数量不匹配时应该抛出错误', async () => {
            const targets = [localTarget];
            const messages = [testMessage, { ...testMessage, type: 'test2' }];

            await expect(pipeline.sendBatch(targets, messages))
                .rejects
                .toThrow('Number of targets must match number of messages');
        });
    });

    describe('目标缓存', () => {
        test('应该缓存消息目标', async () => {
            // 发送两次消息到同一目标
            await pipeline.send(localTarget, testMessage);
            await pipeline.send(localTarget, testMessage);

            const metrics = pipeline.getMetrics();
            expect(metrics.routingCacheHits).toBe(1);
            expect(metrics.routingCacheMisses).toBe(1);
        });

        test('应该能清空目标缓存', async () => {
            // 发送消息以创建缓存
            await pipeline.send(localTarget, testMessage);

            // 清空缓存
            pipeline.clearTargetCache();

            // 再次发送消息
            await pipeline.send(localTarget, testMessage);

            const metrics = pipeline.getMetrics();
            expect(metrics.routingCacheMisses).toBe(2);
        });
    });

    describe('中间件集成', () => {
        test('应该支持添加中间件', async () => {
            const middleware = {
                onSend: jest.fn().mockImplementation(msg => msg)
            };

            pipeline.addMiddleware(middleware);

            await pipeline.send(localTarget, testMessage);

            expect(middleware.onSend).toHaveBeenCalledWith(testMessage, localTarget);
        });

        test('当中间件拦截消息时应该阻止发送', async () => {
            const middleware = {
                onSend: jest.fn().mockReturnValue(null)
            };

            pipeline.addMiddleware(middleware);

            const result = await pipeline.send(localTarget, testMessage);

            expect(middleware.onSend).toHaveBeenCalled();
            expect(system.send).not.toHaveBeenCalled();
            expect(result).toBe(false);
        });

        test('中间件应该能修改消息内容', async () => {
            const modifiedMessage = { ...testMessage, payload: { data: 'modified' } };
            const middleware = {
                onSend: jest.fn().mockReturnValue(modifiedMessage)
            };

            pipeline.addMiddleware(middleware);

            await pipeline.send(localTarget, testMessage);

            expect(system.send).toHaveBeenCalledWith(localTarget, modifiedMessage);
        });
    });

    describe('错误处理', () => {
        test('应该处理查找目标时的错误', async () => {
            // 使用Jest模拟模块替代直接模拟构造函数
            jest.mock('../../core/messaging/pipeline', () => {
                // 保留原始模块的所有内容
                const originalModule = jest.requireActual('../../core/messaging/pipeline');

                // 只覆盖LocalActorTarget类
                return {
                    ...originalModule,
                    LocalActorTarget: jest.fn().mockImplementation(() => {
                        throw new Error('无法创建目标');
                    })
                };
            });

            const result = await pipeline.send(localTarget, testMessage);

            // 目标创建失败后应该尝试使用死信目标
            expect(result).toBe(false);

            // 清除模拟以避免影响其他测试
            jest.unmock('../../core/messaging/pipeline');
        });

        test('应该增加错误计数', async () => {
            system.send = jest.fn().mockRejectedValue(new Error('发送失败'));

            await pipeline.send(localTarget, testMessage);

            const metrics = pipeline.getMetrics();
            expect(metrics.routingErrors).toBe(1);
        });
    });

    describe('性能优化', () => {
        test('小批量时应直接处理而不分组', async () => {
            const targets = new Array(5).fill(localTarget);
            const messages = targets.map(() => testMessage);

            await pipeline.sendBatch(targets, messages);

            // 验证是否为每个消息单独调用了send
            expect(system.send).toHaveBeenCalledTimes(5);
        });

        test('大批量时应按目标分组处理', async () => {
            // 创建一个超过阈值的大批量
            const count = 60;
            const targets = new Array(count).fill(localTarget);
            const messages = targets.map(() => testMessage);

            await pipeline.sendBatch(targets, messages);

            // 验证是否为每个消息单独调用了send
            expect(system.send).toHaveBeenCalledTimes(count);
        });
    });

    describe('指标管理', () => {
        test('应该能重置指标', async () => {
            // 发送一些消息以生成指标
            await pipeline.send(localTarget, testMessage);
            await pipeline.sendBatch([localTarget, remoteTarget], [testMessage, testMessage]);

            // 重置指标
            pipeline.resetMetrics();

            const metrics = pipeline.getMetrics();
            expect(metrics.messagesProcessed).toBe(0);
            expect(metrics.batchesProcessed).toBe(0);
        });
    });
}); 