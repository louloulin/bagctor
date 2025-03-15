import { expect, test, mock } from "bun:test";
import {
    Actor,
    ActorContext,
    ActorSystem,
    Message,
    PID,
    PropsBuilder,
    defineActor,
    match,
    ask
} from "..";
import { createEnhancedActorProxy, MessageMap } from "../typed/types";

// 定义消息类型
interface UserMessages extends MessageMap {
    'create': {
        name: string;
        email: string;
    };
    'update': {
        id: string;
        name?: string;
        email?: string;
    };
    'get': {
        id: string;
    };
    'delete': {
        id: string;
    };
}

// 定义状态类型
interface UserState {
    users: Record<string, { name: string; email: string; }>;
}

// 简化版上下文接口，用于测试
class MockContext {
    public pid: PID;
    public sentMessages: { target: PID; message: Message }[] = [];
    public requestCalls: { target: PID; message: Message; timeout?: number }[] = [];
    public requestResults: Record<string, any> = {};

    constructor(pid: PID) {
        this.pid = pid;
    }

    get self(): PID {
        return this.pid;
    }

    async send(
        target: PID,
        message: Message
    ): Promise<void> {
        this.sentMessages.push({ target, message });
    }

    async request<Res>(
        target: PID,
        message: Message,
        timeoutMs?: number
    ): Promise<Res> {
        // 记录request方法调用
        this.requestCalls.push({ target, message, timeout: timeoutMs });

        const messageType = message.type || 'unknown';
        const result = this.requestResults[`${messageType}-${JSON.stringify(message.payload)}`];

        if (result instanceof Error) {
            throw result;
        }

        return result;
    }
}

test("Enhanced match function should support multiple conditions", async () => {
    // 创建一个使用增强match函数的Actor
    const UserActor = defineActor<UserState, Message>(
        { users: {} },
        {
            default: match<UserState, Message>({
                'update': {
                    // 使用条件数组 - 验证多条件支持
                    condition: [
                        // 条件1: ID必须存在于请求中
                        (msg) => Boolean(msg.payload?.id),
                        // 条件2: 至少有一个字段要更新
                        (msg) => Boolean(msg.payload?.name || msg.payload?.email)
                    ],
                    handler: (state, msg) => {
                        const { id, ...updates } = msg.payload;
                        const user = state.users[id];

                        // 用户存在才进行更新
                        if (user) {
                            return {
                                users: {
                                    ...state.users,
                                    [id]: { ...user, ...updates }
                                }
                            };
                        }
                        return state;
                    }
                },
                'create': (state, msg) => {
                    const { name, email } = msg.payload;
                    const id = `user-${Date.now()}`;
                    return {
                        users: {
                            ...state.users,
                            [id]: { name, email }
                        }
                    };
                },
                'delete': {
                    // 使用单个条件函数
                    condition: (msg) => Boolean(msg.payload?.id && msg.payload.id in msg.payload),
                    handler: (state, msg) => {
                        const { id } = msg.payload;
                        const { [id]: removedUser, ...remainingUsers } = state.users;
                        return { users: remainingUsers };
                    }
                }
            }, (state, msg) => {
                // 默认处理器
                console.warn(`Unhandled message: ${msg.type}`);
                return state;
            })
        }
    );

    // 创建系统和Actor
    const system = new ActorSystem();
    const props = PropsBuilder.fromClass(UserActor).build();
    const pid = await system.spawn(props);

    // 发送创建用户消息
    await system.send(pid, { type: 'create', payload: { name: 'John', email: 'john@example.com' } });

    // 发送一个空的更新消息 - 应该被条件拒绝
    // 这里测试第二个条件：需要至少有一个字段要更新
    await system.send(pid, { type: 'update', payload: { id: 'user-1' } });

    // 发送一个没有ID的更新消息 - 应该被条件拒绝
    // 这里测试第一个条件：需要有ID
    await system.send(pid, { type: 'update', payload: { name: 'Updated Name' } });

    // 发送一个有效的更新消息 - 满足所有条件，但用户不存在
    await system.send(pid, { type: 'update', payload: { id: 'non-existent', name: 'Updated' } });
});

