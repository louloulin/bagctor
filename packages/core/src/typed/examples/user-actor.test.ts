import { describe, test, expect, beforeAll, afterAll } from 'bun:test';
import { ActorSystem } from '../../core/system';
import { DefaultDispatcher } from '../../core/dispatcher';
import { Actor } from '../../core/actor';
import { ActorContext } from '../../core/context';
import { TypedActorContext } from '../context';
import { PID, Message, Props } from '../../core/types';
import { UserActor, UserActorMessages } from './user-actor';

describe('UserActor', () => {
    let system: ActorSystem;
    let userActorPid: PID;
    let clientPid: PID;
    let receivedMessages: Message[] = [];

    // 设置测试环境
    beforeAll(async () => {
        // 创建 Actor 系统
        system = new ActorSystem() as any;
        await system.start();

        // 创建客户端 Actor (用于接收响应)
        class ClientActor extends Actor {
            protected behaviors(): void {
                this.addBehavior('default', async (message: Message) => {
                    receivedMessages.push(message);
                });
            }
        }

        const clientProps: Props = {
            actorClass: ClientActor,
            dispatcher: new DefaultDispatcher()
        };

        clientPid = await system.spawn(clientProps);

        // 创建用户 Actor 并包装成适配器
        class UserActorAdapter extends Actor {
            private userActor: UserActor;

            constructor(context: ActorContext) {
                super(context);
                const typedContext = new TypedActorContext(context);
                this.userActor = new UserActor(typedContext);
            }

            protected behaviors(): void {
                this.addBehavior('default', async (message: Message) => {
                    await this.userActor.receive(message);
                });
            }
        }

        // 使用原生 Actor 系统创建 UserActor
        const userProps: Props = {
            actorClass: UserActorAdapter,
            dispatcher: new DefaultDispatcher()
        };

        userActorPid = await system.spawn(userProps);
    });

    // 清理
    afterAll(async () => {
        await system.stop(userActorPid);
        await system.stop(clientPid);
        await system.shutdown();
    });

    beforeEach(() => {
        receivedMessages = [];
    });

    test('should create a user', async () => {
        // 发送创建用户请求
        await system.send(userActorPid, {
            type: 'user.create.request',
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
        expect(receivedMessages[0].type).toBe('user.create.response');
        expect(receivedMessages[0].payload.user).toBeDefined();
        expect(receivedMessages[0].payload.user.name).toBe('John Doe');
        expect(receivedMessages[0].payload.user.email).toBe('john@example.com');
    });

    test('should get a user', async () => {
        // 先创建一个用户
        await system.send(userActorPid, {
            type: 'user.create.request',
            payload: {
                name: 'John Doe',
                email: 'john@example.com'
            },
            sender: clientPid
        });

        // 等待创建完成
        await new Promise(resolve => setTimeout(resolve, 100));

        // 获取创建的用户ID
        const userId = receivedMessages[0].payload.user.id;
        receivedMessages = [];

        // 发送获取用户请求
        await system.send(userActorPid, {
            type: 'user.get.request',
            payload: { id: userId },
            sender: clientPid
        });

        // 等待响应
        await new Promise(resolve => setTimeout(resolve, 100));

        // 验证响应
        expect(receivedMessages.length).toBe(1);
        expect(receivedMessages[0].type).toBe('user.get.response');
        expect(receivedMessages[0].payload.user).toBeDefined();
        expect(receivedMessages[0].payload.user.name).toBe('John Doe');
    });

    test('should list all users', async () => {
        // 发送列出用户请求
        await system.send(userActorPid, {
            type: 'user.list.request',
            payload: undefined,
            sender: clientPid
        });

        // 等待响应
        await new Promise(resolve => setTimeout(resolve, 100));

        // 验证响应
        expect(receivedMessages.length).toBe(1);
        expect(receivedMessages[0].type).toBe('user.list.response');
        expect(Array.isArray(receivedMessages[0].payload.users)).toBe(true);
    });

    test('should update a user', async () => {
        // 先创建一个用户
        await system.send(userActorPid, {
            type: 'user.create.request',
            payload: {
                name: 'John Doe',
                email: 'john@example.com'
            },
            sender: clientPid
        });

        // 等待创建完成
        await new Promise(resolve => setTimeout(resolve, 100));

        // 获取创建的用户ID
        const userId = receivedMessages[0].payload.user.id;
        receivedMessages = [];

        // 发送更新用户请求
        await system.send(userActorPid, {
            type: 'user.update.request',
            payload: {
                id: userId,
                name: 'John Updated'
            },
            sender: clientPid
        });

        // 等待响应
        await new Promise(resolve => setTimeout(resolve, 100));

        // 验证响应
        expect(receivedMessages.length).toBe(1);
        expect(receivedMessages[0].type).toBe('user.update.response');
        expect(receivedMessages[0].payload.user).toBeDefined();
        expect(receivedMessages[0].payload.user.name).toBe('John Updated');
    });

    test('should delete a user', async () => {
        // 先创建一个用户
        await system.send(userActorPid, {
            type: 'user.create.request',
            payload: {
                name: 'John Doe',
                email: 'john@example.com'
            },
            sender: clientPid
        });

        // 等待创建完成
        await new Promise(resolve => setTimeout(resolve, 100));

        // 获取创建的用户ID
        const userId = receivedMessages[0].payload.user.id;
        receivedMessages = [];

        // 发送删除用户请求
        await system.send(userActorPid, {
            type: 'user.delete.request',
            payload: { id: userId },
            sender: clientPid
        });

        // 等待响应
        await new Promise(resolve => setTimeout(resolve, 100));

        // 验证响应
        expect(receivedMessages.length).toBe(1);
        expect(receivedMessages[0].type).toBe('user.delete.response');
        expect(receivedMessages[0].payload.success).toBe(true);
    });
}); 