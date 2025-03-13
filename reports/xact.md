# Bagctor Actor模型类型系统优化计划

## 1. 当前类型系统分析

Bagctor的Actor模型实现目前使用了TypeScript的类型系统，但存在以下不足：

### 1.1 类型定义问题

- **松散类型定义**：核心类型如`Actor`和`ActorContext`在`types.ts`中被简单定义为`any`以避免循环依赖
- **消息类型泛化**：`Message`接口定义过于宽泛，`payload`字段为`any`类型
- **状态类型不安全**：Actor状态管理使用`any`类型，缺乏类型约束
- **行为处理函数类型不精确**：行为处理函数映射使用基础Map实现，没有利用TypeScript的高级类型特性

```typescript
// 当前Actor类定义问题示例
export abstract class Actor {
  protected state: ActorState; // ActorState.data 是 any 类型
  protected behaviorMap: Map<string, (message: Message) => Promise<void>>;
  
  // 无法对特定消息类型进行处理
  async receive(message: Message): Promise<void> {
    const behavior = this.behaviorMap.get(this.state.behavior);
    if (behavior) {
      await behavior.call(this, message);
    }
  }
  
  // 状态管理使用any类型
  protected setState(data: any): void {
    this.state.data = data;
  }
  
  protected getState(): any {
    return this.state.data;
  }
}
```

### 1.2 消息类型系统不足

- **统一消息接口**：所有消息共享同一个基础接口，缺乏消息类型分类和语义区分
- **类型安全性不足**：无法在编译时保证消息类型与处理函数的匹配
- **缺少消息类型推导**：无法根据消息类型自动推导payload类型
- **松散的消息路由**：基于字符串的消息类型匹配，容易出现拼写错误和维护困难

```typescript
// 当前Message接口定义
export interface Message {
    type: string;          // 字符串类型，容易拼写错误
    payload?: any;         // any类型，失去类型安全
    sender?: PID;
    metadata?: Record<string, any>;
    routee?: PID;
    content?: string;      // 与payload重叠的另一字段
    index?: number;
    messageId?: string;
}
```

### 1.3 Actor通信类型不安全

- **发送消息缺乏类型检查**：无法确保发送给特定Actor的消息类型正确
- **返回值处理复杂**：请求-响应模式下需要手动关联请求和响应消息
- **消息处理函数绑定松散**：无法确保Actor能处理所收到的所有类型消息

```typescript
// 当前send方法类型不安全
protected async send(target: PID, message: Message): Promise<void> {
  await this.context.send(target, message); // 无法保证target能处理此类消息
}
```

## 2. 类型系统优化目标

- **增强类型安全性**：减少运行时错误，提高代码可靠性
- **提高自文档化能力**：通过类型定义提供清晰的API契约
- **简化开发体验**：利用TypeScript的类型推导减轻手动类型注解负担
- **保持性能**：类型增强不应显著增加运行时开销
- **保持兼容性**：新类型系统应兼容现有代码，允许渐进式迁移

## 3. 核心类型定义优化

### 3.1 泛型Actor基类

将Actor类改造为支持状态和消息类型的泛型基类：

```typescript
// 优化后的Actor类定义
export abstract class Actor<TState = any, TMessages extends MessageMap = any> {
  protected state: TState;
  protected behaviorMap = new Map<string, MessageHandler<TMessages>>();
  
  constructor(context: ActorContext, initialState: TState) {
    this.context = context;
    this.state = initialState;
    this.initialize();
  }
  
  // 类型安全的状态管理
  protected setState(newState: Partial<TState>): void {
    this.state = { ...this.state, ...newState };
  }
  
  protected getState(): Readonly<TState> {
    return this.state;
  }
  
  // 类型安全的消息接收
  async receive<K extends keyof TMessages>(
    message: Message<K, TMessages[K]>
  ): Promise<void> {
    const behavior = this.behaviorMap.get(this.currentBehavior);
    if (behavior) {
      await behavior(message);
    }
  }
}
```

### 3.2 强类型消息处理

定义消息类型映射和处理函数接口：

```typescript
// 消息类型映射接口
export interface MessageMap {
  [messageType: string]: any;
}

// 消息类型定义
export interface Message<T extends keyof MessageMap, P = MessageMap[T]> {
  type: T;
  payload: P;
  sender?: PID;
  metadata?: MessageMetadata;
}

// 消息处理函数类型
export type MessageHandler<M extends MessageMap> = <K extends keyof M>(
  message: Message<K, M[K]>
) => Promise<void>;

// 行为映射类型
export type BehaviorMap<M extends MessageMap> = Map<string, MessageHandler<M>>;
```

### 3.3 类型安全的上下文

改进ActorContext接口，支持类型安全的Actor通信：