test("EnhancedActorProxy should support method-style calls", async () => {
    // 创建一个mock系统
    const mockPid = { id: "test-actor" };
    const mockSystem = {
        send: async (target: PID, message: Message) => {
            mockContext.send(target, message);
        },
        request: async <T>(target: PID, message: Message, timeout?: number): Promise<T> => {
            return mockContext.request<T>(target, message, timeout);
        }
    };
    const mockContext = new MockContext(mockPid);

    // 设置mock请求结果
    const testUser = { id: "user1", name: "John", email: "john@example.com" };
    mockContext.requestResults[`get-${JSON.stringify({ id: "user1" })}`] = testUser;

    // 创建增强的Actor代理
    const userProxy = createEnhancedActorProxy<UserMessages>(
        mockSystem as any,
        { id: "user-actor" } as PID,
        { timeout: 1000 }
    );

    // 测试发送方法
    await userProxy.sendCreate({ name: "Alice", email: "alice@example.com" });
    expect(mockContext.sentMessages.length).toBe(1);
    expect(mockContext.sentMessages[0].message.type).toBe("create");
    expect(mockContext.sentMessages[0].message.payload).toEqual({ name: "Alice", email: "alice@example.com" });

    // 测试请求方法
    const user = await userProxy.requestGet({ id: "user1" });
    expect(user).toEqual(testUser);
    expect(mockContext.requestCalls.length).toBe(1);
    expect(mockContext.requestCalls[0].message.type).toBe("get");
    expect(mockContext.requestCalls[0].message.payload).toEqual({ id: "user1" });

    // 测试自定义超时
    await userProxy.requestUpdate({ id: "user1", name: "John Updated" }, 2000);
    expect(mockContext.requestCalls.length).toBe(2);
    expect(mockContext.requestCalls[1].message.type).toBe("update");
    expect(mockContext.requestCalls[1].message.payload).toEqual({ id: "user1", name: "John Updated" });
    expect(mockContext.requestCalls[1].timeout).toBe(2000); // 验证自定义超时设置
});

test("EnhancedActorProxy should handle errors", async () => {
    // 创建一个mock系统
    const mockPid = { id: "test-actor" };
    const mockSystem = {
        send: async (target: PID, message: Message) => {
            mockContext.send(target, message);
        },
        request: async <T>(target: PID, message: Message, timeout?: number): Promise<T> => {
            return mockContext.request<T>(target, message, timeout);
        }
    };
    const mockContext = new MockContext(mockPid);

    // 设置mock请求结果（包含一个错误）
    mockContext.requestResults[`get-${JSON.stringify({ id: "error" })}`] = new Error("User not found");

    // 创建一个自定义错误处理器
    const errorHandler = mock((error: Error, messageType: string, payload: any) => { });

    // 创建增强的Actor代理
    const userProxy = createEnhancedActorProxy<UserMessages>(
        mockSystem as any,
        { id: "user-actor" } as PID,
        { errorHandler: errorHandler }
    );

    // 测试错误处理
    try {
        await userProxy.requestGet({ id: "error" });
        expect(true).toBe(false); // 这行不应该执行
    } catch (error: any) { // 使用any类型处理未知错误
        expect(error.message).toBe("User not found");
        expect(errorHandler).toHaveBeenCalled();
        expect(errorHandler).toHaveBeenCalledWith(error, "get", { id: "error" });
    }
});

