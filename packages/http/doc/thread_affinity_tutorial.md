# 线程亲和性实践教程

本教程将指导您如何在Bactor HTTP应用中集成和利用线程亲和性功能，以显著提升性能和响应能力。

## 先决条件

- Node.js 14.x 或更高版本
- 安装了Bactor HTTP框架
- 对多线程和并发概念有基本了解

## 1. 基本概念

线程亲和性是指将线程绑定到特定CPU核心的技术，使得线程始终在该核心上执行，减少上下文切换，并提高缓存命中率。

Bactor HTTP框架支持三种级别的线程亲和性控制：

- **低级API**: 直接控制线程与CPU核心的绑定关系
- **中级API**: 通过`ThreadAffinityManager`管理线程亲和性
- **高级API**: 将亲和性功能集成到反应器模式中

## 2. 检测系统环境

首先，我们需要检查当前系统是否支持线程亲和性：

```javascript
const { 
  isNativeBindingSupported, 
  getSystemTopology 
} = require('bactor/http/performance/thread_binding');

// 检查是否支持原生线程绑定
const supported = isNativeBindingSupported();
console.log(`原生线程绑定支持: ${supported ? '可用' : '不可用'}`);

// 获取系统拓扑信息
if (supported) {
  const topology = getSystemTopology();
  console.log(`CPU核心数: ${Object.keys(topology.logicalToPhysicalMap).length}`);
  console.log(`NUMA节点数: ${topology.numaNodes}`);
  console.log(`每个节点的核心分布: ${JSON.stringify(topology.coresPerNode)}`);
}
```

## 3. 使用低级API实现线程绑定

如果您需要精确控制特定线程的绑定，可以使用低级API：

```javascript
const { 
  bindThreadToCore,
  getCurrentThreadCore,
  setThreadPriority,
  unbindThread 
} = require('bactor/http/performance/thread_binding');

// 将主线程绑定到CPU核心0
const success = bindThreadToCore(0);
console.log(`线程绑定结果: ${success ? '成功' : '失败'}`);

// 获取当前线程绑定的核心
const currentCore = getCurrentThreadCore();
console.log(`当前线程绑定的核心: ${currentCore}`);

// 设置线程优先级 (0-99，值越大优先级越高)
setThreadPriority(75);

// 稍后解除绑定
// unbindThread();
```

## 4. 使用ThreadAffinityManager管理多线程

对于需要管理多个线程的应用，推荐使用`ThreadAffinityManager`：

```javascript
const { ThreadAffinityManager } = require('bactor/http/performance/thread_affinity');
const { Worker } = require('worker_threads');

// 创建线程亲和性管理器
const manager = ThreadAffinityManager.getInstance({
  enabled: true,             // 启用线程亲和性
  priorityStrategy: 'dynamic', // 动态优先级策略
  numaAware: true,           // 启用NUMA感知
  logging: true              // 启用日志记录
});

// 获取CPU核心数
const cpuCount = manager.getCpuCount();

// 创建Worker线程
function createWorkers(count) {
  const workers = [];
  
  for (let i = 0; i < count; i++) {
    // 为每个Worker分配一个CPU核心
    const coreId = i % cpuCount;
    
    // 创建带有亲和性的Worker
    const worker = manager.createAffinityWorker('./worker.js', coreId, {
      workerId: i,
      someData: `配置数据 ${i}`
    });
    
    worker.on('message', message => {
      console.log(`收到来自Worker ${i} (核心 ${coreId}) 的消息:`, message);
      
      // 更新线程负载信息
      if (message.load !== undefined) {
        const threads = manager.getAllThreads();
        const workerThread = threads.find(t => t.cpuCore === coreId);
        if (workerThread) {
          manager.updateThreadLoad(workerThread.id, message.load);
        }
      }
    });
    
    workers.push(worker);
  }
  
  return workers;
}

// 创建4个Worker
const workers = createWorkers(4);

// 定期重新平衡线程
setInterval(() => {
  const rebalanced = manager.rebalanceThreads();
  if (rebalanced > 0) {
    console.log(`重新平衡了 ${rebalanced} 个线程`);
  }
}, 30000);
```

## 5. Worker线程示例

以下是一个Worker线程的示例代码（`worker.js`）：

