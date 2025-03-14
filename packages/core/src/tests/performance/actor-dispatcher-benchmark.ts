import { Actor } from '../../core/actor';
import { ActorContext } from '../../core/context';
import { Props } from '../../core/types';
import { ActorSystem } from '../../core/system';
import { LayeredDispatcher, TaskType, TaskPriority } from '../../core/dispatcher/layered-dispatcher';
import { AdaptiveScheduler } from '../../core/dispatcher/adaptive-scheduler';
import { MessageDispatcher } from '../../core/interfaces';
import { LockFreeQueue } from '../../core/concurrent/lock-free-queue';
import { v4 as uuidv4 } from 'uuid';
import { PID, Message } from '@bactor/common';
import { LockFreeMailbox } from '../../core/concurrent/lock-free-mailbox';

// 测试配置
interface TestConfig {
    actorCount: number;
    messagesPerActor: number;
    cpuWorkload: number; // 0-1, CPU密集型actor的比例
    ioWorkload: number;  // 0-1, IO密集型actor的比例
    burstiness: number;  // 0-1, 突发程度，越高消息越集中发送
    dispatcherType: 'default' | 'layered' | 'adaptive';
    mailboxType?: 'default' | 'lockfree'; // 添加mailbox类型
}

// 消息类型
enum MessageType {
    CPU_INTENSIVE = 'cpu_intensive',
    IO_INTENSIVE = 'io_intensive',
    LOW_LATENCY = 'low_latency',
    BATCH = 'batch',
    GET_STATS = 'get_stats'
}

// CPU密集型消息
interface CpuIntensiveMessage extends Message {
    type: MessageType.CPU_INTENSIVE;
    iterations: number;
    requestId: string;
    sendTime: number;
}

// IO密集型消息
interface IoIntensiveMessage extends Message {
    type: MessageType.IO_INTENSIVE;
    delayMs: number;
    requestId: string;
    sendTime: number;
}

// 低延迟消息
interface LowLatencyMessage extends Message {
    type: MessageType.LOW_LATENCY;
    value: any;
    requestId: string;
    sendTime: number;
}

// 批处理消息
interface BatchMessage extends Message {
    type: MessageType.BATCH;
    items: any[];
    requestId: string;
    sendTime: number;
}

// 获取统计信息消息
interface GetStatsMessage extends Message {
    type: MessageType.GET_STATS;
    responseId?: string;
}

// 消息联合类型
type ActorTestMessage =
    | CpuIntensiveMessage
    | IoIntensiveMessage
    | LowLatencyMessage
    | BatchMessage
    | GetStatsMessage;

// 测试结果
interface BenchmarkResult {
    totalMessages: number;
    processedMessages: number;
    messagesPerSecond: number;
    avgResponseTime: number;
    responseTimeByType: Record<MessageType, number>;
    messageCountByType: Record<MessageType, number>;
    peakMailboxSize: number;
    testDurationMs: number;
    config: TestConfig;
}

// 工作Actor实现
class WorkerActor extends Actor {
    private processedCount = 0;
    private responseTimes: number[] = [];
    private responseTimesByType: Record<MessageType, number[]> = {
        [MessageType.CPU_INTENSIVE]: [],
        [MessageType.IO_INTENSIVE]: [],
        [MessageType.LOW_LATENCY]: [],
        [MessageType.BATCH]: [],
        [MessageType.GET_STATS]: []
    };
    private peakMailboxSize = 0;
    private currentMailboxSize = 0;

