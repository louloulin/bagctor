import { describe, it, expect } from 'bun:test';
import { Actor } from '../../core/actor';
import { Message as BaseMessage, PID as BasePID } from '@bactor/common';
import { Props } from '../../core/types';

import {
    MessageMap,
    Message,
    PID,
    toBaseMessage,
    toTypedMessage
} from '../types';

import { SimpleTypedActor } from '../actor-extension';

// 创建一个不依赖于 request-response.ts 的测试

describe('简化的向后兼容性测试', () => {
    it('应该能创建 SimpleTypedActor 类', () => {
        // 定义消息和状态类型
        interface TestState {
            counter: number;
        }

        interface TestMessages extends MessageMap {
            increment: { value: number };
            decrement: { value: number };
            get: { key: string };
        }

        // 继承 SimpleTypedActor
        class TestActor extends SimpleTypedActor<TestState, TestMessages> {
            protected behaviors(): void {
                this.on('increment', async (payload) => {
                    const newCounter = this.getState().counter + payload.value;
                    this.setState({ counter: newCounter });
                });

                this.on('decrement', async (payload) => {
                    const newCounter = this.getState().counter - payload.value;
                    this.setState({ counter: newCounter });
                });
            }
        }

        // 创建模拟上下文
        const mockContext = {
            self: { id: 'test-actor', address: 'local' } as PID<TestMessages>,
            send: async () => { }, // 简单的空函数
            spawn: async () => ({ id: 'child', address: 'local' } as PID<any>),
            stop: async () => { },
            stopAll: async () => { }
        };

        // 创建 actor 实例
        const actor = new TestActor(mockContext as any, { counter: 0 });

        // 验证 actor
        expect(actor).toBeDefined();
    });

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
        // 安全地检查可选字段
        if (typedMessage.sender && baseMessage.sender) {
            expect(typedMessage.sender.id).toBe(baseMessage.sender.id);
            expect(typedMessage.sender.address).toBe(baseMessage.sender.address);
        }
        if (typedMessage.metadata && baseMessage.metadata) {
            expect(typedMessage.metadata.timestamp).toBe(baseMessage.metadata.timestamp);
        }

        // 转换回基础消息
        const convertedBaseMessage = toBaseMessage(typedMessage);

        // 验证转换后的基础消息
        expect(convertedBaseMessage.type).toBe(baseMessage.type);
        expect(convertedBaseMessage.payload).toEqual(baseMessage.payload);
    });
}); 