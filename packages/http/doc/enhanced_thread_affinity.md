# 增强版线程亲和性(Enhanced Thread Affinity)

本文档介绍了 Bactor HTTP 框架中的增强版线程亲和性实现，包括原生绑定支持、NUMA 感知以及动态线程负载平衡功能。

## 1. 核心概念

增强版线程亲和性在基础线程亲和性功能之上，添加了以下关键功能：

1. **原生绑定支持** - 通过本地模块提供实际的线程与 CPU 核心绑定能力
2. **NUMA 感知** - 支持 NUMA 架构，提高多处理器系统性能
3. **动态负载平衡** - 根据 CPU 使用率自动调整线程绑定，优化系统资源利用

### 1.1 原生绑定与模拟绑定

增强版线程亲和性实现了两种绑定模式：

- **原生绑定模式**: 通过平台特定的本地模块，直接调用操作系统 API 实现真正的线程绑定
- **模拟绑定模式**: 当原生绑定不可用时，提供行为一致的模拟实现作为回退方案

框架会自动检测环境并选择最佳模式，确保代码可移植性的同时提供最大性能提升。

### 1.2 NUMA 架构支持

NUMA (Non-Uniform Memory Access) 架构是一种多处理器计算机内存设计，其中内存访问时间取决于内存相对于处理器的位置。增强版线程亲和性提供 NUMA 感知能力：

- 自动检测系统 NUMA 拓扑
- 将线程绑定到特定 NUMA 节点
- 优化内存分配，减少跨节点访问开销

### 1.3 动态负载平衡

动态负载平衡功能通过以下机制优化系统资源使用：

- 实时监控 CPU 核心使用率
- 检测负载不均衡情况 (如某核心过载而其他核心空闲)
- 自动迁移线程到负载较低的核心
- 支持基于阈值的平衡策略，避免频繁迁移

## 2. 技术实现

### 2.1 原生绑定模块

原生绑定通过 `thread_binding.ts` 模块实现，该模块负责：

- 根据运行平台加载合适的本地模块
- 提供统一的 API 接口，隐藏平台差异
- 在本地模块不可用时提供模拟实现

本地模块通过 Node.js 的 N-API 实现，支持以下主要平台：

- Linux: 使用 `sched_setaffinity` 系统调用
- Windows: 使用 `SetThreadAffinityMask` API
- macOS: 使用 `thread_policy_set` API

### 2.2 NUMA 感知实现

NUMA 感知功能的实现包括：

- 通过本地模块获取系统 NUMA 拓扑信息
- 追踪核心与 NUMA 节点映射关系
- 在创建工作线程时考虑 NUMA 分组
- 提供 API 设置线程的 NUMA 亲和性

### 2.3 动态负载平衡算法

动态负载平衡通过以下算法实现：

1. 定期收集每个 CPU 核心的使用率
2. 识别负载最高和最低的核心
3. 当核心间负载差异超过阈值时：
   - 识别绑定到高负载核心的线程
   - 暂时解除核心绑定
   - 重新绑定到低负载核心
4. 平衡操作会考虑线程优先级和 NUMA 节点分布

## 3. API 参考

### 3.1 线程绑定 API

```typescript
import {
  isNativeBindingSupported,
  bindThreadToCore,
  setThreadPriority,
  unbindThread,
  getNativeThreadId,
  getCurrentThreadCore,
  getSystemTopology,
  getCpuUsage,
  setNumaAffinity
} from 'bactor/http/performance/thread_binding';

// 检查是否支持原生绑定
const nativeSupported = isNativeBindingSupported();
console.log(`原生线程绑定支持: ${nativeSupported ? '可用' : '不可用'}`);

// 绑定当前线程到核心 0
const success = bindThreadToCore(0);
console.log(`绑定结果: ${success ? '成功' : '失败'}`);

// 设置线程优先级
setThreadPriority(75); // 0-99，值越大优先级越高

// 获取当前线程ID
const threadId = getNativeThreadId();
console.log(`当前线程ID: ${threadId}`);

// 获取当前线程绑定的核心
const currentCore = getCurrentThreadCore();
console.log(`当前绑定的核心: ${currentCore}`);

// 获取系统拓扑信息
const topology = getSystemTopology();
console.log(`系统有 ${topology.numaNodes} 个NUMA节点`);
console.log(`每个节点的核心数: ${topology.coresPerNode}`);

// 获取CPU使用率
const usage = getCpuUsage(0); // 获取核心0的使用率
console.log(`CPU核心0使用率: ${usage}%`);

// 设置NUMA亲和性
setNumaAffinity(0); // 绑定到NUMA节点0

// 解除线程绑定
unbindThread();
```

### 3.2 增强版线程亲和性管理器 API

```typescript
import {
  ThreadAffinityManager,
  ThreadAffinityOptions,
  ThreadInfo,
  rebalanceThreads
} from 'bactor/http/performance/thread_affinity';

// 创建启用NUMA感知的ThreadAffinityManager
const options: ThreadAffinityOptions = {
  enabled: true,
  priorityStrategy: 'dynamic', // 'static' 或 'dynamic'
  numaAware: true,             // 启用NUMA感知
  logging: true                // 启用日志
};

// 获取单例实例
const manager = ThreadAffinityManager.getInstance(options);

// 绑定当前线程到核心0
manager.bindCurrentThread(0, 50);

// 创建绑定到核心1的Worker
const worker = manager.createAffinityWorker('./worker.js', 1, { data: 'test' });

// 获取线程信息
const threads = manager.getAllThreads();
console.log(`活跃线程数: ${threads.length}`);

// 更新线程负载信息
const threadId = threads[0]?.id;
if (threadId) {
  manager.updateThreadLoad(threadId, 80); // 80%负载
}

// 执行线程负载平衡
const rebalanced = rebalanceThreads();
console.log(`重新平衡了 ${rebalanced} 个线程`);
```

