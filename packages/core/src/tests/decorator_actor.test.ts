import { expect, test } from "bun:test";
import {
    Actor,
    ActorContext,
    ActorSystem,
    Message,
    PID,
    PropsBuilder,
    behavior,
    messageHandler,
    initialState
} from "..";

// 用于测试的消息类型
interface CounterMessage extends Message {
    type: 'increment' | 'decrement' | 'get' | 'reset';
    payload?: number;
}

// 用于测试的状态类型
interface CounterState {
    count: number;
}

// 声明一个帮助函数来类型转换
function buildProps<T extends Actor>(actorClass: any) {
    return PropsBuilder.fromClass(actorClass).build();
}

/**
 * 使用装饰器API定义的Actor
 */
@initialState<CounterState>({ count: 0 })
class DecoratedCounterActor extends Actor<CounterState, CounterMessage> {
    constructor(context: ActorContext) {
        super(context, { count: 0 }); // 初始状态会被装饰器覆盖
        this.initializeBehaviors();
    }

    /**
     * 实现抽象方法
     */
    async receive(message: CounterMessage): Promise<any> {
        // 调用当前行为处理函数
        const behavior = this.behaviorMap.get(this.behaviorState);
        if (behavior) {
            return behavior(message);
        }
        throw new Error(`No behavior found: ${this.behaviorState}`);
    }

    /**
     * 实现抽象方法
     */
    protected behaviors(): void {
        // 这个在构造函数中已经通过initializeBehaviors调用了
        // 这里只是为了满足抽象类的要求
    }

    /**
     * 从装饰器收集行为和消息处理函数
     */
    private initializeBehaviors() {
        // 获取原型上的装饰器设置
        const proto = Object.getPrototypeOf(this);
        const behaviorMethods: Map<string, string> = proto.behaviorMethods || new Map();
        const messageHandlers: Map<string, string> = proto.messageHandlers || new Map();

        // 注册默认行为 - 将所有消息处理器映射到对应方法
        this.addBehavior('default', async (msg: CounterMessage) => {
            const handlerName = messageHandlers.get(msg.type);
            if (handlerName && typeof this[handlerName as keyof this] === 'function') {
                return await (this[handlerName as keyof this] as Function)(msg);
            }
            throw new Error(`No handler found for message type: ${msg.type}`);
        });

        // 注册其他行为
        behaviorMethods.forEach((methodName: string, behaviorName: string) => {
            if (behaviorName !== 'default') {
                this.addBehavior(behaviorName, async (msg: CounterMessage) => {
                    return await (this[methodName as keyof this] as Function)(msg);
                });
            }
        });
    }

    @messageHandler('increment')
    async handleIncrement(msg: CounterMessage): Promise<CounterState> {
        const incrementBy = msg.payload || 1;
        return { count: this.state.count + incrementBy };
    }

    @messageHandler('decrement')
    async handleDecrement(msg: CounterMessage): Promise<CounterState> {
        const decrementBy = msg.payload || 1;
        return { count: this.state.count - decrementBy };
    }

    @messageHandler('get')
    async handleGet(msg: CounterMessage): Promise<CounterState> {
        // 不修改状态，只返回当前值
        if (msg.responseId && this.context.respond) {
            this.context.respond(msg, this.state.count);
        }
        return this.state;
    }

    @behavior('readonly')
    async readonlyBehavior(msg: CounterMessage): Promise<CounterState> {
        if (msg.type === 'get') {
            if (msg.responseId && this.context.respond) {
                this.context.respond(msg, this.state.count);
            }
            return this.state;
        }
        throw new Error('In readonly mode, only get operation is allowed');
    }

    @behavior('resetOnly')
    async resetOnlyBehavior(msg: CounterMessage): Promise<CounterState> {
        if (msg.type === 'reset') {
            return { count: 0 };
        }
        throw new Error('In reset-only mode, only reset operation is allowed');
    }
}

test("Decorated actor should handle messages using handlers", async () => {
    // 创建Actor系统
    const system = new ActorSystem();

    // 创建Actor实例
    const props = buildProps(DecoratedCounterActor);
    const counterPID = await system.spawn(props);

    // 发送increment消息
    await system.send(counterPID, { type: 'increment', payload: 5 });

    // 获取计数值
    const count = await system.request<number>(counterPID, { type: 'get' });
    expect(count).toBe(5);

    // 发送decrement消息
    await system.send(counterPID, { type: 'decrement', payload: 2 });

    // 再次获取计数值
    const newCount = await system.request<number>(counterPID, { type: 'get' });
    expect(newCount).toBe(3);
});

test("Decorated actor should switch behaviors", async () => {
    // 创建Actor系统
    const system = new ActorSystem();

    // 创建Actor实例
    const props = buildProps(DecoratedCounterActor);
    const counterPID = await system.spawn(props);

    // 初始化计数器
    await system.send(counterPID, { type: 'increment', payload: 10 });

    // 切换到只读行为
    await system.send(counterPID, {
        type: 'system.become',
        payload: { behavior: 'readonly' }
    });

    // 尝试递增 - 应该失败
    try {
        await system.send(counterPID, { type: 'increment', payload: 5 });
        // 如果不抛出错误，测试应该失败
        expect(false).toBe(true);
    } catch (error) {
        // 预期会抛出错误
        expect(error).toBeDefined();
    }

    // get操作应该仍然有效
    const count = await system.request<number>(counterPID, { type: 'get' });
    expect(count).toBe(10);

    // 切换到resetOnly行为
    await system.send(counterPID, {
        type: 'system.become',
        payload: { behavior: 'resetOnly' }
    });

    // 发送reset消息
    await system.send(counterPID, { type: 'reset' });

    // 切换回默认行为
    await system.send(counterPID, {
        type: 'system.become',
        payload: { behavior: 'default' }
    });

    // 获取计数值 - 应该已经重置为0
    const resetCount = await system.request<number>(counterPID, { type: 'get' });
    expect(resetCount).toBe(0);
});

test("Decorated actor should use initialState", async () => {
    @initialState<{ value: string }>({ value: "initial" })
    class StringActor extends Actor<{ value: string }, Message> {
        constructor(context: ActorContext) {
            super(context, { value: "unused" }); // 这个会被装饰器覆盖
        }

        // 实现抽象方法
        protected behaviors(): void {
            // 不需要添加行为
        }

        // 简单的消息处理
        async receive(msg: Message): Promise<any> {
            if (msg.type === 'get') {
                if (msg.responseId && this.context.respond) {
                    this.context.respond(msg, this.state.value);
                }
                return this.state;
            } else if (msg.type === 'set') {
                return { value: msg.payload };
            }
            return this.state;
        }
    }

    // 创建Actor系统
    const system = new ActorSystem();

    // 创建Actor实例
    const props = buildProps(StringActor);
    const stringPID = await system.spawn(props);

    // 获取初始值
    const initialValue = await system.request<string>(stringPID, { type: 'get' });
    expect(initialValue).toBe("initial"); // 应该使用装饰器中设置的初始值
}); 