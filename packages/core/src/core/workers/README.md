# Actor System with Workers - 多线程支持

本模块为Actor系统提供了基于Web Workers的多线程支持，允许将计算密集型任务从主线程转移到后台线程执行，从而提高应用性能和响应性。

## 功能特性

- **多线程Worker池**: 自动管理多个Worker线程，处理线程创建、销毁和复用
- **计算密集型任务隔离**: 让计算密集型任务在独立线程中执行，避免阻塞主线程UI渲染
- **任务队列和优先级支持**: 根据任务优先级按顺序处理，确保高优先级任务优先执行
- **自动负载均衡**: 根据系统负载自动调整Worker数量
- **错误处理和恢复**: 完善的错误处理机制，确保Worker错误不会影响整个系统
- **内存管理**: 支持小内存模式(smol)，减少内存占用
- **性能指标收集**: 提供详细的性能统计信息

## 架构

Worker功能由以下核心组件组成：

1. **WorkerActor**: 负责接收任务请求并与Worker池通信的Actor
2. **WorkerPool**: 管理Worker线程池，处理线程创建、调度和任务分发
3. **Worker线程脚本**: 在独立线程中执行，处理实际的计算任务

## 使用方法

### 1. 创建一个WorkerActor

```typescript
import { ActorSystem } from '../core/system';
import { WorkerActor, WorkerTaskType } from '../core/workers/worker-actor';

// 创建Actor系统
const system = new ActorSystem();
await system.start();

// 创建一个WorkerActor
const workerActor = await system.spawn({
  actorClass: WorkerActor,
  actorContext: {
    workerPoolConfig: {
      minWorkers: 2,          // 最小Worker数量
      maxWorkers: 8,          // 最大Worker数量
      idleTimeoutMs: 30000,   // Worker空闲超时时间(ms)
      workerScript: '/path/to/worker.ts',  // Worker脚本路径
      useSmol: true           // 使用小内存模式
    }
  }
});
```

### 2. 发送任务执行请求

```typescript
// 发送CPU密集型任务
const response = await system.ask(workerActor, {
  type: 'EXECUTE_WORKER_TASK',
  payload: {
    taskType: WorkerTaskType.CPU_INTENSIVE,
    taskData: { iterations: 1000000 },  // 任务特定数据
    priority: 10,  // 优先级，数字越大优先级越高
    timeout: 5000  // 超时时间(ms)
  }
});

console.log('任务结果:', response.payload.result);
```

### 3. 支持的任务类型

Worker系统支持以下预定义任务类型：

```typescript
enum WorkerTaskType {
  CPU_INTENSIVE = 'CPU_INTENSIVE',  // CPU密集型计算
  IO_INTENSIVE = 'IO_INTENSIVE',    // IO密集型操作
  LOW_LATENCY = 'LOW_LATENCY',      // 低延迟任务
  BATCH = 'BATCH',                  // 批处理任务
  CUSTOM = 'CUSTOM'                 // 自定义任务
}
```

每种任务类型有特定的处理逻辑和参数：

#### CPU密集型任务

适用于大量计算，如数学计算、渲染等：

```typescript
system.ask(workerActor, {
  type: 'EXECUTE_WORKER_TASK',
  payload: {
    taskType: WorkerTaskType.CPU_INTENSIVE,
    taskData: { iterations: 1000000 }
  }
});
```

#### IO密集型任务

适用于模拟IO操作，如网络请求、文件读写等：

```typescript
system.ask(workerActor, {
  type: 'EXECUTE_WORKER_TASK',
  payload: {
    taskType: WorkerTaskType.IO_INTENSIVE,
    taskData: { delayMs: 100 }
  }
});
```

#### 低延迟任务

适用于需要快速响应的简单任务：

```typescript
system.ask(workerActor, {
  type: 'EXECUTE_WORKER_TASK',
  payload: {
    taskType: WorkerTaskType.LOW_LATENCY,
    taskData: { value: 'quick computation' }
  }
});
```

#### 批处理任务

适用于批量处理数据：

```typescript
system.ask(workerActor, {
  type: 'EXECUTE_WORKER_TASK',
  payload: {
    taskType: WorkerTaskType.BATCH,
    taskData: { 
      items: [1, 2, 3, 4, 5],
      processingTimePerItem: 10 // 每项处理时间(ms)
    }
  }
});
```

#### 自定义任务

允许动态执行任意代码（注意安全风险）：

```typescript
system.ask(workerActor, {
  type: 'EXECUTE_WORKER_TASK',
  payload: {
    taskType: WorkerTaskType.CUSTOM,
    taskData: { 
      n: 20, // 参数
      functionCode: `
        // 可以访问data和context
        const fib = (n) => n <= 1 ? n : fib(n-1) + fib(n-2);
        return { result: fib(data.n) };
      `
    }
  }
});
```

### 4. 获取性能指标