## 4. 与 Reactor 集成

增强版线程亲和性与 Bactor 的 Reactor 模块紧密集成，提供以下功能：

```typescript
import { Reactor, ReactorOptions } from 'bactor/http/core/reactor';

// 创建带有线程亲和性的Reactor
const options: ReactorOptions = {
  id: 'reactor-1',
  cpuCore: 0,                 // 绑定到核心0
  affinityOptions: {
    enabled: true,
    priorityStrategy: 'dynamic',
    numaAware: true
  },
  logging: {
    enabled: true,
    level: 'info'
  }
};

// 创建并启动Reactor
const reactor = new Reactor(options);
await reactor.start();

// 获取性能统计，包括CPU使用率
const stats = reactor.getStats();
console.log(`Reactor ${stats.id} 负载: ${stats.currentLoad}`);
console.log(`CPU使用率: ${stats.cpuUsage}%`);
console.log(`绑定的核心: ${stats.boundToCore}`);

// 停止Reactor (会自动解除CPU绑定)
await reactor.stop();
```

## 5. Worker 线程支持

增强版线程亲和性为 Worker 线程提供全面支持：

```typescript
import { Worker } from 'worker_threads';
import { createAffinityWorker } from 'bactor/http/performance/thread_affinity';

// 创建绑定到核心0的Worker
const worker = createAffinityWorker('./worker.js', 0, { 
  appData: 'custom data'
});

// 接收Worker消息
worker.on('message', (message) => {
  if (message.type === 'affinity:status') {
    console.log(`Worker绑定到核心: ${message.core}`);
    console.log(`NUMA节点: ${message.numaNode}`);
  }
});

// Worker脚本内部
// worker.js
const { parentPort, workerData } = require('worker_threads');
const { registerWorkerAffinity } = require('bactor/http/performance/thread_affinity');

// 自动注册Worker亲和性 (会自动应用workerData中的_affinityCore设置)
registerWorkerAffinity();

// 访问应用数据
console.log(workerData.appData);
```

## 6. 性能优化最佳实践

### 6.1 核心绑定策略

根据应用类型选择适当的绑定策略：

| 应用类型 | 推荐绑定策略 | 优势 |
|---------|------------|------|
| CPU密集型 | 静态绑定、NUMA感知 | 最大限度减少上下文切换，提高缓存亲和性 |
| IO密集型 | 动态绑定、不绑定IO线程 | 提高资源利用率，避免IO线程阻塞CPU密集型任务 |
| 混合工作负载 | 按工作类型差异化绑定 | 平衡各种任务需求，提高整体性能 |

### 6.2 NUMA优化建议

在NUMA系统上：

- 将相互频繁通信的线程绑定到同一NUMA节点
- 确保内存分配与线程亲和性一致
- 避免线程频繁跨NUMA节点迁移
- 考虑数据分区与NUMA拓扑对齐

### 6.3 动态负载平衡调优

调优动态负载平衡：

- 根据工作负载特性调整重平衡阈值
- 避免在短时负载峰值时触发线程迁移
- 为关键线程设置较高优先级避免迁移
- 监控迁移频率，过高可能导致性能下降

## 7. 限制与注意事项

使用增强版线程亲和性时，应注意以下限制：

- 原生线程绑定依赖平台特定的本地模块，可能不适用于所有环境
- 过度使用静态绑定可能导致系统资源利用不均衡
- NUMA感知功能依赖操作系统提供的拓扑信息
- 频繁的线程重平衡可能增加系统开销
- 在容器化环境中，线程亲和性的效果取决于容器配置

## 8. 构建原生模块

要启用原生线程绑定，需要为目标平台构建本地模块：

### Linux

```bash
# 安装依赖
sudo apt-get install build-essential node-gyp

# 构建模块
cd native_modules
node-gyp configure build
```

### Windows

```bash
# 安装依赖
npm install -g windows-build-tools node-gyp

# 构建模块
cd native_modules
node-gyp configure build
```

### macOS

```bash
# 安装依赖
xcode-select --install
npm install -g node-gyp

# 构建模块
cd native_modules
node-gyp configure build
```

## 9. 总结

增强版线程亲和性为 Bactor HTTP 框架提供了重要的性能优化功能，通过原生绑定支持、NUMA感知和动态负载平衡等核心特性，帮助应用充分利用现代多核硬件架构的性能潜力。

合理使用线程亲和性可显著改善系统性能和响应能力，特别适用于：

- 高性能Web服务器和API网关
- 需要低延迟的微服务
- 多核环境下的计算密集型任务
- 大规模并发环境中的资源优化

增强版线程亲和性模块支持从基础模拟实现到完整原生绑定的平滑过渡，确保代码在各种环境中保持兼容性的同时提供最大性能收益。 