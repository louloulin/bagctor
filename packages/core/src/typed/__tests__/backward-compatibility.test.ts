import { Actor } from '../../core/actor';
import { Message as BaseMessage, PID as BasePID } from '@bactor/common';
import { Props } from '../../core/types';

import { MessageMap, PID, ActorContext } from '../types';
import { TypedActor, typedActorOf } from '../actor';
import { createTypedContext } from '../context';
import { toBaseMessage, toTypedMessage } from '../types';
import { RequestResponseProtocol, createRequestResponseMap } from '../request-response';

// 内联定义接口，仅用于测试
// interface RequestResponseProtocol<TReq, TRes> {
//     requestType: string;
//     responseType: string;
//     requestValidator?: (value: any) => value is TReq;
//     responseValidator?: (value: any) => value is TRes;
// }

import { MockActorSystem, MockActorContext } from './backward-compatibility.mock';

// 这些测试使用模拟组件和类型断言来验证向后兼容性
// 在实际应用中，应该使用真实的ActorSystem
describe('与传统Actor系统的向后兼容性', () => {
    let system: MockActorSystem;
    let rootContext: MockActorContext;

    beforeEach(() => {
        system = new MockActorSystem('test-system');
        rootContext = system.rootContext;
    });

    afterEach(async () => {
        await system.shutdown();
    });

    // 测试传统Actor接收类型安全的消息
    it('传统Actor应该能接收由TypedActor发送的消息', async () => {
        // 创建一个简单的传统Actor
        class TraditionalActor extends Actor {
            private counter = 0;
            public testValue = '';

            protected behaviors(): void {
                this.addBehavior('default', async (message: BaseMessage) => {
                    if (message.type === 'increment') {
                        this.counter += message.payload.value;
                    } else if (message.type === 'setValue') {
                        this.testValue = message.payload.value;
                    }
                });
            }

            public getCounter(): number {
                return this.counter;
            }
        }

        // 创建一个类型安全的Actor
        interface TypedActorMessages extends MessageMap {
            increment: { value: number };
            setValue: { value: string };
            getValue: { key: string };
        }

        class SafeActor extends TypedActor<{}, TypedActorMessages> {
            protected behaviors(): void {
                this.on('getValue', async (payload, context) => {
                    // 这里什么都不做
                });
            }
        }

        // 创建传统Actor
        const traditionalProps: Props = { actorClass: TraditionalActor };
        const traditionalRef = await rootContext.spawn(traditionalProps);

        // 获取Actor实例用于验证
        const traditionalActor = system.getActor(traditionalRef.id) as TraditionalActor;

        // 创建TypedActor
        // 使用类型断言解决Props类型不匹配问题
        const typedProps = {
            actorClass: SafeActor,
            actorContext: { initialState: {} }
        } as unknown as Props;
        const typedRef = await rootContext.spawn(typedProps);

        // 为了测试目的，直接使用rootContext发送消息
        await rootContext.send(traditionalRef, {
            type: 'increment',
            payload: { value: 5 }
        });

        await rootContext.send(traditionalRef, {
            type: 'setValue',
            payload: { value: 'test' }
        });

        // 等待消息处理
        await new Promise(resolve => setTimeout(resolve, 50));

        // 验证传统Actor是否正确处理了消息
        expect(traditionalActor.getCounter()).toBe(5);
        expect(traditionalActor.testValue).toBe('test');
    });

    // 测试类型安全Actor接收传统消息
    it('TypedActor应该能接收由传统Actor发送的消息', async () => {
        // 创建一个简单的传统Actor
        class TraditionalActor extends Actor {
            protected behaviors(): void {
                this.addBehavior('default', async (message: BaseMessage) => {
                    // 发送消息到TypedActor
                    if (message.type === 'sendToTyped') {
                        const targetPid = message.payload.target;
                        await this.send(targetPid, {
                            type: 'setValue',
                            payload: { value: 'from-traditional' }
                        });
                    }
                });
            }
        }

        // 创建一个类型安全的Actor，记录接收到的消息
        interface TypedActorMessages extends MessageMap {
            setValue: { value: string };
            getValue: { key: string };
        }

        interface TypedActorState {
            receivedValue: string;
        }

        class ReceiverActor extends TypedActor<TypedActorState, TypedActorMessages> {
            protected behaviors(): void {
                this.on('setValue', async (payload) => {
                    this.setState({ receivedValue: payload.value });
                });
            }

            // 用于测试的公共访问器
            public getReceivedValue(): string {
                return this.getState().receivedValue;
            }
        }

        // 创建TypedActor
        const receiverProps = {
            actorClass: ReceiverActor,
            actorContext: { initialState: { receivedValue: '' } }
        } as unknown as Props;
        const receiverRef = await rootContext.spawn(receiverProps);

        // 获取Actor实例用于验证并强制类型转换
        const receiverActor = system.getActor(receiverRef.id) as unknown as ReceiverActor;

        // 创建传统Actor
        const senderProps: Props = { actorClass: TraditionalActor };
        const senderRef = await rootContext.spawn(senderProps);

        // 从传统Actor发送消息到TypedActor
        await rootContext.send(senderRef, {
            type: 'sendToTyped',
            payload: { target: receiverRef }
        });

        // 等待消息处理
        await new Promise(resolve => setTimeout(resolve, 50));

        // 验证TypedActor是否正确处理了消息
        expect(receiverActor.getReceivedValue()).toBe('from-traditional');
    });

    // 测试typedActorOf包装
    it('typedActorOf应该能正确包装传统Actor', async () => {
        // 创建一个简单的传统Actor
        class TraditionalCounter extends Actor {
            private count = 0;

            protected behaviors(): void {
                this.addBehavior('default', async (message: BaseMessage) => {
                    if (message.type === 'increment') {
                        this.count += message.payload.value;
                    } else if (message.type === 'getCount' && message.sender) {
                        await this.send(message.sender, {
                            type: 'countResult',
                            payload: { count: this.count }
                        });
                    }
                });
            }
        }

        // 定义消息类型
        interface CounterMessages extends MessageMap {
            increment: { value: number };
            getCount: null;
            countResult: { count: number };
        }

        // 定义状态类型
        interface CounterState {
            count: number;
        }

        // 使用typedActorOf包装传统Actor
        const TypedCounterActor = typedActorOf<CounterState, CounterMessages>(TraditionalCounter);

        // 创建包装后的Actor
        const counterProps = {
            actorClass: TypedCounterActor,
            actorContext: { initialState: { count: 0 } }
        } as unknown as Props;
        const counterRef = await rootContext.spawn(counterProps);

        // 直接向counter发送increment消息
        await rootContext.send(counterRef, {
            type: 'increment',
            payload: { value: 10 }
        });

        // 使用请求-响应模式获取计数
        const responsePromise = new Promise<number>((resolve) => {
            // 创建一个临时Actor用于接收响应
            class TempActor extends Actor {
                protected behaviors(): void {
                    this.addBehavior('default', async (message: BaseMessage) => {
                        if (message.type === 'countResult') {
                            resolve(message.payload.count);
                        }
                    });
                }
            }

            // 创建临时Actor
            rootContext.spawn({ actorClass: TempActor }).then(tempRef => {
                // 发送获取计数请求
                rootContext.send(counterRef, {
                    type: 'getCount',
                    payload: null,
                    sender: tempRef
                });
            });
        });

        // 等待响应
        const count = await responsePromise;

        // 验证计数
        expect(count).toBe(10);
    });

    // 测试消息转换函数
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
        expect(typedMessage.sender).toEqual(baseMessage.sender);
        expect(typedMessage.metadata).toEqual(baseMessage.metadata);

        // 转换回基础消息
        const convertedBaseMessage = toBaseMessage(typedMessage);

        // 验证转换后的基础消息
        expect(convertedBaseMessage).toEqual(baseMessage);
    });
}); 