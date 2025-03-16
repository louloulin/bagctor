# Bagctor API 设计文档

## 当前 API 分析

### 现有 API 概览

Bagctor (Bactor + AI Agent) 是一个结合了 Actor 模型和 AI Agent 能力的混合框架，当前 API 设计以 Actor 模型为基础，提供了消息传递、状态管理和行为转换等核心功能。主要组件包括：

1. **Actor 基类**：提供消息处理、状态管理和行为切换的基础设施
2. **ActorSystem**：管理 Actor 的生命周期、消息分发和错误处理
3. **消息系统**：支持请求-响应模式和单向消息传递
4. **路由器**：提供不同的消息路由策略
5. **调度器**：控制消息处理的并发执行
6. **邮箱系统**：管理消息队列和处理顺序

### 存在的问题

1. **类型安全不足**：✅ 已解决
   - 当前实现中使用了许多 `any` 类型，缺乏严格的类型检查
   - 消息类型和行为处理函数之间缺乏类型关联
   - 状态数据使用 `Record<string, any>` 类型，不利于类型推断

2. **API 设计不一致**：✅ 已解决
   - 混合了类属性和方法的公共/私有划分，不够清晰
   - `state` getter/setter 与直接状态管理方法 (`setState`/`getState`) 并存
   - 行为定义方式不够直观，需要显式调用 `addBehavior` 而非声明式定义

3. **错误处理机制不完善**：✅ 已解决
   - 错误处理逻辑分散在多个地方
   - 缺乏统一的监督策略 API
   - 异常处理与业务逻辑混合

4. **缺少函数式和声明式 API**：✅ 已解决
   - 主要基于类继承而非组合
   - 缺少函数式的 Actor 定义方式
   - 对 TypeScript 高级类型特性利用不足

5. **文档和示例不足**：✅ 已改进
   - 代码中的注释主要是中文，国际化支持不足
   - 类型定义文件中有不完整的类型声明 (如 `export type SupervisorStrategy = any`)

## 主流 Actor 框架对比

### Akka (Java/Scala)
- **优点**：
  - 完善的生命周期管理和监督层级
  - 丰富的消息路由策略
  - 完整的集群和分布式支持
  - 清晰的 Actor 引用模型
- **缺点**：
  - API 较为复杂
  - 初始学习曲线陡峭

### Nact.js (JavaScript/TypeScript)
- **优点**：
  - 函数式的 API 设计
  - 支持事件溯源
  - 简洁的消息处理模型
  - 模块化设计便于扩展
- **缺点**：
  - 分布式功能相对有限
  - 社区规模较小

### Orleans (Microsoft, 借鉴于 TypeScript 实现)
- **优点**：
  - "虚拟 Actor" 模型，自动激活/停用
  - 强类型接口设计
  - 透明的位置解析
  - 简化的状态持久化
- **缺点**：
  - 更适合特定类型的分布式应用
  - 概念与传统 Actor 模型有差异

## API 设计改进建议与实现

### 1. 强化类型安全 ✅ 已实现

#### 类型化 Actor ✅ 已实现

```typescript
/**
 * Actor 类型定义，支持泛型状态和消息类型
 */
export abstract class Actor<TState = any, TMessage extends Message = Message> {
  protected state: TState;
  protected context: ActorContext<TState, TMessage>;

  constructor(context: ActorContext<TState, TMessage>, initialState: TState) {
    this.context = context;
    this.state = initialState;
  }

  abstract receive(message: TMessage): Promise<any>;
}
```

#### 类型化消息 ✅ 已实现

```typescript
/**
 * 基础消息接口
 */
export interface Message {
  type: string;
  payload?: any;
  sender?: PID;
  timestamp?: number;
  metadata?: Record<string, unknown>;
}

/**
 * 类型化消息工厂
 */
export function createMessage<T>(type: string, payload: T, options?: Partial<Omit<Message, 'type' | 'payload'>>): Message & { payload: T } {
  return {
    type,
    payload,
    timestamp: Date.now(),
    ...options
  };
}
```

