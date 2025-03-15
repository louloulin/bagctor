// Core functionality
export { Actor } from './core/actor';
export { ActorContext } from './core/context';
export { ActorSystem } from './core/system';
export { SupervisorDirective, DefaultSupervisorStrategy, createMessage } from './core/types';
export type { Message, PID, Behavior, BehaviorMap, Props, SupervisorStrategy } from './core/types';
export { PropsBuilder } from './core/props';
export { DefaultMailbox, PriorityMailbox } from './core/mailbox';
export { DefaultDispatcher, ThreadPoolDispatcher, ThroughputDispatcher } from './core/dispatcher';
export type { RouterConfig, RouterType, IRouter } from './core/router';
export { BroadcastRouter, RoundRobinRouter, RandomRouter, createRouter } from './core/router';

// 新增的函数式API
export { defineActor, match, ask, SupervisorStrategies } from './core/helpers';

// 装饰器API
export { behavior, messageHandler, initialState } from './core/decorators';

// Utilities
export { log, configureLogger, createLogger, trace } from './utils/logger';
export type { LoggerConfig } from './utils/logger';

// Testing & Debugging
export type { ActorState, MessageTrace } from './testing/debug/debugger';

// Messaging
export * from './core/messaging/types';
export * from './core/messaging/delivery_tracker';
export * from './core/messaging/memory_message_store';
export { MessagePipeline, LocalActorTarget, RemoteActorTarget } from './core/messaging/pipeline';
export type { MessageTarget, MessagePipelineConfig } from './core/messaging/pipeline';
export { MiddlewareChain, LoggingMiddleware, MetricsMiddleware, RetryMiddleware } from './core/messaging/middleware';
export type { MessageMiddleware } from './core/messaging/middleware';

// Memory Pool Management
export {
    GenericObjectPool,
    BufferPool,
    memoryPoolManager,
    MemoryPoolManager
} from './core/memory_pool';
export type {
    ObjectPool,
    PoolStats,
    ObjectFactory,
    ObjectReset,
    ObjectPoolConfig,
    BufferPoolConfig
} from './core/memory_pool'; 