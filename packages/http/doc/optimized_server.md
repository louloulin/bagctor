# 优化的 HTTP 服务器 API 文档

## 概述

`OptimizedHttpServerActor` 是 bactor HTTP 框架的高性能实现，整合了多项优化技术，包括多反应器模式、对象池、优化路由器等，提供了卓越的性能和可扩展性。

## 核心优化特性

### 1. 多反应器模式

利用多核处理器能力，每个 CPU 核心分配独立的事件循环，显著提高并行处理能力。

```typescript
import { OptimizedHttpServerActor } from '@bactor/http';

// 创建使用多反应器的服务器
const server = OptimizedHttpServerActor.create({
  port: 3000,
  reactorPool: {
    // 自动使用可用的 CPU 核心数
    reactorCount: navigator.hardwareConcurrency,
    // 使用最小负载均衡策略
    balancingStrategy: 'least-busy'
  }
});
```

### 2. 对象池复用

减少内存分配和垃圾回收压力，通过复用 HTTP 请求、响应和上下文对象提高性能。

```typescript
import { 
  acquireRequest, 
  releaseRequest, 
  acquireResponse, 
  releaseResponse 
} from '@bactor/http';

// 从池中获取对象
const request = acquireRequest();
const response = acquireResponse();

// 使用对象...

// 归还对象到池中
releaseRequest(request);
releaseResponse(response);
```

### 3. 高效路由匹配

基于基数树（Radix Tree）的路由系统，提供快速精确的路由匹配，支持参数、通配符和缓存。

```typescript
// 添加路由的示例
await server.send({
  type: 'add-route',
  config: {
    method: 'GET',
    path: '/users/:id',
    handler: async (ctx, req, res) => {
      const userId = ctx.params.id;
      res.statusCode = 200;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ userId }));
    }
  }
});
```

## API

### `OptimizedHttpServerActor`

```typescript
/**
 * 创建优化的 HTTP 服务器 Actor
 */
OptimizedHttpServerActor.create(config: HttpServerConfig): ActorRef<HttpServerMessage>
```

#### 配置选项

```typescript
interface HttpServerConfig {
  /**
   * 服务器端口
   */
  port: number;

  /**
   * 主机地址
   * 默认: '0.0.0.0'
   */
  hostname?: string;

  /**
   * TLS 配置 (HTTPS)
   */
  tls?: {
    cert: string;
    key: string;
  };

  /**
   * 反应器池配置
   */
  reactorPool?: {
    /**
     * 反应器数量
     * 默认: 系统 CPU 核心数
     */
    reactorCount?: number;

    /**
     * 负载均衡策略
     * 默认: 'least-busy'
     */
    balancingStrategy?: 'round-robin' | 'least-busy' | 'consistent-hash';
  };

  /**
   * 路由器配置
   */
  router?: {
    /**
     * 启用路由缓存
     * 默认: true
     */
    enableCache?: boolean;

    /**
     * 缓存大小
     * 默认: 1000
     */
    cacheSize?: number;
  };

  /**
   * 日志配置
   */
  logging?: {
    enabled: boolean;
    level: 'debug' | 'info' | 'warn' | 'error';
  };
}
```

#### 消息类型

```typescript
type HttpServerMessage =
  // 启动服务器
  | { type: 'start' }
  
  // 停止服务器
  | { type: 'stop' }
  
  // 添加单个路由
  | { type: 'add-route'; config: RouteConfig }
  
  // 添加多个路由
  | { type: 'add-routes'; configs: RouteConfig[] }
  
  // 获取服务器统计信息
  | { type: 'get-stats' }
  
  // 健康检查
  | { type: 'health-check' };
```

#### 路由配置

```typescript
interface RouteConfig {
  /**
   * HTTP 方法
   */
  method: string;

  /**
   * 路由路径
   */
  path: string;

  /**
   * 路由处理函数
   */
  handler: (
    ctx: RouterContext,
    req: HttpRequest,
    res: HttpResponse
  ) => Promise<void> | void;

  /**
   * 中间件函数列表（可选）
   */
  middleware?: RouteHandler[];
}
```

## 使用示例

### 创建和启动服务器

