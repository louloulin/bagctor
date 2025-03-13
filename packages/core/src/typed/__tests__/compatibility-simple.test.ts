import { describe, it, expect } from 'bun:test';
import { Actor } from '../../core/actor';
import { Message as BaseMessage, PID as BasePID } from '@bactor/common';
import { Props } from '../../core/types';

import {
    TypedActor,
    MessageMap,
    PID,
    toBaseMessage,
    toTypedMessage
} from '../index';

// 不导入 RequestResponseProtocol，避免导入问题

describe('简化的向后兼容性测试', () => {
    it('toTypedMessage和toBaseMessage应该正确转换消息', () => {
        // 创建基础消息
        const baseMessage: BaseMessage = {
            type: 'test',
            payload: { value: 'test-value' },
            sender: { id: 'actor-1', address: 'local' },
            metadata: { timestamp: Date.now() }
        };

        // 转换为类型安全消息
        interface TestMessages extends MessageMap {
            test: { value: string };
        }

        const typedMessage = toTypedMessage<'test', TestMessages>(baseMessage);

        // 验证类型安全消息
        expect(typedMessage.type).toBe('test');
        expect(typedMessage.payload.value).toBe('test-value');
        if (typedMessage.sender) {
            expect(typedMessage.sender).toEqual(baseMessage.sender);
        }
        if (typedMessage.metadata) {
            expect(typedMessage.metadata).toEqual(baseMessage.metadata);
        }

        // 转换回基础消息
        const convertedBaseMessage = toBaseMessage(typedMessage);

        // 验证转换后的基础消息
        expect(convertedBaseMessage).toEqual(baseMessage);
    });
}); 