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
const userProtocol = createRequestResponseMap<UserRequest, UserResponse>();

// 测试请求-响应消息格式
test('should create request-response messages', () => {
    // 创建请求消息
    const correlationId = 'test-123';
    const mockSender = { id: 'sender-1' };
    const reqMsg = request(userProtocol, { id: 'user1' }, mockSender as any, correlationId);

    // 验证请求消息结构
    expect(reqMsg.type).toBe('request');
    expect(reqMsg.payload).toEqual({ id: 'user1' });
    expect(reqMsg.sender).toBe(mockSender);
    expect(reqMsg.metadata?.correlationId).toBe(correlationId);

    // 创建响应消息
    const respMsg = response(userProtocol, {
        id: 'user1',
        name: 'Test User',
        email: 'test@example.com',
        found: true
    }, reqMsg, mockSender as any);

    // 验证响应消息结构
    expect(respMsg.type).toBe('response');
    expect(respMsg.payload).toEqual({
        id: 'user1',
        name: 'Test User',
        email: 'test@example.com',
        found: true
    });
    expect(respMsg.sender).toBe(mockSender);
    expect(respMsg.metadata?.correlationId).toBe(correlationId);
});

// 测试请求-响应消息工厂
test('should work with response protocol mappings', () => {
    // 验证协议映射
    expect(userProtocol).toHaveProperty('request');
    expect(userProtocol).toHaveProperty('response');

    // 测试类型安全
    const testReq: UserRequest = { id: 'test' };
    const testResp: UserResponse = {
        id: 'test',
        name: 'Test',
        email: 'test@example.com',
        found: true
    };

    // 这些赋值应该不会有类型错误
    userProtocol.request = testReq;
    userProtocol.response = testResp;

    expect(userProtocol.request).toEqual(testReq);
    expect(userProtocol.response).toEqual(testResp);
}); 