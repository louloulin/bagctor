/**
 * @bactor/http Error Classes
 * 
 * This module defines custom error classes for the HTTP module
 * that can be used with supervision strategies.
 */

/**
 * Base HTTP error class
 */
export class HttpError extends Error {
    /**
     * HTTP status code
     */
    public status: number;

    constructor(message: string, status: number = 500) {
        super(message);
        this.name = 'HttpError';
        this.status = status;
    }
}

/**
 * Error representing a temporary failure that can be resolved by retrying
 */
export class TemporaryError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'TemporaryError';
    }
}

/**
 * Error representing a resource allocation failure
 */
export class ResourceError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'ResourceError';
    }
}

/**
 * Error representing a fatal error that cannot be recovered from
 */
export class FatalError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'FatalError';
    }
}

/**
 * HTTP 4xx client error
 */
export class ClientError extends HttpError {
    constructor(message: string, status: number = 400) {
        super(message, status);
        this.name = 'ClientError';
    }
}

/**
 * HTTP 5xx server error
 */
export class ServerError extends HttpError {
    constructor(message: string, status: number = 500) {
        super(message, status);
        this.name = 'ServerError';
    }
}

/**
 * 401 Unauthorized error
 */
export class UnauthorizedError extends ClientError {
    constructor(message: string = 'Unauthorized') {
        super(message, 401);
        this.name = 'UnauthorizedError';
    }
}

/**
 * 403 Forbidden error
 */
export class ForbiddenError extends ClientError {
    constructor(message: string = 'Forbidden') {
        super(message, 403);
        this.name = 'ForbiddenError';
    }
}

/**
 * 404 Not Found error
 */
export class NotFoundError extends ClientError {
    constructor(message: string = 'Not Found') {
        super(message, 404);
        this.name = 'NotFoundError';
    }
}

/**
 * 429 Too Many Requests error
 */
export class TooManyRequestsError extends ClientError {
    constructor(message: string = 'Too Many Requests') {
        super(message, 429);
        this.name = 'TooManyRequestsError';
    }
}

/**
 * 503 Service Unavailable error
 */
export class ServiceUnavailableError extends ServerError {
    constructor(message: string = 'Service Unavailable') {
        super(message, 503);
        this.name = 'ServiceUnavailableError';
    }
}