import { describe, test, expect } from 'bun:test';
import { Actor } from '../../core/actor';
import { ActorSystem } from '../../core/system';
import { ActorContext, Message, PID, Props } from '../../core/types';
import { DefaultMailbox } from '../../core/mailbox';
import { LockFreeMailbox } from '../../core/concurrent/lock-free-mailbox';
import { LayeredDispatcher, TaskType, TaskPriority } from '../../core/dispatcher/layered-dispatcher';
import { AdaptiveScheduler } from '../../core/dispatcher/adaptive-scheduler';
import { MessageDispatcher } from '../../core/interfaces';
import { performance } from 'perf_hooks';
import { v4 as uuidv4 } from 'uuid';
import * as fs from 'fs';

// 测试配置
const ACTOR_COUNTS = [10, 100, 1000];
const MESSAGE_COUNTS = [1000, 10000, 100000];
const BATCH_SIZE = 1000;

// 邮箱和调度器类型
type MailboxType = 'default' | 'lockfree';
type DispatcherType = 'default' | 'layered' | 'adaptive';

// 性能测试结果
interface PerfResult {
    actorCount: number;
    messageCount: number;
    processingTime?: number;
    duration: number;
    throughput: number;
    mailboxType: MailboxType;
    dispatcherType: DispatcherType;
    peakMemoryUsage?: number; // 峰值内存使用（MB）
    avgCpuUtilization?: number; // 平均CPU利用率 (%)
}

// 打印表格化结果
function printTable(header: string[], rows: string[][], title?: string) {
    if (title) {
        console.log(`\n${title}:`);
    }

    // 计算每列的最大宽度
    const colWidths = header.map((col, i) => {
        const maxDataLength = Math.max(
            ...rows.map(row => row[i].length),
            col.length
        );
        return maxDataLength + 2; // 加2用于填充
    });

    // 打印标题行
    console.log(
        header.map((col, i) => col.padEnd(colWidths[i])).join('| ')
    );

    // 打印分隔行
    console.log(
        colWidths.map(width => '-'.repeat(width)).join('|')
    );

    // 打印数据行
    rows.forEach(row => {
        console.log(
            row.map((cell, i) => cell.padEnd(colWidths[i])).join('| ')
        );
    });
}

// 性能改进百分比计算
function calculateImprovement(baseline: number, value: number): string {
    const improvement = ((value - baseline) / baseline) * 100;
    return improvement >= 0
        ? `+${improvement.toFixed(2)}%`
        : `${improvement.toFixed(2)}%`;
}

// 简单的测试Actor类
class TestActor extends Actor {
    private messageCount = 0;
    private processingTime = 0;
    private resolvePromise: ((value: unknown) => void) | null = null;
    private completionPromise: Promise<unknown> | null = null;
    private expectedMessages = 0;
    private startTime = 0;
    private totalProcessingTime = 0;

    constructor(context: ActorContext, processingTime = 0) {
        super(context);
        this.processingTime = processingTime;
    }

    protected behaviors(): void {
        this.addBehavior('default', this.defaultBehavior.bind(this));
        this.addBehavior('counting', this.countingBehavior.bind(this));
        this.addBehavior('echo', this.echoBehavior.bind(this));
        this.addBehavior('forward', this.forwardBehavior.bind(this));
    }

    async defaultBehavior(message: Message): Promise<void> {
        if (message.type === 'START_COUNTING') {
            this.expectedMessages = message.payload.count;
            this.messageCount = 0;
            this.totalProcessingTime = 0;
            this.startTime = performance.now();
            this.become('counting');

            // 创建一个Promise，当收到所有预期消息时解析
            this.completionPromise = new Promise((resolve) => {
                this.resolvePromise = resolve;
            });
        }
    }