```javascript
const { parentPort, workerData } = require('worker_threads');
const { registerWorkerAffinity } = require('bactor/http/performance/thread_affinity');

// 注册Worker亲和性（自动应用workerData中的_affinityCore）
registerWorkerAffinity();

// 获取Worker数据
const workerId = workerData.workerId;
const affinityCore = workerData._affinityCore;  // 由createAffinityWorker自动添加

// 向主线程报告状态
parentPort.postMessage({
  type: 'init',
  workerId: workerId,
  core: affinityCore,
  timestamp: Date.now()
});

// 模拟工作
function doWork() {
  // 执行一些CPU密集型任务
  let result = 0;
  for (let i = 0; i < 1000000; i++) {
    result += Math.sqrt(i);
  }
  
  // 模拟负载 (0-100)
  const load = Math.random() * 70 + 10;
  
  // 向主线程报告结果
  parentPort.postMessage({
    type: 'result',
    workerId: workerId,
    load: load,
    result: result,
    timestamp: Date.now()
  });
  
  // 继续执行任务
  setTimeout(doWork, 1000);
}

// 开始工作
doWork();

// 处理来自主线程的消息
parentPort.on('message', message => {
  if (message.type === 'stop') {
    process.exit(0);
  }
});
```

## 6. 将亲和性集成到HTTP服务器

下面是在Bactor HTTP服务器中集成线程亲和性的完整示例：

```javascript
const http = require('http');
const cluster = require('cluster');
const os = require('os');
const { 
  ThreadAffinityManager 
} = require('bactor/http/performance/thread_affinity');
const { 
  isNativeBindingSupported, 
  bindThreadToCore 
} = require('bactor/http/performance/thread_binding');

// 服务器配置
const PORT = 3000;
const WORKERS = Math.min(os.cpus().length, 8);

// 主进程代码
if (cluster.isMaster) {
  console.log(`主进程启动，监听端口 ${PORT}`);
  console.log(`启动 ${WORKERS} 个工作进程...`);
  
  // 将主进程绑定到最后一个CPU核心
  if (isNativeBindingSupported()) {
    const mainCore = os.cpus().length - 1;
    bindThreadToCore(mainCore);
    console.log(`主进程绑定到核心 ${mainCore}`);
  }
  
  // 启动工作进程
  for (let i = 0; i < WORKERS; i++) {
    const worker = cluster.fork();
    worker.send({ workerId: i });
  }
  
  // 监听工作进程退出
  cluster.on('exit', (worker, code, signal) => {
    console.log(`工作进程 ${worker.process.pid} 退出，状态码: ${code}`);
    // 在生产环境中，应该重新启动工作进程
  });
} 
// 工作进程代码
else {
  let workerId = -1;
  
  // 创建亲和性管理器
  const affinityManager = ThreadAffinityManager.getInstance({
    enabled: true,
    priorityStrategy: 'static',
    numaAware: true
  });
  
  // 监听来自主进程的消息
  process.on('message', msg => {
    if (msg.workerId !== undefined) {
      workerId = msg.workerId;
      
      // 将工作进程绑定到特定核心
      if (isNativeBindingSupported()) {
        // 为避免与主进程冲突，使用 workerId % (cpuCount - 1)
        const cpuCount = affinityManager.getCpuCount();
        const coreId = workerId % (cpuCount - 1);
        
        const success = affinityManager.bindCurrentThread(coreId, 60);
        console.log(`工作进程 ${workerId} (PID: ${process.pid}) 绑定到核心 ${coreId}: ${success ? '成功' : '失败'}`);
      }
      
      // 启动HTTP服务器
      startServer();
    }
  });
  
  // 启动HTTP服务器
  function startServer() {
    const server = http.createServer((req, res) => {
      // 获取请求开始时间
      const start = process.hrtime();
      
      // 根据URL执行不同工作量
      let result;
      if (req.url.includes('/heavy')) {
        result = doHeavyWork();
      } else if (req.url.includes('/medium')) {
        result = doMediumWork();
      } else {
        result = doLightWork();
      }
      
      // 计算处理时间
      const hrend = process.hrtime(start);
      const executionTime = hrend[0] * 1000 + hrend[1] / 1000000;
      
      // 准备响应
      const response = {
        workerId: workerId,
        processId: process.pid,
        cpuCore: affinityManager.getThreadInfo(process.pid)?.cpuCore || -1,
        requestUrl: req.url,
        executionTime: `${executionTime.toFixed(2)}ms`,
        result: result
      };
      
      // 发送响应
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(response, null, 2));
    });
    
    // 启动服务器
    server.listen(PORT, () => {
      console.log(`工作进程 ${workerId} 已启动，监听端口 ${PORT}`);
    });
    
    // 错误处理
    server.on('error', err => {
      console.error(`服务器错误:`, err);
    });
  }
  
  // 模拟不同强度的工作
  function doLightWork() {
    let sum = 0;
    for (let i = 0; i < 100000; i++) {
      sum += i;
    }
    return { type: 'light', sum };
  }
  
  function doMediumWork() {
    let sum = 0;
    for (let i = 0; i < 500000; i++) {
      sum += Math.sqrt(i);
    }
    return { type: 'medium', sum };
  }
  
  function doHeavyWork() {
    let sum = 0;
    for (let i = 0; i < 1000000; i++) {
      sum += Math.sqrt(i) * Math.sin(i);
    }
    return { type: 'heavy', sum };
  }
}
```

