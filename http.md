# @bactor/http 模块设计方案

## 1. 基于 Actor 的 HTTP 架构设计

### 1.1 Actor 模型与 HTTP 服务器

借鉴 Akka HTTP 的设计理念，@bactor/http 模块将 HTTP 服务器构建为一个完整的 Actor 系统，充分利用 Actor 模型的优势：

- **消息传递**：使用消息传递而非方法调用，避免阻塞和锁定
- **封装性**：Actor 内部状态完全封装，只能通过消息进行交互
- **容错性**：通过监督策略优雅地处理错误情况
- **并发处理**：利用 Actor 模型的并发特性处理大量并发请求

HTTP 服务器架构设计如下：

```
          ┌───────────────┐
          │  HttpServer   │
          │    Actor      │
          └───────┬───────┘
                  │
          ┌───────┴───────┐
     ┌────┤  RouterActor  ├────┐
     │    └───────────────┘    │
     │                         │
┌────┴─────┐            ┌──────┴─────┐
│ Handler  │            │ Middleware │
│ Actors   │            │ Actors     │
└──────────┘            └────────────┘
```

HTTP 请求被封装为消息，通过 Actor 系统传递，实现完全解耦的处理流程。

### 1.2 基于消息的请求处理流程

HTTP 请求处理采用完全基于消息的流程：

```typescript
// 定义消息类型
interface HttpRequestMessage {
  type: 'HTTP_REQUEST';
  request: HttpRequest;
  replyTo: PID; // 回复目标的 Actor ID
}

interface HttpResponseMessage {
  type: 'HTTP_RESPONSE';
  response: HttpResponse;
}

// 请求处理 Actor
class RequestHandlerActor extends Actor {
  protected behaviors(): void {
    this.addBehavior('default', async (msg) => {
      if (msg.type === 'HTTP_REQUEST') {
        // 处理请求
        const response = await this.processRequest(msg.request);
        
        // 发送响应消息
        await this.context.send(msg.replyTo, {
          type: 'HTTP_RESPONSE',
          response
        });
      }
    });
  }
  
  private async processRequest(request: HttpRequest): Promise<HttpResponse> {
    // 实际的请求处理逻辑
    // ...
  }
}
```

这种设计与 Akka HTTP 保持一致，确保请求处理过程中不会出现阻塞，同时保持系统的响应性。

### 1.3 监督与容错策略

借鉴 Akka 的监督模型，实现健壮的错误处理机制：

```typescript
class HttpServerActor extends Actor {
  // 定义监督策略
  protected supervisorStrategy(): SupervisorStrategy {
    return {
      directive: (error) => {
        if (error instanceof TemporaryError) {
          return 'restart'; // 临时错误重启 Actor
        } else if (error instanceof ResourceError) {
          return 'stop';    // 资源错误停止 Actor
        } else {
          return 'escalate'; // 无法处理的错误上报给父 Actor
        }
      },
      maxRestarts: 10,
      withinTimeWindow: 1 * 60 * 1000 // 1 分钟
    };
  }
  
  // ...其他实现
}
```

这种监督策略确保系统在面对各种错误时能够保持稳定运行，并且可以采取适当的恢复措施。

## 2. 洋葱模型中间件架构

### 2.1 基于 Actor 的洋葱模型中间件

结合 Hono.js 的洋葱模型与 Actor 模型，设计新的中间件系统：

```typescript
// 中间件消息定义
interface MiddlewareProcessMessage {
  type: 'MIDDLEWARE_PROCESS';
  context: Context;
  next: PID; // 下一个中间件 Actor 的 ID
  complete: PID; // 完成处理后的回调 Actor ID
}

class MiddlewareActor extends Actor {
  protected behaviors(): void {
    this.addBehavior('default', async (msg) => {
      if (msg.type === 'MIDDLEWARE_PROCESS') {
        const { context, next, complete } = msg.payload;
        
        // 前置处理
        console.log(`[${context.req.method}] ${context.req.path}`);
        
        // 调用下一个中间件
        await this.context.send(next, msg);
        
        // 后置处理
        context.res.headers.set('X-Response-Time', '10ms');
        
        // 通知完成
        await this.context.send(complete, {
          type: 'MIDDLEWARE_COMPLETE',
          context
        });
      }
    });
  }
}
```

这种设计将洋葱模型与 Actor 模型完美结合，既保留了洋葱模型的直观性，又利用了 Actor 模型的并发优势。

### 2.2 高性能路由引擎

参考 Hono.js 的 RegExpRouter 设计，实现高性能路由匹配系统：

