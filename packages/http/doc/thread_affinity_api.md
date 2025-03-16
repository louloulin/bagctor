# 线程亲和性 API 参考文档

## 概述

线程亲和性（Thread Affinity）功能允许将工作线程绑定到特定的CPU核心，以减少上下文切换，提高缓存亲和性，从而显著提升性能。Bactor HTTP框架实现了完整的线程亲和性支持，包括原生绑定、NUMA感知和动态负载平衡。

## 核心模块

线程亲和性功能分为两个主要模块：

- `thread_binding.ts` - 提供与平台相关的底层线程绑定功能
- `thread_affinity.ts` - 提供高级线程亲和性管理功能

## 接口定义

### ThreadAffinityOptions

```typescript
export interface ThreadAffinityOptions {
    /**
     * 是否启用线程亲和性
     */
    enabled: boolean;

    /**
     * 优先级策略
     */
    priorityStrategy: 'static' | 'dynamic';

    /**
     * 是否启用NUMA感知
     */
    numaAware?: boolean;

    /**
     * 是否启用日志记录
     */
    logging?: boolean;
}
```

### ThreadInfo

```typescript
export interface ThreadInfo {
    /**
     * 线程ID
     */
    id: number;

    /**
     * 绑定的CPU核心ID
     */
    cpuCore: number;

    /**
     * 优先级 (0-99，值越大优先级越高)
     */
    priority: number;

    /**
     * 当前负载指标
     */
    load: number;

    /**
     * NUMA节点(如果支持)
     */
    numaNode?: number;
}
```

## ThreadBinding API

### `isNativeBindingSupported()`

检查当前环境是否支持原生线程绑定。

**返回值**：`boolean` - 是否支持原生绑定

**示例**：
```typescript
import { isNativeBindingSupported } from 'bactor/http/performance/thread_binding';

const supported = isNativeBindingSupported();
console.log(`原生线程绑定支持: ${supported ? '可用' : '不可用'}`);
```

### `getNativeThreadId()`

获取当前线程的ID。

**返回值**：`number` - 线程ID

**示例**：
```typescript
import { getNativeThreadId } from 'bactor/http/performance/thread_binding';

const threadId = getNativeThreadId();
console.log(`当前线程ID: ${threadId}`);
```

### `bindThreadToCore(coreId: number)`

将当前线程绑定到指定CPU核心。

**参数**：
- `coreId: number` - 要绑定的CPU核心ID

**返回值**：`boolean` - 是否绑定成功

**示例**：
```typescript
import { bindThreadToCore } from 'bactor/http/performance/thread_binding';

const result = bindThreadToCore(0); // 绑定到核心0
console.log(`绑定结果: ${result ? '成功' : '失败'}`);
```

### `getCurrentThreadCore()`

获取当前线程绑定的CPU核心ID。

**返回值**：`number` - 当前绑定的核心ID，如果未绑定则返回-1

**示例**：
```typescript
import { getCurrentThreadCore } from 'bactor/http/performance/thread_binding';

const currentCore = getCurrentThreadCore();
console.log(`当前线程绑定的核心: ${currentCore}`);
```

### `setThreadPriority(priority: number)`

设置当前线程的优先级。

**参数**：
- `priority: number` - 优先级(0-99，值越大优先级越高)

**返回值**：`boolean` - 是否设置成功

**示例**：
```typescript
import { setThreadPriority } from 'bactor/http/performance/thread_binding';

const result = setThreadPriority(75);
console.log(`优先级设置结果: ${result ? '成功' : '失败'}`);
```

### `getSystemTopology()`

获取系统CPU拓扑信息，包括NUMA节点数量和核心分布。

**返回值**：
```typescript
{
    numaNodes: number;              // NUMA节点数量
    coresPerNode: number[];         // 每个节点的核心数
    logicalToPhysicalMap: Record<number, number>; // 逻辑核心到物理节点的映射
}
```

**示例**：
```typescript
import { getSystemTopology } from 'bactor/http/performance/thread_binding';

const topology = getSystemTopology();
console.log(`系统有 ${topology.numaNodes} 个NUMA节点`);
console.log(`每个节点的核心数: ${topology.coresPerNode}`);
```

