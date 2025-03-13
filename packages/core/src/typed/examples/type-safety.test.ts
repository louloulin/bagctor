import { test, expect, beforeAll, afterAll } from 'bun:test';
import { ActorSystem } from '../../core/system';
import { DefaultDispatcher } from '../../core/dispatcher';
import { TypedActor } from '../actor';
import { TypedActorContext } from '../context';
import { Message, MessageMap, PID } from '../types';
import { defineMessage, MessageRegistry } from '../messages';
import { v4 as uuidv4 } from 'uuid';
import { Actor } from '../../core/actor';

// ========== 类型定义 ==========

// 计数器Actor消息类型
interface CounterMessages extends MessageMap {
    'counter.increment': { value: number };
    'counter.decrement': { value: number };
    'counter.reset': null;
    'counter.get': null;
}

// 计数器Actor响应消息类型
interface CounterResponses extends MessageMap {
    'counter.value': { count: number };
    'counter.error': { message: string };
}

// 计数器Actor状态
interface CounterState {
    count: number;
}

// ========== Actor实现 ==========

class CounterActor extends TypedActor<CounterState, CounterMessages> {
    constructor(context: any) {
        super(context, { count: 0 });
    }

    protected behaviors(): void {
        this.on('counter.increment', this.handleIncrement.bind(this))
            .on('counter.decrement', this.handleDecrement.bind(this))
            .on('counter.reset', this.handleReset.bind(this))
            .on('counter.get', this.handleGet.bind(this));
    }

    private async handleIncrement(payload: CounterMessages['counter.increment'], ctx: any): Promise<void> {
        this.setState({
            count: this.state.data.count + payload.value
        });

        if (ctx.sender) {
            await this.context.send(
                ctx.sender,
                'counter.value',
                { count: this.state.data.count }
            );
        }
    }

    private async handleDecrement(payload: CounterMessages['counter.decrement'], ctx: any): Promise<void> {
        this.setState({
            count: this.state.data.count - payload.value
        });

        if (ctx.sender) {
            await this.context.send(
                ctx.sender,
                'counter.value',
                { count: this.state.data.count }
            );
        }
    }

    private async handleReset(_: null, ctx: any): Promise<void> {
        this.setState({ count: 0 });

        if (ctx.sender) {
            await this.context.send(
                ctx.sender,
                'counter.value',
                { count: 0 }
            );
        }
    }

    private async handleGet(_: null, ctx: any): Promise<void> {
        if (ctx.sender) {
            await this.context.send(
                ctx.sender,
                'counter.value',
                { count: this.state.data.count }
            );
        }
    }
}

// ========== 消息验证 ==========

// 创建消息工厂函数
const createIncrementMsg = (value: number, sender?: PID) => ({
    type: 'counter.increment' as const,
    payload: { value },
    sender
});

const createDecrementMsg = (value: number, sender?: PID) => ({
    type: 'counter.decrement' as const,
    payload: { value },
    sender
});

const createResetMsg = (sender?: PID) => ({
    type: 'counter.reset' as const,
    payload: null,
    sender
});

const createGetMsg = (sender?: PID) => ({
    type: 'counter.get' as const,
    payload: null,
    sender
});

// 使用消息定义工具创建类型安全的消息
const counterMessageFactory = defineMessage<CounterMessages>();

// ========== 消息验证器 ==========

const counterRegistry = new MessageRegistry<CounterMessages>();

// 验证器函数
const isIncrementPayload = (value: any): value is CounterMessages['counter.increment'] => {
    return value && typeof value.value === 'number';
};

const isDecrementPayload = (value: any): value is CounterMessages['counter.decrement'] => {
    return value && typeof value.value === 'number';
};

const isNullPayload = (value: any): value is null => {
    return value === null;
};

// 注册验证器
counterRegistry
    .register('counter.increment', isIncrementPayload)
    .register('counter.decrement', isDecrementPayload)
    .register('counter.reset', isNullPayload)
    .register('counter.get', isNullPayload);

// ========== 测试 ==========

// 全局变量
let system: ActorSystem;
let counterActorPid: any;
let clientPid: any;
let receivedMessages: any[] = [];

