import { log } from '../../../utils/logger';
import { Message, PID } from '../../../core/types';

// 追踪上下文
export interface TraceContext {
    traceId: string;
    spanId: string;
    parentSpanId: string;
    sampled: boolean;
    baggage: Record<string, string>;
}

// 追踪配置
export interface TracingConfig {
    serviceName: string;
    enabled: boolean;
    sampleRate: number;
    exporterType: 'console' | 'jaeger' | 'zipkin' | 'otlp';
    exporterUrl?: string;
    tags: Record<string, string>;
    propagationHeaders: string[];
}

// 追踪导出器接口
export interface SpanExporter {
    export(spans: Span[]): Promise<void>;
    shutdown(): Promise<void>;
}

// 追踪采样器
export interface Sampler {
    shouldSample(traceId: string, operation: string): boolean;
}

// 追踪事件
export interface SpanEvent {
    name: string;
    timestamp: number;
    attributes: Record<string, string | number | boolean>;
}

// 链路类型
export enum SpanKind {
    INTERNAL = 'internal',
    SERVER = 'server',
    CLIENT = 'client',
    PRODUCER = 'producer',
    CONSUMER = 'consumer'
}

// 追踪状态
export enum SpanStatus {
    OK = 'ok',
    ERROR = 'error',
    CANCELLED = 'cancelled'
}

// Span表示一个分布式追踪中的单个操作
export class Span {
    readonly traceId: string;
    readonly spanId: string;
    readonly parentSpanId: string;
    readonly name: string;
    readonly kind: SpanKind;
    readonly startTime: number;
    readonly attributes: Record<string, string | number | boolean>;
    readonly events: SpanEvent[] = [];

    private endTime: number = 0;
    private status: SpanStatus = SpanStatus.OK;
    private error?: Error;

    constructor(
        traceId: string,
        spanId: string,
        parentSpanId: string,
        name: string,
        kind: SpanKind,
        startTime: number,
        attributes: Record<string, string | number | boolean> = {}
    ) {
        this.traceId = traceId;
        this.spanId = spanId;
        this.parentSpanId = parentSpanId;
        this.name = name;
        this.kind = kind;
        this.startTime = startTime;
        this.attributes = attributes;
    }

    // 添加事件
    addEvent(name: string, attributes: Record<string, string | number | boolean> = {}): this {
        this.events.push({
            name,
            timestamp: Date.now(),
            attributes
        });
        return this;
    }

    // 设置状态
    setStatus(status: SpanStatus, error?: Error): this {
        this.status = status;
        this.error = error;
        if (error) {
            this.attributes['error.message'] = error.message;
            this.attributes['error.type'] = error.name;
            if (error.stack) {
                this.attributes['error.stack'] = error.stack;
            }
        }
        return this;
    }

    // 设置属性
    setAttribute(key: string, value: string | number | boolean): this {
        this.attributes[key] = value;
        return this;
    }

    // 批量设置属性
    setAttributes(attributes: Record<string, string | number | boolean>): this {
        Object.assign(this.attributes, attributes);
        return this;
    }

    // 结束span
    end(endTime = Date.now()): void {
        if (this.endTime === 0) {
            this.endTime = endTime;
        }
    }

    // 获取持续时间
    getDuration(): number {
        const end = this.endTime > 0 ? this.endTime : Date.now();
        return end - this.startTime;
    }

    // 检查span是否已结束
    isEnded(): boolean {
        return this.endTime > 0;
    }

    // 获取span状态
    getStatus(): SpanStatus {
        return this.status;
    }

    // 获取错误
    getError(): Error | undefined {
        return this.error;
    }

    // 获取结束时间
    getEndTime(): number {
        return this.endTime;
    }

    // 转换为JSON格式
    toJSON(): Record<string, any> {
        return {
            traceId: this.traceId,
            spanId: this.spanId,
            parentSpanId: this.parentSpanId,
            name: this.name,
            kind: this.kind,
            startTime: this.startTime,
            endTime: this.endTime || Date.now(),
            duration: this.getDuration(),
            status: this.status,
            attributes: this.attributes,
            events: this.events
        };
    }
}

// 控制台导出器
export class ConsoleSpanExporter implements SpanExporter {
    async export(spans: Span[]): Promise<void> {
        for (const span of spans) {
            log.info(`[Trace] ${JSON.stringify(span.toJSON(), null, 2)}`);
        }
    }

    async shutdown(): Promise<void> {
        // 无需额外操作
    }
}

// 概率采样器
export class ProbabilitySampler implements Sampler {
    private probability: number;

    constructor(probability: number) {
        this.probability = Math.max(0, Math.min(1, probability));
    }

    shouldSample(_traceId: string, _operation: string): boolean {
        return Math.random() < this.probability;
    }
}

// 分布式追踪系统
export class Tracer {
    private static instance: Tracer;
    private config: TracingConfig;
    private exporter: SpanExporter;
    private sampler: Sampler;
    private activeSpans: Map<string, Span> = new Map();
    private spanBuffer: Span[] = [];
    private flushInterval?: NodeJS.Timeout;

    // 获取单例
    static getInstance(config?: TracingConfig): Tracer {
        if (!Tracer.instance && config) {
            Tracer.instance = new Tracer(config);
        }
        return Tracer.instance;
    }

