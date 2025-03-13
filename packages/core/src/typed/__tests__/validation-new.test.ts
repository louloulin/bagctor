import { describe, it, expect } from 'bun:test';

// 从 types.ts 直接导入以避免 request-response 依赖问题
import {
    Validator,
    MessageMap
} from '../types';

// 从 messages.ts 直接导入以避免模块解析问题
import {
    MessageRegistry,
    objectValidator,
    isString,
    isNumber,
    unionValidator,
    arrayValidator,
    optionalValidator,
    recordValidator
} from '../messages';

describe('消息验证测试', () => {
    it('应该能正确验证对象结构', () => {
        // 创建一个对象验证器
        interface User {
            id: string;
            name: string;
            age: number;
        }

        const userValidator = objectValidator<User>({
            id: isString,
            name: isString,
            age: isNumber
        });

        // 验证有效对象
        const validUser = {
            id: '123',
            name: 'John',
            age: 30
        };
        expect(userValidator(validUser)).toBe(true);

        // 验证无效对象
        const invalidUser1 = {
            id: 123, // 应该是字符串
            name: 'John',
            age: 30
        };
        expect(userValidator(invalidUser1)).toBe(false);

        const invalidUser2 = {
            id: '123',
            name: 'John'
            // 缺少 age 字段
        };
        expect(userValidator(invalidUser2)).toBe(false);

        const invalidUser3 = {
            id: '123',
            name: 'John',
            age: '30' // 应该是数字
        };
        expect(userValidator(invalidUser3)).toBe(false);
    });

    it('应该能正确验证联合类型', () => {
        // 创建一个联合类型验证器
        type Status = 'pending' | 'approved' | 'rejected';

        // 为每个可能的值创建验证器
        const isPending = (val: any): val is 'pending' => val === 'pending';
        const isApproved = (val: any): val is 'approved' => val === 'approved';
        const isRejected = (val: any): val is 'rejected' => val === 'rejected';

        const statusValidator = unionValidator<Status>(isPending, isApproved, isRejected);

        // 验证有效值
        expect(statusValidator('pending')).toBe(true);
        expect(statusValidator('approved')).toBe(true);
        expect(statusValidator('rejected')).toBe(true);

        // 验证无效值
        expect(statusValidator('completed')).toBe(false);
        expect(statusValidator(123)).toBe(false);
    });

    it('应该能正确验证数组', () => {
        // 创建一个数组验证器
        const stringArrayValidator = arrayValidator<string>(isString);

        // 验证有效数组
        expect(stringArrayValidator(['a', 'b', 'c'])).toBe(true);

        // 验证无效数组
        expect(stringArrayValidator(['a', 1, 'c'])).toBe(false);
        expect(stringArrayValidator('not an array')).toBe(false);
    });

    it('应该能正确验证可选字段', () => {
        // 创建一个可选字段验证器
        const optionalStringValidator = optionalValidator<string>(isString);

        // 验证有效值
        expect(optionalStringValidator('hello')).toBe(true);
        expect(optionalStringValidator(undefined)).toBe(true);

        // 验证无效值
        expect(optionalStringValidator(123)).toBe(false);
    });

    it('应该能正确验证记录类型', () => {
        // 创建一个记录验证器
        // 第一个参数是键验证器，第二个是值验证器
        const stringKeyValidator = (key: string): key is string => isString(key);
        const stringRecordValidator = recordValidator<string, string>(stringKeyValidator, isString);

        // 验证有效记录
        expect(stringRecordValidator({ a: 'hello', b: 'world' })).toBe(true);

        // 验证无效记录
        expect(stringRecordValidator({ a: 'hello', b: 123 })).toBe(false);
        expect(stringRecordValidator('not an object')).toBe(false);
    });

    it('应该能正确使用 MessageRegistry', () => {
        interface UserMessages extends MessageMap {
            'user.create': { name: string; email: string };
            'user.update': { id: string; name?: string; email?: string };
            'user.delete': { id: string };
        }

        // 创建消息注册表
        const registry = new MessageRegistry<UserMessages>();

        // 注册验证器
        registry.register('user.create', objectValidator<UserMessages['user.create']>({
            name: isString,
            email: isString
        }));

        // 简化验证器，只检查必要字段
        registry.register('user.update', objectValidator<UserMessages['user.update']>({
            id: isString
        }, { allowExtraProperties: true }));

        registry.register('user.delete', objectValidator<UserMessages['user.delete']>({
            id: isString
        }));

        // 验证有效消息
        expect(registry.validate('user.create', { name: 'John', email: 'john@example.com' })).toBe(true);
        expect(registry.validate('user.update', { id: '123', name: 'John' })).toBe(true);
        expect(registry.validate('user.delete', { id: '123' })).toBe(true);

        // 验证无效消息
        expect(registry.validate('user.create', { name: 'John' })).toBe(false); // 缺少 email
        expect(registry.validate('user.update', { name: 'John' })).toBe(false); // 缺少 id
        expect(registry.validate('user.delete', { id: 123 })).toBe(false); // id 不是字符串
    });
}); 