// 设置测试环境
beforeAll(async () => {
    // 创建 Actor 系统
    system = new ActorSystem();

    // 创建客户端 Actor (用于接收响应)
    class ClientActor extends Actor {
        protected behaviors(): void {
            this.addBehavior('default', async (message) => {
                receivedMessages.push(message);
            });
        }
    }

    const clientProps = {
        actorClass: ClientActor,
        dispatcher: new DefaultDispatcher()
    };

    clientPid = await system.spawn(clientProps);

    // 创建计数器 Actor 适配器
    class CounterActorAdapter extends Actor {
        private counterActor: CounterActor;

        constructor(context: any) {
            super(context);
            this.counterActor = new CounterActor(context);
        }

        protected behaviors(): void {
            // 空实现，我们会手动转发消息
        }

        async receive(message: any): Promise<void> {
            // 转发消息给TypedActor
            await this.counterActor.receive(message);
        }
    }

    // 使用原生 Actor 系统创建 CounterActor
    const counterProps = {
        actorClass: CounterActorAdapter,
        dispatcher: new DefaultDispatcher()
    };

    counterActorPid = await system.spawn(counterProps);
});

// 清理
afterAll(async () => {
    await system.stop(counterActorPid);
});

// 验证类型安全的消息创建和处理
test('should handle typed messages correctly', async () => {
    receivedMessages = [];

    // 使用工厂方法创建类型安全的消息
    const incrementMsg = counterMessageFactory('counter.increment', { value: 5 }, clientPid);

    // 验证消息结构
    expect(incrementMsg.type).toBe('counter.increment');
    expect(incrementMsg.payload.value).toBe(5);

    // 验证消息格式正确
    expect(counterRegistry.validate('counter.increment', incrementMsg.payload)).toBe(true);

    // 发送消息
    await system.send(counterActorPid, incrementMsg);

    // 等待响应
    await new Promise(resolve => setTimeout(resolve, 100));

    // 验证响应
    expect(receivedMessages.length).toBe(1);
    expect(receivedMessages[0].type).toBe('counter.value');
    expect(receivedMessages[0].payload.count).toBe(5);
});

test('should increment counter correctly', async () => {
    receivedMessages = [];

    // 发送增量消息
    await system.send(counterActorPid, createIncrementMsg(3, clientPid));

    // 等待响应
    await new Promise(resolve => setTimeout(resolve, 100));

    // 验证响应
    expect(receivedMessages.length).toBe(1);
    expect(receivedMessages[0].type).toBe('counter.value');
    expect(receivedMessages[0].payload.count).toBe(8); // 从前一个测试的5开始
});

test('should decrement counter correctly', async () => {
    receivedMessages = [];

    // 发送减量消息
    await system.send(counterActorPid, createDecrementMsg(4, clientPid));

    // 等待响应
    await new Promise(resolve => setTimeout(resolve, 100));

    // 验证响应
    expect(receivedMessages.length).toBe(1);
    expect(receivedMessages[0].type).toBe('counter.value');
    expect(receivedMessages[0].payload.count).toBe(4); // 从8减到4
});

test('should reset counter correctly', async () => {
    receivedMessages = [];

    // 发送重置消息
    await system.send(counterActorPid, createResetMsg(clientPid));

    // 等待响应
    await new Promise(resolve => setTimeout(resolve, 100));

    // 验证响应
    expect(receivedMessages.length).toBe(1);
    expect(receivedMessages[0].type).toBe('counter.value');
    expect(receivedMessages[0].payload.count).toBe(0);
});

test('should validate message types correctly', async () => {
    // 有效载荷
    const validIncrementPayload = { value: 5 };
    const invalidIncrementPayload = { val: 5 }; // 属性名错误
    const nonNumberPayload = { value: "5" }; // 类型错误

    // 验证正确的消息类型
    expect(counterRegistry.validate('counter.increment', validIncrementPayload)).toBe(true);

    // 验证错误的消息类型
    expect(counterRegistry.validate('counter.increment', invalidIncrementPayload)).toBe(false);
    expect(counterRegistry.validate('counter.increment', nonNumberPayload)).toBe(false);

    // 验证完整消息
    const validMessage = {
        type: 'counter.increment',
        payload: validIncrementPayload
    };

    const invalidMessage = {
        type: 'counter.increment',
        payload: invalidIncrementPayload
    };

    expect(counterRegistry.validateMessage(validMessage)).toBe(true);
    expect(counterRegistry.validateMessage(invalidMessage)).toBe(false);
}); 