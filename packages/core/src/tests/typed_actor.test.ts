import { expect, test } from "bun:test";
import { Actor, ActorContext, Message, PID, PropsBuilder, ActorSystem, defineActor, match, ask, createMessage } from "..";

// 定义类型安全的消息接口
interface GreetingMessage extends Message {
    type: 'greet' | 'farewell' | 'count';
    payload?: {
        name?: string;
        value?: number;
    };
}

// 定义状态接口
interface GreetingState {
    greetCount: number;
    lastGreeted?: string;
}

// 使用泛型创建类型安全的Actor
class TypedGreetingActor extends Actor<GreetingState, GreetingMessage> {
    constructor(context: ActorContext) {
        super(context, { greetCount: 0 });
    }

    protected behaviors(): void {
        this.addBehavior('default', async (msg: GreetingMessage) => {
            switch (msg.type) {
                case 'greet':
                    const name = msg.payload?.name || 'Anonymous';
                    this.setState({
                        greetCount: this.state.greetCount + 1,
                        lastGreeted: name
                    });
                    return `Hello, ${name}! (${this.state.greetCount})`;

                case 'farewell':
                    return `Goodbye, ${this.state.lastGreeted || 'Anonymous'}!`;

                case 'count':
                    return this.state.greetCount;

                default:
                    throw new Error(`Unhandled message type: ${msg.type}`);
            }
        });
    }
}

// 简化版ActorContext for testing
// 由于ActorContext接口包含许多方法，我们只实现测试所需的方法
interface SimplifiedContext {
    getPID(): PID;
    send(target: PID, message: Message): Promise<void>;
    respond(message: Message, result: any, error?: any): void;
    spawn(props: any): Promise<PID>;
}

// 使用简化版接口进行测试
class MockContext implements SimplifiedContext {
    public sentMessages: { target: PID; message: Message }[] = [];
    public respondMessages: { message: Message; result: any; error?: any }[] = [];

    constructor(private pid: PID) { }

    getPID(): PID {
        return this.pid;
    }

    async send(target: PID, message: Message): Promise<void> {
        this.sentMessages.push({ target, message });
    }

    respond(message: Message, result: any, error?: any): void {
        this.respondMessages.push({ message, result, error });
    }

    async spawn(props: any): Promise<PID> {
        return { id: 'child_' + Math.random().toString(36).substring(7) };
    }
}

// 实际系统测试
test("TypedActor should work with actual system", async () => {
    const system = new ActorSystem();

    // 创建TypedGreetingActor
    const props = PropsBuilder.fromClass(TypedGreetingActor).build();
    const pid = await system.spawn(props);

    // 发送消息
    await system.send(pid, {
        type: 'greet',
        payload: { name: 'John' }
    } as GreetingMessage);

    // 查询计数
    const count = await system.request<number>(pid, { type: 'count' } as GreetingMessage);
    expect(count).toBe(1);

    // 查询告别语
    const farewell = await system.request<string>(pid, { type: 'farewell' } as GreetingMessage);
    expect(farewell).toBe('Goodbye, John!');
});

// 使用Mock对象的简化测试
test("TypedActor mock test", async () => {
    const mockContext = new MockContext({ id: 'mock_test' });
    const actor = new TypedGreetingActor(mockContext as unknown as ActorContext);

    // 直接调用Actor的receive方法
    const result1 = await actor.receive({
        type: 'greet',
        payload: { name: 'Alice' }
    } as GreetingMessage);

    expect(result1).toBe('Hello, Alice! (1)');

    const count = await actor.receive({ type: 'count' } as GreetingMessage);
    expect(count).toBe(1);
});

// 测试函数式API
test("defineActor should create a functional Actor", async () => {
    const system = new ActorSystem();

    // 创建函数式Actor
    const CounterActor = defineActor<{ count: number }, Message>(
        { count: 0 },
        {
            default: (state, message) => {
                if (message.type === 'increment') {
                    return { count: state.count + (message.payload?.value || 1) };
                }
                else if (message.type === 'decrement') {
                    return { count: state.count - (message.payload?.value || 1) };
                }
                else if (message.type === 'get') {
                    return state;
                }
                return state;
            }
        }
    );

    // 创建Actor
    const props = PropsBuilder.fromClass(CounterActor).build();
    const pid = await system.spawn(props);

    // 发送消息
    const incrementMsg = createMessage('increment', { value: 5 });
    await system.send(pid, incrementMsg);

    // 请求查询
    const response = await system.request<{ count: number }>(pid, { type: 'get' });
    expect(response.count).toBe(5);

    // 再次递增
    await system.send(pid, { type: 'increment', payload: { value: 3 } });
    const response2 = await system.request<{ count: number }>(pid, { type: 'get' });
    expect(response2.count).toBe(8);
});

// 测试match函数
test("match function should route messages by type", async () => {
    const system = new ActorSystem();

    // 使用match函数创建Actor
    const CounterActorWithMatch = defineActor<{ count: number }, Message>(
        { count: 0 },
        {
            default: match<{ count: number }, Message>({
                increment: (state, message) => ({
                    count: state.count + (message.payload?.value || 1)
                }),

                decrement: (state, message) => ({
                    count: state.count - (message.payload?.value || 1)
                }),

                get: (state) => state
            })
        }
    );

    // 创建Actor
    const props = PropsBuilder.fromClass(CounterActorWithMatch).build();
    const pid = await system.spawn(props);

    // 发送消息
    await system.send(pid, { type: 'increment', payload: { value: 10 } });
    await system.send(pid, { type: 'decrement', payload: { value: 4 } });

    // 检查结果
    const response = await system.request<{ count: number }>(pid, { type: 'get' });
    expect(response.count).toBe(6);
}); 