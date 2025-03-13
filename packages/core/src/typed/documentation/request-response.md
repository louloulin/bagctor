# 请求-响应模式

Bagctor的类型安全Actor系统提供了强大的请求-响应模式，使Actor之间的同步通信变得简单而安全。本文档将介绍如何使用请求-响应模式，以及它的核心组件和最佳实践。

## 概述

请求-响应模式是一种通信模式，其中一个Actor（请求者）向另一个Actor（响应者）发送请求，并等待响应。这种模式在以下场景中特别有用：

- 需要从另一个Actor获取数据
- 需要另一个Actor执行操作并返回结果
- 需要确认操作是否成功完成

Bagctor的请求-响应实现具有以下特点：

- 类型安全：请求和响应类型都是静态类型化的
- 超时处理：可以设置请求超时时间
- 相关ID：使用唯一的相关ID关联请求和响应
- 异步API：基于Promise的API，易于使用

## 核心组件

### RequestResponseProtocol

`RequestResponseProtocol`是一个接口，定义了请求和响应的类型信息：

```typescript
interface RequestResponseProtocol<TReq, TRes> {
  requestType: string;
  responseType: string;
  requestValidator?: (value: any) => value is TReq;
  responseValidator?: (value: any) => value is TRes;
}
```

### createRequestResponseMap

`createRequestResponseMap`是一个函数，用于创建请求-响应协议：

```typescript
function createRequestResponseMap<TReq, TRes>(
  requestType: string,
  responseType: string,
  requestValidator?: (value: any) => value is TReq,
  responseValidator?: (value: any) => value is TRes
): RequestResponseProtocol<TReq, TRes>
```

### request和response函数

这两个函数用于创建请求和响应消息：

```typescript
function request<TReq>(
  protocol: RequestResponseProtocol<TReq, any>,
  payload: TReq,
  correlationId: string = generateCorrelationId()
): Message<string, any>

function response<TRes>(
  protocol: RequestResponseProtocol<any, TRes>,
  payload: TRes,
  correlationId: string,
  replyTo?: PID<any>
): Message<string, any>
```

### RequestResponseManager

`RequestResponseManager`是一个类，用于管理请求和响应：

```typescript
class RequestResponseManager {
  registerRequest<TRes>(correlationId: string, timeoutMs?: number): Promise<TRes>;
  handleResponse(message: Message<any, any>): boolean;
  cancelRequest(correlationId: string, reason?: string): boolean;
  cancelAllRequests(reason?: string): void;
}
```

## 使用方法

### 1. 定义请求和响应类型

首先，定义请求和响应的类型：

```typescript
interface GetUserRequest {
  userId: string;
}

interface GetUserResponse {
  userId: string;
  name: string;
  email: string;
}
```

### 2. 创建请求-响应协议

使用`createRequestResponseMap`创建协议：

```typescript
const GetUserProtocol = createRequestResponseMap<GetUserRequest, GetUserResponse>(
  'getUser',
  'userResult',
  // 可选的请求验证器
  (value: any): value is GetUserRequest => {
    return typeof value === 'object' && 
           value !== null && 
           typeof value.userId === 'string';
  },
  // 可选的响应验证器
  (value: any): value is GetUserResponse => {
    return typeof value === 'object' && 
           value !== null && 
           typeof value.userId === 'string' && 
           typeof value.name === 'string' && 
           typeof value.email === 'string';
  }
);
```

### 3. 在Actor中实现请求处理

在响应者Actor中，实现请求处理逻辑：

```typescript
class UserActor extends TypedActor<UserState, UserMessages> {
  setupMessageHandlers(): void {
    this.onMessage('getUser', null, (msg, ctx) => {
      const { userId } = msg.payload;
      const user = this.findUser(userId);
      
      // 发送响应
      ctx.sendMessage(msg.sender!, {
        type: 'userResult',
        payload: user,
        metadata: {
          correlationId: msg.metadata?.correlationId,
          isResponse: true,
          timestamp: Date.now()
        }
      });
    });
  }
  
  private findUser(userId: string): GetUserResponse {
    // 实际实现中，这里会从数据库或其他存储中获取用户信息
    return {
      userId,
      name: 'John Doe',
      email: 'john@example.com'
    };
  }
}
```

### 4. 发送请求并等待响应

在请求者Actor中，使用`ask`方法发送请求并等待响应：

```typescript
class ClientActor extends TypedActor<ClientState, ClientMessages> {
  async getUserInfo(userId: string): Promise<GetUserResponse> {
    try {
      // 发送请求并等待响应
      const user = await this.ask(
        this.userActorRef,
        GetUserProtocol,
        { userId },
        5000 // 超时时间（毫秒）
      );
      
      return user;
    } catch (error) {
      console.error('Failed to get user info:', error);
      throw error;
    }
  }
}
```

## 高级用法

### 批量请求

可以同时发送多个请求并等待所有响应：

```typescript
async function getMultipleUsers(userIds: string[]): Promise<GetUserResponse[]> {
  const promises = userIds.map(userId => 
    this.ask(this.userActorRef, GetUserProtocol, { userId })
  );
  
  return Promise.all(promises);
}
```

### 请求超时处理

可以设置请求超时时间，并处理超时异常：

```typescript
try {
  const user = await this.ask(
    this.userActorRef,
    GetUserProtocol,
    { userId },
    1000 // 1秒超时
  );
  
  // 处理响应
} catch (error) {
  if (error.message.includes('timed out')) {
    // 处理超时
    console.error('Request timed out');
  } else {
    // 处理其他错误
    console.error('Request failed:', error);
  }
}
```

### 取消请求

在某些情况下，可能需要取消正在进行的请求：

```typescript
// 获取请求管理器
const requestManager = this.context.getRequestManager();

// 注册请求
const correlationId = generateCorrelationId();
const responsePromise = requestManager.registerRequest(correlationId);

// 发送请求
this.context.send(targetActor, 'getUser', { userId }, correlationId);

// 稍后取消请求
requestManager.cancelRequest(correlationId, 'Operation cancelled by user');
```

## 最佳实践

1. **使用类型验证器**：始终为请求和响应定义类型验证器，以确保类型安全。

2. **设置合理的超时时间**：根据操作的预期时间设置合理的超时时间，避免请求无限期等待。

3. **处理错误**：始终处理请求可能遇到的错误，包括超时、网络错误和业务逻辑错误。

4. **使用有意义的消息类型**：为请求和响应使用有意义的消息类型名称，以便于调试和理解。

5. **避免循环依赖**：避免创建Actor之间的循环请求依赖，这可能导致死锁。

6. **考虑批量处理**：如果需要发送大量请求，考虑批量处理以减少消息数量。

## 示例

请参考以下示例文件，了解请求-响应模式的实际应用：

- `examples/request-response-example.ts`：基本的请求-响应示例
- `examples/typed-actor-example.ts`：在类型安全Actor中使用请求-响应模式

## 限制和注意事项

1. **请求-响应不是RPC**：虽然请求-响应模式类似于RPC，但它仍然基于消息传递，并且是异步的。

2. **性能考虑**：请求-响应模式比单向消息传递有更多的开销，因为它需要跟踪请求和响应。

3. **状态管理**：响应者Actor需要能够处理请求时的状态，如果状态不可用，应该返回适当的错误响应。

4. **错误处理**：请求可能因各种原因失败，包括超时、网络错误、响应者Actor崩溃等，请求者需要处理这些情况。

5. **消息序列化**：在分布式环境中，请求和响应消息需要能够序列化和反序列化。 