```typescript
export interface ActorContext<M extends MessageMap = any> {
  self: PID;
  
  // 类型安全的消息发送
  send<A extends Actor<any, M>, K extends keyof M>(
    target: PID,
    messageType: K,
    payload: M[K]
  ): Promise<void>;
  
  // 类型安全的Actor创建
  spawn<T extends Actor<any, any>>(
    props: Props<T>
  ): Promise<PID>;
  
  // 其他方法...
}
```

## 4. 消息类型系统优化

### 4.1 类型安全的消息定义

使用类型定义创建具体消息类型而不是直接使用Message接口：

```typescript
// 消息类型工厂
export function defineMessage<T extends string, P = any>() {
  return <K extends T, V extends P>(type: K, payload: V): Message<K, V> => ({
    type,
    payload,
    metadata: {}
  });
}

// 使用示例
export interface UserMessages extends MessageMap {
  'user.create': { name: string; email: string };
  'user.update': { id: string; name?: string; email?: string };
  'user.delete': { id: string };
}

// 创建类型安全的消息
const createUserMsg = defineMessage<keyof UserMessages, UserMessages[keyof UserMessages]>();
const msg = createUserMsg('user.create', { name: 'John', email: 'john@example.com' });
```

### 4.2 消息类型注册和验证

提供消息类型注册机制以支持运行时消息验证：

```typescript
export class MessageRegistry<M extends MessageMap> {
  private schemas = new Map<keyof M, Validator<M[keyof M]>>();
  
  register<K extends keyof M>(
    messageType: K,
    validator: Validator<M[K]>
  ): this {
    this.schemas.set(messageType, validator);
    return this;
  }
  
  validate<K extends keyof M>(
    messageType: K,
    payload: any
  ): payload is M[K] {
    const validator = this.schemas.get(messageType);
    return validator ? validator(payload) : false;
  }
}

// 使用示例
const userRegistry = new MessageRegistry<UserMessages>()
  .register('user.create', isCreateUserPayload)
  .register('user.update', isUpdateUserPayload);
```

### 4.3 基于类型的消息路由

实现基于类型的消息路由机制，自动将消息分发到对应处理函数：

```typescript
export class TypedActor<S, M extends MessageMap> extends Actor<S, M> {
  private handlers = new Map<keyof M, (payload: any) => Promise<void>>();
  
  protected on<K extends keyof M>(
    messageType: K,
    handler: (payload: M[K], context: MessageContext) => Promise<void> | void
  ): this {
    this.handlers.set(messageType, async (payload) => {
      await handler(payload, { sender: this.currentMessage?.sender });
    });
    return this;
  }
  
  async receive<K extends keyof M>(
    message: Message<K, M[K]>
  ): Promise<void> {
    const handler = this.handlers.get(message.type);
    if (handler) {
      this.currentMessage = message;
      await handler(message.payload);
      this.currentMessage = undefined;
    }
  }
}
```

## 5. 类型安全的Actor通信

### 5.1 类型安全的PID引用

通过泛型增强PID引用类型安全性：

```typescript
// 增强PID接口
export interface TypedPID<M extends MessageMap = any> extends PID {
  _messageType?: M; // 不使用在运行时，仅用于类型提示
}

// 类型安全的Actor引用创建
export function actorRef<A extends Actor<any, M>, M extends MessageMap>(
  pid: PID
): TypedPID<M> {
  return pid as TypedPID<M>;
}
```

### 5.2 类型安全的请求-响应模式

实现类型安全的请求-响应模式：

```typescript
// 请求-响应接口
export interface RequestResponseProtocol<Req, Res> {
  request: Req;
  response: Res;
}

// 增强上下文接口
export interface ActorContext<M extends MessageMap = any> {
  // ... 其他方法
  
  // 类型安全的请求-响应
  ask<P extends RequestResponseProtocol<any, any>>(
    target: TypedPID<{ [K in string]: P['request'] }>,
    request: P['request'],
    timeout?: number
  ): Promise<P['response']>;
}
```

### 5.3 Actor代理生成

提供自动生成类型安全Actor代理的工具：

```typescript
// Actor代理生成器
export function createActorProxy<A extends Actor<any, M>, M extends MessageMap>(
  context: ActorContext,
  target: TypedPID<M>
): ActorProxy<M> {
  return new Proxy({} as ActorProxy<M>, {
    get: (_, messageType: string) => {
      return (payload: any) => context.send(target, messageType, payload);
    }
  });
}

// 使用示例
interface UserActorMessages extends MessageMap {
  'createUser': { name: string; email: string };
  'updateUser': { id: string; name?: string; };
}

const userActor = createActorProxy<UserActor, UserActorMessages>(context, userPid);
// 类型安全的消息发送
await userActor.createUser({ name: 'Alice', email: 'alice@example.com' });
```

## 6. 优化后的类型系统示例

### 6.1 用户Actor实现示例

