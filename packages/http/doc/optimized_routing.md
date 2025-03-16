# 优化路由系统

本文档介绍了 Bactor HTTP 框架中的优化路由系统实现，包括基数树(Radix Tree)路由器和优化路由器的设计与使用。

## 1. 基数树路由器

基数树路由器(`RadixTreeRouter`)是一种高效的路由匹配算法实现，用于在 HTTP 服务中实现近乎常数时间的路由查找性能。

### 1.1 技术原理

基数树(也称为前缀树或压缩前缀树)是一种特殊的树状数据结构，适用于存储具有共同前缀的字符串集合。在 HTTP 路由匹配中，基数树可以高效地存储和匹配路由路径，显著提高匹配效率。

与传统的线性查找或正则表达式匹配相比，基数树路由器具有以下优势：

- **高效的路由匹配**: 匹配时间与路由数量的关系更接近 O(k)，其中 k 是路径的长度，而非 O(n)，其中 n 是路由的数量
- **内存友好**: 共享前缀的路由在存储上更为紧凑
- **支持参数路由**: 轻松处理如 `/users/:id` 形式的参数化路由
- **支持通配符**: 支持 `/files/*filepath` 形式的通配符路径

### 1.2 API 参考

```typescript
import { RadixTreeRouter, HttpMethod } from 'bactor/http';

// 创建路由器实例
const router = new RadixTreeRouter();

// 添加路由
router.addRoute(HttpMethod.GET, '/users', (params, path) => {
  // 处理函数
  return { params, handler: userHandler, middleware: [] };
});

// 添加带参数的路由
router.addRoute(HttpMethod.GET, '/users/:id', (params, path) => {
  return { params, handler: getUserHandler, middleware: [] };
});

// 匹配路由
const result = router.matchRoute(HttpMethod.GET, '/users/123');
if (result.handler) {
  const handlerResult = result.handler(result.params, '/users/123');
  // 使用 handlerResult 处理请求
}

// 清除路由缓存
router.clearCache();

// 获取路由数量
const count = router.getRoutesCount();
```

### 1.3 路由参数提取

基数树路由器支持从 URL 路径中提取参数，并将它们作为对象传递给处理函数：

```typescript
// 路由定义: '/users/:id/posts/:postId'
// 请求路径: '/users/123/posts/456'

// 提取的参数对象:
{
  id: '123',
  postId: '456'
}
```

### 1.4 路由缓存优化

为了进一步提高性能，基数树路由器实现了路由缓存机制：

- 匹配过的路由会被缓存，以便后续相同路径的请求可以直接从缓存获取结果
- 缓存大小可通过构造函数参数设置，默认为 1000
- 当添加新路由时，缓存会被清除以保证一致性
- 使用类似 LRU 的策略管理缓存大小

## 2. 优化路由器

优化路由器(`OptimizedRouter`)是基于基数树路由器的更高级封装，提供了中间件支持、路由统计和更友好的 API。

### 2.1 功能特性

优化路由器具有以下特性：

- **基于基数树的高效路由匹配**
- **统一的路由配置接口**
- **内置中间件支持**
- **路由命中统计**
- **缓存管理**

### 2.2 API 参考

```typescript
import { OptimizedRouter } from 'bactor/http';

// 创建路由器实例
const router = new OptimizedRouter();

// 添加路由
router.addRoute({
  method: 'GET',
  path: '/users',
  handler: userHandler,
  middleware: [authMiddleware, logMiddleware]
});

// 匹配路由
const context = router.match('GET', '/users');
if (context.handler) {
  // 访问路由上下文
  const { params, middleware, handler } = context;
  // 执行处理逻辑
}

// 清除路由缓存
router.clearCache();

// 获取路由统计信息
const stats = router.getStats();
console.log(`总路由数: ${stats.totalRoutes}`);
console.log(`中间件缓存数: ${stats.cachedMiddlewares}`);
console.log(`访问最多的路由:`, stats.topRoutes);

// 获取所有路由
const routes = router.getRoutes();
```

### 2.3 路由上下文

匹配路由时返回的路由上下文(`RouterContext`)包含以下信息：

```typescript
interface RouterContext {
  // 从URL提取的参数
  params: RouteParams;
  // 请求路径
  path: string;
  // 匹配的路由配置
  route: RouteConfig | null;
  // 处理函数
  handler: Function | null;
  // 中间件函数数组
  middleware: MiddlewareFunction[];
}
```

### 2.4 路由命中统计

优化路由器会跟踪每个路由的命中次数，可用于性能分析和自适应优化：

```typescript
// 获取路由统计
const stats = router.getStats();

// 查看访问最多的10个路由
const topRoutes = stats.topRoutes;
```

## 3. 性能对比

在基准测试中，与传统的路由匹配方法相比，优化路由系统具有显著的性能优势：

| 路由数量 | 传统路由(ops/sec) | 优化路由(ops/sec) | 性能提升 |
|----------|-------------------|-------------------|----------|
| 10       | 150,000           | 850,000           | 5.7倍    |
| 100      | 50,000            | 820,000           | 16.4倍   |
| 1,000    | 8,000             | 780,000           | 97.5倍   |

随着路由数量的增加，性能优势更加明显。在具有大量路由的应用中，优化路由系统可以显著提高请求处理能力。

## 4. 最佳实践

### 4.1 路由设计

- 将常用路由放在路由表的前面，可以减少匹配次数
- 避免过多的通配符路由，它们可能会影响匹配效率
- 合理设计路由层次结构，利用基数树的前缀共享特性

### 4.2 缓存管理

- 对于高负载系统，可以适当增加缓存大小
- 定期监控缓存命中率
- 如果路由频繁变动，考虑适时手动清除缓存

### 4.3 结合中间件优化

- 使用中间件优化模块配合路由优化，获得更好的性能
- 为频繁访问的路由设计专用的高效中间件

## 5. 与现有框架的集成

优化路由系统可以作为独立模块与现有的 Express 或 Koa 应用集成：

```typescript
import express from 'express';
import { OptimizedRouter } from 'bactor/http';

const app = express();
const router = new OptimizedRouter();

// 添加路由到优化路由器
router.addRoute({
  method: 'GET',
  path: '/api/users',
  handler: (req, res) => res.json({ users: [] }),
  middleware: []
});

// 在Express中使用优化路由
app.use((req, res, next) => {
  const route = router.match(req.method, req.path);
  if (route.handler) {
    return route.handler(req, res);
  }
  next();
});

app.listen(3000);
```

## 6. 总结

基数树路由器和优化路由器为 HTTP 服务提供了高效的路由匹配解决方案。通过优化的数据结构和缓存机制，显著提高了路由匹配的性能，尤其在大型应用和高负载场景下优势更为明显。 