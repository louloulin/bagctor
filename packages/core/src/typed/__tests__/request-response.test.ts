import {
    RequestResponseProtocol,
    createRequestResponseMap,
    generateCorrelationId,
    RequestResponseManager,
    request,
    response
} from '../request-response';

// 将测试拆分成多个文件运行
describe('Request-Response Pattern', () => {
    // 测试协议创建
    describe('createRequestResponseMap', () => {
        it('should create a request-response protocol', () => {
            const protocol = createRequestResponseMap<{ id: string }, { name: string }>(
                'getUser',
                'userResult'
            );

            expect(protocol).toBeDefined();
            expect(protocol.requestType).toBe('getUser');
            expect(protocol.responseType).toBe('userResult');
        });

        it('should create a protocol with validators', () => {
            const requestValidator = (value: any): value is { id: string } => {
                return typeof value === 'object' &&
                    value !== null &&
                    typeof value.id === 'string';
            };

            const responseValidator = (value: any): value is { name: string } => {
                return typeof value === 'object' &&
                    value !== null &&
                    typeof value.name === 'string';
            };

            const protocol = createRequestResponseMap<{ id: string }, { name: string }>(
                'getUser',
                'userResult',
                requestValidator,
                responseValidator
            );

            expect(protocol.requestValidator).toBe(requestValidator);
            expect(protocol.responseValidator).toBe(responseValidator);
        });
    });

    // 测试相关ID生成
    describe('generateCorrelationId', () => {
        it('should generate unique correlation IDs', () => {
            const id1 = generateCorrelationId();
            const id2 = generateCorrelationId();

            expect(id1).toBeDefined();
            expect(id2).toBeDefined();
            expect(id1).not.toBe(id2);
        });
    });

    // 测试请求消息创建
    describe('request', () => {
        it('should create a request message', () => {
            const protocol = createRequestResponseMap<{ id: string }, { name: string }>(
                'getUser',
                'userResult'
            );

            const payload = { id: '123' };
            const correlationId = 'test-correlation-id';

            const requestMessage = request(protocol, payload, correlationId);

            expect(requestMessage).toBeDefined();
            expect(requestMessage.type).toBe('getUser');
            expect(requestMessage.payload).toBe(payload);
            expect(requestMessage.metadata?.correlationId).toBe(correlationId);
            expect(requestMessage.metadata?.isRequest).toBe(true);
        });

        it('should generate a correlation ID if not provided', () => {
            const protocol = createRequestResponseMap<{ id: string }, { name: string }>(
                'getUser',
                'userResult'
            );

            const payload = { id: '123' };

            const requestMessage = request(protocol, payload);

            expect(requestMessage.metadata?.correlationId).toBeDefined();
        });
    });

    // 测试响应消息创建
    describe('response', () => {
        it('should create a response message', () => {
            const protocol = createRequestResponseMap<{ id: string }, { name: string }>(
                'getUser',
                'userResult'
            );

            const payload = { name: 'John' };
            const correlationId = 'test-correlation-id';
            const replyTo = { id: 'actor-1', type: 'test' };

            const responseMessage = response(protocol, payload, correlationId, replyTo);

            expect(responseMessage).toBeDefined();
            expect(responseMessage.type).toBe('userResult');
            expect(responseMessage.payload).toBe(payload);
            expect(responseMessage.metadata?.correlationId).toBe(correlationId);
            expect(responseMessage.metadata?.isResponse).toBe(true);
            expect(responseMessage.metadata?.replyTo).toBe(replyTo);
        });
    });

    // 测试请求-响应管理器
    describe('RequestResponseManager基本功能', () => {
        let manager: RequestResponseManager;

        beforeEach(() => {
            console.log('Creating new RequestResponseManager for test');
            manager = new RequestResponseManager();
        });

        // 注册请求并接收响应
        it('should register a request and resolve when response is received', async () => {
            console.log('TEST: should register a request and resolve when response is received');
            const correlationId = 'test-correlation-id';
            console.log('Registering request with correlationId:', correlationId);
            const responsePromise = manager.registerRequest(correlationId);

            // 创建响应消息
            console.log('Creating response message');
            const responseMessage = {
                type: 'userResult',
                payload: { name: 'John' },
                metadata: {
                    correlationId,
                    isResponse: true,
                    timestamp: Date.now()
                }
            };

            // 处理响应
            console.log('Handling response message');
            const handled = manager.handleResponse(responseMessage);

            console.log('Response handled:', handled);
            expect(handled).toBe(true);

            // 等待响应Promise解析
            console.log('Waiting for response promise to resolve');
            const result = await responsePromise;
            console.log('Response promise resolved with:', result);
            expect(result).toEqual({ name: 'John' });
        });

        // 无相关ID的消息不应被处理
        it('should not handle messages without correlation ID', () => {
            console.log('TEST: should not handle messages without correlation ID');
            const responseMessage = {
                type: 'userResult',
                payload: { name: 'John' },
                metadata: {
                    isResponse: true,
                    timestamp: Date.now()
                }
            };

            console.log('Handling message without correlationId');
            const handled = manager.handleResponse(responseMessage);
            console.log('Message handled:', handled);
            expect(handled).toBe(false);
        });

        // 非响应消息不应被处理
        it('should not handle messages that are not responses', () => {
            console.log('TEST: should not handle messages that are not responses');
            const message = {
                type: 'userResult',
                payload: { name: 'John' },
                metadata: {
                    correlationId: 'test-correlation-id',
                    timestamp: Date.now()
                }
            };

            console.log('Handling non-response message');
            const handled = manager.handleResponse(message);
            console.log('Message handled:', handled);
            expect(handled).toBe(false);
        });

        // 未知相关ID的响应不应被处理
        it('should not handle responses for unknown correlation IDs', () => {
            console.log('TEST: should not handle responses for unknown correlation IDs');
            const responseMessage = {
                type: 'userResult',
                payload: { name: 'John' },
                metadata: {
                    correlationId: 'unknown-correlation-id',
                    isResponse: true,
                    timestamp: Date.now()
                }
            };

            console.log('Handling response with unknown correlationId');
            const handled = manager.handleResponse(responseMessage);
            console.log('Message handled:', handled);
            expect(handled).toBe(false);
        });
    });

    // 单独测试取消功能
    describe('RequestResponseManager取消功能', () => {
        let manager: RequestResponseManager;

        beforeEach(() => {
            console.log('Creating new RequestResponseManager for cancel test');
            manager = new RequestResponseManager();
        });

        // 取消单个请求
        it('should cancel a request', async () => {
            console.log('TEST: should cancel a request');
            const correlationId = 'test-correlation-id-cancel';
            console.log('Registering request with correlationId:', correlationId);
            const responsePromise = manager.registerRequest(correlationId);

            // 添加一个等待
            await new Promise(resolve => setTimeout(resolve, 10));

            // 取消请求
            console.log('Cancelling request');
            const cancelled = manager.cancelRequest(correlationId, 'Test cancellation');

            console.log('Request cancelled:', cancelled);
            expect(cancelled).toBe(true);

            // 等待Promise被拒绝
            console.log('Waiting for promise to be rejected');
            try {
                await responsePromise;
                console.log('ERROR: Promise was not rejected');
                // 如果到达这里，说明Promise没有被拒绝
                expect(true).toBe(false); // 这会导致测试失败
            } catch (error: any) {
                console.log('Promise rejected with error:', error.message);
                expect(error.message).toBe('Test cancellation');
            }
        });

        // 取消所有请求
        it('should cancel all requests', async () => {
            console.log('TEST: should cancel all requests');
            const correlationId1 = 'test-correlation-id-cancel-1';
            const correlationId2 = 'test-correlation-id-cancel-2';

            console.log('Registering request 1 with correlationId:', correlationId1);
            const responsePromise1 = manager.registerRequest(correlationId1);

            console.log('Registering request 2 with correlationId:', correlationId2);
            const responsePromise2 = manager.registerRequest(correlationId2);

            // 添加一个等待
            await new Promise(resolve => setTimeout(resolve, 10));

            // 取消所有请求
            console.log('Cancelling all requests');
            manager.cancelAllRequests('All tests cancelled');

            // 等待Promise被拒绝
            console.log('Waiting for promise 1 to be rejected');
            try {
                await responsePromise1;
                console.log('ERROR: Promise 1 was not rejected');
                expect(true).toBe(false);
            } catch (error: any) {
                console.log('Promise 1 rejected with error:', error.message);
                expect(error.message).toBe('All tests cancelled');
            }

            console.log('Waiting for promise 2 to be rejected');
            try {
                await responsePromise2;
                console.log('ERROR: Promise 2 was not rejected');
                expect(true).toBe(false);
            } catch (error: any) {
                console.log('Promise 2 rejected with error:', error.message);
                expect(error.message).toBe('All tests cancelled');
            }
        });
    });

    // 单独测试超时功能
    describe('RequestResponseManager超时功能', () => {
        // 使用硬编码的方式测试超时
        it('should timeout a request after specified time', async () => {
            console.log('TEST: should timeout a request after specified time');

            // 创建新的管理器
            const manager = new RequestResponseManager();

            // 使用更短的超时时间
            const correlationId = 'test-correlation-id-timeout-special';
            const timeoutMs = 200; // 200毫秒超时，增加超时时间

            console.log(`Registering request with correlationId: ${correlationId}, timeout: ${timeoutMs}ms`);
            const responsePromise = manager.registerRequest(correlationId, timeoutMs);

            // 将收到拒绝的Promise转换为布尔值
            let rejected = false;
            let errorMessage = '';

            // 使用更粗暴的方式等待超时
            responsePromise.catch((error) => {
                console.log('Promise was rejected with:', error.message);
                rejected = true;
                errorMessage = error.message;
            });

            // 等待足够长的时间
            console.log(`Waiting for ${timeoutMs * 2}ms to ensure timeout occurs`);
            await new Promise(resolve => setTimeout(resolve, timeoutMs * 2));

            // 检查是否被拒绝
            console.log('Checking if promise was rejected:', rejected);
            expect(rejected).toBe(true);
            expect(errorMessage).toContain(`timed out after ${timeoutMs}ms`);

            console.log('Timeout test completed successfully');
        });
    });
}); 