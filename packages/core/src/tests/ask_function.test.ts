import { expect, test } from "bun:test";
import { Actor } from "../core/actor";
import { ActorContext, Message, PID } from "../core/types";
import { createMessage } from "../core/types";
import { PropsBuilder } from "../core/props";
import { ActorSystem } from "../core/system";
import { ask } from "../core/helpers";

// 定义用于测试的Actor
class EchoActor extends Actor {
    private delay: number = 0;

    constructor(context: ActorContext) {
        super(context);
    }

    protected behaviors(): void {
        this.addBehavior('default', async (msg: Message) => {
            if (msg.type === 'set-delay') {
                this.delay = msg.payload?.delay || 0;
                return this.delay;
            }

            if (msg.type === 'echo') {
                if (this.delay > 0) {
                    await new Promise(resolve => setTimeout(resolve, this.delay));
                }
                return msg.payload;
            }

            if (msg.type === 'error') {
                throw new Error(msg.payload?.message || 'Test error');
            }

            return null;
        });
    }
}

// 测试基本的ask函数功能
test("ask function should return response from actor", async () => {
    const system = new ActorSystem();

    // 创建EchoActor
    const props = PropsBuilder.fromClass(EchoActor).build();
    const pid = await system.spawn(props);

    // 使用ask函数发送请求并接收响应
    const response = await ask<string>(
        system,
        pid,
        createMessage('echo', 'Hello, World!'),
        1000
    );

    expect(response).toBe('Hello, World!');
});

// 测试ask函数的超时功能
test("ask function should timeout after specified period", async () => {
    const system = new ActorSystem();

    // 创建EchoActor
    const props = PropsBuilder.fromClass(EchoActor).build();
    const pid = await system.spawn(props);

    // 设置响应延迟为200ms
    await system.send(pid, createMessage('set-delay', { delay: 200 }));

    // 使用ask函数发送请求，设置超时为100ms
    try {
        await ask<string>(
            system,
            pid,
            createMessage('echo', 'Should timeout'),
            100
        );

        // 如果没有超时，测试失败
        expect(true).toBe(false);
    } catch (error) {
        // 检查错误消息包含"timed out"而不是仅包含"timeout"
        expect((error as Error).message).toContain("timed out");
    }
});

// 测试ask函数处理Actor抛出的错误
test("ask function should handle actor errors", async () => {
    const system = new ActorSystem();

    // 创建EchoActor
    const props = PropsBuilder.fromClass(EchoActor).build();
    const pid = await system.spawn(props);

    // 使用ask函数发送导致错误的请求
    try {
        await ask<string>(
            system,
            pid,
            createMessage('error', { message: 'Intentional error' }),
            1000
        );

        // 如果没有抛出错误，测试失败
        expect(true).toBe(false);
    } catch (error) {
        expect((error as Error).message).toContain('Intentional error');
    }
});

// 测试ask函数与不同类型的响应
test("ask function should handle different response types", async () => {
    const system = new ActorSystem();

    // 创建EchoActor
    const props = PropsBuilder.fromClass(EchoActor).build();
    const pid = await system.spawn(props);

    // 发送数字
    const numberResponse = await ask<number>(
        system,
        pid,
        createMessage('echo', 42),
        1000
    );
    expect(numberResponse).toBe(42);

    // 发送布尔值
    const boolResponse = await ask<boolean>(
        system,
        pid,
        createMessage('echo', true),
        1000
    );
    expect(boolResponse).toBe(true);

    // 发送对象
    const objectResponse = await ask<{ name: string, age: number }>(
        system,
        pid,
        createMessage('echo', { name: 'Alice', age: 30 }),
        1000
    );
    expect(objectResponse).toEqual({ name: 'Alice', age: 30 });

    // 发送数组
    const arrayResponse = await ask<string[]>(
        system,
        pid,
        createMessage('echo', ['a', 'b', 'c']),
        1000
    );
    expect(arrayResponse).toEqual(['a', 'b', 'c']);
}); 