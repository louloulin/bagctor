import { test, expect, beforeAll, afterAll } from 'bun:test';
import { ActorSystem } from '../../core/system';
import { DefaultDispatcher } from '../../core/dispatcher';
import { TypedActor } from '../actor';
import { TypedActorContext } from '../context';
import {
    Message,
    MessageMap,
    PID,
    ActorProxy,
    createActorProxy,
    MessageContext
} from '../types';
import {
    defineMessage,
    MessageRegistry,
    createTypeValidator,
    objectValidator,
    isString,
    isNumber
} from '../messages';
import {
    RequestResponseProtocol,
    createRequestResponseMap,
    request,
    response,
    RequestResponseManager
} from '../request-response';

// ========== 测试类型定义 ==========

// 用户Actor消息类型
interface UserMessages extends MessageMap {
    'user.create': { name: string; email: string };
    'user.update': { id: string; name?: string; email?: string };
    'user.delete': { id: string };
    'user.get': { id: string };
    'user.created': { id: string; name: string; email: string };
    'user.updated': { id: string; name?: string; email?: string };
    'user.deleted': { id: string };
    'user.retrieved': { id: string; name: string; email: string; exists?: boolean };
}

// 用户Actor状态
interface UserState {
    users: Record<string, { id: string; name: string; email: string }>;
    lastOperation: string;
    operationCount: number;
}

// 用户请求-响应协议
interface GetUserRequest {
    id: string;
}

interface GetUserResponse {
    id: string;
    name: string;
    email: string;
    found: boolean;
}

// ========== 测试Actor实现 ==========

class UserActor extends TypedActor<UserState, UserMessages> {
    constructor(context: TypedActorContext<UserMessages>) {
        super(context, {
            users: {
                'user1': { id: 'user1', name: 'John Doe', email: 'john@example.com' },
                'user2': { id: 'user2', name: 'Jane Smith', email: 'jane@example.com' }
            },
            lastOperation: 'init',
            operationCount: 0
        });
    }

    protected behaviors(): void {
        this.on('user.create', this.handleCreate.bind(this))
            .on('user.update', this.handleUpdate.bind(this))
            .on('user.delete', this.handleDelete.bind(this))
            .on('user.get', this.handleGet.bind(this));
    }

    private async handleCreate(payload: UserMessages['user.create'], ctx: MessageContext): Promise<void> {
        const id = `user${Object.keys(this.state.data.users).length + 1}`;
        const user = { id, ...payload };

        this.setState({
            users: { ...this.state.data.users, [id]: user },
            lastOperation: 'create',
            operationCount: this.state.data.operationCount + 1
        });

        if (ctx.sender) {
            await this.context.send(ctx.sender, 'user.created', { id, name: payload.name, email: payload.email });
        }
    }

    private async handleUpdate(payload: UserMessages['user.update'], ctx: MessageContext): Promise<void> {
        const { id, ...updates } = payload;
        const user = this.state.data.users[id];

        if (user) {
            const updatedUser = { ...user, ...updates };
            this.setState({
                users: { ...this.state.data.users, [id]: updatedUser },
                lastOperation: 'update',
                operationCount: this.state.data.operationCount + 1
            });

            if (ctx.sender) {
                await this.context.send(ctx.sender, 'user.updated', { id, ...updates });
            }
        }
    }

    private async handleDelete(payload: UserMessages['user.delete'], ctx: MessageContext): Promise<void> {
        const { id } = payload;
        const users = { ...this.state.data.users };

        if (users[id]) {
            delete users[id];
            this.setState({
                users,
                lastOperation: 'delete',
                operationCount: this.state.data.operationCount + 1
            });

            if (ctx.sender) {
                await this.context.send(ctx.sender, 'user.deleted', { id });
            }
        }
    }

    private async handleGet(payload: UserMessages['user.get'], ctx: MessageContext): Promise<void> {
        const { id } = payload;
        const user = this.state.data.users[id];

        if (ctx.sender) {
            if (user) {
                await this.context.send(ctx.sender, 'user.retrieved', { ...user, exists: true });
            } else {
                await this.context.send(ctx.sender, 'user.retrieved', { id, name: '', email: '', exists: false });
            }
        }
    }
}

// ========== 测试设置 ==========

let system: any; // 使用any类型暂时绕过类型检查
let userActorPid: PID<UserMessages>;
let userProxy: ActorProxy<UserMessages>;
let reqRespManager: RequestResponseManager;
let userActor: UserActor;

beforeAll(async () => {
    // 创建ActorSystem
    system = new ActorSystem();

    // 创建UserActor
    userActorPid = await system.spawn({
        actorClass: UserActor
    }) as PID<UserMessages>;

    // 获取Actor实例和上下文
    userActor = system.actors.get(userActorPid.id);
    const context = system.contexts.get(userActorPid.id);

    // 创建Actor代理 - 直接使用send方法
    userProxy = {
        'user.create': async (payload) => context.send(userActorPid, { type: 'user.create', payload }),
        'user.update': async (payload) => context.send(userActorPid, { type: 'user.update', payload }),
        'user.delete': async (payload) => context.send(userActorPid, { type: 'user.delete', payload }),
        'user.get': async (payload) => context.send(userActorPid, { type: 'user.get', payload }),
    } as ActorProxy<UserMessages>;

    // 创建请求-响应管理器
    reqRespManager = new RequestResponseManager();
});

