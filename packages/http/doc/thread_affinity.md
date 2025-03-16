# 线程亲和性(Thread Affinity)

本文档介绍了 Bactor HTTP 框架中的线程亲和性实现，该功能用于将工作线程绑定到特定的 CPU 核心，减少上下文切换，提高性能。

## 1. 技术概述

线程亲和性（CPU Affinity）是一种操作系统特性，它允许将线程或进程绑定到特定的 CPU 核心上执行，避免线程在不同核心间迁移导致的性能开销。在高性能服务器应用中，合理使用线程亲和性可以显著提高系统吞吐量和降低延迟。

### 1.1 主要优势

线程亲和性为 HTTP 服务器提供了以下优势：

- **减少上下文切换**: 限制线程只在特定核心上运行，减少跨核心迁移
- **提高缓存局部性**: 增加 CPU 缓存命中率，减少缓存失效
- **降低调度开销**: 简化操作系统调度决策，降低调度延迟
- **提高 NUMA 效率**: 在 NUMA 架构系统上优化内存访问模式

### 1.2 JavaScript/Node.js 中的实现限制

由于 JavaScript 和 Node.js 环境的限制，完整的线程亲和性支持存在一定挑战：

1. JavaScript 没有直接访问线程亲和性 API
2. Node.js Worker 线程无法直接控制其 CPU 绑定
3. 需要借助原生模块或外部工具实现真正的线程亲和性

尽管存在这些限制，Bactor HTTP 框架通过以下方式提供了线程亲和性支持：

- 提供模拟实现作为框架接口
- 结合 Node.js Worker 线程，通过 workerData 传递亲和性信息
- 保留扩展接口，以便将来集成原生模块实现真正的线程亲和性

## 2. API 参考

### 2.1 ThreadAffinityManager 类

单例类，管理线程与 CPU 核心的绑定关系：

```typescript
import { ThreadAffinityManager } from 'bactor/http';

// 获取单例实例
const manager = ThreadAffinityManager.getInstance({
    enabled: true,
    priorityStrategy: 'static',
    logging: true
});

// 绑定当前线程到特定核心
const result = manager.bindCurrentThread(0); // 绑定到核心0

// 创建绑定到特定核心的Worker
const worker = manager.createAffinityWorker('./worker.js', 1, { data: 'test' });

// 获取线程信息
const threads = manager.getAllThreads();
console.log(`活跃线程数: ${threads.length}`);

// 获取可用核心数
const coreCount = manager.getCpuCount();
console.log(`可用CPU核心数: ${coreCount}`);
```

### 2.2 ThreadAffinityOptions 接口

配置线程亲和性行为：

```typescript
interface ThreadAffinityOptions {
    /**
     * 是否启用线程亲和性
     */
    enabled: boolean;
    
    /**
     * 优先级策略
     */
    priorityStrategy: 'static' | 'dynamic';
    
    /**
     * 是否启用日志记录
     */
    logging?: boolean;
}
```

### 2.3 辅助函数

提供了一些便捷的辅助函数：

```typescript
import { 
    bindToCore,
    createAffinityWorker,
    getAvailableCores,
    registerWorkerAffinity
} from 'bactor/http';

// 绑定当前线程到核心0
bindToCore(0, 50); // 第二个参数是优先级(0-99)

// 创建绑定到核心1的Worker
const worker = createAffinityWorker('./worker.js', 1, { data: 'test' });

// 获取可用CPU核心数
const cores = getAvailableCores();
console.log(`系统有 ${cores} 个CPU核心`);

// 在Worker线程中注册亲和性(通常自动调用)
if (!isMainThread) {
    registerWorkerAffinity();
}
```

## 3. 线程亲和性策略

### 3.1 静态绑定策略

静态绑定策略（`priorityStrategy: 'static'`）将线程固定绑定到指定核心：

- **优点**: 最大限度减少上下文切换，提高缓存亲和性
- **缺点**: 可能导致核心间负载不均衡
- **适用场景**: 工作负载均匀，线程数等于或小于核心数的情况

