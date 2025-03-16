import { Message as BaseMessage, PID as BasePID } from '@bactor/common';
import { ActorContext as BaseActorContext } from '../../packages/core/src/core/context';
import { ActorSystem } from '../../packages/core/src/core/system';
import {
    ActorContext,
    PID,
    MessageMap,
    Actor,
    Message,
    TypedMessage,
    Props,
    toBaseMessage
} from './types';
import { RequestResponseProtocol, generateCorrelationId, RequestResponseManager, request, response } from '../../packages/core/src/typed/request-response';

/**
 * 类型安全的ActorContext实现
 * 这是对原始ActorContext的包装，以提供类型安全的API
 */
export class TypedActorContext<TM extends MessageMap = any> implements ActorContext<TM> {
    private baseContext: BaseActorContext;
    private requestManager: RequestResponseManager;

    constructor(baseContext: BaseActorContext) {
        this.baseContext = baseContext;
        this.requestManager = new RequestResponseManager();
    }

    /**
     * 获取当前Actor的PID
     */
    get self(): PID<TM> {
        return this.baseContext.self as PID<TM>;
    }

    /**
     * 类型安全的消息发送
     * 发送特定类型的消息到目标Actor
     */
    async send<K extends keyof TM>(
        target: PID<any>,
        messageType: K,
        payload: TM[K],
        metadata?: any
    ): Promise<void> {
        const message: BaseMessage = {
            type: String(messageType),
            payload,
            sender: this.self,
            metadata
        };

        await this.baseContext.send(target as BasePID, message);
    }

    /**
     * 请求-响应模式
     * 向目标Actor发送请求并等待响应
     */
    async request<K extends keyof TM, TMTarget extends MessageMap, R>(
        target: PID<any>,
        type: K,
        payload: TM[K],
        timeout?: number
    ): Promise<R> {
        // 使用ask方法处理请求
        const protocol = {
            requestType: String(type),
            responseType: `${String(type)}.response`
        };

        return this.ask<TM[K], R>(target, protocol, payload, timeout);
    }

    /**
     * 类型安全的消息发送（完整消息对象版本）
     * 使用完整的消息对象发送消息
     */
    async sendMessage<K extends keyof TMTarget, TMTarget extends MessageMap = any>(
        target: PID<TMTarget>,
        message: Message<K, TMTarget> | TypedMessage<K, TMTarget>
    ): Promise<void> {
        const baseMessage = toBaseMessage(message);
        await this.baseContext.send(target as BasePID, baseMessage);
    }

    /**
     * 向目标Actor发送请求并等待响应
     * 这是一个类型安全的请求-响应模式实现
     */
    async ask<Req, Res>(
        target: PID<any>,
        protocol: RequestResponseProtocol<Req, Res>,
        requestPayload: Req,
        timeoutMs: number = 30000
    ): Promise<Res> {
        // 生成相关ID
        const correlationId = generateCorrelationId();

        // 注册请求
        const responsePromise = this.requestManager.registerRequest<Res>(correlationId, timeoutMs);

        // 创建请求消息
        const requestMessage = request(protocol, requestPayload, correlationId);

        // 发送请求
        await this.baseContext.send(target as BasePID, requestMessage);

        // 等待响应
        return responsePromise;
    }

    /**
     * 处理接收到的消息
     * 这个方法会在Actor的receive方法中被调用
     */
    receive(message: BaseMessage): boolean {
        // 尝试处理响应消息
        return this.requestManager.handleResponse(message as any);
    }

    /**
     * 类型安全的Actor创建
     * 创建一个新的Actor实例
     */
    async spawn<TMessages extends MessageMap = any>(
        props: Props<any, TMessages>
    ): Promise<PID<TMessages>> {
        // 转换为基础Props对象
        const baseProps = {
            actorClass: props.actorClass,
            initialState: props.initialState
        };

        // 使用原始系统创建Actor
        const childPid = await this.baseContext.spawn(baseProps);
        return childPid as PID<TMessages>;
    }

    /**
     * 停止指定的Actor
     */
    async stop(pid: PID<any>): Promise<void> {
        await this.baseContext.stop(pid as BasePID);
    }

    /**
     * 获取原始上下文对象
     * 这允许在需要完全访问原始功能时使用
     */
    getBaseContext(): BaseActorContext {
        return this.baseContext;
    }

    /**
     * 获取请求管理器
     */
    getRequestManager(): RequestResponseManager {
        return this.requestManager;
    }
}

/**
 * 创建类型安全的ActorContext
 */
export function createTypedContext<TM extends MessageMap = any>(
    baseContext: BaseActorContext
): TypedActorContext<TM> {
    return new TypedActorContext<TM>(baseContext);
} 