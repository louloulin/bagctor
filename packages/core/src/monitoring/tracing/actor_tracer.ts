import { ActorSystem } from '@core/system';
import { Message, PID } from '@core/types';
import { Tracer, SpanKind, SpanStatus, Span, TraceContext } from './tracer';
import { log } from '@utils/logger';

export interface ActorTracingConfig {
    enabled: boolean;
    captureAllMessages: boolean;
    ignoredMessageTypes: string[];
    includedMessageTypes: string[];
    includePayload: boolean;
    includeMetadata: boolean;
}

// Actor系统追踪适配器
export class ActorTracer {
    private system: ActorSystem;
    private tracer: Tracer;
    private config: ActorTracingConfig;
    private activeTraces: Map<string, Span> = new Map();

    constructor(system: ActorSystem, tracer: Tracer, config: ActorTracingConfig) {
        this.system = system;
        this.tracer = tracer;
        this.config = {
            ...config,
            enabled: config.enabled ?? true,
            captureAllMessages: config.captureAllMessages ?? false,
            ignoredMessageTypes: config.ignoredMessageTypes ?? ['ping', 'heartbeat', 'metrics'],
            includedMessageTypes: config.includedMessageTypes ?? [],
            includePayload: config.includePayload ?? false,
            includeMetadata: config.includeMetadata ?? false
        };

        log.info('Actor tracer initialized');
    }

    // 启动追踪
    start(): void {
        if (!this.config.enabled) {
            log.info('Actor tracing is disabled');
            return;
        }

        this.attachHooks();
        log.info('Actor tracing started');
    }

    // 停止追踪
    stop(): void {
        // 实际的挂钩移除逻辑应该在这里实现
        log.info('Actor tracing stopped');
    }

    // 判断是否应该追踪消息
    private shouldTraceMessage(message: Message): boolean {
        if (!this.config.enabled) {
            return false;
        }

        const messageType = message.type || '';

        // 检查是否在忽略列表中
        if (this.config.ignoredMessageTypes.includes(messageType)) {
            return false;
        }

        // 如果有包含列表，只追踪包含列表中的消息类型
        if (this.config.includedMessageTypes.length > 0) {
            return this.config.includedMessageTypes.includes(messageType);
        }

        // 如果配置为捕获所有消息，则追踪所有未被忽略的消息
        return this.config.captureAllMessages;
    }