    private constructor(config: TracingConfig) {
        this.config = {
            serviceName: 'bactor',
            enabled: true,
            sampleRate: 0.1,
            exporterType: 'console',
            tags: {},
            propagationHeaders: ['traceparent', 'tracestate', 'baggage'],
            ...config
        };

        // 初始化采样器
        this.sampler = new ProbabilitySampler(this.config.sampleRate);

        // 初始化导出器
        switch (this.config.exporterType) {
            case 'console':
                this.exporter = new ConsoleSpanExporter();
                break;
            // 可以扩展更多导出器类型
            default:
                this.exporter = new ConsoleSpanExporter();
        }

        // 设置定期导出
        if (this.config.enabled) {
            this.flushInterval = setInterval(() => this.flush(), 5000);
        }

        log.info(`Tracer initialized for service ${this.config.serviceName}`);
    }

    // 创建新的根span
    startSpan(
        name: string,
        options: {
            kind?: SpanKind;
            attributes?: Record<string, string | number | boolean>;
        } = {}
    ): Span {
        if (!this.config.enabled) {
            // 返回一个无操作的span
            return this.createNoopSpan();
        }

        const traceId = this.generateTraceId();
        const spanId = this.generateSpanId();
        const sampled = this.sampler.shouldSample(traceId, name);

        if (!sampled) {
            return this.createNoopSpan();
        }

        const span = new Span(
            traceId,
            spanId,
            '',
            name,
            options.kind || SpanKind.INTERNAL,
            Date.now(),
            {
                'service.name': this.config.serviceName,
                ...this.config.tags,
                ...options.attributes
            }
        );

        this.activeSpans.set(spanId, span);
        return span;
    }

    // 从现有trace context创建子span
    startSpanWithContext(
        name: string,
        context: TraceContext,
        options: {
            kind?: SpanKind;
            attributes?: Record<string, string | number | boolean>;
        } = {}
    ): Span {
        if (!this.config.enabled || !context.sampled) {
            return this.createNoopSpan();
        }

        const spanId = this.generateSpanId();
        const span = new Span(
            context.traceId,
            spanId,
            context.spanId,
            name,
            options.kind || SpanKind.INTERNAL,
            Date.now(),
            {
                'service.name': this.config.serviceName,
                ...this.config.tags,
                ...options.attributes,
                ...context.baggage
            }
        );

        this.activeSpans.set(spanId, span);
        return span;
    }

    // 结束并处理span
    endSpan(span: Span): void {
        if (!this.config.enabled || !span || span.isEnded()) {
            return;
        }

        span.end();
        this.activeSpans.delete(span.spanId);
        this.spanBuffer.push(span);

        // 如果缓冲区太大，立即导出
        if (this.spanBuffer.length >= 100) {
            this.flush();
        }
    }

    // 从消息中提取跟踪上下文
    extractContextFromMessage(message: Message): TraceContext | null {
        if (!this.config.enabled || !message.metadata?.trace) {
            return null;
        }

        try {
            const trace = message.metadata.trace as any;
            return {
                traceId: trace.traceId,
                spanId: trace.spanId,
                parentSpanId: trace.parentSpanId,
                sampled: trace.sampled,
                baggage: trace.baggage || {}
            };
        } catch (error) {
            log.warn('Failed to extract trace context from message', error);
            return null;
        }
    }

    // 将跟踪上下文注入消息
    injectContextIntoMessage(message: Message, context: TraceContext): Message {
        if (!this.config.enabled) {
            return message;
        }

        try {
            return {
                ...message,
                metadata: {
                    ...message.metadata,
                    trace: {
                        traceId: context.traceId,
                        spanId: context.spanId,
                        parentSpanId: context.parentSpanId,
                        sampled: context.sampled,
                        baggage: context.baggage
                    }
                }
            };
        } catch (error) {
            log.warn('Failed to inject trace context into message', error);
            return message;
        }
    }

    // 将span转换为trace context
    spanToContext(span: Span): TraceContext {
        return {
            traceId: span.traceId,
            spanId: span.spanId,
            parentSpanId: span.parentSpanId,
            sampled: true,
            baggage: {}
        };
    }

    // 导出所有缓冲的span
    async flush(): Promise<void> {
        if (!this.config.enabled || this.spanBuffer.length === 0) {
            return;
        }

        const spans = [...this.spanBuffer];
        this.spanBuffer = [];

        try {
            await this.exporter.export(spans);
        } catch (error) {
            log.error('Failed to export spans', error);
            // 恢复未导出的spans
            this.spanBuffer = [...spans, ...this.spanBuffer];
        }
    }

    // 生成空白span
    private createNoopSpan(): Span {
        return new Span(
            '00000000000000000000000000000000',
            '0000000000000000',
            '',
            'noop',
            SpanKind.INTERNAL,
            Date.now()
        );
    }

    // 生成trace ID
    private generateTraceId(): string {
        return Array.from({ length: 32 }, () =>
            Math.floor(Math.random() * 16).toString(16)
        ).join('');
    }

    // 生成span ID
    private generateSpanId(): string {
        return Array.from({ length: 16 }, () =>
            Math.floor(Math.random() * 16).toString(16)
        ).join('');
    }

    // 关闭追踪器
    async shutdown(): Promise<void> {
        if (this.flushInterval) {
            clearInterval(this.flushInterval);
        }

        await this.flush();
        await this.exporter.shutdown();

        // 清理所有活动span
        this.activeSpans.clear();

        log.info('Tracer shutdown');
    }
} 