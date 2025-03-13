import { Message as BaseMessage, PID as BasePID } from '@bactor/common';
import { ActorContext as BaseActorContext } from '../core/context';
import { ActorSystem } from '../core/system';
import {
    ActorContext,
    PID,
    Props,
    MessageMap,
    toBaseMessage,
    Actor,
    Message
} from './types';
import { RequestResponseProtocol, generateCorrelationId, RequestResponseManager, request, response } from './request-response';

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
        payload: TM[K]
    ): Promise<void> {
        const message: BaseMessage = {
            type: messageType as string,
            payload,
            sender: this.self
        };

        await this.baseContext.send(target as BasePID, message);
    }

    /**
     * 类型安全的消息发送（完整消息对象版本）
     * 使用完整的消息对象发送消息
     */
    async sendMessage<K extends keyof TMTarget, TMTarget extends MessageMap = any>(
        target: PID<TMTarget>,
        message: Message<K, TMTarget>
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
    async spawn<TActor extends Actor<TState, TMessages>, TState = any, TMessages extends MessageMap = any>(
        props: Props<TState, TMessages>
    ): Promise<PID<TMessages>> {
        // 转换为基础Props对象
        const baseProps = {
            ...props,
            // 处理initialState，原始系统可能不支持这个参数
            actorContext: props.initialState
                ? { ...props.actorContext || {}, initialState: props.initialState }
                : props.actorContext
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
     * 停止所有子Actor
     */
    async stopAll(): Promise<void> {
        await this.baseContext.stopAll();
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