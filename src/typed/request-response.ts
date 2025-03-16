import { Message, MessageMap, PID } from '../../packages/core/src/typed/types';

/**
 * 生成唯一的相关ID用于请求-响应模式
 */
export function generateCorrelationId(): string {
    return Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
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
            isRequest: true
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
        sender: replyTo,
        metadata: {
            correlationId,
            isResponse: true
        }
    };
}

/**
 * 请求-响应管理器
 * 跟踪请求和响应，处理超时和取消
 */
export class RequestResponseManager {
    private pendingRequests: Map<string, {
        resolve: (value: any) => void;
        reject: (reason: any) => void;
        timeout: ReturnType<typeof setTimeout>;
    }> = new Map();

    /**
     * 注册请求并返回等待响应的Promise
     */
    registerRequest<TRes>(correlationId: string, timeoutMs: number = 30000): Promise<TRes> {
        return new Promise<TRes>((resolve, reject) => {
            // 创建超时处理
            const timeout = setTimeout(() => {
                const request = this.pendingRequests.get(correlationId);
                if (request) {
                    this.pendingRequests.delete(correlationId);
                    reject(new Error(`Request timed out after ${timeoutMs}ms: ${correlationId}`));
                }
            }, timeoutMs);

            // 保存请求信息
            this.pendingRequests.set(correlationId, {
                resolve,
                reject,
                timeout
            });
        });
    }

    /**
     * 处理接收到的响应
     * 返回true表示消息已处理，false表示消息不是响应或找不到对应的请求
     */
    handleResponse(message: Message<any, any>): boolean {
        // 检查是否是响应消息
        if (!message.metadata?.isResponse || !message.metadata?.correlationId) {
            return false;
        }

        const correlationId = message.metadata.correlationId;
        const request = this.pendingRequests.get(correlationId);

        if (!request) {
            return false; // 找不到对应的请求
        }

        // 清除超时和请求记录
        clearTimeout(request.timeout);
        this.pendingRequests.delete(correlationId);

        // 解析Promise
        request.resolve(message.payload);
        return true;
    }

    /**
     * 取消特定请求
     */
    cancelRequest(correlationId: string, reason: string = 'Request cancelled'): boolean {
        const request = this.pendingRequests.get(correlationId);
        if (!request) {
            return false;
        }

        clearTimeout(request.timeout);
        this.pendingRequests.delete(correlationId);
        request.reject(new Error(reason));
        return true;
    }

    /**
     * 取消所有未完成的请求
     */
    cancelAllRequests(reason: string = 'All requests cancelled'): void {
        for (const [correlationId, request] of this.pendingRequests.entries()) {
            clearTimeout(request.timeout);
            request.reject(new Error(reason));
        }
        this.pendingRequests.clear();
    }

    /**
     * 取消所有请求的别名，为了向后兼容
     */
    cancelAll(reason: string = 'All requests cancelled'): void {
        this.cancelAllRequests(reason);
    }

    /**
     * 获取未完成请求的数量
     */
    get pendingCount(): number {
        return this.pendingRequests.size;
    }
} 