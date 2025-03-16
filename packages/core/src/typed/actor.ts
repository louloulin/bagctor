import { Message as BaseMessage } from '@bactor/common';
import { Actor as BaseActor } from '../core/actor';
import { ActorContext as BaseActorContext } from '../core/context';
import {
    Actor,
    ActorContext,
    MessageMap,
    Message,
    TypedMessage,
    PID,
    TypedPID,
    MessageContext,
    PayloadHandler,
    toBaseMessage
} from './types';
import { TypedActorContext, createTypedContext } from './context';
import { RequestResponseProtocol } from './request-response';

// Helper function to convert BaseMessage to TypedMessage
function toTypedMessage<K extends keyof TM, TM extends MessageMap = any>(
    message: BaseMessage,
    defaultType?: K
): TypedMessage<K, TM> {
    return {
        type: message.type as K,
        payload: message.payload,
        sender: message.sender,
        metadata: message.metadata,
        messageId: message.messageId
    } as TypedMessage<K, TM>;
}

// 定义ActorState接口
export interface ActorState<T = any> {
    behavior: string;
    data: T;
}

/**
 * 类型安全的Actor基类，提供类型化的消息处理和状态管理
 */
export abstract class TypedActor<TState = any, TM extends MessageMap = any> implements Actor<TM> {
    protected context: ActorContext<TM>;
    protected state: ActorState<TState>;
    protected behaviorMap = new Map<string, (message: Message<any, TM>) => Promise<void>>();
    protected handlers = new Map<keyof TM, PayloadHandler<any, any, TM>>();
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
        const typedContext = this.context as TypedActorContext<TM>;
        if (typedContext.receive && typedContext.receive(message)) {
            return;
        }

        // 将原始消息转换为类型安全的消息
        const typedMessage = toTypedMessage(message);
        this.currentMessage = typedMessage;

        // 获取当前行为处理函数
        const behavior = this.behaviorMap.get(this.state.behavior);
        if (!behavior) {
            console.warn(`No behavior found for ${this.state.behavior}`);
            return;
        }

        // 处理消息
        try {
            await behavior(typedMessage);
        } catch (error) {
            console.error('Error processing message:', error);
            throw error;
        }
    }

    /**
     * 注册特定类型消息的处理器
     */
    protected on<K extends keyof TM>(
        messageType: K,
        handler: PayloadHandler<K, TM, TM[K]>
    ): this {
        this.handlers.set(messageType, handler as PayloadHandler<any, any, TM>);

        // 如果还没有默认行为，添加一个
        if (!this.behaviorMap.has('default')) {
            this.addDispatchBehavior('default');
        }

        return this;
    }

    /**
     * 添加一个消息处理行为
     */
    protected addBehavior(
        name: string,
        handler: (message: Message<any, TM>) => Promise<void>
    ): this {
        this.behaviorMap.set(name, handler);
        return this;
    }

    /**
     * 切换到新的行为
     */
    protected become(behavior: string): void {
        if (!this.behaviorMap.has(behavior)) {
            throw new Error(`Behavior ${behavior} not defined`);
        }
        this.state.behavior = behavior;
    }

    /**
     * 添加一个基于类型分发的行为
     */
    private addDispatchBehavior(name: string): void {
        this.addBehavior(name, async (message: Message<any, TM>) => {
            const handler = this.handlers.get(message.type);
            if (handler) {
                const context: MessageContext = {
                    sender: message.sender,
                    messageId: message.messageId,
                    metadata: message.metadata,
                    self: this.context.self,
                    message: message as any
                };
                await handler(message.payload, context);
            }
        });
    }

    /**
     * 获取当前状态（只读）
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
     * 确保消息是类型安全的
     */
    private ensureTypedMessage(message: Message<any, TM> | BaseMessage): Message<any, TM> {
        if ('type' in message && 'payload' in message) {
            return message as Message<any, TM>;
        }
        return toTypedMessage(message as BaseMessage);
    }

    /**
     * 向目标Actor发送消息
     */
    protected async send<K extends keyof TM>(
        target: PID<any>,
        messageType: K,
        payload: TM[K]
    ): Promise<void> {
        await this.context.send(target, messageType, payload);
    }

    /**
     * 向目标Actor发送请求并等待响应
     */
    protected async ask<Req, Res>(
        target: PID<any>,
        protocol: RequestResponseProtocol<Req, Res>,
        request: Req,
        timeoutMs?: number
    ): Promise<Res> {
        const typedContext = this.context as TypedActorContext<TM>;
        if (!typedContext.ask) {
            throw new Error('Context does not support ask pattern');
        }
        return typedContext.ask(target, protocol, request, timeoutMs);
    }
}

/**
 * 通过包装现有Actor创建类型安全的Actor
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
            const typedContext = this.context as TypedActorContext<TM>;
            const baseActor = new BaseActorClass(typedContext.getBaseContext());

            // 设置一个默认行为委托到基础Actor
            this.addBehavior('default', async (message: Message<any, TM>) => {
                const baseMessage = {
                    type: message.type.toString(),
                    payload: message.payload,
                    sender: message.sender,
                    metadata: message.metadata,
                    messageId: message.messageId
                };
                await baseActor.receive(baseMessage);
            });
        }
    };
} 