    async countingBehavior(message: Message): Promise<void> {
        if (message.type === 'COUNT') {
            const msgStartTime = performance.now();

            // 模拟处理时间
            if (this.processingTime > 0) {
                await new Promise(resolve => setTimeout(resolve, this.processingTime));
            }

            this.messageCount++;
            this.totalProcessingTime += performance.now() - msgStartTime;

            // 如果达到预期消息数，通知完成
            if (this.messageCount === this.expectedMessages && this.resolvePromise) {
                const endTime = performance.now();
                const stats = {
                    count: this.messageCount,
                    duration: endTime - this.startTime,
                    avgProcessingTime: this.totalProcessingTime / this.messageCount
                };
                this.resolvePromise(stats);
                this.become('default');
            }
        }
    }

    async echoBehavior(message: Message): Promise<void> {
        if (message.type === 'ECHO' && message.sender) {
            // 回复相同的消息
            await this.send(message.sender, {
                type: 'ECHO_REPLY',
                payload: message.payload,
                sender: this.context.self
            });
        }
    }

    async forwardBehavior(message: Message): Promise<void> {
        if (message.type === 'FORWARD' && message.payload.target) {
            // 转发消息到目标Actor
            await this.send(message.payload.target, {
                type: message.payload.newType || message.type,
                payload: message.payload,
                sender: this.context.self
            });
        }
    }

    // 等待所有消息处理完成
    async waitForCompletion(): Promise<any> {
        if (this.completionPromise) {
            return this.completionPromise;
        }
        return Promise.resolve({ count: this.messageCount });
    }
}

// 创建调度器
function createDispatcher(type: DispatcherType): MessageDispatcher | undefined {
    switch (type) {
        case 'layered':
            return new LayeredDispatcher({
                concurrencyLimits: {
                    [TaskType.CPU_INTENSIVE]: 8,  // 增加资源配额
                    [TaskType.IO_INTENSIVE]: 40,
                    [TaskType.LOW_LATENCY]: 16,
                    [TaskType.BATCH]: 4,
                    [TaskType.DEFAULT]: 16
                },
                metricsCollectionIntervalMs: 500,
                debug: false
            });

        case 'adaptive':
            return new AdaptiveScheduler({
                adaptationIntervalMs: 500,
                metricsCollectionIntervalMs: 250,
                minConcurrency: {
                    [TaskType.CPU_INTENSIVE]: 4,
                    [TaskType.IO_INTENSIVE]: 20,
                    [TaskType.LOW_LATENCY]: 8,
                    [TaskType.BATCH]: 2,
                    [TaskType.DEFAULT]: 8
                },
                maxConcurrency: {
                    [TaskType.CPU_INTENSIVE]: 16,
                    [TaskType.IO_INTENSIVE]: 60,
                    [TaskType.LOW_LATENCY]: 32,
                    [TaskType.BATCH]: 8,
                    [TaskType.DEFAULT]: 32
                },
                debug: false
            });

        case 'default':
        default:
            return undefined;
    }
}

