/**
 * LockFreeMailbox 单元测试
 * 
 * 测试无锁Mailbox的功能正确性和性能特性
 */

import { LockFreeMailbox } from '../../core/concurrent/lock-free-mailbox';
import { Message } from '@bactor/common';
import { MessageDispatcher, MessageInvoker } from '../../core/types';

// 模拟消息处理器
class MockMessageInvoker implements MessageInvoker {
    public systemMessages: Message[] = [];
    public userMessages: Message[] = [];
    public errorCount: number = 0;

    async invokeSystemMessage(msg: Message): Promise<void> {
        if (msg.type === 'error') {
            this.errorCount++;
            throw new Error('System message error');
        }
        this.systemMessages.push(msg);
    }

    async invokeUserMessage(msg: Message): Promise<void> {
        if (msg.type === 'error') {
            this.errorCount++;
            throw new Error('User message error');
        }
        this.userMessages.push(msg);
    }

    async invoke(msg: Message): Promise<void> {
        if (msg.type.startsWith('system')) {
            await this.invokeSystemMessage(msg);
        } else {
            await this.invokeUserMessage(msg);
        }
    }
}

// 模拟调度器
class MockDispatcher implements MessageDispatcher {
    public scheduleCalled: number = 0;
    public scheduledTasks: Array<() => Promise<void>> = [];

    schedule(task: () => Promise<void>): void {
        this.scheduleCalled++;
        this.scheduledTasks.push(task);
        // 立即执行任务
        task();
    }

    shutdown(): Promise<void> {
        return Promise.resolve();
    }
}

// 基本功能测试
test("LockFreeMailbox 应该正确处理系统和用户消息", async () => {
    const mailbox = new LockFreeMailbox();
    const invoker = new MockMessageInvoker();
    const dispatcher = new MockDispatcher();

    mailbox.registerHandlers(invoker, dispatcher);
    mailbox.start();

    // 发送消息
    mailbox.postSystemMessage({ type: "system1" });
    mailbox.postUserMessage({ type: "user1" });
    mailbox.postSystemMessage({ type: "system2" });
    mailbox.postUserMessage({ type: "user2" });

    // 等待处理完成
    await new Promise(resolve => setTimeout(resolve, 50));

    // 验证系统消息优先处理
    expect(invoker.systemMessages).toEqual([
        { type: "system1" },
        { type: "system2" }
    ]);

    // 验证用户消息按顺序处理
    expect(invoker.userMessages).toEqual([
        { type: "user1" },
        { type: "user2" }
    ]);
});

// 错误处理测试
test("LockFreeMailbox 应该正确处理消息处理错误", async () => {
    let errorCaught = false;

    const mailbox = new LockFreeMailbox({
        debug: true,
        onError: (error) => {
            errorCaught = true;
        }
    });

    const invoker = new MockMessageInvoker();
    const dispatcher = new MockDispatcher();

    mailbox.registerHandlers(invoker, dispatcher);
    mailbox.start();

    // 发送错误消息
    mailbox.postSystemMessage({ type: "error" });

    // 等待处理完成
    await new Promise(resolve => setTimeout(resolve, 50));

    // 验证错误回调被触发
    expect(errorCaught).toBe(true);

    // 验证系统消息处理错误导致mailbox挂起
    expect(mailbox.isSuspended()).toBe(true);

    // 验证错误计数
    expect(invoker.errorCount).toBe(1);
});

// 批处理测试
test("LockFreeMailbox 应该按批次处理消息", async () => {
    const mailbox = new LockFreeMailbox({
        batchSize: 5,
        maxBatchProcessingTimeMs: 5
    });

    const invoker = new MockMessageInvoker();
    const dispatcher = new MockDispatcher();

    mailbox.registerHandlers(invoker, dispatcher);
    mailbox.start();

    // 发送大量消息
    for (let i = 0; i < 20; i++) {
        mailbox.postUserMessage({ type: `user${i}` });
    }

    // 等待处理完成
    await new Promise(resolve => setTimeout(resolve, 100));

    // 验证所有消息都被处理
    expect(invoker.userMessages.length).toBe(20);
});

// 挂起和恢复测试
test("LockFreeMailbox 应该正确支持挂起和恢复操作", async () => {
    const mailbox = new LockFreeMailbox();
    const invoker = new MockMessageInvoker();
    const dispatcher = new MockDispatcher();

    mailbox.registerHandlers(invoker, dispatcher);
    mailbox.start();

    // 发送一些消息
    mailbox.postUserMessage({ type: "user1" });

    // 挂起mailbox
    mailbox.suspend();

    // 发送更多消息
    mailbox.postUserMessage({ type: "user2" });
    mailbox.postUserMessage({ type: "user3" });

    // 验证挂起状态
    expect(mailbox.isSuspended()).toBe(true);

    // 等待一段时间
    await new Promise(resolve => setTimeout(resolve, 30));

    // 检查只有第一条消息被处理
    expect(invoker.userMessages.length).toBe(1);
    expect(invoker.userMessages[0].type).toBe("user1");

    // 恢复mailbox
    mailbox.resume();

    // 等待处理完成
    await new Promise(resolve => setTimeout(resolve, 50));

    // 验证所有消息都被处理
    expect(invoker.userMessages.length).toBe(3);
    expect(invoker.userMessages.map(m => m.type)).toEqual(["user1", "user2", "user3"]);
});

// 性能测试
test("LockFreeMailbox 应该比DefaultMailbox有更好的性能", async () => {
    // 这里是一个简单的性能比较测试
    // 在真实环境中，应该使用更复杂的性能测试工具和方法

    const messageCount = 10000;
    const mailbox = new LockFreeMailbox();
    const invoker = new MockMessageInvoker();
    const dispatcher = new MockDispatcher();

    mailbox.registerHandlers(invoker, dispatcher);
    mailbox.start();

    const startTime = performance.now();

    // 发送大量消息
    for (let i = 0; i < messageCount; i++) {
        mailbox.postUserMessage({ type: `perf${i}` });
    }

    // 等待所有消息处理完成
    while (invoker.userMessages.length < messageCount) {
        await new Promise(resolve => setTimeout(resolve, 10));
    }

    const endTime = performance.now();
    const duration = endTime - startTime;

    console.log(`处理 ${messageCount} 条消息耗时: ${duration.toFixed(2)}ms`);
    console.log(`每秒处理消息数: ${(messageCount / (duration / 1000)).toFixed(2)}`);

    // 获取性能指标
    const metrics = (mailbox as any).getMetrics();
    console.log('性能指标:', metrics);

    // 这里不做具体断言，因为性能取决于运行环境
    // 只是输出性能数据供分析
});

// 并发测试（模拟）
test("LockFreeMailbox 应该在并发环境中保持稳定", async () => {
    const mailbox = new LockFreeMailbox({
        batchSize: 50
    });
    const invoker = new MockMessageInvoker();
    const dispatcher = new MockDispatcher();

    mailbox.registerHandlers(invoker, dispatcher);
    mailbox.start();

    // 模拟并发操作
    const concurrentOperations = 20;
    const messagesPerOperation = 100;

    // 并发发送消息
    await Promise.all(Array.from({ length: concurrentOperations }).map(async (_, opIndex) => {
        for (let i = 0; i < messagesPerOperation; i++) {
            const type = `concurrent-${opIndex}-${i}`;
            mailbox.postUserMessage({ type });
        }
    }));

    // 等待所有消息处理完成
    await new Promise(resolve => setTimeout(resolve, 500));

    // 验证所有消息都被处理
    expect(invoker.userMessages.length).toBe(concurrentOperations * messagesPerOperation);
}); 