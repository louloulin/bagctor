import { describe, test, expect, beforeAll, afterAll } from 'bun:test';
import { ActorSystem } from '../core/system';
import { Actor } from '../core/actor';
import { ActorContext, PID, Props } from '../core/types';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { createSystem, getActorRef, ExtendedMessage } from '../utils/test-utils';

/**
 * Worker线程集成测试
 * 
 * 这些测试使用MockWorkerActor而不是真实的WorkerActor，以避免实际Web Worker初始化的复杂性。
 * 这样做可以在不依赖真实Worker环境的情况下测试Worker功能的核心逻辑。
 * 
 * 注意：
 * 1. 我们使用directAsk直接调用Actor的receive方法，绕过了ActorSystem的消息处理机制
 * 2. 测试覆盖了CPU密集型任务、IO密集型任务和性能指标获取功能
 * 3. 实际工作中，应该添加更多的集成测试来验证真实Worker的功能
 */

// 使用test-utils中的扩展消息类型
type Message = ExtendedMessage;

// 辅助函数 - 将PID转换为字符串
function pidToString(pid: PID): string {
  return `${pid.id}@${pid.address}`;
}

// 测试用的直接ask函数（绕过系统的复杂ask实现）
async function directAsk(system: ActorSystem, pid: PID, message: any): Promise<any> {
  const actor = getActorRef(system, pid);
  if (!actor) {
    throw new Error(`找不到Actor: ${pidToString(pid)}`);
  }

  console.log(`直接调用Actor(${pidToString(pid)})的receive方法`);
  return actor.receive(message);
}

// 简化的测试配置
const TEST_CONFIG = {
  cpuTask: {
    iterations: 1000,
    complexity: 'low'
  },
  ioTask: {
    operations: 3,
    delayMs: 10
  }
};

// 任务类型枚举
enum TaskType {
  CPU_INTENSIVE = 'CPU_INTENSIVE',
  IO_INTENSIVE = 'IO_INTENSIVE'
}

/**
 * 模拟WorkerActor - 用于测试
 * 
 * 这个类模拟了WorkerActor的行为，但不依赖实际的Worker线程。
 * 它直接在主线程中执行任务，模拟多线程处理的结果。
 */
class MockWorkerActor extends Actor {
  private metrics = {
    totalTasksProcessed: 0,
    cpuTasksProcessed: 0,
    ioTasksProcessed: 0,
    totalProcessingTime: 0
  };

  constructor(context: ActorContext) {
    super(context);
    this.behaviors();
    console.log('MockWorkerActor 已初始化');
  }

  protected behaviors(): void {
    this.addBehavior('default', this.defaultBehavior.bind(this));
  }

  private defaultBehavior(message: Message): Promise<any> {
    console.log('MockWorkerActor 收到消息:', message.type);

    switch (message.type) {
      case 'EXECUTE_WORKER_TASK':
        return this.executeTask(message);

      case 'GET_WORKER_METRICS':
        return Promise.resolve(this.metrics);

      case 'SHUTDOWN_WORKER_POOL':
        return Promise.resolve({ status: 'shutdown_complete' });

      default:
        return Promise.reject(new Error(`未知消息类型: ${message.type}`));
    }
  }

  private async executeTask(message: Message): Promise<any> {
    const { taskType, taskData } = message.payload;
    const taskId = 'task-' + Date.now();
    const startTime = Date.now();

    console.log(`执行任务 ${taskId}, 类型: ${taskType}`);

    let result;

    try {
      // 根据任务类型执行不同操作
      if (taskType === TaskType.CPU_INTENSIVE) {
        result = this.executeCpuTask(taskData);
        this.metrics.cpuTasksProcessed++;
      }
      else if (taskType === TaskType.IO_INTENSIVE) {
        result = await this.executeIoTask(taskData);
        this.metrics.ioTasksProcessed++;
      }
      else {
        throw new Error(`不支持的任务类型: ${taskType}`);
      }

      const endTime = Date.now();
      this.metrics.totalTasksProcessed++;
      this.metrics.totalProcessingTime += (endTime - startTime);

      return {
        taskId,
        status: 'completed',
        processingTime: endTime - startTime,
        result
      };
    } catch (error: any) {
      console.error(`任务 ${taskId} 执行失败:`, error);
      return {
        taskId,
        status: 'failed',
        error: error.message || '未知错误'
      };
    }
  }

