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
    ActorState
} from './types';

/**
 * 类型安全的Actor扩展
 * 这个版本不依赖于 request-response.ts
 */
export class SimpleTypedActor<TState = any, TM extends MessageMap = any> implements Actor<TState, TM> {
    protected context: ActorContext<TM>;
    protected state: ActorState<TState>;
    protected currentBehavior: string = 'default';
    protected currentMessage?: Message<any, TM>;
    protected handlers = new Map<keyof TM, (payload: any, context: MessageContext) => Promise<void> | void>();
    protected behaviorMap = new Map<string, (message: Message<any, TM>) => Promise<void>>();

    constructor(context: ActorContext<TM> | BaseActorContext, initialState: TState) {
        // 存储上下文
        this.context = context as ActorContext<TM>;

        // 初始化状态
        this.state = {
            behavior: 'default',
            data: initialState ?? ({} as TState)
        };

        // 初始化行为
        this.initialize();
    }

    private initialize(): void {
        this.preStart();
        this.behaviors();
    }

    /**
     * 子类可以重写此方法以提供自定义初始化逻辑
     */
    protected preStart(): void {
        // 默认实现什么都不做
    }

    /**
     * 子类必须重写此方法以定义行为
     */
    protected behaviors(): void {
        // 子类需要实现
    }

    /**
     * 处理接收到的消息
     */
    async receive(message: Message<any, TM> | any): Promise<void> {
        // 将原始消息转换为类型安全的消息
        const typedMessage = toTypedMessage<any, TM>(message);
        this.currentMessage = typedMessage;

        try {
            // 首先尝试使用按消息类型注册的处理器
            const handler = this.handlers.get(typedMessage.type as keyof TM);
            if (handler) {
                await handler(typedMessage.payload, {
                    sender: typedMessage.sender
                });
                return;
            }

            // 如果没有找到特定处理器，使用行为处理器
            const behaviorHandler = this.behaviorMap.get(this.currentBehavior);
            if (behaviorHandler) {
                await behaviorHandler(typedMessage);
                return;
            }

            // 如果没有处理器，记录警告
            console.warn(`No handler found for message type: ${typedMessage.type}`);
        } finally {
            this.currentMessage = undefined;
        }
    }

    /**
     * 注册特定类型消息的处理器
     */
    protected on<K extends keyof TM>(
        messageType: K,
        handler: (payload: TM[K], context: MessageContext) => Promise<void> | void
    ): this {
        this.handlers.set(messageType, handler as (payload: any, context: MessageContext) => Promise<void> | void);
        return this;
    }

    /**
     * 发送类型安全的消息
     */
    protected async send<K extends keyof TM>(
        target: PID<any>,
        messageType: K,
        payload: TM[K]
    ): Promise<void> {
        await this.context.send(target, messageType, payload);
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
     * 切换行为
     */
    protected become(behavior: string): void {
        if (this.behaviorMap.has(behavior)) {
            this.currentBehavior = behavior;
            this.state.behavior = behavior;
        } else {
            throw new Error(`Behavior ${behavior} not found`);
        }
    }
} 