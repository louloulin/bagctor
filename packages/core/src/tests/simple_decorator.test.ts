import { expect, test } from "bun:test";
import {
    Actor,
    ActorContext,
    ActorSystem,
    Message,
    PID,
    PropsBuilder,
    initialState
} from "..";

// 简单的状态接口
interface SimpleState {
    value: string;
}

/**
 * 使用装饰器API定义的简单Actor
 */
@initialState<SimpleState>({ value: "initial-value" })
class SimpleDecoratedActor extends Actor<SimpleState, Message> {
    constructor(context: ActorContext) {
        super(context, { value: "default-value" }); // 这个应该被装饰器覆盖
    }

    // 实现抽象方法
    protected behaviors(): void {
        // 定义默认行为
        this.addBehavior('default', async (message: Message) => {
            console.log('处理消息:', message.type, '当前状态:', this.state);
            if (message.type === 'get') {
                // 返回当前状态值
                if (message.responseId && this.context.respond) {
                    this.context.respond(message, this.state.value);
                }
                return this.state;
            } else if (message.type === 'set') {
                // 设置新值
                console.log('设置新值:', message.payload);
                this.state = { value: message.payload };
                console.log('更新后状态:', this.state);
                return this.state;
            }
            return this.state;
        });
    }

    // 实现receive方法
    async receive(message: Message): Promise<any> {
        console.log('接收消息:', message.type, '当前状态:', this.state);
        const behavior = this.behaviorMap.get(this.behaviorState);
        if (behavior) {
            const result = await behavior(message);
            console.log('处理结果:', result);
            // 确保状态更新
            if (result && result !== this.state) {
                this.state = result;
                console.log('最终状态:', this.state);
            }
            return result;
        }
        throw new Error(`No behavior found for state: ${this.behaviorState}`);
    }
}

test("initialState decorator should set the initial state", async () => {
    // 创建Actor系统
    const system = new ActorSystem();

    // 创建Actor实例
    const props = PropsBuilder.fromClass(SimpleDecoratedActor).build();
    const actorPID = await system.spawn(props);

    // 获取初始值
    const initialValue = await system.request<string>(actorPID, { type: 'get' });

    // 应该使用装饰器设置的初始值，而不是构造函数中的默认值
    expect(initialValue).toBe("initial-value");

    // 测试状态更新
    await system.send(actorPID, { type: 'set', payload: "new-value" });

    // 添加更长的延迟确保消息被处理
    await new Promise(resolve => setTimeout(resolve, 100));

    // 获取更新后的值
    const newValue = await system.request<string>(actorPID, { type: 'get' });
    console.log('获取到的值:', newValue);
    expect(newValue).toBe("new-value");
}); 