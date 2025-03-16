/// <reference types="bun-types" />
import { expect, test, describe } from 'bun:test';
import { Actor, Props, ActorContext, ActorSystem, DefaultMailbox } from '@bactor/core';
import { PID, Message } from '@bactor/common';
import { MiddlewareManager } from '../src/middleware/manager';
import { LoggerMiddleware, CorsMiddleware, AuthMiddleware } from '../src/middleware/common';
import { HttpRequest } from '../src/types';

// Mock ActorSystem for testing
class MockActorSystem extends ActorSystem {
  constructor() {
    super();
  }

  async send(pid: PID, message: Message): Promise<any> {
    return { type: 'middleware.result', payload: { handled: false } };
  }

  async spawn(props: Props): Promise<PID> {
    return { id: 'spawned' };
  }
}

// Mock ActorContext
class MockActorContext extends ActorContext {
  private _selfPid: PID;

  constructor() {
    const pid = { id: 'test' };
    const system = new MockActorSystem();
    super(pid, system, DefaultMailbox);
    this._selfPid = pid;
  }

  get self(): PID {
    return this._selfPid;
  }

  async send(target: PID, message: Message): Promise<any> {
    console.log(`[MockActorContext] Sending message to ${target.id}:`, message);
    // 在实际测试中，这里会返回一个模拟的响应
    return {
      type: 'middleware.result',
      payload: {
        handled: false
      }
    };
  }

  async spawn(props: Props): Promise<PID> {
    return { id: 'spawned' };
  }

  async stop(pid: PID): Promise<void> { }
}

// Test classes to access protected methods
class TestLoggerMiddleware extends LoggerMiddleware {
  public async testProcess(context: any) {
    return this.process(context);
  }
}

class TestCorsMiddleware extends CorsMiddleware {
  public async testProcess(context: any) {
    return this.process(context);
  }
}

class TestAuthMiddleware extends AuthMiddleware {
  public async testProcess(context: any) {
    return this.process(context);
  }
}

class TestMiddlewareManager extends MiddlewareManager {
  private mockContext: MockActorContext;

  constructor() {
    const mockContext = new MockActorContext();
    super(mockContext);
    this.mockContext = mockContext;
  }

  public getContext() {
    return this.context;
  }
}

describe('Middleware Tests', () => {
  describe('MiddlewareManager', () => {
    test('should process middleware chain correctly', async () => {
      const manager = new TestMiddlewareManager();
      const loggerPID = { id: 'logger' } as PID;
      const authPID = { id: 'auth' } as PID;

      // Add middlewares
      await manager.getContext().send(manager.getContext().self, {
        type: 'middleware.add',
        payload: loggerPID
      });

      await manager.getContext().send(manager.getContext().self, {
        type: 'middleware.add',
        payload: authPID
      });

      // Process request
      const request = {
        method: 'GET',
        url: '/test',
        headers: new Headers(),
        state: new Map()
      } as HttpRequest;

      const response = await manager.getContext().send(manager.getContext().self, {
        type: 'middleware.process',
        payload: request
      });

      // 先将返回值转换为unknown，再转为预期的类型
      const typedResponse = (response as unknown) as { type: string, payload: { handled: boolean } };
      expect(typedResponse).toBeDefined();
      expect(typedResponse.type).toBe('middleware.result');
      expect(typedResponse.payload.handled).toBe(false);
    });
  });

  describe('Common Middleware', () => {
    test('LoggerMiddleware should not handle request', async () => {
      // 创建一个MockActorContext并传递给中间件
      const mockContext = new MockActorContext();
      const logger = new TestLoggerMiddleware(mockContext);

      const context = {
        request: {
          method: 'GET',
          url: '/test',
          headers: new Headers(),
          state: new Map()
        },
        state: new Map()
      };

      const result = await logger.testProcess(context);
      expect(result.handled).toBe(false);
      expect(result.context).toBe(context);
    });

    test('CorsMiddleware should handle OPTIONS request', async () => {
      // 创建一个MockActorContext并传递给中间件
      const mockContext = new MockActorContext();
      const cors = new TestCorsMiddleware(mockContext);

      const context = {
        request: {
          method: 'OPTIONS',
          url: '/test',
          headers: new Headers(),
          state: new Map()
        },
        state: new Map()
      };

      const result = await cors.testProcess(context);
      expect(result.handled).toBe(true);
      expect(result.context.response?.status).toBe(204);
      expect(result.context.response?.headers.get('Access-Control-Allow-Origin')).toBe('*');
    });

    test('AuthMiddleware should handle unauthorized request', async () => {
      // 创建一个MockActorContext并传递给中间件
      const mockContext = new MockActorContext();
      const auth = new TestAuthMiddleware(mockContext);

      const context = {
        request: {
          method: 'GET',
          url: '/test',
          headers: new Headers(),
          state: new Map()
        },
        state: new Map()
      };

      const result = await auth.testProcess(context);
      expect(result.handled).toBe(true);
      expect(result.context.response?.status).toBe(401);
    });

    test('AuthMiddleware should pass valid token', async () => {
      // 创建一个MockActorContext并传递给中间件
      const mockContext = new MockActorContext();
      const auth = new TestAuthMiddleware(mockContext);

      const context = {
        request: {
          method: 'GET',
          url: '/test',
          headers: new Headers({
            'Authorization': 'Bearer demo-token'
          }),
          state: new Map()
        },
        state: new Map()
      };

      const result = await auth.testProcess(context);
      expect(result.handled).toBe(false);
      expect(result.context.state.get('user')).toBeDefined();
      expect(result.context.state.get('user').role).toBe('admin');
    });
  });
}); 