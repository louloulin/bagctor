import { Message as BaseMessage } from '@bactor/common';
import { Actor as BaseActor } from '../../packages/core/src/core/actor';
import { ActorContext as BaseActorContext } from '../../packages/core/src/core/context';
import { Message as CoreMessage, PID as CorePID } from '../../packages/core/src/core/types';
import {
    Actor,
    ActorContext,
    MessageMap,
    Message,
    TypedMessage,
    MessageContext,
    PayloadHandler,
    PID,
    ActorState,
    toTypedMessage
} from './types';
import { TypedActorContext, createTypedContext } from './context';
import { RequestResponseProtocol } from '../../packages/core/src/typed/request-response';

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
            context as ActorContext<TM>;

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
     * Actor启动前的生命周期钩子
     */
    protected preStart(): void { }

    /**
     * 定义Actor的行为
     * 子类应该重写此方法以定义不同的行为
     */
    protected abstract behaviors(): void;

    /**
     * 设置当前行为
     */
    protected become(behavior: string): void {
        if (!this.behaviorMap.has(behavior)) {
            throw new Error(`Behavior "${behavior}" is not defined`);
        }
        this.currentBehavior = behavior;
        this.state.behavior = behavior;
    }

    /**
     * 定义行为
     */
    protected defineBehavior(name: string, handler: (message: Message<any, TM>) => Promise<void>): void {
        this.behaviorMap.set(name, handler);
    }

    /**
     * 注册消息处理器
     */
    protected on<K extends keyof TM>(
        messageType: K,
        handler: PayloadHandler<K, TM, TM[K]>
    ): this {
        this.handlers.set(messageType, handler as PayloadHandler<any, any, TM>);
        return this;
    }

    /**
     * 接收消息
     */
    async receive(message: CoreMessage | BaseMessage): Promise<void> {
        // 检查是否有TypedActorContext处理
        if (this.context.receive) {
            const handled = this.context.receive(message as BaseMessage);
            if (handled) return;
        }

        // 转换为类型安全的消息
        const typedMessage = toTypedMessage<any, TM>(
            message as BaseMessage,
            message.type as any,
            undefined
        );

        this.currentMessage = typedMessage;

        // 使用当前行为处理消息
        const currentBehaviorHandler = this.behaviorMap.get(this.currentBehavior);
        if (currentBehaviorHandler) {
            await currentBehaviorHandler(typedMessage);
            return;
        }

        // 如果没有找到行为处理器，尝试使用消息类型处理器
        const messageType = typedMessage.type;
        const handler = this.handlers.get(messageType);

        if (handler) {
            await handler(typedMessage.payload, {
                sender: typedMessage.sender,
                messageId: typedMessage.messageId,
                metadata: typedMessage.metadata,
                self: this.context.self,
                message: typedMessage
            });
        } else {
            console.warn(`No handler found for message type: ${String(messageType)}`);
        }
    }

    /**
     * 发送带类型的消息
     */
    protected async sendTypedMessage<TKey extends keyof TM>(
        target: PID<any>,
        messageType: TKey,
        payload: TM[TKey],
        metadata?: any
    ): Promise<void> {
        if (this.context.sendMessage) {
            // 使用TypedActorContext的sendMessage方法
            const message = {
                type: messageType,
                payload,
                sender: this.context.self,
                metadata
            } as Message<TKey, TM>;
            await this.context.sendMessage(target, message);
        } else {
            // 直接使用ActorContext的send方法
            await this.context.send(target, messageType, payload, metadata);
        }
    }

    /**
     * 将基础消息转换为类型安全的消息
     */
    protected convertToTypedMessage(message: CoreMessage | BaseMessage): Message<any, TM> {
        return toTypedMessage<any, TM>(
            message as BaseMessage,
            message.type as any,
            undefined
        );
    }

    /**
     * 处理请求响应
     */
    protected handleRequestResponse<Req, Res>(
        protocol: RequestResponseProtocol<Req, Res>,
        handler: (request: Req, context: MessageContext) => Promise<Res> | Res
    ): this {
        const { requestType, responseType } = protocol;

        this.on(requestType as unknown as keyof TM, async (payload: TM[keyof TM], context: MessageContext) => {
            try {
                const result = await handler(payload as unknown as Req, context);

                // 发送响应
                if (context.sender && context.metadata?.correlationId) {
                    const responseMessage = {
                        type: responseType,
                        payload: result,
                        sender: context.self,
                        metadata: {
                            correlationId: context.metadata.correlationId,
                            isResponse: true
                        }
                    } as unknown as Message<any, TM>;

                    if (this.context.sendMessage) {
                        await this.context.sendMessage(context.sender, responseMessage as any);
                    } else {
                        await this.context.send(
                            context.sender,
                            responseType as any,
                            result as any,
                            {
                                correlationId: context.metadata.correlationId,
                                isResponse: true
                            }
                        );
                    }
                }
            } catch (error) {
                console.error('Error processing request:', error);
                throw error;
            }
        });

        return this;
    }

    /**
     * 发送请求并等待响应
     */
    protected async ask<Req, Res>(
        target: PID<any>,
        protocol: RequestResponseProtocol<Req, Res>,
        request: Req,
        timeoutMs: number = 30000
    ): Promise<Res> {
        if (!this.context.ask) {
            throw new Error('Context does not support ask pattern');
        }

        return this.context.ask(target, protocol, request, timeoutMs);
    }

    /**
     * 创建Actor
     */
    static create<TActor extends TypedActor<TState, TM>, TState = any, TM extends MessageMap = any>(
        context: BaseActorContext,
        initialState?: TState
    ): TActor {
        const actorContext = createTypedContext<TM>(context);
        return new (this as any)(actorContext, initialState) as TActor;
    }
}

/**
 * 创建类型安全的Actor
 */
export function typedActorOf<TActor extends TypedActor<TState, TM>, TState = any, TM extends MessageMap = any>(
    actorClass: new (context: TypedActorContext<TM>, state: TState) => TActor,
    initialState?: TState
): { actorClass: new (...args: any[]) => Actor<TM>, initialState?: TState } {
    return {
        actorClass: actorClass as unknown as new (...args: any[]) => Actor<TM>,
        initialState
    };
} 