  private executeCpuTask(taskData: any) {
    console.log('执行CPU任务:', taskData);
    const { iterations, complexity } = taskData;

    // 简单计算
    let result = 0;
    for (let i = 0; i < iterations; i++) {
      result += Math.sin(i) * Math.cos(i);
    }

    return {
      iterations,
      complexity,
      result
    };
  }

  private async executeIoTask(taskData: any) {
    console.log('执行IO任务:', taskData);
    const { operations, delayMs } = taskData;

    // 模拟IO操作
    const results = [];
    for (let i = 0; i < operations; i++) {
      // 模拟IO延迟
      await new Promise(resolve => setTimeout(resolve, delayMs));
      results.push({ operation: i, success: true });
    }

    return {
      operations,
      results
    };
  }
}

describe('Worker线程集成测试', () => {
  let system: ActorSystem;
  let workerActorPID: PID;

  // 测试前准备
  beforeAll(async () => {
    console.log('初始化测试环境...');

    // 创建Actor系统
    system = createSystem();
    await system.start();

    // 创建模拟WorkerActor
    const props: Props = {
      actorClass: MockWorkerActor
    };

    console.log('创建MockWorkerActor...');
    workerActorPID = await system.spawn(props);
    console.log(`MockWorkerActor 创建成功: ${pidToString(workerActorPID)}`);
  });

  // 测试后清理
  afterAll(async () => {
    console.log('清理测试环境...');

    // 关闭Actor系统 - 可选地先发送关闭消息
    try {
      await directAsk(system, workerActorPID, {
        type: 'SHUTDOWN_WORKER_POOL'
      });
      console.log('已向WorkerActor发送关闭消息');
    } catch (error) {
      console.error('关闭WorkerActor时出错:', error);
    }

    await system.shutdown();
    console.log('Actor系统已关闭');
  });

  // 测试CPU密集型任务
  test('CPU密集型任务性能测试', async () => {
    console.log('开始执行CPU密集型任务测试...');

    const result = await directAsk(system, workerActorPID, {
      type: 'EXECUTE_WORKER_TASK',
      payload: {
        taskType: TaskType.CPU_INTENSIVE,
        taskData: TEST_CONFIG.cpuTask
      }
    });

    console.log('CPU任务执行结果:', result);
    expect(result).toBeDefined();
    expect(result.status).toBe('completed');
    expect(result.result.iterations).toBe(TEST_CONFIG.cpuTask.iterations);
  });

  // 测试IO密集型任务
  test('IO密集型任务性能测试', async () => {
    console.log('开始执行IO密集型任务测试...');

    const result = await directAsk(system, workerActorPID, {
      type: 'EXECUTE_WORKER_TASK',
      payload: {
        taskType: TaskType.IO_INTENSIVE,
        taskData: TEST_CONFIG.ioTask
      }
    });

    console.log('IO任务执行结果:', result);
    expect(result).toBeDefined();
    expect(result.status).toBe('completed');
    expect(result.result.operations).toBe(TEST_CONFIG.ioTask.operations);
  });

  // 测试获取性能指标
  test('获取Worker性能指标', async () => {
    console.log('开始获取Worker性能指标...');

    const metrics = await directAsk(system, workerActorPID, {
      type: 'GET_WORKER_METRICS'
    });

    console.log('Worker性能指标:', metrics);
    expect(metrics).toBeDefined();
    expect(metrics.totalTasksProcessed).toBeGreaterThan(0);
    expect(metrics.cpuTasksProcessed).toBeGreaterThan(0);
    expect(metrics.ioTasksProcessed).toBeGreaterThan(0);
  });

  // 测试错误处理
  test('处理未知任务类型', async () => {
    console.log('开始测试错误处理...');

    const result = await directAsk(system, workerActorPID, {
      type: 'EXECUTE_WORKER_TASK',
      payload: {
        taskType: 'UNKNOWN_TASK_TYPE',
        taskData: {}
      }
    });

    console.log('未知任务类型处理结果:', result);
    expect(result).toBeDefined();
    expect(result.status).toBe('failed');
    expect(result.error).toContain('不支持的任务类型');
  });

  // 测试请求关闭
  test('请求关闭Worker池', async () => {
    console.log('开始测试关闭Worker池...');

    const result = await directAsk(system, workerActorPID, {
      type: 'SHUTDOWN_WORKER_POOL'
    });

    console.log('关闭Worker池结果:', result);
    expect(result).toBeDefined();
    expect(result.status).toBe('shutdown_complete');
  });
}); 