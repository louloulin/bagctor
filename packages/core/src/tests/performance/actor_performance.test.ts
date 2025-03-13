import { describe, test, expect } from 'bun:test';
import { Actor } from '../../core/actor';
import { ActorSystem } from '../../core/system';
import { ActorContext, Message, PID, Props } from '../../core/types';
import { DefaultMailbox } from '../../core/mailbox';
import { performance } from 'perf_hooks';
import { v4 as uuidv4 } from 'uuid';

// 测试配置
const ACTOR_COUNTS = [10, 100, 1000];
const MESSAGE_COUNTS = [1000, 10000, 100000];
const BATCH_SIZE = 1000;

// 简单的测试Actor类
class TestActor extends Actor {
    private messageCount = 0;
    private processingTime = 0;
    private resolvePromise: ((value: unknown) => void) | null = null;
    private completionPromise: Promise<unknown> | null = null;
    private expectedMessages = 0;

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
            this.become('counting');

            // 创建一个Promise，当收到所有预期消息时解析
            this.completionPromise = new Promise((resolve) => {
                this.resolvePromise = resolve;
            });
        }
    }

    async countingBehavior(message: Message): Promise<void> {
        if (message.type === 'COUNT') {
            // 模拟处理时间
            if (this.processingTime > 0) {
                await new Promise(resolve => setTimeout(resolve, this.processingTime));
            }

            this.messageCount++;

            // 如果达到预期消息数，通知完成
            if (this.messageCount === this.expectedMessages && this.resolvePromise) {
                this.resolvePromise(this.messageCount);
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
    async waitForCompletion(): Promise<number> {
        if (this.completionPromise) {
            return this.completionPromise as Promise<number>;
        }
        return Promise.resolve(this.messageCount);
    }
}

describe('Actor Performance', () => {
    // 创建指定数量的Actor
    async function createActors(system: ActorSystem, count: number, processingTime = 0): Promise<PID[]> {
        const actors: PID[] = [];

        for (let i = 0; i < count; i++) {
            const props: Props = {
                actorClass: TestActor,
                mailboxType: DefaultMailbox,
                supervisorStrategy: 'restart'
            };

            const pid = await system.spawn(props);
            actors.push(pid);
        }

        return actors;
    }

    // 测试Actor创建性能
    async function testActorCreationPerformance(count: number): Promise<number> {
        const system = new ActorSystem();
        await system.start();

        const startTime = performance.now();

        await createActors(system, count);

        const endTime = performance.now();
        const duration = endTime - startTime;

        await system.shutdown();

        return duration;
    }

    // 测试消息发送性能
    async function testMessageSendingPerformance(
        actorCount: number,
        messageCount: number,
        processingTime = 0
    ): Promise<{ duration: number, throughput: number }> {
        const system = new ActorSystem();
        await system.start();

        // 创建Actor
        const actors = await createActors(system, actorCount, processingTime);

        // 为每个Actor创建一个完成Promise
        const completionPromises: Promise<number>[] = [];

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
        await Promise.all(completionPromises);

        const endTime = performance.now();
        const duration = endTime - startTime;

        // 计算吞吐量 (消息/秒)
        const throughput = Math.floor(messageCount / (duration / 1000));

        await system.shutdown();

        return { duration, throughput };
    }

    // 测试Actor间通信性能
    async function testActorCommunicationPerformance(
        actorCount: number,
        messageCount: number
    ): Promise<{ duration: number, throughput: number }> {
        const system = new ActorSystem();
        await system.start();

        // 创建Actor
        const actors = await createActors(system, actorCount);

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
                        mailboxType: DefaultMailbox
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

        return { duration, throughput };
    }

    test('Measure actor creation performance', async () => {
        console.log('\nActor Creation Performance:');
        console.log('Actor Count | Duration (ms) | Actors/sec');
        console.log('------------|--------------|----------');

        for (const count of ACTOR_COUNTS) {
            const duration = await testActorCreationPerformance(count);
            const actorsPerSecond = Math.floor(count / (duration / 1000));

            console.log(`${count.toString().padEnd(11)} | ${duration.toFixed(2).padEnd(13)} | ${actorsPerSecond.toLocaleString()}`);
        }
    });

    test('Measure message sending performance', async () => {
        console.log('\nMessage Sending Performance (no processing time):');
        console.log('Actor Count | Message Count | Duration (ms) | Messages/sec');
        console.log('------------|---------------|--------------|-------------');

        for (const actorCount of ACTOR_COUNTS.slice(0, 2)) {
            for (const messageCount of MESSAGE_COUNTS.slice(0, 2)) {
                const { duration, throughput } = await testMessageSendingPerformance(actorCount, messageCount);

                console.log(
                    `${actorCount.toString().padEnd(11)} | ` +
                    `${messageCount.toString().padEnd(14)} | ` +
                    `${duration.toFixed(2).padEnd(13)} | ` +
                    `${throughput.toLocaleString()}`
                );
            }
        }

        console.log('\nMessage Sending Performance (with 1ms processing time):');
        console.log('Actor Count | Message Count | Duration (ms) | Messages/sec');
        console.log('------------|---------------|--------------|-------------');

        for (const actorCount of [10, 50]) {
            for (const messageCount of [1000, 5000]) {
                const { duration, throughput } = await testMessageSendingPerformance(actorCount, messageCount, 1);

                console.log(
                    `${actorCount.toString().padEnd(11)} | ` +
                    `${messageCount.toString().padEnd(14)} | ` +
                    `${duration.toFixed(2).padEnd(13)} | ` +
                    `${throughput.toLocaleString()}`
                );
            }
        }
    });

    test('Measure actor communication performance', async () => {
        console.log('\nActor Communication Performance:');
        console.log('Actor Count | Message Count | Duration (ms) | Messages/sec');
        console.log('------------|---------------|--------------|-------------');

        for (const actorCount of [10, 50]) {
            for (const messageCount of [100, 500]) {
                const { duration, throughput } = await testActorCommunicationPerformance(actorCount, messageCount);

                console.log(
                    `${actorCount.toString().padEnd(11)} | ` +
                    `${messageCount.toString().padEnd(14)} | ` +
                    `${duration.toFixed(2).padEnd(13)} | ` +
                    `${throughput.toLocaleString()}`
                );
            }
        }
    });
}); 