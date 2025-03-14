/**
 * Worker功能使用示例
 * 
 * 这个示例展示了如何使用Bactor的Worker功能来执行CPU密集型和IO密集型任务。
 */

import { ActorSystem } from '../packages/core/src/core/system';
import { WorkerActor, WorkerTaskType } from '../packages/core/src/core/workers/worker-actor';
import path from 'path';

async function runWorkerExample() {
    console.log('启动Worker示例...');

    // 创建Actor系统
    const system = new ActorSystem();
    await system.start();
    console.log('Actor系统已启动');

    // 创建WorkerActor
    const workerActorPID = await system.spawn({
        actorClass: WorkerActor,
        actorContext: {
            workerPoolConfig: {
                minWorkers: 2,
                maxWorkers: 4,
                idleTimeoutMs: 30000,
                workerScript: path.resolve(__dirname, '../packages/core/src/core/workers/worker.ts'),
                useSmol: false
            }
        }
    });

    console.log(`已创建WorkerActor: ${workerActorPID.id}`);

    try {
        // 等待Worker初始化
        await new Promise(resolve => setTimeout(resolve, 1000));

        // 1. 执行CPU密集型任务
        console.log('执行CPU密集型任务...');
        const cpuResult = await system.ask(workerActorPID, {
            type: 'EXECUTE_WORKER_TASK',
            payload: {
                taskType: WorkerTaskType.CPU_INTENSIVE,
                taskData: {
                    iterations: 1000000,
                    complexity: 'medium'
                },
                priority: 0
            }
        });

        console.log('CPU任务结果:', cpuResult);

        // 2. 执行IO密集型任务
        console.log('执行IO密集型任务...');
        const ioResult = await system.ask(workerActorPID, {
            type: 'EXECUTE_WORKER_TASK',
            payload: {
                taskType: WorkerTaskType.IO_INTENSIVE,
                taskData: {
                    operations: 5,
                    delayMs: 100
                },
                priority: 0
            }
        });

        console.log('IO任务结果:', ioResult);

        // 3. 获取Worker性能指标
        console.log('获取Worker性能指标...');
        const metrics = await system.ask(workerActorPID, {
            type: 'GET_WORKER_METRICS'
        });

        console.log('Worker性能指标:', metrics);

        // 4. 并发任务测试
        console.log('执行并发任务测试...');
        const concurrentTasks = [];

        for (let i = 0; i < 5; i++) {
            concurrentTasks.push(
                system.ask(workerActorPID, {
                    type: 'EXECUTE_WORKER_TASK',
                    payload: {
                        taskType: i % 2 === 0 ? WorkerTaskType.CPU_INTENSIVE : WorkerTaskType.IO_INTENSIVE,
                        taskData: i % 2 === 0
                            ? { iterations: 500000, complexity: 'low' }
                            : { operations: 3, delayMs: 50 },
                        priority: i
                    }
                })
            );
        }

        const concurrentResults = await Promise.all(concurrentTasks);
        console.log(`已完成 ${concurrentResults.length} 个并发任务`);

        // 关闭Worker池
        console.log('关闭Worker池...');
        await system.ask(workerActorPID, {
            type: 'SHUTDOWN_WORKER_POOL'
        });

        console.log('Worker池已关闭');
    } catch (error) {
        console.error('Worker示例执行错误:', error);
    } finally {
        // 关闭Actor系统
        await system.shutdown();
        console.log('Actor系统已关闭');
    }
}

// 运行示例
if (require.main === module) {
    runWorkerExample().catch(console.error);
}

export { runWorkerExample }; 