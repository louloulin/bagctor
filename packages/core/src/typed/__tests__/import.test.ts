import { describe, it, expect } from 'bun:test';
import { Actor } from '../../core/actor';
import { Message as BaseMessage, PID as BasePID } from '@bactor/common';
import { Props } from '../../core/types';

import {
    TypedActor,
    MessageMap,
    PID,
    ActorContext
} from '../index';

import { RequestResponseProtocol } from '../request-response';

describe('导入测试', () => {
    it('应该能正确导入所有必要的类型和函数', () => {
        // 验证导入是否成功
        expect(TypedActor).toBeDefined();
        // 不能检查接口，因为接口在运行时不存在

        // 验证可以使用这些类型
        type TestProtocol = RequestResponseProtocol<{ id: string }, { name: string }>;

        // 创建一个使用了这些类型的对象
        const protocol: TestProtocol = {
            requestType: 'test.request',
            responseType: 'test.response'
        };

        expect(protocol.requestType).toBe('test.request');
        expect(protocol.responseType).toBe('test.response');
    });
}); 