```typescript
// 静态绑定示例
for (let i = 0; i < workerCount; i++) {
    // 将每个Worker绑定到不同的核心
    const worker = createAffinityWorker('./worker.js', i % coreCount);
}
```

### 3.2 动态绑定策略

动态绑定策略（`priorityStrategy: 'dynamic'`）根据负载情况动态调整线程绑定：

- **优点**: 更好的负载均衡，适应变化的工作负载
- **缺点**: 可能增加上下文切换，降低缓存亲和性
- **适用场景**: 工作负载不均匀，或线程数大于核心数的情况

```typescript
// 动态绑定示例
const manager = ThreadAffinityManager.getInstance({
    enabled: true,
    priorityStrategy: 'dynamic'
});

// 系统会根据负载自动分配核心
const worker = manager.createAffinityWorker('./worker.js');
```

## 4. 与 Worker 线程集成

### 4.1 Worker 线程自动亲和性

Bactor HTTP 框架的线程亲和性模块会自动为 Worker 线程注册亲和性：

```typescript
// main.js
import { createAffinityWorker } from 'bactor/http';

// 创建分配到核心0的Worker
const worker = createAffinityWorker('./worker.js', 0, { data: 'test' });

// worker.js
const { parentPort, workerData } = require('worker_threads');

// Worker线程会自动注册CPU亲和性
console.log(`此Worker绑定到核心: ${workerData._affinityCore}`);

// 向主线程报告
parentPort.postMessage({
    type: 'ready',
    core: workerData._affinityCore
});
```

### 4.2 多反应器模式集成

与多反应器池结合使用时，每个反应器可以绑定到不同的核心：

```typescript
import { MultiReactorPool } from 'bactor/http';

// 创建启用了CPU亲和性的多反应器池
const pool = new MultiReactorPool({
    reactorCount: 4,
    balancingStrategy: 'round-robin',
    enableAffinityIfSupported: true
});

// 启动反应器池
await pool.start();
```

## 5. 性能优化

### 5.1 理想的线程数与核心数比例

根据应用类型，不同的线程与核心比例可能有不同的性能表现：

- **CPU密集型**: 线程数 = 核心数
- **I/O密集型**: 线程数 > 核心数（通常为 1.5 - 2 倍）
- **混合工作负载**: 线程数 = 核心数 + 少量额外线程

### 5.2 NUMA 注意事项

在 NUMA 架构系统上，应注意以下几点：

- 尽量确保线程访问本地节点内存
- 将相互通信频繁的线程分配到同一 NUMA 节点
- 考虑使用 NUMA 感知的内存分配策略

### 5.3 最佳实践

- **预热阶段**: 在系统预热阶段不要应用严格的亲和性策略
- **监控性能**: 持续监控亲和性策略对性能的影响，根据需要调整
- **避免过度绑定**: 保留一些核心用于操作系统和后台任务
- **与线程池结合**: 将亲和性策略与线程池策略协调，避免冲突

## 6. 限制与未来改进

当前实现的主要限制：

- JavaScript/Node.js 环境下无法直接控制真正的线程亲和性
- 当前实现主要是模拟，为未来扩展提供统一接口
- 性能提升可能不如原生实现明显

未来计划的改进：

- 开发原生模块实现真正的线程亲和性绑定
- 支持更高级的亲和性策略，如 NUMA 感知调度
- 提供更详细的性能监控和自动调优功能

## 7. 总结

线程亲和性是提高多线程 HTTP 服务器性能的重要机制。尽管在 JavaScript/Node.js 环境中存在实现限制，Bactor HTTP 框架通过模拟实现和提供统一接口，为应用提供了线程亲和性支持的基础，并为未来的原生实现留下了扩展空间。

在多核环境下，合理使用线程亲和性可以显著减少上下文切换，提高缓存亲和性，从而提升系统整体性能和吞吐量。 