- 使用预生成的正则表达式进行快速路由匹配
- 实现 SmartRouter 以适应所有路由模式
- 采用基数树（Radix Tree）结构优化路由查找

### 2.3 项目结构分层

借鉴 Actix-web 的项目结构设计，同时结合 Akka 的 Actor 层次结构，将 HTTP 模块重组为：

```
src/
├── actors
│   ├── http-server.actor.ts
│   ├── router.actor.ts
│   ├── middleware
│   │   ├── logger.actor.ts
│   │   ├── cors.actor.ts
│   │   ├── auth.actor.ts
│   │   └── index.ts
│   └── handlers
│       ├── static-file.actor.ts
│       ├── api.actor.ts
│       └── index.ts
├── routing
│   ├── regexp-router.ts
│   ├── radix-tree.ts
│   ├── router.ts
│   └── route-cache.ts
├── middleware
│   ├── core.ts
│   ├── common.ts
│   └── chain.ts
├── context.ts
├── server.ts
└── index.ts
```

这种结构将各个组件以 Actor 的形式组织，使系统更具模块化和可维护性。

## 3. 路由系统优化

### 3.1 Actor 路由树

结合 Actor 模型和路由系统，实现基于 Actor 的路由树：

```typescript
// 路由器 Actor
class RouterActor extends Actor {
  private routes: Map<string, PID> = new Map();
  
  protected behaviors(): void {
    this.addBehavior('default', async (msg) => {
      if (msg.type === 'HTTP_REQUEST') {
        const { request, replyTo } = msg;
        const path = request.url;
        
        // 查找匹配的路由处理 Actor
        const handlerPID = this.findRouteHandler(request.method, path);
        
        if (handlerPID) {
          // 转发请求给处理器 Actor
          await this.context.send(handlerPID, {
            type: 'HANDLE_REQUEST',
            request,
            replyTo
          });
        } else {
          // 返回 404 响应
          await this.context.send(replyTo, {
            type: 'HTTP_RESPONSE',
            response: {
              status: 404,
              headers: new Headers({ 'Content-Type': 'application/json' }),
              body: JSON.stringify({ error: 'Not Found' })
            }
          });
        }
      }
    });
  }
  
  // 注册路由处理 Actor
  public async registerRoute(method: string, pattern: string, handlerPID: PID): Promise<void> {
    const key = `${method}:${pattern}`;
    this.routes.set(key, handlerPID);
  }
  
  // 查找路由处理 Actor
  private findRouteHandler(method: string, path: string): PID | undefined {
    // 实现路由匹配逻辑
    // ...
  }
}
```

### 3.2 分组路由

实现分组路由功能，允许开发者更好地组织 API 端点：

```typescript
// routes/post.ts
const posts = new Router();
posts.get('/', (c) => c.text('List Posts'));
posts.get('/:id', (c) => {
  const id = c.req.param('id');
  return c.text('Get Post: ' + id);
});

// 在主应用中挂载
app.route('/posts', posts);
```

### 3.3 正则表达式路由

优化路由匹配算法，使用 RegExpRouter 替代当前的线性搜索：

```typescript
// 内部实现：预编译正则表达式以提高匹配速度
const compile = (pattern) => {
  // 将路由模式转换为高效的正则表达式
  const paramNames = [];
  const regexPattern = pattern
    .replace(/:([^/]+)/g, (_, name) => {
      paramNames.push(name);
      return '([^/]+)';
    });
  return { regex: new RegExp(`^${regexPattern}$`), paramNames };
};
```

## 4. 消息驱动的中间件系统

### 4.1 中间件的 Actor 实现

中间件被设计为 Actor，通过消息传递进行交互：

```typescript
// 中间件 Actor 基类
abstract class MiddlewareActor extends Actor {
  protected behaviors(): void {
    this.addBehavior('default', async (msg) => {
      if (msg.type === 'PROCESS') {
        const context = msg.payload.context;
        const next = msg.payload.next;
        
        // 前置处理
        await this.before(context);
        
        if (next) {
          // 调用下一个中间件
          await this.context.send(next, {
            type: 'PROCESS',
            payload: {
              context,
              next: msg.payload.nextAfterNext
            }
          });
        }
        
        // 后置处理
        await this.after(context);
        
        // 回复完成消息
        if (msg.sender) {
          await this.context.send(msg.sender, {
            type: 'PROCESS_COMPLETE',
            payload: { context }
          });
        }
      }
    });
  }
  
  // 中间件前置处理，子类实现
  protected abstract before(context: Context): Promise<void>;
  
  // 中间件后置处理，子类实现
  protected abstract after(context: Context): Promise<void>;
}

// 具体中间件实现示例 - CORS
class CorsMiddlewareActor extends MiddlewareActor {
  private options: CorsOptions;
  
  constructor(context: ActorContext, props?: Props) {
    super(context);
    this.options = (props as any)?.options || {};
  }
  
  protected async before(context: Context): Promise<void> {
    context.res.headers.set('Access-Control-Allow-Origin', this.options.origin || '*');
    
    if (context.req.method === 'OPTIONS') {
      context.res.headers.set('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
      context.res.headers.set('Access-Control-Allow-Headers', 'Content-Type');
      context.res.status = 204;
      context.res.body = '';
    }
  }
  
  protected async after(context: Context): Promise<void> {
    // 后置处理，如果需要的话
  }
}
```