```typescript
import { ActorSystem } from '@bactor/core';
import { OptimizedHttpServerActor } from '@bactor/http';

// 创建 Actor 系统
const system = new ActorSystem();

// 创建 HTTP 服务器
const server = OptimizedHttpServerActor.create({
  port: 3000,
  hostname: 'localhost',
  reactorPool: {
    reactorCount: 4,
    balancingStrategy: 'least-busy'
  },
  logging: {
    enabled: true,
    level: 'info'
  }
});

// 添加路由
await server.send({
  type: 'add-route',
  config: {
    method: 'GET',
    path: '/hello',
    handler: async (ctx, req, res) => {
      res.statusCode = 200;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ message: 'Hello, World!' }));
    }
  }
});

// 批量添加路由
await server.send({
  type: 'add-routes',
  configs: [
    {
      method: 'GET',
      path: '/users',
      handler: async (ctx, req, res) => {
        // 处理获取用户列表...
      }
    },
    {
      method: 'POST',
      path: '/users',
      handler: async (ctx, req, res) => {
        // 处理创建用户...
      }
    }
  ]
});

// 启动服务器
const result = await server.send({ type: 'start' });
console.log(`服务器启动${result.success ? '成功' : '失败'}, 端口: ${result.port}`);

// 获取服务器统计信息
const stats = await server.send({ type: 'get-stats' });
console.log(`已处理请求: ${stats.requestsProcessed}, 平均响应时间: ${stats.avgResponseTime}ms`);

// 在应用关闭时停止服务器
await server.send({ type: 'stop' });
await system.shutdown();
```

### 使用中间件

```typescript
// 日志中间件
const loggerMiddleware = async (ctx, req, res) => {
  const start = performance.now();
  console.log(`${req.method} ${req.url} - 开始处理`);
  
  // 执行下一个中间件或路由处理函数后的处理
  return async () => {
    const duration = performance.now() - start;
    console.log(`${req.method} ${req.url} - 完成处理 (${duration.toFixed(2)}ms)`);
  };
};

// 身份验证中间件
const authMiddleware = async (ctx, req, res) => {
  const token = req.headers.get('Authorization');
  
  if (!token) {
    res.statusCode = 401;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ error: '未授权' }));
    return false; // 终止后续处理
  }
  
  // 验证通过，继续处理
  ctx.state.set('user', { id: '123', role: 'admin' });
};

// 添加带中间件的路由
await server.send({
  type: 'add-route',
  config: {
    method: 'GET',
    path: '/admin/dashboard',
    middleware: [loggerMiddleware, authMiddleware],
    handler: async (ctx, req, res) => {
      const user = ctx.state.get('user');
      res.statusCode = 200;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ 
        dashboard: 'Admin Dashboard',
        user 
      }));
    }
  }
});
```

## 性能考虑

### 最佳实践

1. **反应器数量**: 通常应设置为系统 CPU 核心数，避免过多的上下文切换。

2. **负载均衡策略**: 
   - `least-busy`: 适用于处理时间差异较大的请求
   - `round-robin`: 适用于处理时间较为一致的请求
   - `consistent-hash`: 适用于需要会话亲和性的场景

3. **路由设计**: 尽量使用静态路由，减少动态参数部分，可提高路由匹配性能。

4. **对象池配置**: 根据预期并发请求量调整对象池大小，通常设为峰值请求量的 50%-75%。

5. **并发处理**: 针对 I/O 密集型操作（如数据库查询、外部 API 调用），使用异步处理以充分利用反应器池的并行能力。

### 监控与调优

使用 `get-stats` 消息获取服务器性能指标，关注以下关键指标：

- 请求处理数
- 平均响应时间
- 反应器负载分布
- 路由缓存命中率

基于这些指标，可以调整反应器数量、负载均衡策略和对象池大小，以达到最佳性能。

## 基准测试工具

包含一个基准测试工具，用于比较不同服务器实现的性能：

```bash
# 运行默认基准测试
bun src/benchmarks/optimized_benchmark.ts

# 指定测试参数
bun src/benchmarks/optimized_benchmark.ts --duration 30 --connections 100 --servers bactor,optimized,bun
```

参数选项：
- `--port NUMBER`: 服务器端口 (默认: 3000)
- `--duration NUMBER`: 测试持续时间，秒 (默认: 10)
- `--connections NUMBER`: 并发连接数 (默认: 50)
- `--warmup NUMBER`: 预热时间，秒 (默认: 2)
- `--servers LIST`: 要测试的服务器，逗号分隔 (默认: bactor,optimized,bun,hono)

## 限制与注意事项

1. CPU 亲和性功能在当前 JavaScript 运行时（如 Bun）中可能受限。

2. 对象池不适合生命周期极短的小对象，可能反而增加开销。

3. 基数树路由匹配对包含大量通配符和复杂参数的路由效果可能不如纯静态路由明显。

4. 在高度并发的环境中，建议定期监控内存使用情况，避免对象池过大导致内存问题。 