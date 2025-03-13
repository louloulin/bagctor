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
    if (message.type === 'middleware.add') {
      return { type: 'ok' };
    }
    return { type: 'middleware.result', payload: { handled: false } };
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
  constructor() {
    super({});
    (this as any).context = new MockActorContext();
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

      expect(response).toBeDefined();
      expect(response.type).toBe('middleware.result');
      expect(response.payload.handled).toBe(false);
    });
  });

  describe('Common Middleware', () => {
    test('LoggerMiddleware should not handle request', async () => {
      const logger = new TestLoggerMiddleware({
        actorContext: { name: 'test-logger' }
      });

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
      const cors = new TestCorsMiddleware({
        actorContext: { name: 'test-cors' }
      });

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
      const auth = new TestAuthMiddleware({
        actorContext: { name: 'test-auth' }
      });

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
      const auth = new TestAuthMiddleware({
        actorContext: { name: 'test-auth' }
      });

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