#### 类型化行为 ✅ 已实现

```typescript
/**
 * 类型化行为定义
 */
export type Behavior<TState, TMessage extends Message> = 
  (state: TState, message: TMessage, context: ActorContext<TState, TMessage>) => 
    Promise<TState> | TState;

/**
 * 行为映射类型
 */
export type BehaviorMap<TState, TMessage extends Message> = 
  Map<string, Behavior<TState, TMessage>>;
```

### 2. 提供声明式 API ✅ 已实现

#### 基于函数的 Actor 定义 ✅ 已实现

```typescript
/**
 * 函数式 Actor 创建器
 */
export function defineActor<TState, TMessage extends Message = Message>(
  initialState: TState,
  behaviors: Record<string, Behavior<TState, TMessage>>,
  options?: { defaultBehavior?: string }
) {
  return class FunctionalActor extends Actor<TState, TMessage> {
    private behaviorMap: BehaviorMap<TState, TMessage> = new Map();
    private currentBehavior: string = options?.defaultBehavior || 'default';

    constructor(context: ActorContext<TState, TMessage>) {
      super(context, initialState);
      Object.entries(behaviors).forEach(([name, fn]) => {
        this.behaviorMap.set(name, fn);
      });
    }

    async receive(message: TMessage): Promise<any> {
      const behavior = this.behaviorMap.get(this.currentBehavior);
      if (!behavior) {
        throw new Error(`No behavior found for state: ${this.currentBehavior}`);
      }
      
      const newState = await behavior(this.state, message, this.context);
      if (newState !== undefined) {
        this.state = newState;
      }
      
      return newState;
    }

    become(behavior: string): void {
      if (!this.behaviorMap.has(behavior)) {
        throw new Error(`Unknown behavior: ${behavior}`);
      }
      this.currentBehavior = behavior;
    }
  };
}
```

#### 装饰器支持 ✅ 已实现

```typescript
/**
 * 行为装饰器
 */
export function behavior(behaviorName: string = 'default') {
  return function (
    target: any,
    propertyKey: string,
    descriptor: PropertyDescriptor
  ) {
    if (!target.behaviorMap) {
      target.behaviorMap = new Map();
    }
    target.behaviorMap.set(behaviorName, descriptor.value);
    return descriptor;
  };
}

/**
 * 消息处理装饰器
 */
export function messageHandler(messageType: string) {
  return function (
    target: any,
    propertyKey: string,
    descriptor: PropertyDescriptor
  ) {
    if (!target.messageHandlers) {
      target.messageHandlers = new Map();
    }
    target.messageHandlers.set(messageType, propertyKey);
    return descriptor;
  };
}

/**
 * 使用示例
 */
@initialState<{ count: number }>({ count: 0 })
class GreetingActor extends Actor<{ count: number }, Message> {
  @messageHandler('greet')
  handleGreet(msg: Message<{ name: string }>): { count: number } {
    console.log(`Hello, ${msg.payload.name}! Visit count: ${this.state.count}`);
    return { count: this.state.count + 1 };
  }
  
  @behavior('farewell')
  handleGoodbye(msg: Message<{ name: string }>): { count: number } {
    console.log(`Goodbye, ${msg.payload.name}! Total visits: ${this.state.count}`);
    return this.state;
  }
}
```

### 3. 改进错误处理和监督策略 ✅ 已实现

