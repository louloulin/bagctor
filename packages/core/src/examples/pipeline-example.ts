/**
 * 消息处理管道和中间件示例
 * 
 * 本示例展示如何配置和使用Bagctor的消息处理管道和中间件系统
 * 包括如何:
 * 1. 初始化消息处理管道
 * 2. 配置各种中间件
 * 3. 使用管道发送消息
 * 4. 收集和分析性能指标
 */

import { ActorSystem, ActorSystemConfig } from '../core/system';
import { LoggingMiddleware, MetricsMiddleware, RetryMiddleware } from '../core/messaging/middleware';
import { Message, PID, Props } from '../core/types';
import { Actor } from '../core/actor';
import { log } from '../utils/logger';

async function runPipelineExample() {
    console.log('启动消息处理管道示例...');

    // 1. 创建配置了消息管道的ActorSystem
    const systemConfig: ActorSystemConfig = {
        useMessagePipeline: true,       // 启用消息处理管道
        enableMetrics: true,            // 启用性能指标收集
        enableMessageLogging: true,     // 启用消息日志
        logLevel: 'debug'               // 设置日志级别
    };

    const system = new ActorSystem(undefined, undefined, systemConfig);

    // 2. 添加自定义中间件
    // 添加重试中间件 - 自动重试失败的消息
    system.addMessageMiddleware(new RetryMiddleware(system, 3, 200, 2));

    // 3. 创建一些测试Actor

    // 示例Actor类: 回显收到的消息
    class EchoActor extends Actor {
        // 实现 behaviors 方法定义行为
        protected behaviors(): void {
            this.addBehavior('default', async (message: Message) => {
                if (message.type === 'echo') {
                    console.log(`[EchoActor] 收到消息: ${JSON.stringify(message.payload)}`);

                    // 响应消息
                    if (message.sender && message.responseId) {
                        await this.context.send(message.sender, {
                            type: 'echo-response',
                            payload: message.payload,
                            responseId: message.responseId
                        });
                    }
                    return message.payload; // 可用于自动响应
                }
            });
        }
    }

    // 示例Actor类: 测试失败处理
    class FailingActor extends Actor {
        private failCount = 0;

        // 实现 behaviors 方法定义行为
        protected behaviors(): void {
            this.addBehavior('default', async (message: Message) => {
                if (message.type === 'fail-test') {
                    this.failCount++;

                    // 前两次失败，第三次成功 - 测试重试中间件
                    if (this.failCount <= 2) {
                        console.log(`[FailingActor] 第${this.failCount}次失败`);
                        throw new Error('Intentional failure for testing');
                    }

                    console.log(`[FailingActor] 成功处理消息: ${JSON.stringify(message.payload)}`);
                    // 重置失败计数
                    this.failCount = 0;
                    return { success: true };
                }
            });
        }
    }

    // 创建Actor实例
    const echoPID = await system.spawn({ actorClass: EchoActor });
    const failingPID = await system.spawn({ actorClass: FailingActor });

    console.log(`创建的Actors: EchoActor(${echoPID.id}), FailingActor(${failingPID.id})`);

    // 4. 测试消息发送

    // 标准消息发送
    console.log('\n--- 测试标准消息发送 ---');
    await system.send(echoPID, {
        type: 'echo',
        payload: { text: 'Hello, Echo Actor!' }
    });

    // 等待消息处理完成
    await new Promise(resolve => setTimeout(resolve, 500));

    // 请求-响应模式
    console.log('\n--- 测试请求-响应模式 ---');
    try {
        const response = await system.request(echoPID, {
            type: 'echo',
            payload: { text: 'This is a request expecting response' }
        }, 2000);

        console.log('收到响应:', response);
    } catch (err) {
        console.error('请求失败:', err);
    }

    // 批量消息发送
    console.log('\n--- 测试批量消息发送 ---');
    await system.sendBatch(
        [echoPID, echoPID, echoPID],
        {
            type: 'echo',
            payload: { text: 'This is a batch message' }
        }
    );

    // 测试错误处理和重试中间件
    console.log('\n--- 测试故障恢复和重试 ---');
    await system.send(failingPID, {
        type: 'fail-test',
        payload: { data: 'This will fail and retry' },
        messageId: 'test-retry-1'
    });

    // 等待重试完成
    await new Promise(resolve => setTimeout(resolve, 3000));

    // 5. 查看性能指标
    console.log('\n--- 性能指标 ---');
    const metrics = system.getMessageMetrics();
    console.log(JSON.stringify(metrics, null, 2));

    // 6. 清理资源
    console.log('\n--- 关闭系统 ---');
    await system.shutdown();
    console.log('示例完成');
}

// 运行示例
runPipelineExample().catch(err => {
    console.error('示例运行失败:', err);
    process.exit(1);
}); 