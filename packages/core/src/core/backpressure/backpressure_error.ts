/**
 * 背压异常类，当背压策略设置为THROW时抛出
 */
export class BackpressureError extends Error {
    constructor(
        message: string,
        public readonly queueSize: number,
        public readonly maxQueueSize: number
    ) {
        super(message);
        this.name = 'BackpressureError';
    }
}

/**
 * 背压等待超时异常，当WAIT策略下等待超时时抛出
 */
export class BackpressureTimeoutError extends BackpressureError {
    constructor(
        message: string,
        queueSize: number,
        maxQueueSize: number,
        public readonly timeoutMs: number
    ) {
        super(message, queueSize, maxQueueSize);
        this.name = 'BackpressureTimeoutError';
    }
} 