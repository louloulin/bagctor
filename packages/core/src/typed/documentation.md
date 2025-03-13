# Bagctor 类型安全的Actor系统

## 概述

Bagctor的类型安全Actor系统提供了一种强类型的方式来使用Actor模型，利用TypeScript的类型系统确保在编译时捕获许多潜在错误。这个系统为以下方面提供了类型安全性：

- **消息定义和处理**：确保Actor只能接收和处理其声明支持的消息类型
- **状态管理**：提供类型安全的状态访问和修改
- **Actor通信**：确保发送给Actor的消息格式正确
- **请求-响应模式**：提供类型安全的请求-响应交互模式

## 核心组件

### 1. 类型定义

#### MessageMap

`MessageMap`接口用于定义Actor可以处理的消息类型集合：

```typescript
interface MessageMap {
    [messageType: string]: any;
}

// 示例：定义一个计数器Actor的消息类型
interface CounterMessages extends MessageMap {
    'counter.increment': { value: number };
    'counter.decrement': { value: number };
    'counter.reset': null;
    'counter.get': null;
}
```

#### Message

`Message`接口为消息提供类型安全的结构：

```typescript
interface Message<T extends keyof TM, TM extends MessageMap = any, P = TM[T]> {
    type: T;
    payload: P;
    sender?: PID;
    metadata?: Record<string, any>;
    messageId?: string;
}
```

#### PID (Process ID)

`PID`接口是Actor引用的类型安全版本：

```typescript
interface PID<TM extends MessageMap = any> extends BasePID {
    _messageTypes?: TM; // 仅用于类型检查，运行时不存在
}
```

### 2. TypedActor

`TypedActor`是类型安全Actor的基类，它支持泛型状态和消息类型：

```typescript
abstract class TypedActor<TState = any, TM extends MessageMap = any> {
    protected context: ActorContext<TM>;
    protected state: ActorState<TState>;
    
    constructor(context: ActorContext<TM> | BaseActorContext, initialState: TState) {
        // ...初始化逻辑
    }
    
    protected abstract behaviors(): void;
    
    protected on<K extends keyof TM>(
        messageType: K,
        handler: (payload: TM[K], ctx: MessageContext) => Promise<void> | void
    ): this {
        // ...注册消息处理器
        return this;
    }
    
    // ...其他方法
}
```

### 3. 消息工具

#### defineMessage

用于创建类型安全的消息工厂函数：

```typescript
function defineMessage<TM extends MessageMap>() {
    return <K extends keyof TM>(
        type: K,
        payload: TM[K],
        sender?: PID,
        metadata?: Record<string, any>
    ): Message<K, TM> => ({
        type,
        payload,
        sender,
        metadata: metadata || {},
    });
}
```

#### MessageRegistry

用于注册和验证消息类型：

```typescript
class MessageRegistry<TM extends MessageMap = any> {
    register<K extends keyof TM>(
        messageType: K,
        validator: Validator<TM[K]>
    ): this;
    
    validate<K extends keyof TM>(
        messageType: K,
        payload: any
    ): payload is TM[K];
    
    validateMessage<K extends keyof TM>(
        message: Partial<Message<K, TM>>
    ): message is Message<K, TM>;
}
```

### 4. 请求-响应模式

请求-响应模式允许Actor发送请求并获取响应，类似于传统的远程过程调用：

```typescript
interface RequestResponseProtocol<Req, Res> {
    request: Req;
    response: Res;
}

function createRequestResponseMap<Req, Res>() {
    return { request: {} as Req, response: {} as Res };
}

function request<TReq, TRes>(
    protocol: RequestResponseProtocol<TReq, TRes>,
    requestData: TReq,
    sender?: PID,
    correlationId?: string
): Message<'request', { [key: string]: TReq }>;

function response<TReq, TRes>(
    protocol: RequestResponseProtocol<TReq, TRes>,
    responseData: TRes,
    requestMessage: Message<any>,
    sender?: PID
): Message<'response', { [key: string]: TRes }>;
```

## 使用指南

### 1. 定义Actor消息和状态类型

```typescript
// 定义Actor状态
interface CounterState {
    count: number;
}

// 定义Actor消息类型
interface CounterMessages extends MessageMap {
    'counter.increment': { value: number };
    'counter.decrement': { value: number };
    'counter.reset': null;
    'counter.get': null;
}

// 定义Actor响应消息类型
interface CounterResponses extends MessageMap {
    'counter.value': { count: number };
    'counter.error': { message: string };
}
```

### 2. 实现类型安全的Actor