```typescript
/**
 * 监督指令
 */
export enum SupervisorDirective {
  Resume,   // 继续处理消息，忽略错误
  Restart,  // 重启 Actor
  Stop,     // 停止 Actor
  Escalate  // 将错误升级到父 Actor
}

/**
 * 监督策略接口
 */
export interface SupervisorStrategy {
  handleError(
    error: Error, 
    childPID: PID, 
    restartCount: number
  ): SupervisorDirective;
}

/**
 * 默认监督策略
 */
export class DefaultSupervisorStrategy implements SupervisorStrategy {
  private maxRestarts: number;
  private withinTimeWindow: number;
  
  constructor(maxRestarts: number = 10, withinTimeWindow: number = 60000) {
    this.maxRestarts = maxRestarts;
    this.withinTimeWindow = withinTimeWindow;
  }
  
  handleError(error: Error, childPID: PID, restartCount: number): SupervisorDirective {
    if (restartCount > this.maxRestarts) {
      return SupervisorDirective.Stop;
    }
    return SupervisorDirective.Restart;
  }
}

/**
 * 自定义策略工厂
 */
export const SupervisorStrategies = {
  oneForOne: (maxRestarts: number, withinTimeWindow: number) => 
    new DefaultSupervisorStrategy(maxRestarts, withinTimeWindow),
    
  allForOne: (maxRestarts: number, withinTimeWindow: number) => 
    new AllForOneSupervisorStrategy(maxRestarts, withinTimeWindow),
    
  custom: (handler: (error: Error, childPID: PID, restartCount: number) => SupervisorDirective,
         options?: { restartAll?: boolean, errorClassifiers?: ErrorClassifier[] }) => 
    new CustomSupervisorStrategy(handler, options),

  /**
   * 创建错误分类器 ✅ 已实现
   * 用于精细化控制不同类型错误的处理方式
   */
  createErrorClassifier: (
    name: string,
    matchFn: (error: Error) => boolean,
    directive: SupervisorDirective
  ): ErrorClassifier => ({
    name,
    matches: matchFn,
    directive
  })
};

/**
 * 错误分类器接口 ✅ 已实现
 * 用于自定义监督策略中对不同类型的错误进行分类处理
 */
export interface ErrorClassifier {
  name: string;
  matches: (error: Error) => boolean;
  directive: SupervisorDirective;
}
```

### 4. 统一的消息模式 ✅ 已实现

```typescript
/**
 * 请求-响应模式辅助函数
 */
export function ask<TResponse>(
  system: ActorSystem,
  target: PID,
  message: Message,
  timeout: number = 5000
): Promise<TResponse> {
  return system.request<TResponse>(target, message, timeout);
}

/**
 * 消息模式匹配
 */
export function match<TState, TMessage extends Message = Message>(
  handlers: Partial<Record<string, Behavior<TState, TMessage> | {
    condition?: ((message: TMessage) => boolean) | Array<(message: TMessage) => boolean>;
    handler: Behavior<TState, TMessage>;
    priority?: number;
  }>>,
  defaultHandler?: Behavior<TState, TMessage>
): Behavior<TState, TMessage> {
  return (state, message, context) => {
    // 实现多条件匹配、优先级处理等功能
    // ...
  };
}
```

### 5. 增强的 Props API ✅ 已实现

```typescript
/**
 * Props 构建器，提供流畅的 API
 */
export class PropsBuilder<TState, TMessage extends Message = Message> {
  private props: Props = {};
  
  static create<S, M extends Message = Message>(): PropsBuilder<S, M> {
    return new PropsBuilder<S, M>();
  }
  
  static fromClass<S, M extends Message = Message>(
    actorClass: new (context: ActorContext) => Actor
  ): PropsBuilder<S, M> {
    return new PropsBuilder<S, M>().withActorClass(actorClass);
  }
  
  withActorClass(
    actorClass: new (context: ActorContext) => Actor
  ): this {
    this.props.actorClass = actorClass;
    return this;
  }
  
  withProducer(
    producer: (context: ActorContext) => Actor
  ): this {
    this.props.producer = producer;
    return this;
  }
  
  withMailbox(mailboxType: new () => IMailbox): this {
    this.props.mailboxType = mailboxType;
    return this;
  }
  
  withSupervisor(strategy: SupervisorStrategy): this {
    this.props.supervisorStrategy = strategy;
    return this;
  }
  
  withDispatcher(dispatcher: MessageDispatcher): this {
    this.props.dispatcher = dispatcher;
    return this;
  }
  
  withAddress(address: string): this {
    this.props.address = address;
    return this;
  }
  
  build(): Props {
    return { ...this.props };
  }
}
```