    // 定义Actor行为
    protected behaviors(): void {
        // 添加默认行为处理器
        this.addBehavior('default', async (message: Message): Promise<any> => {
            // 更新mailbox大小统计
            this.currentMailboxSize++;
            this.peakMailboxSize = Math.max(this.peakMailboxSize, this.currentMailboxSize);

            const typedMessage = message as ActorTestMessage;
            const messageType = (typedMessage as any).type;

            if (messageType === MessageType.GET_STATS) {
                // 处理获取统计信息的请求
                const statsMessage = typedMessage as GetStatsMessage;
                const stats = this.getStats();

                if (statsMessage.responseId) {
                    // 如果有responseId，回复统计信息
                    return stats;
                }
                return;
            }

            const startTime = performance.now();
            const responseTime = startTime - (typedMessage as any).sendTime;

            // 根据消息类型执行不同逻辑
            switch (messageType) {
                case MessageType.CPU_INTENSIVE:
                    await this.processCpuIntensiveTask(typedMessage as CpuIntensiveMessage);
                    break;

                case MessageType.IO_INTENSIVE:
                    await this.processIoIntensiveTask(typedMessage as IoIntensiveMessage);
                    break;

                case MessageType.LOW_LATENCY:
                    await this.processLowLatencyTask(typedMessage as LowLatencyMessage);
                    break;

                case MessageType.BATCH:
                    await this.processBatchTask(typedMessage as BatchMessage);
                    break;
            }

            // 记录处理时间
            this.responseTimes.push(responseTime);
            if (messageType in this.responseTimesByType) {
                this.responseTimesByType[messageType as keyof typeof this.responseTimesByType].push(responseTime);
            }
            this.processedCount++;
            this.currentMailboxSize--;
        });
    }

    // CPU密集型任务处理
    private async processCpuIntensiveTask(message: CpuIntensiveMessage): Promise<void> {
        let sum = 0;
        for (let i = 0; i < message.iterations; i++) {
            sum += Math.sin(i) * Math.cos(i);
        }
        return Promise.resolve();
    }

    // IO密集型任务处理
    private async processIoIntensiveTask(message: IoIntensiveMessage): Promise<void> {
        return new Promise(resolve => setTimeout(resolve, message.delayMs));
    }

    // 低延迟任务处理
    private async processLowLatencyTask(message: LowLatencyMessage): Promise<void> {
        // 模拟快速处理
        return Promise.resolve();
    }

    // 批处理任务处理
    private async processBatchTask(message: BatchMessage): Promise<void> {
        // 模拟批处理
        await new Promise(resolve => setTimeout(resolve, message.items.length * 2));
        return Promise.resolve();
    }

    // 获取统计信息
    private getStats(): {
        processedCount: number;
        avgResponseTime: number;
        responseTimesByType: Record<MessageType, number[]>;
        peakMailboxSize: number;
    } {
        const avgResponseTime = this.responseTimes.length > 0
            ? this.responseTimes.reduce((a, b) => a + b, 0) / this.responseTimes.length
            : 0;

        return {
            processedCount: this.processedCount,
            avgResponseTime,
            responseTimesByType: this.responseTimesByType,
            peakMailboxSize: this.peakMailboxSize
        };
    }
}

// 创建调度器
function createDispatcher(type: 'default' | 'layered' | 'adaptive'): MessageDispatcher | undefined {
    switch (type) {
        case 'layered':
            return new LayeredDispatcher({
                concurrencyLimits: {
                    [TaskType.CPU_INTENSIVE]: 4,
                    [TaskType.IO_INTENSIVE]: 20,
                    [TaskType.LOW_LATENCY]: 8,
                    [TaskType.BATCH]: 2,
                    [TaskType.DEFAULT]: 8
                },
                metricsCollectionIntervalMs: 1000,
                debug: false
            });

        case 'adaptive':
            return new AdaptiveScheduler({
                adaptationIntervalMs: 1000,
                metricsCollectionIntervalMs: 500,
                minConcurrency: {
                    [TaskType.CPU_INTENSIVE]: 2,
                    [TaskType.IO_INTENSIVE]: 10,
                    [TaskType.LOW_LATENCY]: 4,
                    [TaskType.BATCH]: 1,
                    [TaskType.DEFAULT]: 4
                },
                maxConcurrency: {
                    [TaskType.CPU_INTENSIVE]: 8,
                    [TaskType.IO_INTENSIVE]: 30,
                    [TaskType.LOW_LATENCY]: 16,
                    [TaskType.BATCH]: 4,
                    [TaskType.DEFAULT]: 16
                },
                debug: false
            });

        case 'default':
        default:
            // 使用系统默认调度器
            return undefined;
    }
}