```typescript
class CounterActor extends TypedActor<CounterState, CounterMessages> {
    constructor(context: ActorContext<CounterMessages>) {
        super(context, { count: 0 });
    }

    protected behaviors(): void {
        this.on('counter.increment', this.handleIncrement.bind(this))
            .on('counter.decrement', this.handleDecrement.bind(this))
            .on('counter.reset', this.handleReset.bind(this))
            .on('counter.get', this.handleGet.bind(this));
    }

    private async handleIncrement(payload: CounterMessages['counter.increment'], ctx: MessageContext): Promise<void> {
        this.setState({
            count: this.state.data.count + payload.value
        });

        if (ctx.sender) {
            await this.context.send(
                ctx.sender,
                'counter.value',
                { count: this.state.data.count }
            );
        }
    }

    // ...其他处理方法
}
```

### 3. 创建和验证消息

```typescript
// 创建消息工厂
const counterMessageFactory = defineMessage<CounterMessages>();

// 创建消息
const incrementMsg = counterMessageFactory('counter.increment', { value: 5 }, senderPid);

// 创建消息验证器
const counterRegistry = new MessageRegistry<CounterMessages>();

// 定义验证器函数
const isIncrementPayload = (value: any): value is CounterMessages['counter.increment'] => {
    return value && typeof value.value === 'number';
};

// 注册验证器
counterRegistry.register('counter.increment', isIncrementPayload);

// 验证消息
if (counterRegistry.validate('counter.increment', somePayload)) {
    // 类型安全：此处somePayload的类型已经被缩小为CounterMessages['counter.increment']
    console.log(somePayload.value);
}
```

### 4. 使用请求-响应模式

```typescript
// 定义请求和响应类型
interface GetUserRequest {
    id: string;
}

interface GetUserResponse {
    user: { id: string; name: string } | null;
    success: boolean;
}

// 创建协议
type GetUserProtocol = RequestResponseProtocol<GetUserRequest, GetUserResponse>;
const getUserProtocol = createRequestResponseMap<GetUserRequest, GetUserResponse>();

// 创建请求
const reqMsg = request(getUserProtocol, { id: 'user-123' }, senderPid);

// 发送请求
await context.send(userServicePid, reqMsg.type, reqMsg.payload);

// 创建响应
const respMsg = response(getUserProtocol, {
    user: { id: 'user-123', name: 'John Doe' },
    success: true
}, reqMsg, receiverPid);

// 发送响应
await context.send(reqMsg.sender!, respMsg.type, respMsg.payload);
```

## 最佳实践

1. **为每个Actor定义明确的消息类型**：为每个Actor创建专门的消息类型接口，清晰地表明Actor可以处理的消息。

2. **使用严格的状态类型**：尽量为Actor状态使用精确的类型定义，避免使用`any`或过于宽松的类型。

3. **利用消息验证**：在运行时使用`MessageRegistry`验证消息格式，特别是当处理来自外部系统的消息时。

4. **保持消息处理函数的简洁**：每个消息处理函数应该专注于单一职责，复杂逻辑应该拆分为更小的辅助函数。

5. **一致使用请求-响应模式**：对于需要返回结果的交互，始终使用请求-响应模式而不是直接回复。

## 从非类型安全代码迁移

要将现有的非类型安全Actor迁移到类型安全版本，请按照以下步骤操作：

1. **定义消息和状态类型**：为Actor创建`MessageMap`接口和状态类型。

2. **扩展TypedActor**：让Actor类扩展`TypedActor`而不是基础`Actor`。

3. **使用`on`方法注册消息处理器**：将原有的行为处理器转换为使用`on`方法注册的处理函数。

4. **更新消息发送**：使用类型安全的消息发送方法，确保消息类型和负载匹配。

5. **添加消息验证**：为关键消息类型添加验证器，以提高运行时安全性。

## 限制和注意事项

1. **类型擦除**：TypeScript的类型安全仅存在于编译时，运行时不会进行类型检查。因此，仍然需要防范不正确的消息格式。

2. **请求-响应不是原生支持的**：请求-响应模式是基于常规消息传递构建的，不是Actor模型的原生特性。

3. **兼容性考虑**：类型安全系统需要与现有的非类型安全代码共存，这可能导致一些折衷。

4. **性能开销**：额外的类型检查和验证可能会引入一些性能开销，尤其是在高吞吐量场景下。

## 示例

请参考以下示例以了解更多使用方法：

- `examples/user-actor.ts`：一个完整的用户管理Actor示例
- `examples/type-safety.test.ts`：展示类型安全特性的测试用例
- `examples/req-resp-simple.test.ts`：请求-响应模式的示例和测试 