## 使用示例

### 基于类的 Actor ✅ 已实现

```typescript
/**
 * 定义消息类型
 */
interface CounterMessage extends Message {
  type: 'increment' | 'decrement' | 'get';
  payload?: number;
}

/**
 * 定义状态类型
 */
interface CounterState {
  count: number;
}

/**
 * 实现 Actor
 */
class CounterActor extends Actor<CounterState, CounterMessage> {
  constructor(context: ActorContext) {
    super(context, { count: 0 });
  }
  
  protected behaviors(): void {
    this.addBehavior('default', async (message: CounterMessage) => {
      switch (message.type) {
        case 'increment':
          this.setState({ count: this.state.count + (message.payload || 1) });
          return this.state.count;
          
        case 'decrement':
          this.setState({ count: this.state.count - (message.payload || 1) });
          return this.state.count;
          
        case 'get':
          return this.state.count;
          
        default:
          throw new Error(`Unhandled message type: ${message.type}`);
      }
    });
  }
}

/**
 * 创建并使用 Actor
 */
const system = new ActorSystem();
const props = PropsBuilder.fromClass(CounterActor).build();
const counterPid = await system.spawn(props);

// 发送消息
await system.send(counterPid, { type: 'increment', payload: 5 });

// 请求-响应模式
const count = await ask<number>(system, counterPid, { type: 'get' });
console.log(`Current count: ${count}`);
```

### 函数式 Actor ✅ 已实现

```typescript
/**
 * 使用函数式 API 定义 Actor
 */
const CounterActor = defineActor<CounterState, CounterMessage>(
  { count: 0 },
  {
    default: (state, message, context) => {
      switch (message.type) {
        case 'increment':
          return { count: state.count + (message.payload || 1) };
          
        case 'decrement':
          return { count: state.count - (message.payload || 1) };
          
        case 'get':
          // 不修改状态，只返回当前计数
          context.respond(message, state.count);
          return state;
          
        default:
          throw new Error(`Unhandled message type: ${message.type}`);
      }
    }
  }
);

/**
 * 或者使用 match 模式
 */
const CounterActorWithMatch = defineActor<CounterState, CounterMessage>(
  { count: 0 },
  {
    default: match<CounterState, CounterMessage>({
      increment: (state, message) => ({ 
        count: state.count + (message.payload || 1) 
      }),
      
      decrement: (state, message) => ({ 
        count: state.count - (message.payload || 1) 
      }),
      
      get: (state, message, context) => {
        context.respond(message, state.count);
        return state;
      }
    })
  }
);
```

### 装饰器API示例 ✅ 新添加

```typescript
/**
 * 使用装饰器API定义Actor
 */
@initialState<CounterState>({ count: 0 })
class DecoratedCounterActor extends Actor<CounterState, CounterMessage> {
  protected behaviors(): void {
    // 获取装饰器定义的行为和消息处理器
    const proto = Object.getPrototypeOf(this);
    const behaviorMethods = proto.behaviorMethods || new Map();
    const messageHandlers = proto.messageHandlers || new Map();
    
    // 注册默认行为
    this.addBehavior('default', async (msg) => {
      const handlerName = messageHandlers.get(msg.type);
      if (handlerName && typeof this[handlerName] === 'function') {
        return await this[handlerName](msg);
      }
      throw new Error(`No handler found for message type: ${msg.type}`);
    });
    
    // 注册其他行为
    behaviorMethods.forEach((methodName, behaviorName) => {
      if (behaviorName !== 'default') {
        this.addBehavior(behaviorName, async (msg) => {
          return await this[methodName](msg);
        });
      }
    });
  }
  
  @messageHandler('increment')
  handleIncrement(msg: CounterMessage): CounterState {
    return { count: this.state.count + (msg.payload || 1) };
  }
  
  @messageHandler('decrement')
  handleDecrement(msg: CounterMessage): CounterState {
    return { count: this.state.count - (msg.payload || 1) };
  }
  
  @messageHandler('get')
  handleGet(): CounterState {
    return this.state;
  }
  
  @behavior('readonly')
  readonlyBehavior(msg: CounterMessage): any {
    if (msg.type === 'get') {
      return this.state;
    }
    throw new Error('In readonly mode, only get is allowed');
  }
}
```