### 4.2 中间件链的构建与执行

中间件链被构建为一系列 Actor，通过消息传递形成处理流程：

```typescript
class MiddlewareChain {
  private middlewareActors: PID[] = [];
  private system: ActorSystem;
  
  constructor(system: ActorSystem) {
    this.system = system;
  }
  
  async add(middlewareClass: any, options?: any): Promise<void> {
    const pid = await this.system.spawn({
      actorClass: middlewareClass,
      props: { options }
    });
    
    this.middlewareActors.push(pid);
  }
  
  async process(context: Context): Promise<void> {
    if (this.middlewareActors.length === 0) {
      return;
    }
    
    // 构建中间件执行链
    const chain = this.buildExecutionChain();
    
    // 启动中间件处理
    await this.system.send(chain.first, {
      type: 'PROCESS',
      payload: {
        context,
        next: chain.rest
      }
    });
  }
  
  private buildExecutionChain() {
    // 构建中间件执行链的逻辑
    // ...
  }
}
```

## 5. 上下文对象设计

### 5.1 基于 Actor 的上下文对象

借鉴 Hono.js 的上下文对象设计，结合 Actor 模型特性，重构 @bactor/http 的请求处理上下文：

```typescript
interface Context {
  req: {
    method: string;
    path: string;
    headers: Headers;
    param(name: string): string;
    query(name: string): string;
    body: any;
  };
  res: {
    status: number;
    headers: Headers;
    body: any;
  };
  // Actor 系统相关
  actorContext: ActorContext;
  // 辅助方法
  json(data: any, status?: number): Response;
  text(text: string, status?: number): Response;
  redirect(url: string, status?: number): Response;
  // 请求状态存储
  state: Map<string, any>;
  set(key: string, value: any): void;
  get(key: string): any;
  // 发送消息到其他 Actor 的辅助方法
  send(to: PID, message: any): Promise<void>;
  ask(to: PID, message: any, timeout?: number): Promise<any>;
}
```

这种设计不仅保留了 Hono.js 上下文的易用性，还增加了与 Actor 系统交互的能力。

### 5.2 响应辅助函数

实现一系列响应辅助函数，简化响应生成：

```typescript
// 在上下文对象中添加响应辅助方法
Context.prototype.json = function(data, status = 200) {
  this.res.headers.set('Content-Type', 'application/json');
  this.res.status = status;
  this.res.body = JSON.stringify(data);
  return this.res;
};

Context.prototype.html = function(html, status = 200) {
  this.res.headers.set('Content-Type', 'text/html');
  this.res.status = status;
  this.res.body = html;
  return this.res;
};
```

## 6. 性能优化策略

### 6.1 Actor 池与负载均衡

利用 Actor 模型的能力，实现请求处理的 Actor 池和负载均衡：

```typescript
class RequestHandlerPool extends Actor {
  private workers: PID[] = [];
  private routingStrategy: 'round-robin' | 'random' | 'least-busy' = 'round-robin';
  private currentIndex = 0;
  
  async preStart(): Promise<void> {
    // 创建工作 Actor 池
    const poolSize = this.props.poolSize || 10;
    
    for (let i = 0; i < poolSize; i++) {
      const worker = await this.context.spawn({
        actorClass: RequestHandlerWorker
      });
      this.workers.push(worker);
    }
  }
  
  protected behaviors(): void {
    this.addBehavior('default', async (msg) => {
      if (msg.type === 'HTTP_REQUEST') {
        // 选择一个工作 Actor 处理请求
        const worker = this.selectWorker();
        
        // 转发请求
        await this.context.send(worker, msg);
      }
    });
  }
  
  private selectWorker(): PID {
    // 根据路由策略选择工作 Actor
    if (this.routingStrategy === 'round-robin') {
      const worker = this.workers[this.currentIndex];
      this.currentIndex = (this.currentIndex + 1) % this.workers.length;
      return worker;
    }
    // 其他策略...
    
    return this.workers[0]; // 默认
  }
}
```

