// 基本类型定义
export {
    MessageMap,
    Message,
    PID,
    ActorContext,
    Actor,
    MessageContext,
    Validator,
    MessageHandler,
    PayloadHandler,
    ActorState,
    Props,
    MessageMetadata,
    ActorProxy,
    createActorProxy,
    actorRef,
    toTypedMessage,
    toBaseMessage
} from './types';

// Actor实现
export { TypedActor, typedActorOf } from './actor';

// 上下文实现 
export { TypedActorContext, createTypedContext } from './context';

// 消息工具
export {
    defineMessage,
    MessageRegistry,
    createTypeValidator,
    objectValidator,
    // 消息构建器
    MessageBuilder,
    createMessageSchema,
    // 高级验证器
    unionValidator,
    arrayValidator,
    optionalValidator,
    recordValidator,
    // 基础类型验证器
    isString,
    isNumber,
    isBoolean,
    isObject,
    isArray,
    isNull,
    isUndefined,
    isDate,
    isFunction
} from './messages';

// 请求-响应模式
export type { RequestResponseProtocol } from './request-response';
export {
    createRequestResponseMap,
    request,
    response,
    generateCorrelationId,
    RequestResponseManager
} from './request-response'; 