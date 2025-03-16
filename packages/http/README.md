# Bactor HTTP 框架

一个高性能、自适应的HTTP服务器框架，基于Actor模型构建，专为高并发和变负载场景设计。

## 特性

- **高性能**：针对高并发场景优化，提供卓越的吞吐量和低延迟
- **自适应资源管理**：根据实际负载自动调整资源使用
- **多反应器架构**：有效利用多核CPU提高并行处理能力
- **高效内存管理**：通过对象池减少GC压力
- **实时监控**：内置性能监控仪表盘
- **线程亲和性**：将工作线程绑定到特定CPU核心，减少上下文切换
- **零拷贝优化**：优化消息传递过程，减少不必要的数据复制

## 优化技术

Bactor HTTP框架使用多种优化技术以实现卓越性能：

### 1. 自适应对象池

动态调整对象池大小以适应当前请求负载，平衡内存使用和性能需求。
对象池自动扩展和收缩以响应流量变化，最大限度地减少内存占用并提高响应速度。

```typescript
// 使用自适应对象池
const poolOptions: AdaptivePoolOptions = {
  initialSize: 100,
  maxSize: 2000,
  adaptiveResizing: true,
  minGrowRatio: 0.7,
  minShrinkRatio: 0.3
};
```

### 2. 多反应器架构

利用多核CPU架构实现真正的并行请求处理，通过内部负载均衡分配工作。

```typescript
// 创建使用多反应器的服务器
const server = createAdaptiveHttpServer(system, {
  reactorPoolSize: 4, // 使用4个反应器
  // ...其他选项
});
```

### 3. 高效路由匹配

使用基于RadixTree的路由匹配算法，提供近乎常数时间的路由查找。

```typescript
// 添加路由
server.tell({
  type: 'addRoute',
  method: 'GET',
  path: '/api/users/:id',
  handler: async (ctx) => {
    const userId = ctx.request.params.id;
    // 处理请求...
  }
});
```

### 4. 自动流量突发处理

检测流量突发并预先分配资源，确保在突发流量期间保持性能。

```typescript
// 启用自动流量突发处理
const server = createAdaptiveHttpServer(system, {
  enableAutoTrafficBurstPreparation: true,
  trafficBurstThresholdPercent: 40,
  // ...其他选项
});

// 手动准备流量突发
server.tell({
  type: 'prepareForTrafficBurst',
  factor: 2.0 // 准备处理2倍的正常流量
});
```

## 实时监控

框架附带实时监控仪表盘，提供以下功能：

- 请求吞吐量和响应时间可视化
- 对象池使用情况实时监控
- 资源调整操作日志
- 内存使用跟踪

```typescript
// 启动监控仪表盘
const dashboard = createDashboard(server, {
  port: 8090,
  collectIntervalMs: 1000
});
```

## 性能基准测试

与标准HTTP服务器相比，Bactor HTTP框架在以下方面表现出显著提升：

| 场景 | 标准HTTP服务器 | 自适应HTTP服务器 | 提升 |
|------|--------------|-----------------|-----|
| 稳定低负载 | 10,000 RPS | 12,000-15,000 RPS | 20-50% |
| 高并发稳定负载 | 25,000 RPS | 50,000-70,000 RPS | 100-180% |
| 突发流量 | 性能下降40-60% | 性能下降10-20% | 25-50% |
| 内存使用 | 基准 | 减少40-60% | 40-60% |
| 响应延迟 | 基准 | 减少30-50% | 30-50% |

## 使用示例

### 基本服务器

```typescript
import { createActorSystem } from 'bactor';
import { createAdaptiveHttpServer } from './src/core/server/adaptive_http_server';

// 创建Actor系统
const system = createActorSystem();

// 创建HTTP服务器
const server = createAdaptiveHttpServer(system, {
  port: 3000,
  hostname: '0.0.0.0',
  poolOptions: {
    initialSize: 100,
    maxSize: 2000,
    adaptiveResizing: true
  }
});

// 添加路由
server.tell({
  type: 'addRoute',
  method: 'GET',
  path: '/',
  handler: async (ctx) => {
    ctx.response.body = 'Hello World!';
  }
});

// 启动服务器
server.tell({ type: 'start' });
```

### 监控集成

```typescript
import { createActorSystem } from 'bactor';
import { createAdaptiveHttpServer } from './src/core/server/adaptive_http_server';
import { createDashboard } from './src/monitoring/adaptive_dashboard';

// 创建服务器
const system = createActorSystem();
const server = createAdaptiveHttpServer(system, { port: 3000 });

// 添加路由
// ...

// 启动服务器
server.tell({ type: 'start' });

// 启动监控仪表盘
const dashboard = createDashboard(server, { port: 8090 });

// 处理退出
process.on('SIGINT', () => {
  dashboard.stop();
  server.tell({ type: 'stop' });
  // ...
});
```

## 文档

详细文档可在以下目录找到：

- `/doc/adaptive_server.md` - 自适应HTTP服务器API文档
- `/doc/optimization_summary.md` - 优化技术详细说明
- `/examples/` - 使用示例

## 基准测试工具

包含一个专用的基准测试工具，可用于比较不同服务器实现的性能：

```bash
# 运行基准测试
bun run benchmark.ts --server=adaptive --duration=30 --connections=100
```

## 许可证

MIT 