    // 附加系统钩子
    private attachHooks(): void {
        // 消息发送拦截器
        this.system.addMessageInterceptor(async (message: Message, source: PID, target: PID) => {
            if (!this.shouldTraceMessage(message)) {
                return true;
            }

            try {
                // 尝试从消息中提取现有的跟踪上下文
                let context = this.tracer.extractContextFromMessage(message);
                let span: Span;

                if (context) {
                    // 如果消息中有跟踪上下文，创建一个子span
                    span = this.tracer.startSpanWithContext(
                        `process-${message.type}`,
                        context,
                        {
                            kind: SpanKind.CONSUMER,
                            attributes: this.buildSpanAttributes(message, source, target)
                        }
                    );
                } else {
                    // 否则创建一个新的根span
                    span = this.tracer.startSpan(
                        `process-${message.type}`,
                        {
                            kind: SpanKind.CONSUMER,
                            attributes: this.buildSpanAttributes(message, source, target)
                        }
                    );

                    // 将新的span上下文注入到消息中
                    context = this.tracer.spanToContext(span);
                    message = this.tracer.injectContextIntoMessage(message, context);
                }

                // 保存活动跟踪，以便在消息处理完成后结束它
                const traceKey = this.generateTraceKey(message, target);
                this.activeTraces.set(traceKey, span);

                return true;
            } catch (error) {
                log.error('Error in actor tracing interceptor', error);
                return true; // 允许消息继续传递，即使跟踪失败
            }
        });

        // 消息处理钩子
        this.system.addMessageProcessingHook(async (message: Message, target: PID, error?: Error) => {
            if (!this.shouldTraceMessage(message)) {
                return true;
            }

            try {
                const traceKey = this.generateTraceKey(message, target);
                const span = this.activeTraces.get(traceKey);

                if (span) {
                    if (error) {
                        span.setStatus(SpanStatus.ERROR, error);
                        span.addEvent('error', {
                            'error.message': error.message,
                            'error.type': error.name,
                            'error.stack': error.stack || ''
                        });
                    } else {
                        span.setStatus(SpanStatus.OK);
                        span.addEvent('message_processed');
                    }

                    this.tracer.endSpan(span);
                    this.activeTraces.delete(traceKey);
                }

                return true;
            } catch (error) {
                log.error('Error in actor tracing processing hook', error);
                return true;
            }
        });

        // Actor创建钩子
        this.system.addActorCreationHook((actor: PID) => {
            if (!this.config.enabled) {
                return true;
            }

            try {
                const span = this.tracer.startSpan(
                    'actor_created',
                    {
                        kind: SpanKind.PRODUCER,
                        attributes: {
                            'actor.id': actor.id,
                            'actor.address': actor.address || '',
                            'actor.type': actor.type || 'unknown'
                        }
                    }
                );

                span.addEvent('actor_initialized');
                this.tracer.endSpan(span);
                return true;
            } catch (error) {
                log.error('Error in actor tracing creation hook', error);
                return true;
            }
        });

        // Actor终止钩子
        this.system.addActorTerminationHook((actor: PID) => {
            if (!this.config.enabled) {
                return true;
            }

            try {
                const span = this.tracer.startSpan(
                    'actor_terminated',
                    {
                        kind: SpanKind.INTERNAL,
                        attributes: {
                            'actor.id': actor.id,
                            'actor.address': actor.address || '',
                            'actor.type': actor.type || 'unknown'
                        }
                    }
                );

                span.addEvent('actor_stopped');
                this.tracer.endSpan(span);
                return true;
            } catch (error) {
                log.error('Error in actor tracing termination hook', error);
                return true;
            }
        });

        // Actor错误钩子
        this.system.addErrorHook((actor: PID, error: Error) => {
            if (!this.config.enabled) {
                return true;
            }

            try {
                const span = this.tracer.startSpan(
                    'actor_error',
                    {
                        kind: SpanKind.INTERNAL,
                        attributes: {
                            'actor.id': actor.id,
                            'actor.address': actor.address || '',
                            'actor.type': actor.type || 'unknown'
                        }
                    }
                );

                span.setStatus(SpanStatus.ERROR, error);
                span.addEvent('actor_error', {
                    'error.message': error.message,
                    'error.type': error.name,
                    'error.stack': error.stack || ''
                });

                this.tracer.endSpan(span);
                return true;
            } catch (error) {
                log.error('Error in actor tracing error hook', error);
                return true;
            }
        });
    }

    // 构建span属性
    private buildSpanAttributes(
        message: Message,
        source: PID,
        target: PID
    ): Record<string, string | number | boolean> {
        const attributes: Record<string, string | number | boolean> = {
            'message.type': message.type,
            'source.id': source.id,
            'source.address': source.address || '',
            'target.id': target.id,
            'target.address': target.address || '',
            'target.type': target.type || 'unknown'
        };

        // 添加负载信息（如果配置允许）
        if (this.config.includePayload && message.payload) {
            try {
                const payloadStr = typeof message.payload === 'object'
                    ? JSON.stringify(message.payload)
                    : String(message.payload);

                // 限制负载大小以避免大型数据
                attributes['message.payload'] = payloadStr.length > 1000
                    ? payloadStr.substring(0, 997) + '...'
                    : payloadStr;
            } catch (error) {
                attributes['message.payload.error'] = 'Failed to serialize payload';
            }
        }

        // 添加元数据信息（如果配置允许）
        if (this.config.includeMetadata && message.metadata) {
            try {
                // 过滤trace信息以避免重复
                const { trace, ...filteredMetadata } = message.metadata as any;
                const metadataStr = JSON.stringify(filteredMetadata);

                // 限制元数据大小
                attributes['message.metadata'] = metadataStr.length > 1000
                    ? metadataStr.substring(0, 997) + '...'
                    : metadataStr;
            } catch (error) {
                attributes['message.metadata.error'] = 'Failed to serialize metadata';
            }
        }

        return attributes;
    }

    // 生成唯一的跟踪键
    private generateTraceKey(message: Message, target: PID): string {
        return `${message.type}_${target.id}_${message.id || Date.now()}`;
    }
}