### 6.2 路由缓存机制

实现路由缓存系统，加速频繁访问的路径匹配：

```typescript
class RouterCache {
  private cache = new Map<string, RouteMatch>();
  private maxSize: number;
  
  constructor(maxSize = 1000) {
    this.maxSize = maxSize;
  }
  
  get(method: string, path: string): RouteMatch | undefined {
    const key = `${method}:${path}`;
    return this.cache.get(key);
  }
  
  set(method: string, path: string, match: RouteMatch): void {
    if (this.cache.size >= this.maxSize) {
      // 使用 LRU 策略清理缓存
      const oldestKey = this.cache.keys().next().value;
      this.cache.delete(oldestKey);
    }
    const key = `${method}:${path}`;
    this.cache.set(key, match);
  }
}
```

### 6.3 请求和响应序列化优化

优化 JSON 处理和序列化过程：

```typescript
// 使用更高效的 JSON 序列化
import { serialize, deserialize } from 'v8';

class OptimizedJSONMiddleware {
  async process(context) {
    // 优化请求 JSON 解析
    if (context.request.headers.get('content-type')?.includes('application/json')) {
      context.request.json = async () => {
        const buffer = await context.request.arrayBuffer();
        return deserialize(buffer);
      };
    }
    
    // 处理响应
    await next();
    
    // 优化响应 JSON 序列化
    if (typeof context.response.body === 'object') {
      const serialized = serialize(context.response.body);
      context.response.body = serialized;
      context.response.headers.set('Content-Type', 'application/json');
    }
  }
}
```

## 7. 错误处理与监督

### 7.1 Akka 风格的监督策略

实现类似 Akka 的监督策略，确保系统的稳定性：

```typescript
// 监督指令类型
type SupervisorDirective = 'resume' | 'restart' | 'stop' | 'escalate';

// 监督策略接口
interface SupervisorStrategy {
  directive: (error: Error) => SupervisorDirective;
  maxRestarts: number;
  withinTimeWindow: number; // 毫秒
}

// HTTP 服务器 Actor 的监督策略
class HttpServerActor extends Actor {
  private supervisorStrategy: SupervisorStrategy = {
    directive: (error) => {
      if (error instanceof TemporaryError) {
        return 'restart';
      } else if (error instanceof ResourceError) {
        return 'stop';
      } else {
        return 'escalate';
      }
    },
    maxRestarts: 10,
    withinTimeWindow: 60000 // 1分钟
  };
  
  protected behaviors(): void {
    // ... 行为定义
  }
  
  // 处理子 Actor 错误
  protected onChildFailure(child: PID, error: Error): void {
    const directive = this.supervisorStrategy.directive(error);
    
    switch (directive) {
      case 'resume':
        // 恢复子 Actor 状态
        this.context.resume(child);
        break;
      case 'restart':
        // 重启子 Actor
        this.context.restart(child);
        break;
      case 'stop':
        // 停止子 Actor
        this.context.stop(child);
        break;
      case 'escalate':
        // 将错误上报给父 Actor
        throw error;
    }
  }
}
```

### 7.2 中间件级别的错误处理

实现中间件级别的错误处理，确保请求处理过程中的错误能够被适当处理：

```typescript
// 错误处理中间件
export const errorHandler = (options = {}) => {
  return async (c, next) => {
    try {
      await next();
    } catch (err) {
      console.error('Request error:', err);
      
      // 根据错误类型返回适当的响应
      if (err.status) {
        return c.json({ error: err.message }, err.status);
      }
      
      // 生产环境中隐藏详细错误
      const isProduction = process.env.NODE_ENV === 'production';
      return c.json({
        error: isProduction ? 'Internal Server Error' : err.message,
        stack: isProduction ? undefined : err.stack
      }, 500);
    }
  };
};
```

## 8. 安全与监控

### 8.1 健康检查和指标收集

实现健康检查和性能监控系统：

```typescript
// 健康检查中间件
export const healthCheck = (path = '/health') => {
  return async (c, next) => {
    if (c.req.path === path) {
      return c.json({
        status: 'ok',
        uptime: process.uptime(),
        timestamp: Date.now()
      });
    }
    await next();
  };
};

// 请求指标收集中间件
export const metrics = (path = '/metrics') => {
  const stats = {
    requests: 0,
    errors: 0,
    responseTime: {
      sum: 0,
      count: 0
    }
  };
  
  return async (c, next) => {
    if (c.req.path === path) {
      return c.json(stats);
    }
    
    stats.requests++;
    const start = Date.now();
    try {
      await next();
      const duration = Date.now() - start;
      stats.responseTime.sum += duration;
      stats.responseTime.count++;
    } catch (error) {
      stats.errors++;
      throw error;
    }
  };
};
```

