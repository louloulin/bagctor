/**
 * HTTP 状态码枚举
 */
export enum HttpStatus {
    // 2xx 成功
    OK = 200,
    CREATED = 201,
    ACCEPTED = 202,
    NO_CONTENT = 204,

    // 3xx 重定向
    MOVED_PERMANENTLY = 301,
    FOUND = 302,
    SEE_OTHER = 303,
    NOT_MODIFIED = 304,
    TEMPORARY_REDIRECT = 307,
    PERMANENT_REDIRECT = 308,

    // 4xx 客户端错误
    BAD_REQUEST = 400,
    UNAUTHORIZED = 401,
    FORBIDDEN = 403,
    NOT_FOUND = 404,
    METHOD_NOT_ALLOWED = 405,
    CONFLICT = 409,
    GONE = 410,
    UNPROCESSABLE_ENTITY = 422,
    TOO_MANY_REQUESTS = 429,

    // 5xx 服务器错误
    INTERNAL_SERVER_ERROR = 500,
    NOT_IMPLEMENTED = 501,
    BAD_GATEWAY = 502,
    SERVICE_UNAVAILABLE = 503,
    GATEWAY_TIMEOUT = 504
}

/**
 * HTTP 响应类型
 */
export interface HttpResponse {
    status: number;
    headers: Headers;
    body: any;
}

/**
 * HTTP 响应工具类
 * 提供快捷方式创建标准 HTTP 响应
 */
export class HttpResponses {
    /**
     * 创建 JSON 响应
     * @param data 要转换为 JSON 的数据
     * @param status HTTP 状态码
     * @param headers 额外的响应头
     */
    static json(data: any, status: HttpStatus = HttpStatus.OK, headers: Record<string, string> = {}): HttpResponse {
        const responseHeaders = new Headers({
            'Content-Type': 'application/json',
            ...headers
        });

        return {
            status,
            headers: responseHeaders,
            body: JSON.stringify(data)
        };
    }

    /**
     * 创建文本响应
     * @param text 文本内容
     * @param status HTTP 状态码
     * @param headers 额外的响应头
     */
    static text(text: string, status: HttpStatus = HttpStatus.OK, headers: Record<string, string> = {}): HttpResponse {
        const responseHeaders = new Headers({
            'Content-Type': 'text/plain',
            ...headers
        });

        return {
            status,
            headers: responseHeaders,
            body: text
        };
    }

    /**
     * 创建 HTML 响应
     * @param html HTML 内容
     * @param status HTTP 状态码
     * @param headers 额外的响应头
     */
    static html(html: string, status: HttpStatus = HttpStatus.OK, headers: Record<string, string> = {}): HttpResponse {
        const responseHeaders = new Headers({
            'Content-Type': 'text/html',
            ...headers
        });

        return {
            status,
            headers: responseHeaders,
            body: html
        };
    }

    /**
     * 创建重定向响应
     * @param location 重定向目标URL
     * @param status HTTP 状态码
     */
    static redirect(location: string, status: HttpStatus = HttpStatus.FOUND): HttpResponse {
        return {
            status,
            headers: new Headers({
                'Location': location
            }),
            body: null
        };
    }

    /**
     * 创建错误响应
     * @param message 错误消息
     * @param status HTTP 状态码
     * @param headers 额外的响应头
     */
    static error(message: string, status: HttpStatus = HttpStatus.INTERNAL_SERVER_ERROR, headers: Record<string, string> = {}): HttpResponse {
        return this.json({
            error: {
                message,
                status
            }
        }, status, headers);
    }

    /**
     * 创建 404 Not Found 响应
     * @param message 自定义错误消息
     */
    static notFound(message: string = 'Resource not found'): HttpResponse {
        return this.error(message, HttpStatus.NOT_FOUND);
    }

    /**
     * 创建 400 Bad Request 响应
     * @param message 自定义错误消息
     */
    static badRequest(message: string = 'Bad request'): HttpResponse {
        return this.error(message, HttpStatus.BAD_REQUEST);
    }

    /**
     * 创建 401 Unauthorized 响应
     * @param message 自定义错误消息
     */
    static unauthorized(message: string = 'Unauthorized'): HttpResponse {
        return this.error(message, HttpStatus.UNAUTHORIZED);
    }

    /**
     * 创建 403 Forbidden 响应
     * @param message 自定义错误消息
     */
    static forbidden(message: string = 'Forbidden'): HttpResponse {
        return this.error(message, HttpStatus.FORBIDDEN);
    }

    /**
     * 创建 204 No Content 响应
     */
    static noContent(): HttpResponse {
        return {
            status: HttpStatus.NO_CONTENT,
            headers: new Headers(),
            body: null
        };
    }
} 