// 创建Props并使用指定调度器
function createActorProps(dispatcherType: 'default' | 'layered' | 'adaptive', mailboxType: 'default' | 'lockfree' = 'default'): Props {
    const dispatcher = createDispatcher(dispatcherType);

    // 使用Props API创建Props
    const props: Props = {
        actorClass: WorkerActor,
        dispatcher: dispatcher
    };

    // 根据配置设置mailbox类型
    if (mailboxType === 'lockfree') {
        props.mailboxType = LockFreeMailbox;
    }

    return props;
}

// 生成随机消息
function generateRandomMessage(cpuRatio: number, ioRatio: number): ActorTestMessage {
    const rand = Math.random();
    const timestamp = performance.now();
    const requestId = uuidv4();

    if (rand < cpuRatio) {
        return {
            type: MessageType.CPU_INTENSIVE,
            iterations: 50000 + Math.floor(Math.random() * 50000),
            requestId,
            sendTime: timestamp
        };
    } else if (rand < cpuRatio + ioRatio) {
        return {
            type: MessageType.IO_INTENSIVE,
            delayMs: 50 + Math.floor(Math.random() * 100),
            requestId,
            sendTime: timestamp
        };
    } else if (rand < cpuRatio + ioRatio + 0.2) {
        return {
            type: MessageType.BATCH,
            items: Array(10 + Math.floor(Math.random() * 90)).fill(0),
            requestId,
            sendTime: timestamp
        };
    } else {
        return {
            type: MessageType.LOW_LATENCY,
            value: Math.random(),
            requestId,
            sendTime: timestamp
        };
    }
}