### 8.2 输入验证中间件

实现请求验证中间件，增强安全性：

```typescript
export const validate = (schema) => {
  return async (c, next) => {
    const body = await c.req.json();
    try {
      const valid = validateSchema(schema, body);
      if (!valid) {
        return c.json({ error: 'Validation failed' }, 400);
      }
      c.set('validatedBody', body);
      await next();
    } catch (error) {
      return c.json({ error: 'Invalid input' }, 400);
    }
  };
};
```

## 9. 开发体验增强

### 9.1 开发模式与热重载

实现开发模式和热重载功能：

```typescript
// 开发模式配置
interface DevOptions {
  hotReload: boolean;
  verbose: boolean;
  watchDirs: string[];
}

// 开发服务器
export function createDevServer(app, options: DevOptions) {
  // 设置文件监听
  if (options.hotReload) {
    for (const dir of options.watchDirs) {
      watch(dir, { recursive: true }, () => {
        console.log('File changes detected, reloading...');
        // 实现模块重载逻辑
      });
    }
  }
  
  // 添加开发中间件
  app.use(async (c, next) => {
    if (options.verbose) {
      console.log(`[DEV] ${c.req.method} ${c.req.path}`);
    }
    await next();
  });
  
  return app;
}
```

### 9.2 完善的错误处理

结合 Akka 的监督机制，实现全面的错误处理系统：

```typescript
// 错误类型
class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
    this.name = 'HttpError';
  }
}

class TemporaryError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TemporaryError';
  }
}

class ResourceError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ResourceError';
  }
}

// 集中式错误处理中间件
export const errorHandler = (options = {}) => {
  return async (c, next) => {
    try {
      await next();
    } catch (err) {
      console.error('Request error:', err);
      
      if (err instanceof HttpError) {
        return c.json({ error: err.message }, err.status);
      }
      
      // 生产环境中隐藏详细错误
      const isProduction = process.env.NODE_ENV === 'production';
      return c.json({
        error: isProduction ? 'Internal Server Error' : err.message,
        stack: isProduction ? undefined : err.stack
      }, 500);
    }
  };
};
```

## 10. 实现计划与优先级

基于 Hono.js、Actix 和 Akka HTTP 的设计理念，结合 Actor 模型的特点，建议按照以下优先级实施改进：

1. **Actor 基础设施** - 实现基本的 Actor 架构支持 HTTP 服务
2. **消息驱动的路由引擎** - 使用 Actor 和消息传递实现路由
3. **基于 Actor 的中间件系统** - 重构中间件为 Actor 组件
4. **上下文对象集成 Actor** - 增强上下文对象与 Actor 系统的集成
5. **监督策略实现** - 实现完整的错误处理和监督机制
6. **响应辅助函数** - 实现常用的响应生成辅助方法
7. **分组路由支持** - 增强路由模块化能力
8. **Actor 池和负载均衡** - 优化性能和资源利用
9. **监控与指标收集** - 增加系统可观测性
10. **开发体验工具** - 完善开发和调试环境

## 11. 与 Actor 模型的融合优势

Actor 模型与 HTTP 服务的结合可以带来以下优势：

1. **自然的并发处理** - Actor 模型天然支持并发，无需手动管理线程和锁
2. **隔离的失败域** - 每个 Actor 都是独立的失败单元，不会影响整个系统
3. **灵活的扩展性** - 可以根据负载动态调整 Actor 数量
4. **消息驱动的异步处理** - 完全异步的处理模式，提高系统吞吐量
5. **统一的编程模型** - HTTP 处理与其他系统组件使用相同的 Actor 编程模型

## 12. 开发路线图

### 阶段一：核心 Actor 框架（当前）
- 实现 HTTP 服务器 Actor
- 实现路由 Actor
- 实现基本的中间件 Actor

### 阶段二：消息传递与路由（下一步）
- 实现基于消息的请求处理流程
- 实现 Actor 路由系统
- 实现分组路由支持

### 阶段三：中间件与上下文增强
- 实现洋葱模型中间件 Actor
- 增强上下文对象与 Actor 系统集成
- 实现内置中间件集合

### 阶段四：监督与容错
- 实现监督策略
- 实现错误处理机制
- 实现健康检查与恢复策略

### 阶段五：性能优化
- 实现 Actor 池与负载均衡
- 优化消息传递性能
- 实现路由缓存和响应优化