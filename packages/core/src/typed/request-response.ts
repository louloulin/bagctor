import { v4 as uuidv4 } from 'uuid';
import { Message, MessageMap, PID } from './types';

/**
 * 生成唯一的相关ID用于请求-响应模式
 */
export function generateCorrelationId(): string {
    return uuidv4();
}

/**
 * 请求-响应协议定义
 * 包含请求和响应的类型信息
 */
export interface RequestResponseProtocol<TReq, TRes> {
    requestType: string;
    responseType: string;
    requestValidator?: (value: any) => value is TReq;
    responseValidator?: (value: any) => value is TRes;
}

/**
 * 创建请求-响应映射
 * 用于在Actor系统中注册请求-响应协议
 */
export function createRequestResponseMap<TReq, TRes>(
    requestType: string,
    responseType: string,
    requestValidator?: (value: any) => value is TReq,
    responseValidator?: (value: any) => value is TRes
): RequestResponseProtocol<TReq, TRes> {
    return {
        requestType,
        responseType,
        requestValidator,
        responseValidator
    };
}

/**
 * 创建请求消息
 */
export function request<TReq>(
    protocol: RequestResponseProtocol<TReq, any>,
    payload: TReq,
    correlationId: string = generateCorrelationId()
): Message<string, any> {
    return {
        type: protocol.requestType,
        payload,
        metadata: {
            correlationId,
            isRequest: true,
            timestamp: Date.now()
        }
    };
}

/**
 * 创建响应消息
 */
export function response<TRes>(
    protocol: RequestResponseProtocol<any, TRes>,
    payload: TRes,
    correlationId: string,
    replyTo?: PID<any>
): Message<string, any> {
    return {
        type: protocol.responseType,
        payload,
        metadata: {
            correlationId,
            isResponse: true,
            timestamp: Date.now(),
            replyTo
        }
    };
}

/**
 * 请求-响应管理器
 * 用于跟踪请求和处理响应
 */
export class RequestResponseManager {
    private pendingRequests: Map<string, {
        resolve: (value: any) => void;
        reject: (reason: any) => void;
        timeout: NodeJS.Timeout;
    }> = new Map();

    /**
     * 注册一个请求并返回一个Promise
     */
    registerRequest<TRes>(correlationId: string, timeoutMs: number = 30000): Promise<TRes> {
        console.log(`[RequestResponseManager] Registering request: ${correlationId}, timeout: ${timeoutMs}ms`);

        return new Promise<TRes>((resolve, reject) => {
            // 创建超时处理
            const timeout = setTimeout(() => {
                console.log(`[RequestResponseManager] Request ${correlationId} timed out after ${timeoutMs}ms`);
                const request = this.pendingRequests.get(correlationId);
                if (request) {
                    this.pendingRequests.delete(correlationId);
                    reject(new Error(`Request with correlationId ${correlationId} timed out after ${timeoutMs}ms`));
                } else {
                    console.log(`[RequestResponseManager] Strange: Request ${correlationId} not found when timing out`);
                }
            }, timeoutMs) as unknown as NodeJS.Timeout;

            // 存储请求信息
            this.pendingRequests.set(correlationId, {
                resolve,
                reject,
                timeout
            });

            console.log(`[RequestResponseManager] Request ${correlationId} registered, pending requests: ${this.pendingRequests.size}`);
        });
    }

    /**
     * 处理响应消息
     * 返回是否成功处理了响应
     */
    handleResponse(message: Message<any, any>): boolean {
        console.log(`[RequestResponseManager] Handling response message:`,
            { type: message.type, correlationId: message.metadata?.correlationId, isResponse: message.metadata?.isResponse });

        if (!message.metadata?.isResponse || !message.metadata?.correlationId) {
            console.log(`[RequestResponseManager] Message is not a valid response`);
            return false;
        }

        const correlationId = message.metadata.correlationId;
        const request = this.pendingRequests.get(correlationId);

        if (request) {
            console.log(`[RequestResponseManager] Found pending request for ${correlationId}, resolving`);
            // 清除超时计时器
            clearTimeout(request.timeout);

            // 从待处理请求中移除
            this.pendingRequests.delete(correlationId);

            // 解析Promise
            request.resolve(message.payload);
            return true;
        }

        console.log(`[RequestResponseManager] No pending request found for ${correlationId}`);
        return false;
    }

    /**
     * 取消请求
     */
    cancelRequest(correlationId: string, reason: string = 'Request cancelled'): boolean {
        console.log(`[RequestResponseManager] Cancelling request: ${correlationId}, reason: ${reason}`);
        const request = this.pendingRequests.get(correlationId);

        if (request) {
            clearTimeout(request.timeout);
            this.pendingRequests.delete(correlationId);
            request.reject(new Error(reason));
            console.log(`[RequestResponseManager] Request ${correlationId} cancelled successfully`);
            return true;
        }

        console.log(`[RequestResponseManager] Request ${correlationId} not found for cancellation`);
        return false;
    }

    /**
     * 取消所有待处理的请求
     */
    cancelAllRequests(reason: string = 'All requests cancelled'): void {
        console.log(`[RequestResponseManager] Cancelling all requests, reason: ${reason}, count: ${this.pendingRequests.size}`);

        for (const [correlationId, request] of this.pendingRequests.entries()) {
            console.log(`[RequestResponseManager] Cancelling request: ${correlationId}`);
            clearTimeout(request.timeout);
            request.reject(new Error(reason));
        }

        this.pendingRequests.clear();
        console.log(`[RequestResponseManager] All requests cancelled`);
    }

    /**
     * 取消所有待处理的请求 (别名方法，兼容现有代码)
     */
    cancelAll(reason: string = 'All requests cancelled'): void {
        this.cancelAllRequests(reason);
    }

    /**
     * 获取当前待处理请求数量
     */
    get pendingCount(): number {
        return this.pendingRequests.size;
    }
} 