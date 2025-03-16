# 对象池 API 文档

## 概述

对象池是bactor HTTP框架的性能优化核心，通过复用常见对象（如HTTP请求和响应对象）来减少内存分配和垃圾回收压力，显著提高应用性能和稳定性。

## API

### `ObjectPool` 类

```typescript
export class ObjectPool<T> {
  /**
   * 创建一个新的对象池
   * @param factory 创建新对象的工厂函数
   * @param reset 重置对象状态的函数（在对象返回池之前调用）
   * @param options 对象池选项
   */
  constructor(
    factory: () => T,
    reset: (obj: T) => void,
    options?: ObjectPoolOptions
  );

  /**
   * 从池中获取一个对象
   * 如果池为空，则创建一个新对象
   */
  acquire(): T;

  /**
   * 将对象返回到池中
   * @param obj 要返回的对象
   */
  release(obj: T): void;

  /**
   * 清空对象池
   */
  clear(): void;

  /**
   * 获取池统计信息
   */
  getStats(): ObjectPoolStats;
}

/**
 * 对象池配置选项
 */
export interface ObjectPoolOptions {
  /**
   * 池的最大大小，0表示无限制
   * 默认: 1000
   */
  maxSize?: number;

  /**
   * 池的初始大小（预分配的对象数量）
   * 默认: 10
   */
  initialSize?: number;

  /**
   * 池耗尽策略，当池为空时的行为
   * - 'grow': 创建新对象（默认）
   * - 'wait': 等待对象返回池中
   * - 'throw': 抛出异常
   */
  exhaustionPolicy?: 'grow' | 'wait' | 'throw';

  /**
   * 等待超时（毫秒），仅当exhaustionPolicy为'wait'时有效
   * 默认: 5000
   */
  waitTimeoutMs?: number;

  /**
   * 是否启用资源验证
   * 默认: false
   */
  enableValidation?: boolean;

  /**
   * 资源验证函数，验证对象是否有效
   */
  validator?: (obj: T) => boolean;
}

/**
 * 对象池统计信息
 */
export interface ObjectPoolStats {
  /**
   * 当前池大小
   */
  size: number;

  /**
   * 当前活跃对象数量（已借出未归还）
   */
  active: number;

  /**
   * 空闲对象数量
   */
  idle: number;

  /**
   * 分配的总对象数量
   */
  totalAllocated: number;

  /**
   * 等待获取对象的请求数量
   */
  waitingCount: number;
}
```

### 专用池类型

为提高类型安全性和便于使用，框架提供几种常用对象的专用池实现：

#### `HttpRequestPool` 类

```typescript
export class HttpRequestPool extends ObjectPool<HttpRequest> {
  constructor(options?: ObjectPoolOptions);
}
```

#### `HttpResponsePool` 类

```typescript
export class HttpResponsePool extends ObjectPool<HttpResponse> {
  constructor(options?: ObjectPoolOptions);
}
```

#### `RouterContextPool` 类

```typescript
export class RouterContextPool extends ObjectPool<RouterContext> {
  constructor(options?: ObjectPoolOptions);
}
```

## 用法示例

### 基本用法

```typescript
import { ObjectPool } from '@bactor/http';

// 创建一个简单对象池
const bufferPool = new ObjectPool<Buffer>(
  // 工厂函数
  () => Buffer.alloc(1024),
  // 重置函数
  (buffer) => buffer.fill(0),
  // 选项
  {
    maxSize: 100,
    initialSize: 10
  }
);

// 从池中获取对象
const buffer = bufferPool.acquire();

// 使用对象...
buffer.write('Hello, world!');

// 返回对象到池中
bufferPool.release(buffer);

// 查看池统计信息
const stats = bufferPool.getStats();
console.log(`Pool size: ${stats.size}, active: ${stats.active}`);
```

### HTTP请求/响应池

```typescript
import { HttpServerActor } from '@bactor/http';
import { HttpRequestPool, HttpResponsePool } from '@bactor/http';

// 创建请求和响应对象池
const requestPool = new HttpRequestPool({
  initialSize: 50,
  maxSize: 500
});

const responsePool = new HttpResponsePool({
  initialSize: 50,
  maxSize: 500
});

// 在HTTP服务器处理中使用
class OptimizedHttpServerActor extends HttpServerActor {
  protected async processRequest(rawRequest: Request): Promise<Response> {
    // 从池中获取请求对象
    const httpRequest = requestPool.acquire();
    
    // 设置请求属性
    httpRequest.method = rawRequest.method;
    httpRequest.url = new URL(rawRequest.url).pathname;
    httpRequest.headers = rawRequest.headers;
    httpRequest.body = rawRequest.body;
    httpRequest.state = new Map();
    
    try {
      // 处理请求...
      
      // 从池中获取响应对象
      const httpResponse = responsePool.acquire();
      
      // 设置响应属性并返回
      httpResponse.status = 200;
      httpResponse.headers = new Headers({ 'Content-Type': 'application/json' });
      httpResponse.body = JSON.stringify({ message: 'Success' });
      
      const response = new Response(httpResponse.body, {
        status: httpResponse.status,
        headers: httpResponse.headers
      });
      
      // 返回响应对象到池
      responsePool.release(httpResponse);
      
      return response;
    } finally {
      // 确保请求对象返回到池
      requestPool.release(httpRequest);
    }
  }
}
```

## 内部实现

对象池基于以下核心原则实现：

1. **预分配对象**：初始化时创建一定数量的对象，减少运行时分配。

2. **高效存储**：使用数组或高效数据结构存储池中对象。

3. **对象重置**：对象归还池时会被重置到初始状态，避免状态泄漏。

4. **资源限制**：实现最大池大小限制，防止无限增长占用过多内存。

5. **使用模式优化**：针对HTTP服务常见的请求-响应模式进行特殊优化。

6. **引用管理**：使用弱引用或类似机制管理对象引用，减少内存泄漏。

## 性能考虑

- 对象池最适合中等大小、分配成本较高且使用频繁的对象。
- 初始池大小应根据预期并发请求量设置，通常设为预期峰值的50%-75%。
- 监控池使用情况，针对性调整池大小和策略。
- 对象重置函数应高效执行，避免成为性能瓶颈。 