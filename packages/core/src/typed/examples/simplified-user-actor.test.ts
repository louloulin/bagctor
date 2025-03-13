import { test, expect, beforeAll, afterAll } from 'bun:test';
import { ActorSystem } from '../../core/system';
import { DefaultDispatcher } from '../../core/dispatcher';
import { Actor } from '../../core/actor';
import { SimpleUserActor } from './simplified-user-actor';

// 全局变量
let system: ActorSystem;
let userActorPid: any;
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

    // 创建用户 Actor 并包装成适配器
    class UserActorAdapter extends Actor {
        private userActor: SimpleUserActor;

        constructor(context: any) {
            super(context);
            this.userActor = new SimpleUserActor(context);
        }

        protected behaviors(): void {
            // 空实现，我们会手动将消息转发给 UserActor
        }

        async receive(message: any): Promise<void> {
            // 转发消息给 UserActor
            await this.userActor.receive(message);
        }
    }

    // 使用原生 Actor 系统创建 UserActor
    const userProps = {
        actorClass: UserActorAdapter,
        dispatcher: new DefaultDispatcher()
    };

    userActorPid = await system.spawn(userProps);
});

// 清理
afterAll(async () => {
    // 清理 Actor 系统
    await system.stop(userActorPid);
});

test('should create a user', async () => {
    // 清空之前的消息
    receivedMessages = [];

    // 发送创建用户消息
    await system.send(userActorPid, {
        type: 'user.create',
        payload: {
            name: 'John Doe',
            email: 'john@example.com'
        },
        sender: clientPid
    });

    // 等待响应
    await new Promise(resolve => setTimeout(resolve, 100));

    // 验证响应
    expect(receivedMessages.length).toBe(1);
    expect(receivedMessages[0].type).toBe('user.created');
    expect(receivedMessages[0].payload.user).toBeDefined();
    expect(receivedMessages[0].payload.user.name).toBe('John Doe');
    expect(receivedMessages[0].payload.user.email).toBe('john@example.com');
    expect(receivedMessages[0].payload.user.id).toBeDefined();
});

test('should get a user', async () => {
    receivedMessages = [];

    // 创建一个用户
    await system.send(userActorPid, {
        type: 'user.create',
        payload: {
            name: 'Jane Doe',
            email: 'jane@example.com'
        },
        sender: clientPid
    });

    // 等待创建完成
    await new Promise(resolve => setTimeout(resolve, 100));

    // 获取创建的用户ID
    const userId = receivedMessages[0].payload.user.id;

    // 清空消息
    receivedMessages = [];

    // 发送获取用户消息
    await system.send(userActorPid, {
        type: 'user.get',
        payload: {
            id: userId
        },
        sender: clientPid
    });

    // 等待响应
    await new Promise(resolve => setTimeout(resolve, 100));

    // 验证响应
    expect(receivedMessages.length).toBe(1);
    expect(receivedMessages[0].type).toBe('user.found');
    expect(receivedMessages[0].payload.user).toBeDefined();
    expect(receivedMessages[0].payload.user.id).toBe(userId);
    expect(receivedMessages[0].payload.user.name).toBe('Jane Doe');
    expect(receivedMessages[0].payload.user.email).toBe('jane@example.com');
});

test('should list all users', async () => {
    receivedMessages = [];

    // 发送获取用户列表消息
    await system.send(userActorPid, {
        type: 'user.list',
        payload: null,
        sender: clientPid
    });

    // 等待响应
    await new Promise(resolve => setTimeout(resolve, 100));

    // 验证响应
    expect(receivedMessages.length).toBe(1);
    expect(receivedMessages[0].type).toBe('user.listed');
    expect(Array.isArray(receivedMessages[0].payload.users)).toBe(true);
}); 