### `getCpuUsage(coreId?: number)`

获取CPU使用率。

**参数**：
- `coreId?: number` - 可选的核心ID，如果不指定则返回所有核心的平均值

**返回值**：`number` - CPU使用率(0-100)

**示例**：
```typescript
import { getCpuUsage } from 'bactor/http/performance/thread_binding';

// 获取整体CPU使用率
const overallUsage = getCpuUsage();
console.log(`整体CPU使用率: ${overallUsage.toFixed(1)}%`);

// 获取核心0的使用率
const core0Usage = getCpuUsage(0);
console.log(`核心0使用率: ${core0Usage.toFixed(1)}%`);
```

### `setNumaAffinity(numaNode: number)`

设置当前线程的NUMA节点亲和性。

**参数**：
- `numaNode: number` - NUMA节点ID

**返回值**：`boolean` - 是否设置成功

**示例**：
```typescript
import { setNumaAffinity } from 'bactor/http/performance/thread_binding';

const result = setNumaAffinity(0);
console.log(`NUMA亲和性设置结果: ${result ? '成功' : '失败'}`);
```

### `unbindThread()`

解除当前线程的CPU亲和性绑定。

**返回值**：`boolean` - 是否成功解除绑定

**示例**：
```typescript
import { unbindThread } from 'bactor/http/performance/thread_binding';

const result = unbindThread();
console.log(`解除绑定结果: ${result ? '成功' : '失败'}`);
```

## ThreadAffinityManager API

### `ThreadAffinityManager.getInstance(options?: ThreadAffinityOptions)`

获取线程亲和性管理器的单例实例。

**参数**：
- `options?: ThreadAffinityOptions` - 可选的配置选项

**返回值**：`ThreadAffinityManager` - 线程亲和性管理器实例

**示例**：
```typescript
import { ThreadAffinityManager } from 'bactor/http/performance/thread_affinity';

const manager = ThreadAffinityManager.getInstance({
    enabled: true,
    priorityStrategy: 'dynamic',
    numaAware: true,
    logging: true
});
```

### `manager.bindCurrentThread(coreId: number, priority: number = 50)`

将当前线程绑定到指定CPU核心。

**参数**：
- `coreId: number` - 要绑定的CPU核心ID
- `priority: number` - 线程优先级，默认为50

**返回值**：`boolean` - 是否绑定成功

**示例**：
```typescript
const result = manager.bindCurrentThread(0, 75);
console.log(`线程绑定结果: ${result ? '成功' : '失败'}`);
```

### `manager.createAffinityWorker(scriptPath: string, coreId: number, data?: any)`

创建一个与指定CPU核心绑定的Worker线程。

**参数**：
- `scriptPath: string` - Worker脚本路径
- `coreId: number` - 要绑定的CPU核心ID
- `data?: any` - 可选的传递给Worker的数据

**返回值**：`Worker` - Worker线程实例

**示例**：
```typescript
const worker = manager.createAffinityWorker('./worker.js', 1, { data: 'test' });

worker.on('message', (message) => {
    console.log('收到Worker消息:', message);
});
```

### `manager.getCpuCount()`

获取系统可用的CPU核心数。

**返回值**：`number` - CPU核心数

**示例**：
```typescript
const cpuCount = manager.getCpuCount();
console.log(`系统有 ${cpuCount} 个CPU核心`);
```

### `manager.getThreadInfo(threadId: number)`

获取指定线程的信息。

**参数**：
- `threadId: number` - 线程ID

**返回值**：`ThreadInfo | undefined` - 线程信息，如果不存在则返回undefined

**示例**：
```typescript
const threadId = getNativeThreadId();
const threadInfo = manager.getThreadInfo(threadId);

if (threadInfo) {
    console.log(`线程${threadId}绑定到核心${threadInfo.cpuCore}`);
}
```

### `manager.getAllThreads()`

获取所有线程的信息。

**返回值**：`ThreadInfo[]` - 线程信息数组

**示例**：
```typescript
const threads = manager.getAllThreads();
console.log(`当前有 ${threads.length} 个受管理的线程`);

threads.forEach(thread => {
    console.log(`线程${thread.id}: 核心=${thread.cpuCore}, 负载=${thread.load}%`);
});
```