## 结论

通过引入更强的类型安全、提供更灵活的 API 模式，并借鉴主流 Actor 框架的最佳实践，Bagctor 已经变得更加易用、类型安全且易于扩展。我们已经完成了以下改进：

1. **利用 TypeScript 泛型**：✅ 已完成 - 为 Actor、消息和状态提供类型安全的定义
2. **提供多种编程风格**：✅ 已完成 - 同时支持基于类、基于函数和基于装饰器的 Actor 定义方式
3. **改进错误处理**：✅ 已完成 - 明确的监督策略接口和实现，包括错误分类器功能
4. **简化消息处理**：✅ 已完成 - 通过模式匹配等方式简化消息处理逻辑
5. **流畅的 API 设计**：✅ 已完成 - 使用构建器模式和链式 API 提高代码可读性

这些改进使 Bagctor 更符合现代 TypeScript 应用的开发风格，同时保持 Actor 模型的核心概念和优势。我们还添加了全面的测试，验证了新API的正确性和可用性。

### 测试验证

为了确保实现的功能正常工作，我们添加了以下测试：

1. **类型安全Actor测试**：✅ 已完成
   - 测试验证了泛型Actor的状态和消息类型安全
   - 确认了状态更新和类型推断正常工作

2. **函数式API测试**：✅ 已完成
   - 验证了defineActor函数创建的函数式Actor的功能
   - 测试了match函数处理不同消息类型的能力

3. **装饰器API测试**：✅ 已完成
   - 确认了@behavior和@messageHandler装饰器的正确行为
   - 测试了@initialState装饰器自动设置初始状态

4. **监督策略测试**：✅ 已完成
   - 验证了OneForOne策略正确处理单个子Actor的故障
   - 测试了AllForOne策略的行为模式
   - 验证了自定义策略能够根据错误类型做出不同决策
   - 测试了错误分类器功能正确匹配不同类型的错误并应用相应指令

5. **请求-响应测试**：✅ 已完成
   - 测试了ask函数的基本请求-响应功能
   - 验证了超时处理机制
   - 确认了错误处理和不同响应类型的支持

这些测试覆盖了API设计文档中提出的所有关键改进，并确认了它们在实际代码中的正确实现。

### 文档完善

我们还为所有实现的功能创建了详细的文档：

1. **API 概览**：✅ 已完成 - 在 `docs/api/README.md` 中提供了完整的API概览
2. **错误处理**：✅ 已完成 - 在 `docs/api/error-handling.md` 中详细说明了错误处理机制
3. **监督策略**：✅ 已完成 - 在 `docs/api/supervision/strategies.md` 中描述了各种监督策略
4. **错误分类器**：✅ 已完成 - 在 `docs/api/supervision/error-classification.md` 中提供了错误分类器的用法

## 后续改进计划

1. **改进文档和示例**：✅ 已完成 - 添加了详细的API文档和使用示例，包括增强的Actor代理和模式匹配
2. **性能优化**：✅ 已完成 - 优化了泛型Actor的性能，确保与原始版本相当或更好
3. **集成与集群支持**：计划中 - 提供更好的集群和分布式支持，通过类型安全的API
4. **增强错误追踪**：✅ 已完成 - 改进监督策略的错误追踪和恢复机制，添加了自动重试和错误处理功能
5. **进一步提高测试覆盖率**：✅ 已完成 - 针对边缘情况添加了更多测试
6. **提供更多中间件**：✅ 已完成 - 扩展消息处理管道，添加了消息拦截器、批量处理和条件匹配
7. **增强Actor代理功能**：✅ 已完成 - 添加了批量操作、动态配置、消息拦截和自动重试功能
8. **增强模式匹配**：✅ 已完成 - 添加了多条件匹配和优先级处理 