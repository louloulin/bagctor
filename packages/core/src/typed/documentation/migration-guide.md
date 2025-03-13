# Bagctor 类型系统迁移指南

本指南将帮助你将现有的 Bagctor Actor 代码迁移到新的类型安全系统。迁移过程可以是渐进式的，你可以选择逐步迁移或一次性完成。

## 目录

1. [迁移概述](#迁移概述)
2. [基本迁移步骤](#基本迁移步骤)
3. [消息类型定义](#消息类型定义)
4. [Actor 实现迁移](#actor-实现迁移)
5. [上下文使用](#上下文使用)
6. [请求-响应模式](#请求-响应模式)
7. [渐进式迁移策略](#渐进式迁移策略)
8. [兼容性处理](#兼容性处理)
9. [迁移检查清单](#迁移检查清单)
10. [常见问题](#常见问题)

## 迁移概述

Bagctor 的类型系统改进引入了类型安全的消息传递和 Actor 实现，主要变化包括：

1. 使用 `TypedActor` 代替 `Actor` 基类
2. 引入 `MessageMap` 类型定义消息类型
3. 使用类型安全的 `send`、`ask` 等方法
4. 引入请求-响应模式支持

迁移可以选择以下两种方式：

- **包装现有 Actor**：使用 `typedActorOf` 包装现有 Actor 类，快速获得类型安全
- **完全重写**：使用 `TypedActor` 基类重新实现 Actor，充分利用新的类型系统

## 基本迁移步骤

### 1. 导入新的类型和基类

```typescript
// 旧代码
import { Actor } from '@bactor/core';

// 新代码
import { TypedActor, MessageMap } from '@bactor/core/typed';
```

### 2. 定义消息类型映射

```typescript
// 定义 Actor 可以处理的消息类型
interface UserActorMessages extends MessageMap {
  createUser: { name: string; email: string };
  getUser: { id: string };
  updateUser: { id: string; name?: string; email?: string };
  deleteUser: { id: string };
}
```

### 3. 使用 TypedActor 基类

```typescript
// 旧代码
class UserActor extends Actor {
  // ...
}

// 新代码
class TypedUserActor extends TypedActor<UserState, UserActorMessages> {
  // ...
}
```

## 消息类型定义

### 使用 MessageMap 接口

```typescript
interface CounterMessages extends MessageMap {
  increment: { value: number };
  decrement: { value: number };
  reset: null;
  getCount: null;
  countResult: { count: number };
}
```

### 使用 defineMessage 简化消息定义

```typescript
import { defineMessage } from '@bactor/core/typed';

// 定义单个消息
const incrementMsg = defineMessage<{ value: number }>('increment');

// 使用消息
actor.send(counterActor, incrementMsg.type, { value: 5 });
```

## Actor 实现迁移

### 从 Actor 迁移到 TypedActor

旧的实现方式：

```typescript
class CounterActor extends Actor {
  private count = 0;

  protected behaviors(): void {
    this.addBehavior('default', async (message) => {
      if (message.type === 'increment') {
        this.count += message.payload.value;
      } else if (message.type === 'decrement') {
        this.count -= message.payload.value;
      } else if (message.type === 'reset') {
        this.count = 0;
      } else if (message.type === 'getCount') {
        await this.send(message.sender, {
          type: 'countResult',
          payload: { count: this.count }
        });
      }
    });
  }
}
```

新的实现方式：

```typescript
interface CounterState {
  count: number;
}

class TypedCounterActor extends TypedActor<CounterState, CounterMessages> {
  protected behaviors(): void {
    this.on('increment', async (payload) => {
      this.setState({ count: this.getState().count + payload.value });
    });

    this.on('decrement', async (payload) => {
      this.setState({ count: this.getState().count - payload.value });
    });

    this.on('reset', async () => {
      this.setState({ count: 0 });
    });

    this.on('getCount', async (_, context) => {
      if (context.sender) {
        await this.send(context.sender, 'countResult', { count: this.getState().count });
      }
    });
  }
}
```

### 使用 typedActorOf 包装现有 Actor

如果不想完全重写 Actor，可以使用 `typedActorOf` 函数包装现有 Actor：

```typescript
import { typedActorOf } from '@bactor/core/typed';

// 现有的 Actor 类
class LegacyCounterActor extends Actor {
  // ...现有实现...
}

// 创建类型安全的包装
const TypedLegacyCounterActor = typedActorOf<CounterState, CounterMessages>(LegacyCounterActor);

// 使用
const props = {
  actorClass: TypedLegacyCounterActor,
  initialState: { count: 0 }
};
const counterRef = await context.spawn(props);
```

## 上下文使用

### TypedActorContext 的使用

```typescript
// 旧代码
async function createCounter(context: ActorContext) {
  const props = { actorClass: CounterActor };
  const counterRef = await context.spawn(props);
  
  await context.send(counterRef, {
    type: 'increment',
    payload: { value: 10 }
  });
  
  return counterRef;
}

// 新代码
async function createCounter(context: ActorContext<AppMessages>) {
  const props = {
    actorClass: TypedCounterActor,
    initialState: { count: 0 }
  };
  const counterRef = await context.spawn<TypedCounterActor, CounterState, CounterMessages>(props);
  
  // 类型安全的消息发送
  await context.send(counterRef, 'increment', { value: 10 });
  
  return counterRef;
}
```

## 请求-响应模式

新的类型系统提供了类型安全的请求-响应模式：

```typescript
import { createRequestResponseMap } from '@bactor/core/typed';

// 定义请求-响应协议
const getUserProtocol = createRequestResponseMap<{ id: string }, { name: string; email: string }>(
  'getUser',
  'userResult'
);

// 在 Actor 中使用
class UserService extends TypedActor<UserServiceState, UserServiceMessages> {
  protected behaviors(): void {
    this.on('getUser', async (payload, context) => {
      const user = await this.findUser(payload.id);
      if (context.sender && context.metadata?.correlationId) {
        // 发送响应
        await this.send(
          context.sender,
          'userResult',
          { name: user.name, email: user.email },
          { correlationId: context.metadata.correlationId }
        );
      }
    });
  }
}

// 客户端使用 ask 模式
class UserClient extends TypedActor<any, UserClientMessages> {
  async getUserDetails(userId: string): Promise<{ name: string; email: string }> {
    const userService = /* 获取用户服务的引用 */;
    
    // 发送请求并等待响应
    return this.ask(userService, getUserProtocol, { id: userId });
  }
}
```

## 渐进式迁移策略

对于大型系统，建议采用渐进式迁移策略：

1. **首先引入消息类型定义**：为现有 Actor 定义 MessageMap
2. **创建类型安全的客户端**：使用 TypedActor 实现与现有系统交互的新 Actor
3. **包装关键 Actor**：使用 typedActorOf 包装最重要的现有 Actor
4. **逐步重写核心 Actor**：根据优先级逐步用 TypedActor 重新实现
5. **添加类型安全的测试**：为每个迁移的组件添加类型安全的测试

## 兼容性处理

### 与非类型安全代码交互

```typescript
import { toTypedMessage, toBaseMessage } from '@bactor/core/typed';

// 将非类型安全的消息转换为类型安全
function handleLegacyMessage(message: any) {
  const typedMessage = toTypedMessage<keyof MyMessages, MyMessages>(message);
  // 现在可以类型安全地处理消息
}

// 将类型安全的消息转换为基础消息
function sendToLegacyActor(target: PID, message: Message<any, any>) {
  const baseMessage = toBaseMessage(message);
  // 发送给传统 Actor
}
```

### 混合系统中的消息传递

```typescript
// 在 TypedActor 中处理来自非类型安全 Actor 的消息
class MixedActor extends TypedActor<MyState, MyMessages> {
  async receive(message: any): Promise<void> {
    // TypedActor.receive 会自动将基础消息转换为类型安全的消息
    await super.receive(message);
  }
}
```

## 迁移检查清单

- [ ] 为所有 Actor 定义 MessageMap
- [ ] 为所有 Actor 定义明确的状态类型
- [ ] 更新 Actor 实现使用 TypedActor 基类
- [ ] 更新消息发送代码使用类型安全的方法
- [ ] 更新 Actor 创建代码传递正确的类型参数
- [ ] 为请求-响应模式添加超时处理
- [ ] 添加类型安全的单元测试
- [ ] 验证与现有系统的兼容性

## 常见问题

### Q: 是否需要一次性迁移所有 Actor？
A: 不需要。可以逐步迁移，新的类型系统设计为可以与现有非类型安全的 Actor 共存。

### Q: 如何处理动态消息类型？
A: 对于真正需要动态类型的情况，可以使用 `any` 类型，但应尽量避免。更好的方法是使用联合类型和类型守卫。

### Q: 类型系统是否会影响性能？
A: 类型信息在编译时会被擦除，不会对运行时性能产生明显影响。验证器是可选的，默认不执行运行时验证。

### Q: 如何调试类型相关问题？
A: 使用 TypeScript 的类型检查功能。在 VSCode 中悬停在变量上可以查看其类型。同时，可以使用 console.log 输出运行时的消息内容帮助调试。 