### `manager.updateThreadLoad(threadId: number, load: number)`

更新线程的负载指标。

**参数**：
- `threadId: number` - 线程ID
- `load: number` - 负载值(0-100)

**示例**：
```typescript
const threadId = getNativeThreadId();
manager.updateThreadLoad(threadId, 75);
```

### `manager.unbindThread(threadId: number)`

解除指定线程的CPU亲和性绑定。

**参数**：
- `threadId: number` - 线程ID

**返回值**：`boolean` - 是否成功解除绑定

**示例**：
```typescript
const threadId = getNativeThreadId();
const result = manager.unbindThread(threadId);
console.log(`解除线程${threadId}绑定结果: ${result ? '成功' : '失败'}`);
```

### `manager.rebalanceThreads()`

根据负载情况重新平衡线程分配。

**返回值**：`number` - 被重新分配的线程数

**示例**：
```typescript
const rebalanced = manager.rebalanceThreads();
console.log(`重新平衡了 ${rebalanced} 个线程`);
```

## 辅助函数

### `registerWorkerAffinity()`

在Worker线程中注册CPU亲和性。

**示例**：
```typescript
// 在Worker线程的脚本中
const { registerWorkerAffinity } = require('bactor/http/performance/thread_affinity');

// 自动注册Worker亲和性
registerWorkerAffinity();
```

### `createAffinityWorker(scriptPath: string, coreId: number, data?: any)`

创建一个与指定CPU核心绑定的Worker线程（便捷函数）。

**参数**：
- `scriptPath: string` - Worker脚本路径
- `coreId: number` - 要绑定的CPU核心ID
- `data?: any` - 可选的传递给Worker的数据

**返回值**：`Worker` - Worker线程实例

**示例**：
```typescript
import { createAffinityWorker } from 'bactor/http/performance/thread_affinity';

const worker = createAffinityWorker('./worker.js', 1, { data: 'test' });
```

### `bindToCore(coreId: number, priority: number = 50)`

将当前线程绑定到指定CPU核心（便捷函数）。

**参数**：
- `coreId: number` - 要绑定的CPU核心ID
- `priority: number` - 线程优先级，默认为50

**返回值**：`boolean` - 是否绑定成功

**示例**：
```typescript
import { bindToCore } from 'bactor/http/performance/thread_affinity';

const result = bindToCore(0, 75);
```

### `getAvailableCores()`

获取系统可用的CPU核心数（便捷函数）。

**返回值**：`number` - CPU核心数

**示例**：
```typescript
import { getAvailableCores } from 'bactor/http/performance/thread_affinity';

const cpuCount = getAvailableCores();
```

### `unbindCurrentThread()`

解除当前线程的CPU亲和性绑定（便捷函数）。

**返回值**：`boolean` - 是否成功解除绑定

**示例**：
```typescript
import { unbindCurrentThread } from 'bactor/http/performance/thread_affinity';

const result = unbindCurrentThread();
```

### `rebalanceThreads()`

根据负载情况重新平衡线程分配（便捷函数）。

**返回值**：`number` - 被重新分配的线程数

**示例**：
```typescript
import { rebalanceThreads } from 'bactor/http/performance/thread_affinity';

const rebalanced = rebalanceThreads();
```

## 完整示例

### 基本示例

```typescript
import { 
    isNativeBindingSupported, 
    bindThreadToCore,
    getCurrentThreadCore,
    getCpuUsage
} from 'bactor/http/performance/thread_binding';

// 检查是否支持原生绑定
const nativeSupported = isNativeBindingSupported();
console.log(`原生线程绑定支持: ${nativeSupported ? '可用' : '不可用'}`);

// 绑定主线程到核心0
const success = bindThreadToCore(0);
console.log(`主线程绑定结果: ${success ? '成功' : '失败'}`);

// 获取当前绑定的核心
const currentCore = getCurrentThreadCore();
console.log(`当前线程绑定的核心: ${currentCore}`);

// 监控CPU使用率
setInterval(() => {
    const usage = getCpuUsage(0);
    console.log(`核心0使用率: ${usage.toFixed(1)}%`);
}, 1000);
```