afterAll(async () => {
    await system.shutdown();
});

// ========== 测试用例 ==========

// 测试Actor代理
test('should use actor proxy to send messages', async () => {
    // 使用代理创建用户
    await userProxy['user.create']({ name: 'Alice', email: 'alice@example.com' });

    // 使用代理更新用户
    await userProxy['user.update']({ id: 'user1', name: 'John Updated' });

    // 使用代理获取用户
    let receivedUser: any = null;

    // 添加一个临时处理器来捕获响应
    const originalSend = system.contexts.get(userActorPid.id).send;
    system.contexts.get(userActorPid.id).send = async (target: any, message: any) => {
        if (message.type === 'user.retrieved' && message.payload.id === 'user1') {
            receivedUser = message.payload;
        }
        return originalSend.call(system.contexts.get(userActorPid.id), target, message);
    };

    await userProxy['user.get']({ id: 'user1' });

    // 等待一小段时间以确保消息被处理
    await new Promise(resolve => setTimeout(resolve, 50));

    // 恢复原始send方法
    system.contexts.get(userActorPid.id).send = originalSend;

    // 验证结果
    expect(receivedUser).not.toBeNull();
    expect(receivedUser.name).toBe('John Updated');
    expect(receivedUser.email).toBe('john@example.com');
});

// 测试消息验证器
test('should validate messages using validators', () => {
    // 创建消息注册表
    const userRegistry = new MessageRegistry<UserMessages>();

    // 使用对象验证器
    const isCreateUserPayload = objectValidator<UserMessages['user.create']>({
        name: isString,
        email: isString
    });

    // 注册验证器
    userRegistry.register('user.create', isCreateUserPayload);

    // 验证有效负载
    const validPayload = { name: 'Test', email: 'test@example.com' };
    expect(userRegistry.validate('user.create', validPayload)).toBe(true);

    // 验证无效负载
    const invalidPayload1 = { name: 123, email: 'test@example.com' } as any;
    const invalidPayload2 = { name: 'Test' } as any;

    expect(userRegistry.validate('user.create', invalidPayload1)).toBe(false);
    expect(userRegistry.validate('user.create', invalidPayload2)).toBe(false);
});

// 测试请求-响应管理器
test('should handle request-response pattern with manager', async () => {
    // 创建请求-响应协议
    const userProtocol = createRequestResponseMap<GetUserRequest, GetUserResponse>();

    // 创建请求
    const reqMsg = request(userProtocol, { id: 'user1' });

    // 注册请求
    const responsePromise = new Promise<GetUserResponse>((resolve, reject) => {
        reqRespManager.registerRequest(
            reqMsg.metadata!.correlationId!,
            resolve,
            reject,
            5000
        );
    });

    // 模拟响应
    setTimeout(() => {
        const respMsg = response(userProtocol, {
            id: 'user1',
            name: 'John Doe',
            email: 'john@example.com',
            found: true
        }, reqMsg);

        reqRespManager.handleResponse(respMsg);
    }, 100);

    // 等待响应
    const result = await responsePromise;

    expect(result.id).toBe('user1');
    expect(result.name).toBe('John Doe');
    expect(result.found).toBe(true);
});

// 测试请求超时
test('should handle request timeout', async () => {
    // 创建请求-响应协议
    const userProtocol = createRequestResponseMap<GetUserRequest, GetUserResponse>();

    // 创建请求
    const reqMsg = request(userProtocol, { id: 'user999' });

    // 注册请求，设置较短的超时时间
    const responsePromise = new Promise<GetUserResponse>((resolve, reject) => {
        reqRespManager.registerRequest(
            reqMsg.metadata!.correlationId!,
            resolve,
            reject,
            100 // 100ms超时
        );
    });

    // 等待响应，应该超时
    try {
        await responsePromise;
        // 如果没有超时，测试失败
        expect(true).toBe(false);
    } catch (error) {
        // 验证超时错误
        expect((error as Error).message).toContain('Request timed out');
    }
});

// 测试取消所有请求
test('should cancel all pending requests', async () => {
    // 创建请求-响应协议
    const userProtocol = createRequestResponseMap<GetUserRequest, GetUserResponse>();

    // 创建多个请求
    const reqMsg1 = request(userProtocol, { id: 'user1' });
    const reqMsg2 = request(userProtocol, { id: 'user2' });

    // 注册请求
    const promise1 = new Promise<GetUserResponse>((resolve, reject) => {
        reqRespManager.registerRequest(
            reqMsg1.metadata!.correlationId!,
            resolve,
            reject,
            5000
        );
    });

    const promise2 = new Promise<GetUserResponse>((resolve, reject) => {
        reqRespManager.registerRequest(
            reqMsg2.metadata!.correlationId!,
            resolve,
            reject,
            5000
        );
    });

    // 取消所有请求
    reqRespManager.cancelAll('Test cancellation');

    // 验证所有请求都被拒绝
    try {
        await promise1;
        expect(true).toBe(false);
    } catch (error) {
        expect((error as Error).message).toBe('Test cancellation');
    }

    try {
        await promise2;
        expect(true).toBe(false);
    } catch (error) {
        expect((error as Error).message).toBe('Test cancellation');
    }

    // 验证没有待处理的请求
    expect(reqRespManager.pendingCount).toBe(0);
}); 