// 运行基准测试
async function runBenchmark(config: TestConfig): Promise<BenchmarkResult> {
    console.log(`开始测试：${config.dispatcherType} 调度器，${config.mailboxType || 'default'} 邮箱，${config.actorCount}个Actor，每个${config.messagesPerActor}条消息`);
    console.log(`负载比例 - CPU: ${config.cpuWorkload * 100}%, IO: ${config.ioWorkload * 100}%, 突发度: ${config.burstiness * 100}%`);

    // 创建Actor系统
    const system = new ActorSystem("benchmark-system");

    // 创建Actor
    const actors: PID[] = [];
    for (let i = 0; i < config.actorCount; i++) {
        const actor = await system.spawn(
            createActorProps(config.dispatcherType, config.mailboxType)
        );
        actors.push(actor);
    }

    const totalMessages = config.actorCount * config.messagesPerActor;
    let sentMessages = 0;

    const startTime = performance.now();

    // 分批发送消息
    const batchCount = config.burstiness < 0.3 ? 10 : (config.burstiness < 0.7 ? 5 : 2);
    const messagesPerBatch = Math.ceil(config.messagesPerActor / batchCount);

    // 发送所有消息
    const sendPromises: Promise<void>[] = [];

    for (let batchIndex = 0; batchIndex < batchCount; batchIndex++) {
        // 添加随机延迟，模拟真实场景中的消息到达模式
        const batchDelay = batchIndex * (Math.random() * 200 + 50);

        const batchPromise = new Promise<void>(resolve => {
            setTimeout(() => {
                for (let i = 0; i < config.actorCount; i++) {
                    const actor = actors[i];
                    for (let j = 0; j < messagesPerBatch; j++) {
                        if ((batchIndex * messagesPerBatch + j) < config.messagesPerActor) {
                            const message = generateRandomMessage(config.cpuWorkload, config.ioWorkload);
                            system.send(actor, message);
                            sentMessages++;
                        }
                    }
                }
                resolve();
            }, batchDelay);
        });

        sendPromises.push(batchPromise);
    }

    // 等待所有消息发送完成
    await Promise.all(sendPromises);

    // 等待消息处理完成（给一个足够长的时间）
    await new Promise(resolve => setTimeout(resolve, 10000));

    const endTime = performance.now();
    const testDuration = endTime - startTime;

    // 收集统计信息
    const stats = await Promise.all(
        actors.map(actor => {
            const msg: GetStatsMessage = {
                type: MessageType.GET_STATS,
                responseId: uuidv4()
            };
            return system.request(actor, msg);
        })
    );

    // 汇总结果
    let totalProcessed = 0;
    let totalResponseTime = 0;
    let maxMailboxSize = 0;
    const responseTimesByType: Record<MessageType, number[]> = {
        [MessageType.CPU_INTENSIVE]: [],
        [MessageType.IO_INTENSIVE]: [],
        [MessageType.LOW_LATENCY]: [],
        [MessageType.BATCH]: [],
        [MessageType.GET_STATS]: []
    };

    stats.forEach(actorStats => {
        totalProcessed += actorStats.processedCount;
        totalResponseTime += actorStats.avgResponseTime * actorStats.processedCount;
        maxMailboxSize = Math.max(maxMailboxSize, actorStats.peakMailboxSize);

        // 合并各类型响应时间
        Object.entries(actorStats.responseTimesByType).forEach(([type, times]) => {
            const messageType = type as unknown as MessageType;
            if (times && Array.isArray(times)) {
                responseTimesByType[messageType].push(...times);
            }
        });
    });

    // 计算各类型平均响应时间和消息数
    const avgResponseTimeByType: Record<MessageType, number> = {
        [MessageType.CPU_INTENSIVE]: 0,
        [MessageType.IO_INTENSIVE]: 0,
        [MessageType.LOW_LATENCY]: 0,
        [MessageType.BATCH]: 0,
        [MessageType.GET_STATS]: 0
    };

    const messageCountByType: Record<MessageType, number> = {
        [MessageType.CPU_INTENSIVE]: 0,
        [MessageType.IO_INTENSIVE]: 0,
        [MessageType.LOW_LATENCY]: 0,
        [MessageType.BATCH]: 0,
        [MessageType.GET_STATS]: 0
    };

    Object.entries(responseTimesByType).forEach(([type, times]) => {
        const messageType = type as unknown as MessageType;
        messageCountByType[messageType] = times.length;
        if (times.length > 0) {
            avgResponseTimeByType[messageType] =
                times.reduce((sum, time) => sum + time, 0) / times.length;
        }
    });

    // 计算整体平均响应时间
    const avgResponseTime = totalProcessed > 0
        ? totalResponseTime / totalProcessed
        : 0;

    // 计算吞吐量
    const messagesPerSecond = totalProcessed / (testDuration / 1000);

    // 关闭Actor系统 - 注意：此系统可能没有terminate方法
    // 此处我们跳过关闭过程，在真实环境中应考虑资源回收

    const result: BenchmarkResult = {
        totalMessages: sentMessages,
        processedMessages: totalProcessed,
        messagesPerSecond,
        avgResponseTime,
        responseTimeByType: avgResponseTimeByType,
        messageCountByType,
        peakMailboxSize: maxMailboxSize,
        testDurationMs: testDuration,
        config
    };

    return result;
}

// 格式化结果输出
function formatBenchmarkResult(result: BenchmarkResult): string {
    const completion = ((result.processedMessages / result.totalMessages) * 100).toFixed(2);

    return `
调度器: ${result.config.dispatcherType}
邮箱类型: ${result.config.mailboxType || 'default'}
总消息数: ${result.totalMessages}
已处理消息: ${result.processedMessages} (${completion}%)
吞吐量: ${result.messagesPerSecond.toFixed(2)} 消息/秒
平均响应时间: ${result.avgResponseTime.toFixed(2)} ms
峰值邮箱大小: ${result.peakMailboxSize}
测试时长: ${result.testDurationMs.toFixed(2)} ms

响应时间(ms)/消息数统计:
  CPU密集型: ${result.responseTimeByType[MessageType.CPU_INTENSIVE].toFixed(2)} ms (${result.messageCountByType[MessageType.CPU_INTENSIVE]})
  IO密集型: ${result.responseTimeByType[MessageType.IO_INTENSIVE].toFixed(2)} ms (${result.messageCountByType[MessageType.IO_INTENSIVE]})
  低延迟: ${result.responseTimeByType[MessageType.LOW_LATENCY].toFixed(2)} ms (${result.messageCountByType[MessageType.LOW_LATENCY]})
  批处理: ${result.responseTimeByType[MessageType.BATCH].toFixed(2)} ms (${result.messageCountByType[MessageType.BATCH]})
`;
}

