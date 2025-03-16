# 路由优化 API 文档

## 概述

bactor HTTP框架的路由系统经过专门优化，使用基数树（Radix Tree）实现高效的URL匹配，支持复杂路由模式，并包含缓存机制以提高性能。

## API

### `OptimizedRouter` 类

```typescript
export class OptimizedRouter {
  /**
   * 创建一个新的优化路由器
   * @param options 路由器选项
   */
  constructor(options?: RouterOptions);

  /**
   * 添加路由
   * @param method HTTP方法
   * @param pattern 路由模式
   * @param handler 处理函数
   */
  add(method: string, pattern: string, handler: RouteHandler): void;

  /**
   * 添加路由组
   * @param prefix 路由前缀
   * @param routes 路由配置数组
   */
  addGroup(prefix: string, routes: RouteConfig[]): void;

  /**
   * 匹配请求并返回处理结果
   * @param method HTTP方法
   * @param path 请求路径
   * @param request 原始请求对象
   */
  match(method: string, path: string, request: HttpRequest): Promise<HttpResponse>;

  /**
   * 清除路由缓存
   */
  clearCache(): void;

  /**
   * 获取路由统计信息
   */
  getStats(): RouterStats;
}

/**
 * 路由器配置选项
 */
export interface RouterOptions {
  /**
   * 是否启用路由缓存
   * 默认: true
   */
  enableCache?: boolean;

  /**
   * 路由缓存大小
   * 默认: 1000
   */
  cacheSize?: number;

  /**
   * 是否区分路由大小写
   * 默认: false
   */
  caseSensitive?: boolean;

  /**
   * 是否启用严格模式（路径末尾斜杠敏感）
   * 默认: false
   */
  strict?: boolean;

  /**
   * 路由查找超时（毫秒）
   * 默认: 50
   */
  matchTimeout?: number;
}

/**
 * 路由处理函数
 */
export type RouteHandler = (context: RouteContext) => Promise<HttpResponse>;

/**
 * 路由配置
 */
export interface RouteConfig {
  /**
   * HTTP方法
   */
  method: string;

  /**
   * 路由模式
   */
  pattern: string;

  /**
   * 处理函数
   */
  handler: RouteHandler;
}

/**
 * 路由上下文
 */
export interface RouteContext {
  /**
   * 请求对象
   */
  request: HttpRequest;

  /**
   * 路由参数
   */
  params: Record<string, string>;

  /**
   * 查询参数
   */
  query: URLSearchParams;

  /**
   * 状态存储
   */
  state: Map<string, any>;
}

/**
 * 路由统计信息
 */
export interface RouterStats {
  /**
   * 注册的路由总数
   */
  routeCount: number;

  /**
   * 缓存命中次数
   */
  cacheHits: number;

  /**
   * 缓存未命中次数
   */
  cacheMisses: number;

  /**
   * 平均匹配时间（毫秒）
   */
  avgMatchTime: number;

  /**
   * 当前缓存大小
   */
  currentCacheSize: number;
}
```

### `RadixTree` 类

```typescript
export class RadixTree<T> {
  /**
   * 创建一个新的基数树
   */
  constructor();

  /**
   * 插入路径和关联值
   * @param path 路径
   * @param value 关联值
   */
  insert(path: string, value: T): void;

  /**
   * 查找匹配路径
   * @param path 查询路径
   * @returns 匹配结果，包含值和参数
   */
  lookup(path: string): RadixMatchResult<T> | null;

  /**
   * 移除路径
   * @param path 要移除的路径
   */
  remove(path: string): boolean;
}

/**
 * 基数树匹配结果
 */
export interface RadixMatchResult<T> {
  /**
   * 匹配的值
   */
  value: T;

  /**
   * 解析的参数
   */
  params: Record<string, string>;
}
```

## 用法示例

### 基本路由设置

```typescript
import { OptimizedRouter, HttpRequest, HttpResponse } from '@bactor/http';

// 创建优化路由器
const router = new OptimizedRouter({
  enableCache: true,
  cacheSize: 500
});

// 添加简单路由
router.add('GET', '/api/users', async (context) => {
  return {
    status: 200,
    headers: new Headers({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ users: ['user1', 'user2'] })
  };
});

// 添加带参数的路由
router.add('GET', '/api/users/:id', async (context) => {
  const userId = context.params.id;
  return {
    status: 200,
    headers: new Headers({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ userId })
  };
});

// 添加路由组
router.addGroup('/api/products', [
  {
    method: 'GET',
    pattern: '/',
    handler: async (context) => {
      return {
        status: 200,
        headers: new Headers({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({ products: ['product1', 'product2'] })
      };
    }
  },
  {
    method: 'GET',
    pattern: '/:id',
    handler: async (context) => {
      const productId = context.params.id;
      return {
        status: 200,
        headers: new Headers({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({ productId })
      };
    }
  }
]);
```

### 路由匹配和处理

```typescript
import { OptimizedRouter, HttpRequest } from '@bactor/http';

// 创建请求对象
const request: HttpRequest = {
  method: 'GET',
  url: '/api/users/123',
  headers: new Headers(),
  body: null,
  state: new Map()
};

// 匹配路由
const response = await router.match(request.method, request.url, request);

// 输出响应
console.log(response.status); // 200
console.log(response.body); // {"userId":"123"}
```

### 获取路由统计信息

```typescript
// 获取路由器性能统计信息
const stats = router.getStats();
console.log(`Routes: ${stats.routeCount}`);
console.log(`Cache hits: ${stats.cacheHits}, misses: ${stats.cacheMisses}`);
console.log(`Avg match time: ${stats.avgMatchTime}ms`);
```

## 内部实现

优化的路由系统基于以下核心原则实现：

1. **基数树数据结构**：使用基数树（Radix Tree/Patricia Trie）实现高效路由匹配，比传统的线性搜索或正则表达式匹配快得多。

2. **路由缓存**：维护一个最近使用的路由匹配结果缓存，避免重复计算常用路径的匹配。

3. **参数提取优化**：使用优化的参数提取算法，减少字符串操作和内存分配。

4. **HTTP方法优化**：对每种HTTP方法使用单独的路由树，减少匹配时的搜索空间。

5. **动态路由识别**：智能识别静态和动态路由部分，优先进行静态部分匹配以提高性能。

6. **懒式正则编译**：仅在必要时才编译和使用正则表达式，减少初始化开销。

## 性能考虑

- 基数树路由在包含大量路由的应用中表现尤为出色，匹配时间几乎不随路由数量增加而线性增长。
- 路由缓存对于具有高流量且访问模式相对固定的应用特别有效。
- 静态路由（不包含参数）的匹配性能显著优于动态路由。
- 路由组的使用可以减少内存占用并提高路由树的效率。 