```typescript
// 用户Actor消息类型定义
interface UserActorState {
  users: Record<string, User>;
  lastActivity: Date;
}

interface UserActorMessages extends MessageMap {
  'user.create': { name: string; email: string };
  'user.get': { id: string };
  'user.update': { id: string; name?: string; email?: string };
  'user.delete': { id: string };
}

// 用户Actor实现
class UserActor extends TypedActor<UserActorState, UserActorMessages> {
  constructor(context: ActorContext) {
    super(context, { users: {}, lastActivity: new Date() });
    this.registerHandlers();
  }
  
  private registerHandlers(): void {
    this.on('user.create', this.handleCreate.bind(this))
      .on('user.get', this.handleGet.bind(this))
      .on('user.update', this.handleUpdate.bind(this))
      .on('user.delete', this.handleDelete.bind(this));
  }
  
  private async handleCreate(
    payload: UserActorMessages['user.create'],
    ctx: MessageContext
  ): Promise<void> {
    const id = uuidv4();
    const user = { id, ...payload };
    this.setState({ 
      users: { ...this.state.users, [id]: user },
      lastActivity: new Date() 
    });
    
    // 类型安全的消息回复
    if (ctx.sender) {
      await this.context.send(ctx.sender, 'user.created', { user });
    }
  }
  
  // 其他处理函数...
}
```

### 6.2 路由器类型优化示例

```typescript
// 路由器类型定义
export interface RouterConfig<M extends MessageMap> {
  routees: Array<TypedPID<M>>;
  strategy: RoutingStrategy;
  groupName?: string;
}

// 类型安全的路由器实现
export class TypedRouter<M extends MessageMap> extends Actor<RouterState, RouterMessages> {
  private routees: Array<TypedPID<M>> = [];
  private strategy: RoutingStrategy;
  
  constructor(context: ActorContext, config: RouterConfig<M>) {
    super(context, { routees: [], lastRouting: null });
    this.routees = config.routees;
    this.strategy = config.strategy;
    this.setState({ routees: config.routees });
  }
  
  async route<K extends keyof M>(
    messageType: K,
    payload: M[K],
    sender?: PID
  ): Promise<void> {
    const targets = await this.selectRoutees(messageType, payload);
    
    // 发送类型安全的消息到所有目标
    for (const target of targets) {
      await this.context.send(target, messageType, payload);
    }
  }
  
  private async selectRoutees<K extends keyof M>(
    messageType: K,
    payload: M[K]
  ): Promise<Array<TypedPID<M>>> {
    // 基于策略选择路由目标
    // ...
  }
}
```

## 7. 实施计划

### 7.1 第一阶段: 基础类型定义改进 (1-2周) ✅

1. **核心类型重构** ✅
   - 修改基础类型定义，解决循环依赖问题
   - 引入基础泛型支持，但保持与现有代码兼容
   - 实现基础消息类型映射和验证器接口

2. **向后兼容层** ✅
   - 提供向后兼容的类型定义
   - 实现类型断言和类型转换助手函数
   - 添加类型迁移指南文档

### 7.2 第二阶段: 消息类型系统增强 (2-3周)

1. **消息类型定义工具**
   - 实现消息类型定义和约束工具
   - 创建消息类型验证器框架
   - 添加运行时类型检查(可选功能)

2. **Actor通信类型安全**
   - 更新ActorContext接口，支持类型安全的消息发送
   - 实现类型安全的PID引用
   - 增强请求-响应模式类型安全性

### 7.3 第三阶段: 高级类型特性 (3-4周)

1. **状态管理增强**
   - 实现类型安全的Actor状态管理
   - 提供状态演化和事件源模式的类型支持
   - 实现不可变状态类型约束

2. **高级Actor模式类型支持**
   - 类型安全的Supervision策略
   - 类型安全的Router实现
   - 类型安全的Actor组合和层次结构

### 7.4 第四阶段: 示例和文档 (1-2周)

1. **示例和模式**
   - 提供类型安全的Actor示例
   - 更新现有示例使用新类型系统
   - 创建常见模式的类型安全实现

2. **文档和教程**
   - 更新API文档，包含类型信息
   - 创建类型系统使用教程
   - 提供迁移指南

## 8. 预期成果

完成上述优化后，Bagctor Actor模型类型系统将实现以下目标：

1. **增强静态类型检查**: 减少运行时错误，提前捕获类型不匹配问题
2. **提高代码可读性**: 通过类型定义清晰表达Actor的能力和约束
3. **简化Actor开发**: 利用TypeScript的类型推导减少手动类型注解
4. **增强IDE支持**: 提供更好的代码补全、导航和重构支持
5. **行为文档化**: 类型定义作为代码的"可执行文档"

通过这些改进，开发者将能够更高效、更安全地构建基于Actor模型的应用程序，同时保持系统的可扩展性和性能。 