```typescript
const metricsResponse = await system.ask(workerActor, {
  type: 'GET_WORKER_METRICS'
});

console.log('Worker性能指标:', metricsResponse.payload);
```

性能指标包括：
- 处理的任务总数
- 成功/失败的任务数
- 平均等待时间和处理时间
- 当前活动Worker数量
- 队列中等待的任务数
- 等等

### 5. 取消任务

```typescript
system.tell(workerActor, {
  type: 'CANCEL_WORKER_TASK',
  payload: {
    taskId: 'task-id-to-cancel'
  }
});
```

### 6. 关闭Worker池

```typescript
await system.ask(workerActor, {
  type: 'SHUTDOWN_WORKER_POOL'
});
```

## 最佳实践

1. **合适的场景**:
   - 使用Worker处理计算密集型任务，如数据处理、图像处理、复杂算法
   - 对于简单快速的任务，直接在主线程执行可能更有效率

2. **控制Worker数量**:
   - `minWorkers`设置为CPU核心数的一半
   - `maxWorkers`设置为CPU核心数的1-2倍
   - 过多的Worker会导致上下文切换开销增加

3. **避免频繁通信**:
   - 尽量批量发送数据，减少主线程和Worker间的通信次数
   - 大数据传输考虑使用SharedArrayBuffer（如果可用）

4. **任务超时**:
   - 总是设置合理的超时时间，避免任务无限阻塞

5. **异常处理**:
   - 确保在Worker中正确处理异常，避免整个线程崩溃

## 限制和注意事项

1. **实验性功能**: 基于Bun的Worker API，该API仍处于实验阶段，可能存在稳定性问题
2. **序列化开销**: 主线程和Worker之间传递的数据需要序列化和反序列化，对于大型数据可能有性能影响
3. **启动开销**: Worker线程创建有一定开销，不适合执行非常短暂的任务
4. **共享状态**: Worker之间以及与主线程之间不能直接共享状态，需要通过消息传递

## 性能基准测试

以下是不同类型任务在主线程和Worker线程中执行的性能对比(示例数据)：

| 任务类型 | 主线程 | Worker线程 | 提升 |
|---------|-------|------------|-----|
| CPU密集型 (1M次迭代) | 450ms | 170ms | 62% |
| IO密集型 (100ms延迟) | 105ms | 107ms | -2% |
| 批处理 (100项) | 520ms | 180ms | 65% |
| 并发任务 (10个) | 4200ms | 850ms | 80% |

## 调试技巧

1. 启用调试日志：
   ```typescript
   const workerActor = await system.spawn({
     actorClass: WorkerActor,
     actorContext: {
       workerPoolConfig: {
         // ...其他配置
         debug: true
       }
     }
   });
   ```

2. 检查Worker脚本错误：如果Worker脚本有语法错误或运行时错误，会在控制台显示错误信息

## 示例应用

以下是一个完整的使用Worker处理图像处理的示例：

```typescript
import { ActorSystem } from '../core/system';
import { WorkerActor, WorkerTaskType } from '../core/workers/worker-actor';

// 创建Actor系统和WorkerActor
const system = new ActorSystem();
await system.start();

const workerActor = await system.spawn({
  actorClass: WorkerActor,
  actorContext: {
    workerPoolConfig: {
      minWorkers: 4,
      maxWorkers: 8,
      workerScript: '/path/to/worker.ts'
    }
  }
});

// 图像处理任务
async function processImage(imageData) {
  return await system.ask(workerActor, {
    type: 'EXECUTE_WORKER_TASK',
    payload: {
      taskType: WorkerTaskType.CUSTOM,
      taskData: { 
        imageData,
        functionCode: `
          // 在这里实现图像处理算法
          const width = data.imageData.width;
          const height = data.imageData.height;
          const pixels = data.imageData.data;
          
          // 图像处理操作 (例如灰度转换)
          for(let i = 0; i < pixels.length; i += 4) {
            const avg = (pixels[i] + pixels[i+1] + pixels[i+2]) / 3;
            pixels[i] = avg;    // R
            pixels[i+1] = avg;  // G
            pixels[i+2] = avg;  // B
          }
          
          return { processedData: data.imageData };
        `
      }
    }
  });
}

// 使用
const result = await processImage({
  width: 1000,
  height: 800,
  data: new Uint8Array(1000 * 800 * 4) // RGBA像素数据
});

console.log('处理完成', result.payload.processedData);

// 最后关闭系统
await system.shutdown();
```

## 未来改进计划

1. 支持更多的任务类型和优化策略
2. 增加对SharedArrayBuffer的支持，提高数据传输效率
3. 实现任务依赖管理，支持复杂的任务流程
4. 提供更详细的性能分析工具

## 贡献指南

欢迎对Worker模块进行改进！如果想要贡献代码：

1. 确保您的代码通过所有现有测试
2. 为新功能添加测试
3. 更新相关文档
4. 提交PR并描述您的更改

## 许可证

与主项目许可证相同 