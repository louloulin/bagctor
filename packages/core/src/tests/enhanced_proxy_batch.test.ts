import { expect, test, mock } from "bun:test";
import {
    Message,
    PID,
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
    'batch': {
        operations: Array<{ type: string, data: any }>;
    };
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

test("EnhancedActorProxy should support batch operations", async () => {
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
    const user1 = { id: "user1", name: "John", email: "john@example.com" };
    const user2 = { id: "user2", name: "Alice", email: "alice@example.com" };
    mockContext.requestResults[`get-${JSON.stringify({ id: "user1" })}`] = user1;
    mockContext.requestResults[`get-${JSON.stringify({ id: "user2" })}`] = user2;

    // 创建增强的Actor代理
    const userProxy = createEnhancedActorProxy<UserMessages>(
        mockSystem as any,
        { id: "user-actor" } as PID,
        { timeout: 1000 }
    );

    // 测试批量发送
    await userProxy.sendBatch([
        {
            type: 'create',
            payload: { name: "John", email: "john@example.com" }
        },
        {
            type: 'create',
            payload: { name: "Alice", email: "alice@example.com" }
        }
    ]);

    expect(mockContext.sentMessages.length).toBe(2);
    expect(mockContext.sentMessages[0].message.type).toBe("create");
    expect(mockContext.sentMessages[0].message.payload).toEqual({ name: "John", email: "john@example.com" });
    expect(mockContext.sentMessages[1].message.type).toBe("create");
    expect(mockContext.sentMessages[1].message.payload).toEqual({ name: "Alice", email: "alice@example.com" });

    // 测试批量请求
    const results = await userProxy.requestBatch([
        {
            type: 'get',
            payload: { id: "user1" }
        },
        {
            type: 'get',
            payload: { id: "user2" }
        }
    ]);

    expect(results.length).toBe(2);
    expect(results[0]).toEqual(user1);
    expect(results[1]).toEqual(user2);
    expect(mockContext.requestCalls.length).toBe(2);
});

test("EnhancedActorProxy should support allSettled in batch operations", async () => {
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

    // 设置mock请求结果，包括一个错误
    const user1 = { id: "user1", name: "John", email: "john@example.com" };
    mockContext.requestResults[`get-${JSON.stringify({ id: "user1" })}`] = user1;
    mockContext.requestResults[`get-${JSON.stringify({ id: "error" })}`] = new Error("User not found");

    // 创建增强的Actor代理
    const userProxy = createEnhancedActorProxy<UserMessages>(
        mockSystem as any,
        { id: "user-actor" } as PID,
        { timeout: 1000 }
    );

    // 测试allSettled选项，允许部分失败
    const results = await userProxy.requestBatch([
        {
            type: 'get',
            payload: { id: "user1" }
        },
        {
            type: 'get',
            payload: { id: "error" }
        }
    ], { allSettled: true });

    expect(results.length).toBe(2);
    expect(results[0]).toEqual(user1);
    expect(results[1]).toBeUndefined();
    expect(mockContext.requestCalls.length).toBe(2);
});

test("EnhancedActorProxy should support interceptors", async () => {
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
    const user1 = { id: "user1", name: "John", email: "john@example.com" };
    mockContext.requestResults[`get-${JSON.stringify({ id: "user1" })}`] = user1;

    // 创建一个拦截器，只允许get操作
    const interceptor = mock((messageType: string, payload: any, isRequest: boolean) => {
        return messageType === 'get';
    });

    // 创建增强的Actor代理
    const userProxy = createEnhancedActorProxy<UserMessages>(
        mockSystem as any,
        { id: "user-actor" } as PID,
        {
            timeout: 1000,
            interceptor
        }
    );

    // 尝试发送创建消息 - 应该被拦截器阻止
    await userProxy.sendCreate({ name: "John", email: "john@example.com" });
    // 预期不会发送
    expect(mockContext.sentMessages.length).toBe(0);
    expect(interceptor).toHaveBeenCalled();
    expect(interceptor).toHaveBeenCalledWith('create', { name: "John", email: "john@example.com" }, false);

    // 发送get请求 - 应该被允许
    await userProxy.requestGet({ id: "user1" });
    expect(mockContext.requestCalls.length).toBe(1);
    expect(interceptor).toHaveBeenCalledWith('get', { id: "user1" }, true);
});

test("EnhancedActorProxy should support dynamic configuration", async () => {
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
    const user1 = { id: "user1", name: "John", email: "john@example.com" };
    mockContext.requestResults[`get-${JSON.stringify({ id: "user1" })}`] = user1;

    // 初始错误处理器
    const initialErrorHandler = mock((error: Error, messageType: string, payload: any) => { });

    // 创建增强的Actor代理
    const userProxy = createEnhancedActorProxy<UserMessages>(
        mockSystem as any,
        { id: "user-actor" } as PID,
        {
            timeout: 1000,
            errorHandler: initialErrorHandler
        }
    );

    // 测试初始配置
    await userProxy.requestGet({ id: "user1" }, 1000);
    expect(mockContext.requestCalls[0].timeout).toBe(1000);

    // 动态更新超时设置
    userProxy.setTimeout(2000);

    // 使用新的超时设置
    await userProxy.requestGet({ id: "user1" });
    expect(mockContext.requestCalls[1].timeout).toBe(2000);

    // 创建新的错误处理器
    const newErrorHandler = mock((error: Error, messageType: string, payload: any) => { });

    // 动态更新错误处理器
    userProxy.setErrorHandler(newErrorHandler);

    // 制造一个错误
    mockContext.requestResults[`get-${JSON.stringify({ id: "error" })}`] = new Error("User not found");

    try {
        await userProxy.requestGet({ id: "error" });
    } catch (error) {
        // 验证新的错误处理器被调用，而不是初始的
        expect(newErrorHandler).toHaveBeenCalled();
        expect(initialErrorHandler).not.toHaveBeenCalled();
    }
}); 