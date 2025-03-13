// 测试 RequestResponseProtocol 的导入
import { describe, it, expect } from 'bun:test';
import { RequestResponseProtocol, createRequestResponseMap } from '../request-response';

describe('RequestResponseProtocol', () => {
    it('should be correctly imported and usable', () => {
        // 定义请求和响应类型
        interface UserRequest {
            id: string;
        }

        interface UserResponse {
            name: string;
            email: string;
        }

        // 创建请求-响应协议
        const userProtocol: RequestResponseProtocol<UserRequest, UserResponse> = {
            requestType: 'user.get',
            responseType: 'user.result',
            requestValidator: (val): val is UserRequest => {
                return typeof val === 'object' && val !== null && typeof val.id === 'string';
            },
            responseValidator: (val): val is UserResponse => {
                return typeof val === 'object' && val !== null &&
                    typeof val.name === 'string' && typeof val.email === 'string';
            }
        };

        // 使用工厂函数创建请求-响应协议
        const protocol = createRequestResponseMap<UserRequest, UserResponse>(
            'user.get',
            'user.result',
            (val): val is UserRequest => {
                return typeof val === 'object' && val !== null && typeof val.id === 'string';
            },
            (val): val is UserResponse => {
                return typeof val === 'object' && val !== null &&
                    typeof val.name === 'string' && typeof val.email === 'string';
            }
        );

        // 验证协议属性
        expect(userProtocol.requestType).toBe('user.get');
        expect(userProtocol.responseType).toBe('user.result');
        expect(typeof userProtocol.requestValidator).toBe('function');
        expect(typeof userProtocol.responseValidator).toBe('function');

        // 验证工厂函数创建的协议
        expect(protocol.requestType).toBe('user.get');
        expect(protocol.responseType).toBe('user.result');
        expect(typeof protocol.requestValidator).toBe('function');
        expect(typeof protocol.responseValidator).toBe('function');
    });
}); 