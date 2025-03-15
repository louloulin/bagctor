import { test, expect } from 'bun:test';
import {
    RequestResponseProtocol,
    createRequestResponseMap,
    request,
    response
} from '../request-response';

// ========== 请求-响应协议定义 ==========

// 数据库操作请求-响应协议
interface UserRequest {
    id: string;
}

interface UserResponse {
    id: string;
    name: string;
    email: string;
    found: boolean;
}

// 创建具体的请求-响应协议
type UserProtocol = RequestResponseProtocol<UserRequest, UserResponse>;

// 创建协议映射
const userProtocol = createRequestResponseMap<UserRequest, UserResponse>(
    'user.request',  // 请求类型
    'user.response'  // 响应类型
);

// 测试请求-响应消息格式
test('should create request-response messages', () => {
    // 创建请求消息
    const correlationId = 'test-123';
    const mockSender = { id: 'sender-1' };
    const reqMsg = request(userProtocol, { id: 'user1' }, correlationId);

    // 验证请求消息结构
    expect(reqMsg.type).toBe('user.request');
    expect(reqMsg.payload).toEqual({ id: 'user1' });
    expect(reqMsg.metadata?.correlationId).toBe(correlationId);

    // 创建响应消息
    const respMsg = response(userProtocol, {
        id: 'user1',
        name: 'Test User',
        email: 'test@example.com',
        found: true
    }, correlationId, mockSender as any);

    // 验证响应消息结构
    expect(respMsg.type).toBe('user.response');
    expect(respMsg.payload).toEqual({
        id: 'user1',
        name: 'Test User',
        email: 'test@example.com',
        found: true
    });
    expect(respMsg.metadata?.replyTo).toBe(mockSender);
    expect(respMsg.metadata?.correlationId).toBe(correlationId);
});

// 测试请求-响应消息工厂
test('should work with response protocol mappings', () => {
    // 验证协议映射
    expect(userProtocol).toHaveProperty('requestType');
    expect(userProtocol).toHaveProperty('responseType');

    // 测试类型安全
    const testReq: UserRequest = { id: 'test' };
    const testResp: UserResponse = {
        id: 'test',
        name: 'Test',
        email: 'test@example.com',
        found: true
    };

    // 这里我们只是测试类型兼容性
    expect(userProtocol.requestType).toBe('user.request');
    expect(userProtocol.responseType).toBe('user.response');
}); 