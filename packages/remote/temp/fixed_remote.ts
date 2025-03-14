import { Actor, ActorContext } from '@bactor/core';
import { Message, PID } from '@bactor/common';
import { ActorSystem } from '@bactor/core';

// 计算器Actor实现
class CalculatorActor extends Actor {
    constructor(context: ActorContext) {
        super(context);
        this.addBehavior('default', this.handleDefault.bind(this));
    }

    protected behaviors(): void {
        // 在构造函数中已经添加了行为
    }

    private async handleDefault(message: Message): Promise<void> {
        console.log(`[Calculator] 收到消息类型: ${message.type}`);

        if (message.type === 'add') {
            const { a, b } = message.payload;
            const result = a + b;
            console.log(`[Calculator] 计算结果: ${a} + ${b} = ${result}`);

            // 使用message.sender和context.send，而不是context.sender.tell
            if (message.sender) {
                await this.context.send(message.sender, {
                    type: 'result',
                    payload: { result }
                });
            }
        }
    }
}

// 用户Actor实现，用于使用计算器服务
class UserActor extends Actor {
    private calculatorPid?: PID;

    constructor(context: ActorContext) {
        super(context);
        this.addBehavior('default', this.handleDefault.bind(this));
    }

    protected behaviors(): void {
        // 在构造函数中已经添加了行为
    }

    private async handleDefault(message: Message): Promise<void> {
        console.log(`[User] 收到消息类型: ${message.type}`);

        if (message.type === 'start') {
            this.calculatorPid = message.payload.calculatorPid;
            console.log(`[User] 获取到计算器引用: ${this.calculatorPid?.id}`);

            if (this.calculatorPid) {
                console.log(`[User] 发送加法请求到计算器`);
                // 使用send而不是tell
                await this.context.send(this.calculatorPid, {
                    type: 'add',
                    payload: { a: 5, b: 3 }
                });
            }
        }
        else if (message.type === 'result') {
            console.log(`[User] 收到结果: ${message.payload.result}`);
            console.log(`[User] 测试完成，停止...`);

            // 需要提供PID参数给stop方法
            if (this.context.self) {
                await this.context.stop(this.context.self);
            }
        }
    }
}

// 主函数，用于演示Actor通信
async function main() {
    console.log('启动远程Actor示例...');

    // 创建Actor系统
    const system = new ActorSystem();
    console.log('Actor系统已创建');

    try {
        // 创建计算器Actor
        console.log('创建计算器Actor...');
        const calculatorPid = await system.spawn({
            producer: (context) => new CalculatorActor(context)
        });
        console.log(`计算器Actor已创建，ID: ${calculatorPid.id}`);

        // 创建用户Actor
        console.log('创建用户Actor...');
        const userPid = await system.spawn({
            producer: (context) => new UserActor(context)
        });
        console.log(`用户Actor已创建，ID: ${userPid.id}`);

        // 开始测试
        console.log('开始测试...');
        await system.send(userPid, {
            type: 'start',
            payload: { calculatorPid }
        });

        // 等待测试结果
        console.log('等待测试完成...');
        await new Promise(resolve => setTimeout(resolve, 1000));

        // 关闭系统
        console.log('关闭Actor系统...');
        await system.shutdown();
        console.log('示例完成');
    }
    catch (error) {
        console.error('示例出错:', error);
    }
}

// 运行示例
main().catch(console.error); 