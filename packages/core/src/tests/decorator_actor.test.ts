import { expect, test } from "bun:test";
import { Actor, ActorContext, ActorSystem, PropsBuilder, Message, behavior, messageHandler, initialState, PID } from "..";

// 定义消息类型
interface CounterMessage extends Message {
    type: 'increment' | 'decrement' | 'get' | 'reset';
    value?: number;
}

// 定义状态类型
interface CounterState {
    count: number;
    history: number[];
}

// 使用装饰器API定义Actor
@initialState<CounterState>({ count: 0, history: [] })
class DecoratorCounterActor extends Actor<CounterState, CounterMessage> {
    // 重写behaviors方法来处理装饰器定义的行为
    protected behaviors(): void {
        // 获取通过装饰器定义的行为方法
        const proto = Object.getPrototypeOf(this);
        const behaviorMethods = proto.behaviorMethods || new Map<string, string>();
        const messageHandlers = proto.messageHandlers || new Map<string, string>();

        // 注册默认行为
        this.addBehavior('default', async (msg: CounterMessage) => {
            // 根据消息类型路由到对应的处理方法
            const handlerName = messageHandlers.get(msg.type);
            if (handlerName && typeof this[handlerName as keyof this] === 'function') {
                return await (this[handlerName as keyof this] as Function)(msg);
            }

            throw new Error(`No handler found for message type: ${msg.type}`);
        });

        // 注册其他行为
        behaviorMethods.forEach((methodName, behaviorName) => {
            if (behaviorName !== 'default' && typeof this[methodName as keyof this] === 'function') {
                this.addBehavior(behaviorName, async (msg: CounterMessage) => {
                    return await (this[methodName as keyof this] as Function)(msg);
                });
            }
        });
    }

    @messageHandler('increment')
    handleIncrement(msg: CounterMessage): CounterState {
        const value = msg.value || 1;
        const newCount = this.state.count + value;
        const newHistory = [...this.state.history, newCount];
        return { count: newCount, history: newHistory };
    }

    @messageHandler('decrement')
    handleDecrement(msg: CounterMessage): CounterState {
        const value = msg.value || 1;
        const newCount = this.state.count - value;
        const newHistory = [...this.state.history, newCount];
        return { count: newCount, history: newHistory };
    }

    @messageHandler('get')
    handleGet(): CounterState {
        return this.state;
    }

    @messageHandler('reset')
    handleReset(): CounterState {
        return { count: 0, history: [...this.state.history, 0] };
    }

    @behavior('readonly')
    readonlyBehavior(msg: CounterMessage): any {
        if (msg.type === 'get') {
            return this.state;
        } else {
            throw new Error('In readonly mode, only get is allowed');
        }
    }
}

test("Actor with decorators should work correctly", async () => {
    const system = new ActorSystem();

    // 创建Actor
    const props = PropsBuilder.fromClass(DecoratorCounterActor).build();
    const pid = await system.spawn(props);

    // 测试递增
    await system.send(pid, { type: 'increment', value: 5 } as CounterMessage);

    // 检查结果
    const state1 = await system.request<CounterState>(pid, { type: 'get' } as CounterMessage);
    expect(state1.count).toBe(5);
    expect(state1.history).toEqual([5]);

    // 测试递减
    await system.send(pid, { type: 'decrement', value: 2 } as CounterMessage);

    // 检查结果
    const state2 = await system.request<CounterState>(pid, { type: 'get' } as CounterMessage);
    expect(state2.count).toBe(3);
    expect(state2.history).toEqual([5, 3]);

    // 测试切换到只读行为
    await system.send(pid, { type: 'become', behavior: 'readonly' } as Message);

    // 在只读模式下尝试递增应该失败
    try {
        await system.request(pid, { type: 'increment', value: 10 } as CounterMessage);
        expect(true).toBe(false); // 这里不应该执行
    } catch (e) {
        expect((e as Error).message).toContain('only get is allowed');
    }

    // 只读模式下get应该正常工作
    const state3 = await system.request<CounterState>(pid, { type: 'get' } as CounterMessage);
    expect(state3.count).toBe(3);
}); 