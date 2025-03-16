# 多反应器模式 API 文档

## 概述

多反应器模式是bactor HTTP框架的一个核心优化，通过为每个CPU核心分配独立的事件循环，充分利用多核处理器资源，提高系统的并行处理能力和整体吞吐量。

## API

### `MultiReactorPool` 类

```typescript
export class MultiReactorPool {
  /**
   * 创建一个新的多反应器池
   * @param options 配置选项
   */
  constructor(options?: MultiReactorPoolOptions);

  /**
   * 启动多反应器池
   */
  start(): Promise<void>;

  /**
   * 停止多反应器池
   */
  stop(): Promise<void>;

  /**
   * 将工作分发给合适的反应器
   * @param work 要处理的工作
   */
  dispatch(work: Work): Promise<WorkResult>;

  /**
   * 获取反应器池的统计信息
   */
  getStats(): ReactorPoolStats;
}

/**
 * 多反应器池配置选项
 */
export interface MultiReactorPoolOptions {
  /**
   * 反应器数量，默认为系统CPU核心数
   */
  reactorCount?: number;

  /**
   * 负载均衡策略
   */
  balancingStrategy?: 'round-robin' | 'least-busy' | 'consistent-hash';

  /**
   * 是否启用CPU亲和性（如果平台支持）
   */
  enableAffinityIfSupported?: boolean;

  /**
   * 日志选项
   */
  logging?: {
    enabled: boolean;
    level: 'debug' | 'info' | 'warn' | 'error';
  };
}

/**
 * 反应器池统计信息
 */
export interface ReactorPoolStats {
  /**
   * 活跃的反应器数量
   */
  activeReactors: number;

  /**
   * 总处理工作数
   */
  totalWorkProcessed: number;

  /**
   * 每个反应器的工作负载
   */
  reactorLoads: {
    reactorId: string;
    currentLoad: number;
    totalProcessed: number;
    averageProcessingTime: number;
  }[];
}
```

### `Reactor` 类

```typescript
export class Reactor {
  /**
   * 反应器的唯一标识符
   */
  readonly id: string;

  /**
   * 当前反应器的负载
   */
  readonly currentLoad: number;

  /**
   * 创建一个新的反应器
   * @param options 反应器选项
   */
  constructor(options: ReactorOptions);

  /**
   * 启动反应器
   */
  start(): Promise<void>;

  /**
   * 停止反应器
   */
  stop(): Promise<void>;

  /**
   * 提交工作到反应器
   * @param work 要处理的工作
   */
  submit(work: Work): Promise<WorkResult>;

  /**
   * 获取反应器的统计信息
   */
  getStats(): ReactorStats;
}

/**
 * 反应器选项
 */
export interface ReactorOptions {
  /**
   * 反应器ID
   */
  id: string;

  /**
   * 绑定的CPU核心ID（如果支持）
   */
  cpuCore?: number;

  /**
   * 工作队列容量
   */
  queueCapacity?: number;

  /**
   * 日志选项
   */
  logging?: {
    enabled: boolean;
    level: 'debug' | 'info' | 'warn' | 'error';
  };
}
```

## 用法示例

```typescript
import { MultiReactorPool } from '@bactor/http';

// 创建多反应器池，自动使用系统CPU核心数
const reactorPool = new MultiReactorPool({
  balancingStrategy: 'least-busy',
  enableAffinityIfSupported: true,
  logging: {
    enabled: true,
    level: 'info'
  }
});

// 启动反应器池
await reactorPool.start();

// 将HTTP请求作为工作提交到反应器池
const handleRequest = async (request) => {
  const result = await reactorPool.dispatch({
    type: 'http.request',
    payload: request
  });
  
  return result.response;
};

// 获取反应器池统计信息
const stats = reactorPool.getStats();
console.log(`Active reactors: ${stats.activeReactors}`);
console.log(`Total work processed: ${stats.totalWorkProcessed}`);

// 应用关闭时停止反应器池
await reactorPool.stop();
```

## 内部实现

多反应器模式基于以下核心原则实现：

1. **隔离的执行环境**：每个反应器都在独立的事件循环中运行，避免了线程间的同步和锁竞争。

2. **工作分发机制**：使用高效的负载均衡算法（如一致性哈希、最少忙碌等）将工作分配到合适的反应器。

3. **线程亲和性**：在支持的平台上，将反应器与特定CPU核心绑定，减少上下文切换开销。

4. **无锁数据结构**：反应器内部使用无锁数据结构和消息传递机制，最小化并发开销。

5. **自适应负载均衡**：根据反应器的当前负载和性能指标动态调整工作分配策略。

## 性能考虑

- 多反应器模式适合CPU密集型工作负载，能够显著提高处理器利用率和吞吐量。
- 最佳反应器数量通常与系统的物理CPU核心数匹配，过多的反应器会导致上下文切换开销增加。
- 对于IO密集型工作负载，应考虑将其与计算密集型工作负载分开处理，以获得最佳性能。 