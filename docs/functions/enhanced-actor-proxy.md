# 增强的Actor代理与模式匹配

本文档介绍了Bagctor框架中两个重要的增强功能：`EnhancedActorProxy`和增强版`match`函数。

## 增强的Actor代理 (EnhancedActorProxy)

`EnhancedActorProxy`是一个类型安全的代理工具，它提供了更直观、更灵活的方式来与Actor进行交互。相比于传统的消息发送方式，它提供了基于方法的调用风格，并支持更多高级功能。

### 基本用法

```typescript
import { createEnhancedActorProxy } from '@bactor/core';

// 定义消息类型
interface UserMessages {
    'create': { name: string; email: string; };
    'update': { id: string; name?: string; email?: string; };
    'get': { id: string; };
    'delete': { id: string; };
}

// 创建代理
const userProxy = createEnhancedActorProxy<UserMessages>(
    system,
    userActorPID,
    { timeout: 5000 }
);

// 使用方法风格发送消息
await userProxy.sendCreate({ name: "John", email: "john@example.com" });

// 使用方法风格请求数据
const user = await userProxy.requestGet({ id: "user1" });

// 使用自定义超时
const updatedUser = await userProxy.requestUpdate({ id: "user1", name: "John Doe" }, 10000);
```

### 高级功能

#### 批量操作

```typescript
// 批量发送多个消息
await userProxy.sendBatch([
    { type: 'create', payload: { name: "John", email: "john@example.com" } },
    { type: 'create', payload: { name: "Alice", email: "alice@example.com" } }
]);

// 批量请求多个数据
const users = await userProxy.requestBatch([
    { type: 'get', payload: { id: "user1" } },
    { type: 'get', payload: { id: "user2" } }
]);

// 处理部分失败的情况
const results = await userProxy.requestBatch([
    { type: 'get', payload: { id: "user1" } },
    { type: 'get', payload: { id: "nonexistent" } }
], { allSettled: true });
// results[0]包含用户数据，results[1]可能是undefined
```

#### 动态配置

```typescript
// 更新默认超时时间
userProxy.setTimeout(10000);

// 设置自定义错误处理器
userProxy.setErrorHandler((error, messageType, payload) => {
    console.error(`Error in ${messageType}:`, error);
    metrics.incrementCounter('actor.errors', { type: messageType });
});
```

#### 消息拦截器

```typescript
// 创建带拦截器的代理
const userProxy = createEnhancedActorProxy<UserMessages>(
    system,
    userActorPID,
    {
        interceptor: (messageType, payload, isRequest) => {
            // 记录所有操作
            logger.info(`Actor operation: ${messageType}`, { payload, isRequest });
            
            // 验证权限
            if (messageType === 'delete' && !hasPermission('delete_users')) {
                return false; // 阻止消息发送
            }
            
            return true; // 允许消息发送
        }
    }
);
```

#### 自动重试

```typescript
// 创建支持重试的代理
const userProxy = createEnhancedActorProxy<UserMessages>(
    system,
    userActorPID,
    {
        retry: {
            maxRetries: 3,
            delay: 200,
            backoffFactor: 2,
            shouldRetry: (error) => {
                // 只重试网络相关的错误
                return error.message.includes('network') || 
                       error.message.includes('timeout');
            }
        }
    }
);
```

## 增强的模式匹配 (match)

`match`函数是一个强大的消息处理工具，它允许以声明式的方式定义不同消息类型的处理逻辑，现在还支持条件匹配和多条件组合。

### 基本用法

```typescript
import { match, defineActor } from '@bactor/core';

const UserActor = defineActor<UserState, UserMessage>(
    { users: {} }, // 初始状态
    {
        default: match<UserState, UserMessage>({
            'create': (state, msg) => {
                // 处理创建用户
                return newState;
            },
            'update': (state, msg) => {
                // 处理更新用户
                return newState;
            },
            'delete': (state, msg) => {
                // 处理删除用户
                return newState;
            }
        }, (state, msg) => {
            // 默认处理器，处理未匹配的消息类型
            console.warn(`Unhandled message type: ${msg.type}`);
            return state;
        })
    }
);
```

### 条件匹配

```typescript
match<UserState, UserMessage>({
    'update': {
        // 单个条件：只有当用户ID存在时才处理更新
        condition: (msg) => Boolean(msg.payload?.id),
        handler: (state, msg) => {
            // 处理更新
            return newState;
        }
    }
})
```

### 多条件组合

```typescript
match<UserState, UserMessage>({
    'update': {
        // 多个条件：使用条件数组，所有条件都必须满足（逻辑与）
        condition: [
            // 条件1: ID必须存在
            (msg) => Boolean(msg.payload?.id),
            // 条件2: 至少有一个字段要更新
            (msg) => Boolean(msg.payload?.name || msg.payload?.email),
            // 条件3: 用户必须存在于当前状态中
            (msg, state) => msg.payload.id in state.users
        ],
        handler: (state, msg) => {
            // 处理更新
            return newState;
        }
    }
})
```

## 集成使用示例

结合`EnhancedActorProxy`和`match`函数，可以构建更加强大和类型安全的Actor系统：

```typescript
// 定义消息类型
interface UserMessages {
    'create': { name: string; email: string; };
    'update': { id: string; name?: string; email?: string; };
    'get': { id: string; };
    'delete': { id: string; };
}

// 定义状态类型
interface UserState {
    users: Record<string, { name: string; email: string; }>;
}

// 使用match定义Actor行为
const UserActor = defineActor<UserState, UserMessages>(
    { users: {} },
    {
        default: match<UserState, UserMessages>({
            'create': (state, msg) => {
                const { name, email } = msg.payload;
                const id = `user-${Date.now()}`;
                return {
                    users: {
                        ...state.users,
                        [id]: { name, email }
                    }
                };
            },
            'update': {
                condition: [
                    (msg) => Boolean(msg.payload?.id),
                    (msg) => Boolean(msg.payload?.name || msg.payload?.email)
                ],
                handler: (state, msg) => {
                    const { id, ...updates } = msg.payload;
                    if (id in state.users) {
                        return {
                            users: {
                                ...state.users,
                                [id]: { ...state.users[id], ...updates }
                            }
                        };
                    }
                    return state;
                }
            },
            'get': (state, msg, context) => {
                const { id } = msg.payload;
                // 这是一个请求消息，需要回复
                context.respond(msg, state.users[id]);
                return state;
            },
            'delete': (state, msg) => {
                const { id } = msg.payload;
                const { [id]: removedUser, ...remainingUsers } = state.users;
                return { users: remainingUsers };
            }
        })
    }
);

// 在其他地方使用增强的Actor代理与该Actor交互
const userService = createEnhancedActorProxy<UserMessages>(system, userActorPID);

// 创建用户
await userService.sendCreate({ name: "John", email: "john@example.com" });

// 获取用户
const user = await userService.requestGet({ id: "user1" });

// 更新用户
await userService.sendUpdate({ id: "user1", name: "John Doe" });

// 批量操作
await userService.sendBatch([
    { type: 'create', payload: { name: "Alice", email: "alice@example.com" } },
    { type: 'create', payload: { name: "Bob", email: "bob@example.com" } }
]);
``` 