test("Match function should support handler priority", async () => {
    // 创建一个基础消息构造函数
    const createMessage = (type: string, payload: any) => ({ type, payload });

    // 创建一个使用优先级匹配的Actor
    const PriorityActor = defineActor<UserState, Message>(
        { users: {} },
        {
            default: match<UserState, Message>({
                'update': [
                    {
                        // 高优先级处理器 - 只处理VIP用户
                        priority: 100,
                        condition: (msg) => msg.payload?.isVIP === true,
                        handler: (state, msg) => {
                            const { id, ...updates } = msg.payload;
                            return {
                                users: {
                                    ...state.users,
                                    [id]: {
                                        ...state.users[id],
                                        ...updates,
                                        lastUpdateTime: Date.now(),
                                        updatedWithPriority: 'high'
                                    }
                                }
                            };
                        }
                    },
                    {
                        // 中优先级处理器 - 处理员工用户
                        priority: 50,
                        condition: (msg) => msg.payload?.isEmployee === true,
                        handler: (state, msg) => {
                            const { id, ...updates } = msg.payload;
                            return {
                                users: {
                                    ...state.users,
                                    [id]: {
                                        ...state.users[id],
                                        ...updates,
                                        lastUpdateTime: Date.now(),
                                        updatedWithPriority: 'medium'
                                    }
                                }
                            };
                        }
                    },
                    {
                        // 低优先级处理器 - 处理普通用户
                        priority: 0,
                        handler: (state, msg) => {
                            const { id, ...updates } = msg.payload;
                            return {
                                users: {
                                    ...state.users,
                                    [id]: {
                                        ...state.users[id],
                                        ...updates,
                                        lastUpdateTime: Date.now(),
                                        updatedWithPriority: 'low'
                                    }
                                }
                            };
                        }
                    }
                ],
                // 添加set-state处理器
                'set-state': (state, msg) => {
                    return msg.payload;
                },
                'get-state': (state) => {
                    return state;
                },
                'create': (state, msg) => {
                    const { name, email } = msg.payload;
                    const id = `user-${Date.now()}`;
                    return {
                        users: {
                            ...state.users,
                            [id]: { name, email }
                        }
                    };
                }
            })
        }
    );

    // 创建系统和Actor实例
    const system = new ActorSystem();

    // 监听状态变化的函数
    const stateListener = mock(state => { });

    // 创建一个简单的消息创建函数
    function createTestMessage(type: string, payload: any) {
        return { type, payload };
    }

    // Mocking ActorRef.request 来获取状态
    const originalRequest = system.request;
    system.request = async (target, message) => {
        if (message.type === 'get-state') {
            // 直接模拟返回状态，避免使用内部API
            const actorState = (system as any).actors.get(target.id)?.customState || {};
            stateListener(actorState);
            return actorState;
        }
        return originalRequest.call(system, target, message);
    };

    const props = PropsBuilder.fromClass(PriorityActor).build();
    const pid = await system.spawn(props);

    // 创建几个测试用户
    const user1 = { id: 'user1', name: 'John', email: 'john@example.com' };
    const user2 = { id: 'user2', name: 'Alice', email: 'alice@example.com', isEmployee: true };
    const user3 = { id: 'user3', name: 'Bob', email: 'bob@example.com', isVIP: true };

    // 初始化用户
    const initialState = {
        users: {
            [user1.id]: user1,
            [user2.id]: user2,
            [user3.id]: user3
        }
    };

    // 设置初始状态
    await system.send(pid, createTestMessage('set-state', initialState));

    // 获取当前状态
    const currentState = await system.request(pid, createTestMessage('get-state', null));
    expect(currentState.users).toBeDefined();

    // 测试普通用户更新 - 应该使用低优先级处理器
    await system.send(pid, createTestMessage('update', { id: 'user1', name: 'John Updated' }));

    // 测试员工用户更新 - 应该使用中优先级处理器
    await system.send(pid, createTestMessage('update', { id: 'user2', name: 'Alice Updated', isEmployee: true }));

    // 测试VIP用户更新 - 应该使用高优先级处理器
    await system.send(pid, createTestMessage('update', { id: 'user3', name: 'Bob Updated', isVIP: true }));

    // 添加小延迟确保消息已处理
    await new Promise(resolve => setTimeout(resolve, 10));

    // 获取最终状态
    const finalState = await system.request(pid, createTestMessage('get-state', null));

    // 验证每个用户使用了正确的优先级处理器
    expect(finalState.users.user1.updatedWithPriority).toBe('low');
    expect(finalState.users.user2.updatedWithPriority).toBe('medium');
    expect(finalState.users.user3.updatedWithPriority).toBe('high');

    // 恢复原始request方法
    system.request = originalRequest;
}); 