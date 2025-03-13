import {
    TypedActor,
    MessageMap,
    defineMessage,
    createTypeValidator,
    isString,
    isNumber,
    isObject,
    RequestResponseProtocol,
    createRequestResponseMap,
    MessageContext,
    Message,
    ActorContext
} from '../index';

// 定义消息类型
interface GreeterMessages extends MessageMap {
    'greet': { name: string };
    'changeGreeting': { greeting: string };
    'getStats': void;
    'stats': { greetingCount: number };
}

// 定义请求-响应协议
const GetStatsProtocol: RequestResponseProtocol<void, { greetingCount: number }> = createRequestResponseMap(
    'getStats',
    'stats',
    (value: any): value is void => value === undefined,
    (value: any): value is { greetingCount: number } => {
        return typeof value === 'object' &&
            value !== null &&
            typeof value.greetingCount === 'number';
    }
);

// 定义Actor状态
interface GreeterState {
    greeting: string;
    greetingCount: number;
}

// 创建消息验证器
const greetValidator = createTypeValidator<GreeterMessages['greet']>(
    (value): value is GreeterMessages['greet'] => {
        return isObject(value) &&
            typeof (value as any).name === 'string';
    }
);

const changeGreetingValidator = createTypeValidator<GreeterMessages['changeGreeting']>(
    (value): value is GreeterMessages['changeGreeting'] => {
        return isObject(value) &&
            typeof (value as any).greeting === 'string';
    }
);

// 实现类型安全的Actor
class GreeterActor extends TypedActor<GreeterState, GreeterMessages> {
    // 初始化状态
    initialState(): GreeterState {
        return {
            greeting: 'Hello',
            greetingCount: 0
        };
    }

    // 实现behaviors方法（TypedActor的抽象方法）
    behaviors(): string[] {
        return ['greeter'];
    }

    // 设置消息处理器
    setupMessageHandlers(): void {
        // 处理greet消息
        this.onMessage('greet', greetValidator,
            (msg: Message<'greet', GreeterMessages>, ctx: ActorContext<GreeterMessages>) => {
                const { name } = msg.payload;
                console.log(`${this.state.greeting}, ${name}!`);

                // 更新状态
                this.setState({
                    greeting: this.state.greeting,
                    greetingCount: this.state.greetingCount + 1
                });
            });

        // 处理changeGreeting消息
        this.onMessage('changeGreeting', changeGreetingValidator,
            (msg: Message<'changeGreeting', GreeterMessages>, ctx: ActorContext<GreeterMessages>) => {
                const { greeting } = msg.payload;

                // 更新状态
                this.setState({
                    greeting,
                    greetingCount: this.state.greetingCount
                });

                console.log(`Greeting changed to: ${greeting}`);
            });

        // 处理getStats请求
        this.onMessage('getStats', null,
            (msg: Message<'getStats', GreeterMessages>, ctx: ActorContext<GreeterMessages>) => {
                // 发送响应
                if (msg.sender) {
                    ctx.sendMessage(msg.sender, {
                        type: 'stats',
                        payload: { greetingCount: this.state.greetingCount },
                        metadata: {
                            correlationId: msg.metadata?.correlationId,
                            isResponse: true,
                            timestamp: Date.now()
                        }
                    });
                }
            });
    }
}

// 使用示例
async function runExample() {
    // 创建Actor系统
    const system = createActorSystem();

    // 创建Greeter Actor
    const greeterRef = await system.spawn(GreeterActor);

    // 发送消息
    system.send(greeterRef, 'greet', { name: 'Alice' });
    system.send(greeterRef, 'greet', { name: 'Bob' });
    system.send(greeterRef, 'changeGreeting', { greeting: 'Hola' });
    system.send(greeterRef, 'greet', { name: 'Charlie' });

    // 使用请求-响应模式
    try {
        const stats = await system.ask(greeterRef, GetStatsProtocol, undefined);
        console.log(`Total greetings: ${stats.greetingCount}`);
    } catch (error) {
        console.error('Failed to get stats:', error);
    }

    // 停止Actor系统
    await system.shutdown();
}

// 模拟Actor系统API
function createActorSystem() {
    // 这里简化了实现，实际应用中应使用完整的Actor系统
    return {
        async spawn(ActorClass: any) {
            const actor = new ActorClass();
            actor.setupMessageHandlers();
            return { id: 'actor-1', type: ActorClass.name };
        },
        send(ref: any, type: string, payload: any) {
            console.log(`Sending message ${type} to ${ref.id}`);
            // 实际实现中，这里会将消息发送到Actor的邮箱
        },
        ask(ref: any, protocol: RequestResponseProtocol<any, any>, request: any) {
            console.log(`Asking ${ref.id} with protocol ${protocol.requestType}->${protocol.responseType}`);
            // 实际实现中，这里会发送请求并等待响应
            return Promise.resolve({ greetingCount: 3 });
        },
        async shutdown() {
            console.log('Shutting down actor system');
        }
    };
}

// 运行示例
runExample().catch(console.error); 