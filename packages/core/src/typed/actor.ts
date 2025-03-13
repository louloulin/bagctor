import { Message as BaseMessage } from '@bactor/common';
import { Actor as BaseActor } from '../core/actor';
import { ActorContext as BaseActorContext } from '../core/context';
import {
    Actor,
    ActorContext,
    MessageMap,
    Message,
    PID,
    MessageContext,
    toTypedMessage,
    ActorState,
    PayloadHandler
} from './types';
import { TypedActorContext, createTypedContext } from './context';
import { RequestResponseProtocol } from './request-response';

/**
 * 类型安全的Actor基类，提供类型化的消息处理和状态管理
 */
export abstract class TypedActor<TState = any, TM extends MessageMap = any> implements Actor<TState, TM> {
    protected context: ActorContext<TM>;
    protected state: ActorState<TState>;
    protected behaviorMap = new Map<string, (message: Message<any, TM>) => Promise<void>>();
    protected handlers = new Map<keyof TM, PayloadHandler<any, TM>>();
    protected currentMessage?: Message<any, TM>;
    protected currentBehavior: string = 'default';

    constructor(context: ActorContext<TM> | BaseActorContext, initialState: TState) {
        // 如果传入的是BaseActorContext，转换为TypedActorContext
        this.context = context instanceof BaseActorContext ?
            createTypedContext<TM>(context) :
            context;

        // 初始化状态
        this.state = {
            behavior: 'default',
            data: initialState ?? ({} as TState)
        };

        // 初始化
        this.initialize();
    }

    /**
     * 初始化Actor
     */
    private initialize(): void {
        this.preStart();
        this.behaviors();
    }

    /**
     * 定义Actor行为
     * 子类必须实现此方法来设置消息处理器
     */
    protected abstract behaviors(): void;

    /**
     * 生命周期钩子：Actor启动前
     */
    protected async preStart(): Promise<void> { }

    /**
     * 生命周期钩子：Actor停止后
     */
    protected async postStop(): Promise<void> { }

    /**
     * 生命周期钩子：Actor重启前
     */
    protected async preRestart(reason: Error): Promise<void> {
        await this.postStop();
    }

    /**
     * 生命周期钩子：Actor重启后
     */
    protected async postRestart(reason: Error): Promise<void> {
        await this.preStart();
    }

    /**
     * 处理接收到的消息
     * 这个方法由Actor系统调用，将接收到的原始消息转换为类型安全的消息
     */
    async receive(message: BaseMessage): Promise<void> {
        // 首先尝试将消息作为响应处理
        if (this.context.receive?.(message)) {
            return;
        }

        // 将原始消息转换为类型安全的消息
        const typedMessage = toTypedMessage<any, TM>(message);
        this.currentMessage = typedMessage;

        // 获取当前行为处理函数
        const behavior = this.behaviorMap.get(this.state.behavior);
        if (behavior) {
            await behavior.call(this, typedMessage);
        } else {
            // 如果没有找到行为处理函数，尝试使用类型特定的处理函数
            const handler = this.handlers.get(typedMessage.type);
            if (handler) {
                await handler(typedMessage.payload, {
                    sender: typedMessage.sender as PID<any>,
                    self: this.context.self,
                    message: typedMessage
                });
            }
        }

        this.currentMessage = undefined;
    }

    /**
     * 注册特定类型消息的处理器
     */
    protected on<K extends keyof TM>(
        messageType: K,
        handler: PayloadHandler<TM[K], TM>
    ): this {
        this.handlers.set(messageType, handler as PayloadHandler<any, TM>);
        return this;
    }

    /**
     * 注册行为处理器
     */
    protected addBehavior(
        name: string,
        handler: (message: Message<any, TM>) => Promise<void>
    ): this {
        this.behaviorMap.set(name, handler);
        return this;
    }

    /**
     * 切换当前行为
     */
    protected become(behavior: string): void {
        if (this.behaviorMap.has(behavior)) {
            this.currentBehavior = behavior;
            this.state.behavior = behavior;
        } else {
            throw new Error(`Behavior ${behavior} not found`);
        }
    }

    /**
     * 获取当前状态
     */
    protected getState(): Readonly<TState> {
        return this.state.data;
    }

    /**
     * 更新状态
     */
    protected setState(newState: Partial<TState>): void {
        this.state.data = { ...this.state.data, ...newState };
    }

    /**
     * 确保消息是类型化的
     */
    private ensureTypedMessage(message: Message<any, TM> | BaseMessage): Message<any, TM> {
        if ('payload' in message) {
            return message as Message<any, TM>;
        }
        return toTypedMessage<any, TM>(message as BaseMessage);
    }

    /**
     * 类型安全的消息发送
     * 向目标Actor发送特定类型的消息
     */
    protected async send<K extends keyof TM>(
        target: PID<any>,
        messageType: K,
        payload: TM[K]
    ): Promise<void> {
        await this.context.send(target, messageType, payload);
    }

    /**
     * 类型安全的请求-响应模式
     * 向目标Actor发送请求并等待响应
     */
    protected async ask<Req, Res>(
        target: PID<any>,
        protocol: RequestResponseProtocol<Req, Res>,
        request: Req,
        timeoutMs?: number
    ): Promise<Res> {
        if (!this.context.ask) {
            throw new Error('Context does not support ask pattern');
        }
        return this.context.ask(target, protocol, request, timeoutMs);
    }
}

/**
 * 类型安全的ActorRef创建工厂
 * 用于从非类型安全的Actor类创建类型安全的Actor
 */
export function typedActorOf<TState, TM extends MessageMap>(
    BaseActorClass: new (...args: any[]) => BaseActor
): new (context: ActorContext<TM> | BaseActorContext, initialState: TState) => TypedActor<TState, TM> {
    return class extends TypedActor<TState, TM> {
        constructor(context: ActorContext<TM> | BaseActorContext, initialState: TState) {
            super(context, initialState);
        }

        protected behaviors(): void {
            // 委托给原始Actor类的behaviors方法
            const baseActor = new BaseActorClass(this.context instanceof TypedActorContext ?
                (this.context as TypedActorContext<TM>).getBaseContext() :
                this.context as BaseActorContext);

            // 设置一个默认行为委托到基础Actor
            this.addBehavior('default', async (message: Message<any, TM>) => {
                await baseActor.receive({
                    type: message.type as string,
                    payload: message.payload,
                    sender: message.sender
                });
            });
        }
    };
} 