// 比较不同调度器的结果
function compareResults(defaultResult: BenchmarkResult, layeredResult: BenchmarkResult, adaptiveResult: BenchmarkResult): string {
    // 计算性能比率
    const layeredVsDefault = {
        throughput: layeredResult.messagesPerSecond / defaultResult.messagesPerSecond,
        responseTime: defaultResult.avgResponseTime / layeredResult.avgResponseTime,
        lowLatencyResponseTime: defaultResult.responseTimeByType[MessageType.LOW_LATENCY] /
            layeredResult.responseTimeByType[MessageType.LOW_LATENCY]
    };

    const adaptiveVsDefault = {
        throughput: adaptiveResult.messagesPerSecond / defaultResult.messagesPerSecond,
        responseTime: defaultResult.avgResponseTime / adaptiveResult.avgResponseTime,
        lowLatencyResponseTime: defaultResult.responseTimeByType[MessageType.LOW_LATENCY] /
            adaptiveResult.responseTimeByType[MessageType.LOW_LATENCY]
    };

    const adaptiveVsLayered = {
        throughput: adaptiveResult.messagesPerSecond / layeredResult.messagesPerSecond,
        responseTime: layeredResult.avgResponseTime / adaptiveResult.avgResponseTime,
        lowLatencyResponseTime: layeredResult.responseTimeByType[MessageType.LOW_LATENCY] /
            adaptiveResult.responseTimeByType[MessageType.LOW_LATENCY]
    };

    return `
性能对比:

LayeredDispatcher vs 默认调度器:
  吞吐量比: ${layeredVsDefault.throughput.toFixed(2)}x
  响应时间比: ${layeredVsDefault.responseTime.toFixed(2)}x
  低延迟任务响应时间比: ${layeredVsDefault.lowLatencyResponseTime.toFixed(2)}x

AdaptiveScheduler vs 默认调度器:
  吞吐量比: ${adaptiveVsDefault.throughput.toFixed(2)}x
  响应时间比: ${adaptiveVsDefault.responseTime.toFixed(2)}x
  低延迟任务响应时间比: ${adaptiveVsDefault.lowLatencyResponseTime.toFixed(2)}x

AdaptiveScheduler vs LayeredDispatcher:
  吞吐量比: ${adaptiveVsLayered.throughput.toFixed(2)}x
  响应时间比: ${adaptiveVsLayered.responseTime.toFixed(2)}x
  低延迟任务响应时间比: ${adaptiveVsLayered.lowLatencyResponseTime.toFixed(2)}x
`;
}

