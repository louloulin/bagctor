import { Actor } from '../../core/actor';
import { Message as BaseMessage, PID as BasePID } from '@bactor/common';
import { Props } from '../../core/types';

import {
    TypedActor,
    MessageMap,
    PID,
    toTypedMessage,
    toBaseMessage,
    ActorState
} from '../index';

import { MockActorSystem, MockActorContext } from './backward-compatibility.mock';

// 验证类型擦除机制，确保运行时性能不受类型系统影响
describe('类型擦除和性能测试', () => {
    let system: MockActorSystem;
    let rootContext: MockActorContext;

    beforeEach(() => {
        system = new MockActorSystem('type-erasure-test');
        rootContext = system.rootContext;
    });

    afterEach(async () => {
        await system.shutdown();
    });

    // 测试类型擦除
    it('TypedActor的类型信息应该在运行时被擦除', () => {
        // 定义消息类型
        interface CounterMessages extends MessageMap {
            increment: { value: number };
            decrement: { value: number };
            getCount: null;
        }

        // 定义状态类型
        interface CounterState {
            count: number;
        }

        // 创建TypedActor类
        class TypedCounterActor extends TypedActor<CounterState, CounterMessages> {
            protected behaviors(): void {
                this.on('increment', payload => {
                    this.setState({ count: this.getState().count + payload.value });
                });

                this.on('decrement', payload => {
                    this.setState({ count: this.getState().count - payload.value });
                });
            }

            // 公共方法用于测试
            public hasMessageTypeField(): boolean {
                // @ts-ignore - 检查私有字段
                return this._messageTypes !== undefined;
            }

            public hasStateTypeField(): boolean {
                // @ts-ignore - 检查私有字段
                return this._stateType !== undefined;
            }
        }

        // 获取TypedActor的原型
        const proto = Object.getPrototypeOf(TypedCounterActor);

        // 类型擦除验证：保留原始Actor功能
        expect(typeof TypedCounterActor.prototype.receive).toBe('function');

        // 构造Actor实例
        const props = {
            actorClass: TypedCounterActor,
            actorContext: { initialState: { count: 0 } }
        } as unknown as Props;

        rootContext.spawn(props).then(ref => {
            const instance = system.getActor(ref.id) as unknown as TypedCounterActor;

            // 类型信息不应该存在于运行时
            expect(instance.hasMessageTypeField()).toBe(false);
            expect(instance.hasStateTypeField()).toBe(false);
        });
    });

    // 测试类型转换不引入额外开销
    it('消息类型转换不应显著影响性能', () => {
        const iterations = 10000;

        // 创建测试消息
        const baseMessage: BaseMessage = {
            type: 'test',
            payload: { value: 42 },
            sender: { id: 'test-actor', address: 'local' }
        };

        // 定义类型
        interface TestMessages extends MessageMap {
            test: { value: number };
        }

        // 测量类型转换的性能
        const start = performance.now();

        for (let i = 0; i < iterations; i++) {
            const typedMessage = toTypedMessage<'test', TestMessages>(baseMessage);
            const convertedBack = toBaseMessage(typedMessage);
        }

        const end = performance.now();
        const duration = end - start;

        console.log(`类型转换 ${iterations} 次耗时: ${duration}ms`);
        console.log(`平均每次转换耗时: ${duration / iterations}ms`);

        // 测试直接使用消息的性能
        const baseStart = performance.now();

        for (let i = 0; i < iterations; i++) {
            const message = { ...baseMessage };
            const payload = message.payload;
        }

        const baseEnd = performance.now();
        const baseDuration = baseEnd - baseStart;

        console.log(`直接使用消息 ${iterations} 次耗时: ${baseDuration}ms`);
        console.log(`平均每次使用耗时: ${baseDuration / iterations}ms`);

        // 类型转换的性能开销应在可接受范围内
        // 由于浏览器和环境差异，我们只能做定性比较
        // 我们期望类型转换的开销不超过直接使用的3倍
        expect(duration).toBeLessThan(baseDuration * 3);
    });

    // 测试类型验证的可选性
    it('运行时类型验证应是可选的，不影响核心功能', async () => {
        // 定义一个带验证器的Actor
        interface UserMessage extends MessageMap {
            createUser: { id: string; name: string; age: number };
            updateUser: { id: string; name?: string; age?: number };
        }

        interface UserState {
            users: Record<string, { name: string; age: number }>;
        }

        // 简单的验证函数，验证createUser消息
        const validateCreateUser = (payload: any): payload is UserMessage['createUser'] => {
            return typeof payload === 'object' &&
                payload !== null &&
                typeof payload.id === 'string' &&
                typeof payload.name === 'string' &&
                typeof payload.age === 'number';
        };

        class UserActor extends TypedActor<UserState, UserMessage> {
            // 验证器标志，用于测试
            public validationCalled = false;
            public users: Record<string, { name: string; age: number }> = {};

            protected behaviors(): void {
                this.on('createUser', (payload, context) => {
                    // 可选的运行时验证
                    if (process.env.ENABLE_VALIDATION) {
                        if (!validateCreateUser(payload)) {
                            throw new Error('Invalid createUser payload');
                        }
                    }

                    // 标记验证已调用
                    this.validationCalled = true;

                    // 处理消息
                    const { id, name, age } = payload;
                    const users = { ...this.getState().users };
                    users[id] = { name, age };
                    this.setState({ users });

                    // 为了测试目的，保存到公共字段
                    this.users = users;
                });
            }
        }

        // 创建Actor并发送消息
        const userProps = {
            actorClass: UserActor,
            actorContext: { initialState: { users: {} } }
        } as unknown as Props;

        const userRef = await rootContext.spawn(userProps);
        const userActor = system.getActor(userRef.id) as unknown as UserActor;

        // 发送消息
        await rootContext.send(userRef, {
            type: 'createUser',
            payload: { id: '1', name: 'John', age: 30 }
        });

        // 等待消息处理
        await new Promise(resolve => setTimeout(resolve, 50));

        // 验证消息已处理
        expect(userActor.validationCalled).toBe(true);
        expect(userActor.users['1']).toEqual({ name: 'John', age: 30 });
    });
}); 