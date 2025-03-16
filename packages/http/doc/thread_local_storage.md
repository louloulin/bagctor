# 线程本地存储(Thread Local Storage)

本文档介绍了 Bactor HTTP 框架中的线程本地存储实现，该功能用于减少线程间的资源竞争，提高多线程环境下的性能。

## 1. 技术概述

线程本地存储(Thread Local Storage, TLS)是一种在多线程应用中为每个线程提供专用数据存储区域的机制。Bactor HTTP 框架使用 Node.js 的 `AsyncLocalStorage` API 实现了异步上下文感知的线程本地存储，在不同请求和异步操作之间维持数据的隔离性，从而提高了并发处理能力。

### 1.1 主要优势

线程本地存储为 HTTP 服务器提供了以下优势：

- **减少竞争**: 避免线程间对共享资源的竞争，减少锁的使用
- **提高性能**: 降低同步开销，提高多线程环境下的处理效率
- **简化编程模型**: 无需显式传递上下文，简化异步代码
- **增强隔离性**: 确保请求之间的数据不会相互干扰

### 1.2 适用场景

线程本地存储特别适用于以下场景：

- **高并发 HTTP 服务器**: 在处理大量并发请求时提高性能
- **请求级别的计数和统计**: 收集每个请求的性能指标
- **上下文传播**: 在异步调用链中传递请求上下文
- **资源池优化**: 为每个线程维护专用的资源池

## 2. API 参考

### 2.1 ThreadLocalStorage 类

单例类，管理线程本地存储：

```typescript
import { ThreadLocalStorage } from 'bactor/http';

// 获取单例实例
const tls = ThreadLocalStorage.getInstance();

// 在线程本地存储上下文中执行函数
tls.run(() => {
  // 在此上下文中执行的代码可以访问线程本地变量
  // ...
});

// 创建线程本地变量
const counter = tls.createThreadLocal('counter', 0);

// 获取所有线程本地变量
const allItems = tls.getAllItems();

// 清除所有线程本地变量
tls.clearAll();
```

### 2.2 ThreadLocalItem 接口

表示单个线程本地变量：

```typescript
interface ThreadLocalItem<T> {
  get(): T | undefined;
  set(value: T): void;
  remove(): void;
}
```

### 2.3 辅助函数

提供了一些便捷的辅助函数：

```typescript
import { 
  createThreadLocal, 
  runInThreadLocal,
  requestCounter,
  performanceStats,
  updatePerformanceStats,
  getThreadPerformanceStats
} from 'bactor/http';

// 创建线程本地变量
const userContext = createThreadLocal('userContext', { userId: null });

// 在新上下文中执行函数
runInThreadLocal(() => {
  // 操作线程本地变量
  userContext.set({ userId: 123 });
  
  // 异步操作也会保持上下文
  setTimeout(() => {
    const ctx = userContext.get(); // 仍然可以访问
  }, 1000);
});

// 更新性能统计
updatePerformanceStats(10); // 记录一个请求的延迟时间

// 获取性能统计
const stats = getThreadPerformanceStats();
console.log(`平均延迟: ${stats.avgLatency}ms`);
```

## 3. 内置的线程本地变量

框架预定义了一些有用的线程本地变量：

### 3.1 请求计数器

```typescript
import { requestCounter } from 'bactor/http';

// 获取当前线程的请求计数
const count = requestCounter.get();

// 增加计数
requestCounter.set((count || 0) + 1);
```

### 3.2 性能统计

```typescript
import { performanceStats } from 'bactor/http';

// 获取当前线程的性能统计
const stats = performanceStats.get();
if (stats) {
  stats.requestCount += 1;
  stats.totalLatency += latency;
  stats.maxLatency = Math.max(stats.maxLatency, latency);
  // 更新统计对象
  performanceStats.set(stats);
}
```

## 4. 性能优化实践

### 4.1 减少资源竞争

```typescript
import { createThreadLocal } from 'bactor/http';

// 为每个线程创建独立的缓存
const localCache = createThreadLocal('cache', new Map());

// 在处理请求时使用本地缓存，避免争用全局缓存
app.use((req, res, next) => {
  const cache = localCache.get();
  const key = req.url;
  
  if (cache && cache.has(key)) {
    return res.send(cache.get(key));
  }
  
  // 处理请求并更新本地缓存
});
```

### 4.2 请求级别上下文

```typescript
import { createThreadLocal, runInThreadLocal } from 'bactor/http';

const requestContext = createThreadLocal('requestContext');

// 在请求处理中使用
app.use((req, res, next) => {
  runInThreadLocal(() => {
    // 设置请求上下文
    requestContext.set({
      requestId: generateId(),
      startTime: Date.now(),
      user: req.user
    });
    
    // 后续中间件和路由处理函数都可以访问这个上下文
    next();
  });
});

// 在其他中间件中访问上下文
app.use((req, res, next) => {
  const ctx = requestContext.get();
  console.log(`Processing request ${ctx.requestId}`);
  next();
});
```

### 4.3 性能监控

```typescript
import { updatePerformanceStats, getThreadPerformanceStats } from 'bactor/http';

// 请求结束时记录性能指标
app.use((req, res, next) => {
  const start = Date.now();
  
  res.on('finish', () => {
    const latency = Date.now() - start;
    updatePerformanceStats(latency);
  });
  
  next();
});

// 定期收集并聚合所有线程的性能指标
setInterval(() => {
  const stats = getThreadPerformanceStats();
  metrics.gauge('http.avg_latency', stats.avgLatency);
  metrics.gauge('http.max_latency', stats.maxLatency);
  metrics.counter('http.requests', stats.requestCount);
}, 5000);
```

## 5. 局限性与注意事项

- **仅在单个进程内有效**: 线程本地存储不能跨进程共享数据
- **异步连续性依赖 AsyncLocalStorage**: 确保在 Node.js 中正确维护异步上下文
- **内存使用**: 每个线程都有独立的存储副本，注意内存占用
- **避免过度使用**: 不是所有数据都适合存储在线程本地存储中

## 6. 与 Worker 线程集成

在使用 Node.js Worker 线程时，每个 Worker 都有独立的线程本地存储实例：

```typescript
import { Worker } from 'worker_threads';
import { runInThreadLocal } from 'bactor/http';

// 主线程
for (let i = 0; i < 4; i++) {
  const worker = new Worker('./worker.js');
  // 每个 Worker 有独立的 TLS
}

// worker.js
import { createThreadLocal } from 'bactor/http';

// Worker 专用计数器
const workerCounter = createThreadLocal('workerCounter', 0);

// 处理任务
runInThreadLocal(() => {
  // 在 Worker 的上下文中执行任务
});
```

## 7. 总结

线程本地存储是提高多线程 HTTP 服务器性能的重要机制。通过减少资源竞争、简化上下文传播并提供线程隔离，可以显著提高高并发环境下的服务器性能。Bactor HTTP 框架的线程本地存储实现充分利用了 Node.js 的异步特性，为开发高性能 Web 应用提供了强大的工具。 