// 主函数：运行所有测试场景
async function runAllBenchmarks() {
    // 测试场景1：中等规模，平衡负载
    const config1: TestConfig = {
        actorCount: 50,
        messagesPerActor: 100,
        cpuWorkload: 0.3,
        ioWorkload: 0.3,
        burstiness: 0.3,
        dispatcherType: 'default'
    };

    // 测试场景2：高并发，IO密集
    const config2: TestConfig = {
        actorCount: 100,
        messagesPerActor: 100,
        cpuWorkload: 0.2,
        ioWorkload: 0.6,
        burstiness: 0.5,
        dispatcherType: 'default'
    };

    // 测试场景3：突发负载
    const config3: TestConfig = {
        actorCount: 80,
        messagesPerActor: 80,
        cpuWorkload: 0.4,
        ioWorkload: 0.3,
        burstiness: 0.8,
        dispatcherType: 'default'
    };

    // 运行所有测试场景
    console.log("开始Actor与调度器集成性能测试...");

    console.log("\n====== 场景1: 中等规模，平衡负载 ======");

    // 默认调度器
    const defaultResult1 = await runBenchmark({ ...config1, dispatcherType: 'default' });
    console.log(formatBenchmarkResult(defaultResult1));

    // 分层调度器
    const layeredResult1 = await runBenchmark({ ...config1, dispatcherType: 'layered' });
    console.log(formatBenchmarkResult(layeredResult1));

    // 自适应调度器
    const adaptiveResult1 = await runBenchmark({ ...config1, dispatcherType: 'adaptive' });
    console.log(formatBenchmarkResult(adaptiveResult1));

    // 无锁邮箱 + 自适应调度器
    const lockfreeAdaptiveResult1 = await runBenchmark({ ...config1, dispatcherType: 'adaptive', mailboxType: 'lockfree' });
    console.log(formatBenchmarkResult(lockfreeAdaptiveResult1));

    // 比较结果
    console.log(compareResults(defaultResult1, layeredResult1, adaptiveResult1));
    console.log("\n无锁邮箱与自适应调度器组合 vs 默认调度器:");
    console.log(`  吞吐量比: ${(lockfreeAdaptiveResult1.messagesPerSecond / defaultResult1.messagesPerSecond).toFixed(2)}x`);
    console.log(`  响应时间比: ${(defaultResult1.avgResponseTime / lockfreeAdaptiveResult1.avgResponseTime).toFixed(2)}x`);

    console.log("\n====== 场景2: 高并发，IO密集 ======");

    // 默认调度器
    const defaultResult2 = await runBenchmark({ ...config2, dispatcherType: 'default' });
    console.log(formatBenchmarkResult(defaultResult2));

    // 分层调度器
    const layeredResult2 = await runBenchmark({ ...config2, dispatcherType: 'layered' });
    console.log(formatBenchmarkResult(layeredResult2));

    // 自适应调度器
    const adaptiveResult2 = await runBenchmark({ ...config2, dispatcherType: 'adaptive' });
    console.log(formatBenchmarkResult(adaptiveResult2));

    // 无锁邮箱 + 自适应调度器
    const lockfreeAdaptiveResult2 = await runBenchmark({ ...config2, dispatcherType: 'adaptive', mailboxType: 'lockfree' });
    console.log(formatBenchmarkResult(lockfreeAdaptiveResult2));

    // 比较结果
    console.log(compareResults(defaultResult2, layeredResult2, adaptiveResult2));
    console.log("\n无锁邮箱与自适应调度器组合 vs 默认调度器:");
    console.log(`  吞吐量比: ${(lockfreeAdaptiveResult2.messagesPerSecond / defaultResult2.messagesPerSecond).toFixed(2)}x`);
    console.log(`  响应时间比: ${(defaultResult2.avgResponseTime / lockfreeAdaptiveResult2.avgResponseTime).toFixed(2)}x`);

    console.log("\n====== 场景3: 突发负载 ======");

    // 默认调度器
    const defaultResult3 = await runBenchmark({ ...config3, dispatcherType: 'default' });
    console.log(formatBenchmarkResult(defaultResult3));

    // 分层调度器
    const layeredResult3 = await runBenchmark({ ...config3, dispatcherType: 'layered' });
    console.log(formatBenchmarkResult(layeredResult3));

    // 自适应调度器
    const adaptiveResult3 = await runBenchmark({ ...config3, dispatcherType: 'adaptive' });
    console.log(formatBenchmarkResult(adaptiveResult3));

    // 无锁邮箱 + 自适应调度器
    const lockfreeAdaptiveResult3 = await runBenchmark({ ...config3, dispatcherType: 'adaptive', mailboxType: 'lockfree' });
    console.log(formatBenchmarkResult(lockfreeAdaptiveResult3));

    // 比较结果
    console.log(compareResults(defaultResult3, layeredResult3, adaptiveResult3));
    console.log("\n无锁邮箱与自适应调度器组合 vs 默认调度器:");
    console.log(`  吞吐量比: ${(lockfreeAdaptiveResult3.messagesPerSecond / defaultResult3.messagesPerSecond).toFixed(2)}x`);
    console.log(`  响应时间比: ${(defaultResult3.avgResponseTime / lockfreeAdaptiveResult3.avgResponseTime).toFixed(2)}x`);

    console.log("\n所有测试完成！");
}

// 执行所有测试
runAllBenchmarks().catch(console.error); 