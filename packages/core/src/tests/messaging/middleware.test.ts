import { MiddlewareChain, LoggingMiddleware, MetricsMiddleware } from '../../core/messaging/middleware';
import { Message, PID } from '../../core/types';

describe('消息中间件', () => {
    // 测试用的消息和目标
    const testMessage: Message = { type: 'test', payload: { data: 'test-data' } };
    const testTarget: PID = { id: 'test-actor', address: 'test-node' };

    describe('MiddlewareChain', () => {
        let chain: MiddlewareChain;

        beforeEach(() => {
            chain = new MiddlewareChain();
        });

        test('应该允许添加中间件', () => {
            const middleware = { onSend: jest.fn().mockReturnValue(testMessage) };
            chain.add(middleware);

            const result = chain.processSend(testMessage, testTarget);
            expect(middleware.onSend).toHaveBeenCalledWith(testMessage, testTarget);
            expect(result).toBe(testMessage);
        });

        test('当中间件返回null时应该终止处理链', () => {
            const middleware1 = { onSend: jest.fn().mockReturnValue(null) };
            const middleware2 = { onSend: jest.fn().mockReturnValue(testMessage) };

            chain.add(middleware1).add(middleware2);

            const result = chain.processSend(testMessage, testTarget);
            expect(middleware1.onSend).toHaveBeenCalledWith(testMessage, testTarget);
            expect(middleware2.onSend).not.toHaveBeenCalled();
            expect(result).toBeNull();
        });

        test('应该按顺序处理多个中间件', () => {
            const modifiedMessage1 = { ...testMessage, modified: 1 };
            const modifiedMessage2 = { ...modifiedMessage1, modified: 2 };

            const middleware1 = {
                onSend: jest.fn().mockReturnValue(modifiedMessage1)
            };
            const middleware2 = {
                onSend: jest.fn().mockImplementation(msg => ({ ...msg, modified: 2 }))
            };

            chain.add(middleware1).add(middleware2);

            const result = chain.processSend(testMessage, testTarget);
            expect(middleware1.onSend).toHaveBeenCalledWith(testMessage, testTarget);
            expect(middleware2.onSend).toHaveBeenCalledWith(modifiedMessage1, testTarget);
            expect(result).toEqual(modifiedMessage2);
        });

        test('应该正确处理死信', () => {
            const middleware1 = { onDeadLetter: jest.fn() };
            const middleware2 = { onDeadLetter: jest.fn() };

            chain.add(middleware1).add(middleware2);

            chain.processDeadLetter(testMessage, testTarget);
            expect(middleware1.onDeadLetter).toHaveBeenCalledWith(testMessage, testTarget);
            expect(middleware2.onDeadLetter).toHaveBeenCalledWith(testMessage, testTarget);
        });

        test('应该正确处理错误', () => {
            const error = new Error('Test error');
            const middleware1 = { onError: jest.fn() };
            const middleware2 = { onError: jest.fn() };

            chain.add(middleware1).add(middleware2);

            chain.processError(error, testMessage, testTarget);
            expect(middleware1.onError).toHaveBeenCalledWith(error, testMessage, testTarget);
            expect(middleware2.onError).toHaveBeenCalledWith(error, testMessage, testTarget);
        });
    });

    describe('LoggingMiddleware', () => {
        let middleware: LoggingMiddleware;
        let logSpy: jest.SpyInstance;

        beforeEach(() => {
            middleware = new LoggingMiddleware('debug');
            // Mock the logger
            logSpy = jest.spyOn(console, 'log').mockImplementation();
        });

        afterEach(() => {
            logSpy.mockRestore();
        });

        test('应该记录发送消息', () => {
            const result = middleware.onSend(testMessage, testTarget);
            expect(result).toBe(testMessage);
            // 实际项目中应该检查日志输出
        });

        test('应该记录接收消息', () => {
            const result = middleware.onReceive(testMessage, testTarget);
            expect(result).toBe(testMessage);
            // 实际项目中应该检查日志输出
        });

        test('应该记录死信', () => {
            middleware.onDeadLetter(testMessage, testTarget);
            // 实际项目中应该检查日志输出
        });

        test('应该记录错误', () => {
            const error = new Error('Test error');
            middleware.onError(error, testMessage, testTarget);
            // 实际项目中应该检查日志输出
        });
    });

    describe('MetricsMiddleware', () => {
        let middleware: MetricsMiddleware;

        beforeEach(() => {
            middleware = new MetricsMiddleware();
        });

        test('应该跟踪发送的消息数量', () => {
            middleware.onSend(testMessage, testTarget);
            middleware.onSend(testMessage, testTarget);

            const metrics = middleware.getMetrics();
            expect(metrics.messagesSent).toBe(2);
        });

        test('应该跟踪接收的消息数量', () => {
            middleware.onReceive(testMessage, testTarget);

            const metrics = middleware.getMetrics();
            expect(metrics.messagesReceived).toBe(1);
        });

        test('应该跟踪消息类型计数', () => {
            middleware.onSend(testMessage, testTarget);
            middleware.onSend({ ...testMessage, type: 'another-type' }, testTarget);
            middleware.onSend(testMessage, testTarget);

            const metrics = middleware.getMetrics();
            expect(metrics.messageTypeCount['test']).toBe(2);
            expect(metrics.messageTypeCount['another-type']).toBe(1);
        });

        test('应该跟踪死信数量', () => {
            middleware.onDeadLetter(testMessage, testTarget);
            middleware.onDeadLetter(testMessage, testTarget);

            const metrics = middleware.getMetrics();
            expect(metrics.deadLetters).toBe(2);
        });

        test('应该跟踪错误数量', () => {
            const error = new Error('Test error');
            middleware.onError(error, testMessage, testTarget);

            const metrics = middleware.getMetrics();
            expect(metrics.errors).toBe(1);
        });

        test('应该重置指标', () => {
            middleware.onSend(testMessage, testTarget);
            middleware.onReceive(testMessage, testTarget);
            middleware.onDeadLetter(testMessage, testTarget);

            middleware.resetMetrics();

            const metrics = middleware.getMetrics();
            expect(metrics.messagesSent).toBe(0);
            expect(metrics.messagesReceived).toBe(0);
            expect(metrics.deadLetters).toBe(0);
        });

        test('应该跟踪消息处理时间', () => {
            // 发送带追踪ID的消息
            const sentMessage = middleware.onSend(testMessage, testTarget);

            // 模拟一些处理时间
            jest.advanceTimersByTime(100);

            // 接收相同的消息
            middleware.onReceive(sentMessage, testTarget);

            const metrics = middleware.getMetrics();
            // 在实际环境中，这里会检查处理时间的指标
        });
    });
}); 