## 7. 集成到反应器模式

如果您使用Bactor的反应器模式（Reactor Pattern），可以直接在反应器选项中启用线程亲和性：

```javascript
const { Reactor } = require('bactor/http/core/reactor');

// 创建带有亲和性的反应器
const reactor = new Reactor({
  id: 'api-reactor',
  enableAffinityBinding: true,  // 启用线程亲和性
  affinityCore: 2,              // 绑定到核心2
  threadPriority: 75,           // 设置高优先级
  numaNode: 0                   // 指定NUMA节点（可选）
});

// 启动反应器
await reactor.start();

// 注册工作处理器
reactor.registerHandler('api-request', async (work) => {
  // 处理API请求
  return { success: true, data: work.payload };
});

// 提交工作到反应器
const result = await reactor.submit({
  type: 'api-request',
  payload: { user: 'test', action: 'query' }
});

// 完成后停止反应器
await reactor.stop();
```

## 8. 性能调优建议

在使用线程亲和性时，以下是一些性能调优建议：

1. **避免过度绑定**：
   - 不要绑定比物理核心更多的线程
   - 留出至少一个核心用于操作系统和后台任务

2. **工作负载匹配**：
   - 将计算密集型任务绑定到性能核心
   - 将I/O密集型任务绑定到效率核心（在混合架构CPU上）

3. **监控与调整**：
   - 定期收集性能指标
   - 使用`rebalanceThreads()`在负载变化时调整

4. **特殊处理**：
   - 在MacOS上，区分性能核心和效率核心（M1/M2芯片）
   - 在Linux服务器上，考虑NUMA节点结构

## 9. 故障排除

如果遇到线程亲和性相关问题，请检查：

1. **原生绑定支持**：
   - 某些环境可能不支持原生线程绑定，框架会自动降级
   - 检查`isNativeBindingSupported()`的返回值

2. **权限问题**：
   - Linux下可能需要特定权限设置线程亲和性
   - 确保应用有足够权限访问系统调用

3. **平台兼容性**：
   - Windows、Linux和macOS对线程亲和性的支持有所不同
   - 查阅特定平台文档了解限制

4. **工作线程绑定**：
   - 确保使用`registerWorkerAffinity()`或`createAffinityWorker()`
   - 验证Worker线程确实绑定到预期核心

## 10. 最佳实践总结

1. **先测量，后优化**：
   - 首先建立性能基准
   - 有选择地应用线程亲和性，验证改进

2. **逐步应用**：
   - 从关键路径开始
   - 不要一次绑定所有线程

3. **结合其他优化**：
   - 线程亲和性与对象池、零拷贝等优化结合效果更佳
   - 考虑整体系统架构

4. **动态适应**：
   - 利用动态负载平衡功能
   - 根据系统负载变化调整策略

5. **构建可靠性**：
   - 即使亲和性绑定失败，应用也应能正常运行
   - 实现适当的回退机制

通过遵循本教程中的指导，您可以有效地在Bactor HTTP应用中集成线程亲和性功能，提升应用性能和系统资源利用率。 