import { Actor, Message } from '@bactor/core';
import { PID } from '@bactor/common';
import type { ActorContext } from '@bactor/core';

/**
 * HTTP请求的配置参数
 */
export interface HttpRequestParams {
    url: string;
    method?: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';
    headers?: Record<string, string>;
    body?: any;
    timeout?: number;
}

export interface ExecuteHttpRequestMessage extends Message {
    type: 'execute';
    params: HttpRequestParams;
    sender: PID;
    responseId?: string;
}

export interface HttpResponseMessage extends Message {
    type: 'result';
    payload: {
        status: number;
        headers: Record<string, string>;
        body: any;
    };
    responseId?: string;
}

export interface HttpErrorMessage extends Message {
    type: 'error';
    error: string;
    details?: any;
    responseId?: string;
}

export type HttpToolMessage = ExecuteHttpRequestMessage;

/**
 * HTTP工具Actor，用于发送HTTP请求并返回响应
 */
export class HttpToolActor extends Actor<any, Message> {
    constructor(context: ActorContext) {
        super(context);
    }

    /**
     * 定义Actor的行为
     */
    protected behaviors(): void {
        this.addBehavior('default', this.handleRequest.bind(this));
    }

    /**
     * 处理HTTP请求
     */
    private async handleRequest(message: Message): Promise<void> {
        if (message.type !== 'execute') return;

        const execMessage = message as ExecuteHttpRequestMessage;
        const { url, method = 'GET', headers = {}, body, timeout = 10000 } = execMessage.params;
        const responseId = (message as any).responseId;

        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), timeout);

            const options: RequestInit = {
                method,
                headers: {
                    'Content-Type': 'application/json',
                    ...headers
                },
                signal: controller.signal
            };

            // 添加请求体 (如果有)
            if (body && (method === 'POST' || method === 'PUT' || method === 'PATCH')) {
                options.body = typeof body === 'string' ? body : JSON.stringify(body);
            }

            // 发送请求
            const response = await fetch(url, options);
            clearTimeout(timeoutId);

            // 获取响应头
            const responseHeaders: Record<string, string> = {};
            response.headers.forEach((value, key) => {
                responseHeaders[key] = value;
            });

            // 解析响应体
            let responseBody;
            const contentType = response.headers.get('content-type');

            if (contentType && contentType.includes('application/json')) {
                responseBody = await response.json();
            } else if (contentType && contentType.includes('text/')) {
                responseBody = await response.text();
            } else {
                // 二进制数据，转为base64
                const buffer = await response.arrayBuffer();
                responseBody = {
                    type: 'binary',
                    contentType: contentType || 'application/octet-stream',
                    data: Buffer.from(buffer).toString('base64')
                };
            }

            // 发送响应消息
            if (message.sender) {
                await this.send(message.sender, {
                    type: 'result',
                    payload: {
                        status: response.status,
                        headers: responseHeaders,
                        body: responseBody
                    },
                    responseId
                } as HttpResponseMessage);
            }
        } catch (error: any) {
            // 处理错误
            if (message.sender) {
                await this.send(message.sender, {
                    type: 'error',
                    error: `HTTP request failed: ${error?.message || String(error)}`,
                    details: {
                        url,
                        method,
                        error: error?.toString() || String(error)
                    },
                    responseId
                } as HttpErrorMessage);
            }
        }
    }
} 