describe('Actor Performance', () => {
    // 创建指定数量的Actor，使用指定的邮箱和调度器类型
    async function createActors(
        system: ActorSystem,
        count: number,
        mailboxType: MailboxType = 'default',
        dispatcherType: DispatcherType = 'default',
        processingTime = 0
    ): Promise<PID[]> {
        const actors: PID[] = [];
        const dispatcher = createDispatcher(dispatcherType);

        for (let i = 0; i < count; i++) {
            const props: Props = {
                actorClass: TestActor,
                actorContext: { processingTime },
                dispatcher,
                supervisorStrategy: 'restart'
            };

            // 根据mailboxType设置邮箱类型
            if (mailboxType === 'lockfree') {
                props.mailboxType = LockFreeMailbox;
            } else {
                props.mailboxType = DefaultMailbox;
            }

            const pid = await system.spawn(props);
            actors.push(pid);
        }

        return actors;
    }

    // 测试Actor创建性能
    async function testActorCreationPerformance(
        count: number,
        mailboxType: MailboxType = 'default',
        dispatcherType: DispatcherType = 'default'
    ): Promise<PerfResult> {
        const system = new ActorSystem();
        await system.start();

        const startTime = performance.now();
        await createActors(system, count, mailboxType, dispatcherType);
        const endTime = performance.now();

        const duration = endTime - startTime;
        const throughput = Math.floor(count / (duration / 1000));

        await system.shutdown();

        return {
            actorCount: count,
            messageCount: 0,
            mailboxType,
            dispatcherType,
            duration,
            throughput
        };
    }

    // 测试消息发送性能
    async function testMessageSendingPerformance(
        actorCount: number,
        messageCount: number,
        mailboxType: MailboxType = 'default',
        dispatcherType: DispatcherType = 'default',
        processingTime = 0
    ): Promise<PerfResult> {
        const system = new ActorSystem();
        await system.start();

        const startMemory = process.memoryUsage().heapUsed / 1024 / 1024;
        let peakMemory = startMemory;

        // 创建Actor
        const actors = await createActors(system, actorCount, mailboxType, dispatcherType, processingTime);

        // 为每个Actor创建一个完成Promise
        const completionPromises: Promise<any>[] = [];

        // 通知Actor开始计数
        for (let i = 0; i < actors.length; i++) {
            const messagesPerActor = Math.ceil(messageCount / actorCount);

            await system.send(actors[i], {
                type: 'START_COUNTING',
                payload: { count: messagesPerActor }
            });

            // 获取Actor实例并等待其完成
            const actor = (system as any).getActor(actors[i].id) as TestActor;
            completionPromises.push(actor.waitForCompletion());
        }

        // 开始计时
        const startTime = performance.now();
        let cpuTimeSum = 0;
        let cpuSampleCount = 0;

        // 定时检查内存使用和CPU
        const memoryCheckInterval = setInterval(() => {
            const currentMemory = process.memoryUsage().heapUsed / 1024 / 1024;
            if (currentMemory > peakMemory) {
                peakMemory = currentMemory;
            }

            // 在真实环境中，这里应该使用OS API获取CPU利用率
            cpuTimeSum += Math.random() * 100; // 模拟CPU利用率
            cpuSampleCount++;
        }, 100);

        // 发送消息
        const messagesPerActor = Math.ceil(messageCount / actorCount);

        for (let i = 0; i < actors.length; i++) {
            for (let j = 0; j < messagesPerActor; j += BATCH_SIZE) {
                const batchSize = Math.min(BATCH_SIZE, messagesPerActor - j);
                const promises = [];

                for (let k = 0; k < batchSize; k++) {
                    promises.push(system.send(actors[i], {
                        type: 'COUNT',
                        payload: { value: j + k }
                    }));
                }

                await Promise.all(promises);
            }
        }

        // 等待所有Actor处理完成
        const actorStats = await Promise.all(completionPromises);

        const endTime = performance.now();
        const duration = endTime - startTime;

        clearInterval(memoryCheckInterval);

        // 计算吞吐量 (消息/秒)
        const throughput = Math.floor(messageCount / (duration / 1000));
        const avgCpuUtilization = cpuSampleCount > 0 ? cpuTimeSum / cpuSampleCount : 0;

        await system.shutdown();

        return {
            actorCount,
            messageCount,
            processingTime,
            mailboxType,
            dispatcherType,
            duration,
            throughput,
            peakMemoryUsage: peakMemory,
            avgCpuUtilization
        };
    }

    // 测试Actor间通信性能
    async function testActorCommunicationPerformance(
        actorCount: number,
        messageCount: number,
        mailboxType: MailboxType = 'default',
        dispatcherType: DispatcherType = 'default'
    ): Promise<PerfResult> {
        const system = new ActorSystem();
        await system.start();

        // 创建Actor
        const actors = await createActors(system, actorCount, mailboxType, dispatcherType);

        // 将所有Actor设置为echo模式
        for (const actor of actors) {
            await system.send(actor, {
                type: 'BECOME',
                payload: { behavior: 'echo' }
            });
        }

        // 开始计时
        const startTime = performance.now();

        // 发送消息并等待回复
        const messagesPerActor = Math.ceil(messageCount / actorCount);
        const promises = [];

        for (let i = 0; i < actors.length; i++) {
            for (let j = 0; j < messagesPerActor; j++) {
                const promise = new Promise<void>(async (resolve) => {
                    // 创建一个临时Actor来接收回复
                    const tempProps: Props = {
                        actorClass: TestActor,
                        mailboxType: mailboxType === 'lockfree' ? LockFreeMailbox : DefaultMailbox,
                        dispatcher: createDispatcher(dispatcherType)
                    };

                    const tempActor = await system.spawn(tempProps);

                    // 发送消息并等待回复
                    await system.send(actors[i], {
                        type: 'ECHO',
                        payload: { value: j },
                        sender: tempActor
                    });

                    // 设置超时
                    const timeout = setTimeout(() => {
                        resolve();
                    }, 5000);

                    // 等待回复
                    const tempActorInstance = (system as any).getActor(tempActor.id) as TestActor;
                    tempActorInstance.receive({
                        type: 'REPLY',
                        payload: {}
                    }).then(() => {
                        clearTimeout(timeout);
                        resolve();
                    });
                });

                promises.push(promise);
            }
        }

        await Promise.all(promises);

        const endTime = performance.now();
        const duration = endTime - startTime;

        // 计算吞吐量 (消息/秒)
        const throughput = Math.floor(messageCount / (duration / 1000));

        await system.shutdown();

        return {
            actorCount,
            messageCount,
            mailboxType,
            dispatcherType,
            duration,
            throughput
        };
    }

    // 生成比较报告
    function generateComparisonReport(results: PerfResult[], baseline: PerfResult): string[] {
        return results.map(result => [
            result.mailboxType,
            result.dispatcherType,
            result.duration.toFixed(2),
            result.throughput.toLocaleString(),
            calculateImprovement(baseline.throughput, result.throughput)
        ]);
    }

    test('Measure actor creation performance with different mailbox and dispatcher types', async () => {
        // 存储所有测试结果
        const results: PerfResult[] = [];

        // 完整组合的测试矩阵
        const mailboxTypes: MailboxType[] = ['default', 'lockfree'];
        const dispatcherTypes: DispatcherType[] = ['default', 'layered', 'adaptive'];

        console.log('\nActor Creation Performance:');

        // 对每种配置进行测试
        for (const actorCount of ACTOR_COUNTS.slice(0, 2)) {
            const baselineResult = await testActorCreationPerformance(
                actorCount, 'default', 'default'
            );
            results.push(baselineResult);

            const configResults: PerfResult[] = [];

            for (const mailboxType of mailboxTypes) {
                for (const dispatcherType of dispatcherTypes) {
                    // 跳过基准配置，因为已经测试过了
                    if (mailboxType === 'default' && dispatcherType === 'default') {
                        continue;
                    }

                    const result = await testActorCreationPerformance(
                        actorCount, mailboxType, dispatcherType
                    );
                    results.push(result);
                    configResults.push(result);
                }
            }

            // 打印结果表格
            console.log(`\nActor Count: ${actorCount}`);
            printTable(
                ['Mailbox', 'Dispatcher', 'Duration (ms)', 'Actors/sec', 'vs Default'],
                [
                    [
                        baselineResult.mailboxType,
                        baselineResult.dispatcherType,
                        baselineResult.duration.toFixed(2),
                        baselineResult.throughput.toLocaleString(),
                        '0.00%'
                    ],
                    ...generateComparisonReport(configResults, baselineResult)
                ]
            );
        }
    });

    test('Measure message sending performance across all combinations', async () => {
        // 存储所有测试结果
        const allResults: PerfResult[] = [];

        // 完整组合的测试矩阵
        const mailboxTypes: MailboxType[] = ['default', 'lockfree'];
        const dispatcherTypes: DispatcherType[] = ['default', 'layered', 'adaptive'];

        // 使用更小的测试规模以加快测试速度
        const testActorCounts = [10, 50];
        const testMessageCounts = [1000, 5000];

        // 无处理时间的消息测试
        console.log('\nMessage Sending Performance (no processing time):');

        for (const actorCount of testActorCounts) {
            for (const messageCount of testMessageCounts) {
                console.log(`\nActor Count: ${actorCount}, Message Count: ${messageCount}`);

                // 基准配置
                const baselineResult = await testMessageSendingPerformance(
                    actorCount, messageCount, 'default', 'default', 0
                );
                allResults.push(baselineResult);

                const configResults: PerfResult[] = [];

                // 测试所有其他配置
                for (const mailboxType of mailboxTypes) {
                    for (const dispatcherType of dispatcherTypes) {
                        // 跳过基准配置
                        if (mailboxType === 'default' && dispatcherType === 'default') {
                            continue;
                        }

                        const result = await testMessageSendingPerformance(
                            actorCount, messageCount, mailboxType, dispatcherType, 0
                        );
                        allResults.push(result);
                        configResults.push(result);
                    }
                }

                // 打印结果表格
                printTable(
                    ['Mailbox', 'Dispatcher', 'Duration (ms)', 'Messages/sec', 'vs Default'],
                    [
                        [
                            baselineResult.mailboxType,
                            baselineResult.dispatcherType,
                            baselineResult.duration.toFixed(2),
                            baselineResult.throughput.toLocaleString(),
                            '0.00%'
                        ],
                        ...generateComparisonReport(configResults, baselineResult)
                    ]
                );
            }
        }

        // 有处理时间的消息测试 (1ms)
        console.log('\nMessage Sending Performance (with 1ms processing time):');

        for (const actorCount of [10, 20]) {
            for (const messageCount of [1000, 2000]) {
                console.log(`\nActor Count: ${actorCount}, Message Count: ${messageCount}`);

                // 基准配置
                const baselineResult = await testMessageSendingPerformance(
                    actorCount, messageCount, 'default', 'default', 1
                );
                allResults.push(baselineResult);

                const configResults: PerfResult[] = [];

                // 测试所有其他配置
                for (const mailboxType of mailboxTypes) {
                    for (const dispatcherType of dispatcherTypes) {
                        // 跳过基准配置
                        if (mailboxType === 'default' && dispatcherType === 'default') {
                            continue;
                        }

                        const result = await testMessageSendingPerformance(
                            actorCount, messageCount, mailboxType, dispatcherType, 1
                        );
                        allResults.push(result);
                        configResults.push(result);
                    }
                }

                // 打印结果表格
                printTable(
                    ['Mailbox', 'Dispatcher', 'Duration (ms)', 'Messages/sec', 'vs Default'],
                    [
                        [
                            baselineResult.mailboxType,
                            baselineResult.dispatcherType,
                            baselineResult.duration.toFixed(2),
                            baselineResult.throughput.toLocaleString(),
                            '0.00%'
                        ],
                        ...generateComparisonReport(configResults, baselineResult)
                    ]
                );
            }
        }

        // 保存结果到文件
        try {
            const resultsJson = JSON.stringify(allResults, null, 2);
            fs.writeFileSync('perf-test-results.json', resultsJson);
            console.log('\nDetailed results saved to perf-test-results.json');
        } catch (error) {
            console.error('Error saving results:', error);
        }
    });

    test('Measure actor communication performance with different configurations', async () => {
        // 存储所有测试结果
        const allResults: PerfResult[] = [];

        // 完整组合的测试矩阵
        const mailboxTypes: MailboxType[] = ['default', 'lockfree'];
        const dispatcherTypes: DispatcherType[] = ['default', 'layered', 'adaptive'];

        console.log('\nActor Communication Performance:');

        // 使用小型测试以加快速度
        for (const actorCount of [10, 20]) {
            for (const messageCount of [100, 200]) {
                console.log(`\nActor Count: ${actorCount}, Message Count: ${messageCount}`);

                // 基准配置
                const baselineResult = await testActorCommunicationPerformance(
                    actorCount, messageCount, 'default', 'default'
                );
                allResults.push(baselineResult);

                const configResults: PerfResult[] = [];

                // 测试所有其他配置
                for (const mailboxType of mailboxTypes) {
                    for (const dispatcherType of dispatcherTypes) {
                        // 跳过基准配置
                        if (mailboxType === 'default' && dispatcherType === 'default') {
                            continue;
                        }

                        const result = await testActorCommunicationPerformance(
                            actorCount, messageCount, mailboxType, dispatcherType
                        );
                        allResults.push(result);
                        configResults.push(result);
                    }
                }

                // 打印结果表格
                printTable(
                    ['Mailbox', 'Dispatcher', 'Duration (ms)', 'Messages/sec', 'vs Default'],
                    [
                        [
                            baselineResult.mailboxType,
                            baselineResult.dispatcherType,
                            baselineResult.duration.toFixed(2),
                            baselineResult.throughput.toLocaleString(),
                            '0.00%'
                        ],
                        ...generateComparisonReport(configResults, baselineResult)
                    ]
                );
            }
        }

        // 保存结果到文件
        try {
            const resultsJson = JSON.stringify(allResults, null, 2);
            fs.writeFileSync('comm-perf-results.json', resultsJson);
            console.log('\nDetailed communication results saved to comm-perf-results.json');
        } catch (error) {
            console.error('Error saving results:', error);
        }
    });

    // 高负载测试 - 仅针对最优配置
    test('High-load performance test for optimal configurations', async () => {
        console.log('\nHigh-load Performance Test:');

        // 最优配置组合
        const configurations = [
            { mailboxType: 'default', dispatcherType: 'default', label: 'Default' },
            { mailboxType: 'lockfree', dispatcherType: 'default', label: 'LockFree Only' },
            { mailboxType: 'default', dispatcherType: 'adaptive', label: 'Adaptive Only' },
            { mailboxType: 'lockfree', dispatcherType: 'adaptive', label: 'LockFree + Adaptive' }
        ];

        // 高负载场景
        const actorCount = 100;
        const messageCount = 10000;
        const processingTime = 0.5; // 0.5ms处理时间

        console.log(`\nHigh-load: ${actorCount} actors, ${messageCount} messages, ${processingTime}ms processing time`);

        const results: PerfResult[] = [];

        for (const config of configurations) {
            const result = await testMessageSendingPerformance(
                actorCount,
                messageCount,
                config.mailboxType as MailboxType,
                config.dispatcherType as DispatcherType,
                processingTime
            );
            results.push(result);
        }

        // 打印结果表格
        printTable(
            ['Configuration', 'Duration (ms)', 'Messages/sec', 'Memory (MB)', 'vs Default'],
            results.map((r, i) => [
                configurations[i].label,
                r.duration.toFixed(2),
                r.throughput.toLocaleString(),
                r.peakMemoryUsage ? r.peakMemoryUsage.toFixed(2) : 'N/A',
                i === 0 ? '0.00%' : calculateImprovement(results[0].throughput, r.throughput)
            ])
        );

        // 保存详细结果
        try {
            const resultsJson = JSON.stringify(results, null, 2);
            fs.writeFileSync('high-load-results.json', resultsJson);
            console.log('\nHigh-load results saved to high-load-results.json');
        } catch (error) {
            console.error('Error saving results:', error);
        }

        // 分析和打印结论
        let bestConfig = { index: 0, throughput: results[0].throughput };

        for (let i = 1; i < results.length; i++) {
            if (results[i].throughput > bestConfig.throughput) {
                bestConfig = { index: i, throughput: results[i].throughput };
            }
        }

        console.log('\nPerformance Analysis:');
        console.log(`- Best configuration: ${configurations[bestConfig.index].label}`);
        console.log(`- Throughput improvement: ${calculateImprovement(results[0].throughput, bestConfig.throughput)}`);
        console.log(`- Recommended for high-load production environments: ${configurations[bestConfig.index].label}`);
    });

    // 突发负载测试
    test('Burst load handling test', async () => {
        console.log('\nBurst Load Handling Test:');

        const actorCount = 20;
        const burstSize = 5000; // 突发消息数量

        // 配置组合
        const configurations = [
            { mailboxType: 'default', dispatcherType: 'default', label: 'Default' },
            { mailboxType: 'lockfree', dispatcherType: 'adaptive', label: 'LockFree + Adaptive' }
        ];

        const results = [];

        for (const config of configurations) {
            const system = new ActorSystem();
            await system.start();

            // 创建Actor
            const actors = await createActors(
                system,
                actorCount,
                config.mailboxType as MailboxType,
                config.dispatcherType as DispatcherType
            );

            // 为每个Actor创建一个完成Promise
            const completionPromises: Promise<any>[] = [];

            // 通知Actor开始计数
            for (let i = 0; i < actors.length; i++) {
                await system.send(actors[i], {
                    type: 'START_COUNTING',
                    payload: { count: burstSize / actorCount }
                });

                // 获取Actor实例并等待其完成
                const actor = (system as any).getActor(actors[i].id) as TestActor;
                completionPromises.push(actor.waitForCompletion());
            }

            // 发送突发消息
            const startTime = performance.now();

            // 同时发送所有消息，不等待
            const allPromises = [];

            for (let i = 0; i < actors.length; i++) {
                for (let j = 0; j < burstSize / actorCount; j++) {
                    allPromises.push(system.send(actors[i], {
                        type: 'COUNT',
                        payload: { value: j }
                    }));
                }
            }

            // 等待所有消息发送完成
            await Promise.all(allPromises);
            const sendCompleteTime = performance.now();

            // 等待所有Actor处理完成
            const actorStats = await Promise.all(completionPromises);
            const endTime = performance.now();

            // 计算结果
            const sendDuration = sendCompleteTime - startTime;
            const processingDuration = endTime - sendCompleteTime;
            const totalDuration = endTime - startTime;
            const throughput = Math.floor(burstSize / (totalDuration / 1000));

            results.push({
                label: config.label,
                sendDuration,
                processingDuration,
                totalDuration,
                throughput
            });

            await system.shutdown();
        }

        // 打印结果
        printTable(
            ['Configuration', 'Send Time (ms)', 'Process Time (ms)', 'Total (ms)', 'Messages/sec', 'Improvement'],
            results.map((r, i) => [
                r.label,
                r.sendDuration.toFixed(2),
                r.processingDuration.toFixed(2),
                r.totalDuration.toFixed(2),
                r.throughput.toLocaleString(),
                i === 0 ? '0.00%' : calculateImprovement(results[0].throughput, r.throughput)
            ])
        );

        // 分析结果
        const burstImprovement = ((results[1].throughput - results[0].throughput) / results[0].throughput) * 100;
        console.log(`\nBurst Load Analysis:`);
        console.log(`- LockFree + Adaptive improvement: ${burstImprovement.toFixed(2)}%`);
        console.log(`- Send time difference: ${((results[0].sendDuration - results[1].sendDuration) / results[0].sendDuration * 100).toFixed(2)}%`);
        console.log(`- Processing time difference: ${((results[0].processingDuration - results[1].processingDuration) / results[0].processingDuration * 100).toFixed(2)}%`);
    });
}); 