### 使用线程亲和性管理器

```typescript
import { ThreadAffinityManager } from 'bactor/http/performance/thread_affinity';
import { Worker } from 'worker_threads';

// 创建线程亲和性管理器
const manager = ThreadAffinityManager.getInstance({
    enabled: true,
    priorityStrategy: 'dynamic', // 'static' 或 'dynamic'
    numaAware: true,  // 启用NUMA感知
    logging: true     // 启用日志记录
});

// 获取CPU核心数
const cpuCount = manager.getCpuCount();
console.log(`系统有 ${cpuCount} 个CPU核心`);

// 创建Worker线程并绑定到不同核心
const workers: Worker[] = [];

for (let i = 0; i < cpuCount; i++) {
    // 创建绑定到核心i的Worker
    const worker = manager.createAffinityWorker('./worker.js', i, {
        id: i,
        data: `Worker ${i}`
    });
    
    worker.on('message', (message) => {
        console.log(`收到Worker ${i} 消息:`, message);
        
        // 根据消息更新线程负载
        if (message.type === 'status' && message.load !== undefined) {
            const threads = manager.getAllThreads();
            const workerThread = threads.find(t => t.cpuCore === i);
            
            if (workerThread) {
                manager.updateThreadLoad(workerThread.id, message.load);
            }
        }
    });
    
    workers.push(worker);
}

// 定期重新平衡线程
setInterval(() => {
    const rebalanced = manager.rebalanceThreads();
    console.log(`重新平衡了 ${rebalanced} 个线程`);
    
    // 获取当前线程状态
    const threads = manager.getAllThreads();
    console.log('当前线程状态:', threads);
}, 10000);
```

### Worker线程实现

```typescript
// worker.js
const { parentPort, workerData } = require('worker_threads');
const { registerWorkerAffinity } = require('bactor/http/performance/thread_affinity');

// 自动注册Worker亲和性
registerWorkerAffinity();

// 向主线程报告状态
parentPort.postMessage({
    type: 'status',
    id: workerData.id,
    affinityCore: workerData._affinityCore,
    numaNode: workerData._affinityNumaNode
});

// 模拟工作负载
function doWork() {
    // 模拟CPU密集型任务
    let result = 0;
    for (let i = 0; i < 1000000; i++) {
        result += Math.sqrt(i);
    }
    
    // 报告负载
    parentPort.postMessage({
        type: 'status',
        id: workerData.id,
        load: Math.random() * 100, // 模拟负载
        result: result
    });
    
    // 继续工作
    setTimeout(doWork, 500);
}

// 开始工作
doWork();
```

### NUMA感知示例

```typescript
import { 
    getSystemTopology,
    setNumaAffinity
} from 'bactor/http/performance/thread_binding';
import { ThreadAffinityManager } from 'bactor/http/performance/thread_affinity';

// 获取系统拓扑信息
const topology = getSystemTopology();
console.log(`系统有 ${topology.numaNodes} 个NUMA节点`);
console.log(`每个节点的核心数: ${topology.coresPerNode}`);

if (topology.numaNodes > 1) {
    // 创建启用NUMA感知的线程亲和性管理器
    const manager = ThreadAffinityManager.getInstance({
        enabled: true,
        priorityStrategy: 'dynamic',
        numaAware: true,
        logging: true
    });
    
    // 为每个NUMA节点创建对应的Worker
    for (let nodeId = 0; nodeId < topology.numaNodes; nodeId++) {
        // 计算该NUMA节点的起始核心ID
        let startCore = 0;
        for (let i = 0; i < nodeId; i++) {
            startCore += topology.coresPerNode[i];
        }
        
        // 创建绑定到该NUMA节点的Worker
        for (let i = 0; i < topology.coresPerNode[nodeId]; i++) {
            const coreId = startCore + i;
            
            const worker = manager.createAffinityWorker('./numa_worker.js', coreId, {
                numaNode: nodeId,
                coreId: coreId
            });
            
            console.log(`在NUMA节点 ${nodeId} 创建了Worker，绑定到核心 ${coreId}`);
        }
    }
} else {
    console.log('系统只有一个NUMA节点，不需要特殊处理');
} 