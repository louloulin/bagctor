# Bagctor 类型系统改进计划

## 目标

Bagctor的类型系统改进旨在提供更好的类型安全和开发体验，同时保持与现有代码的兼容性。主要目标包括：

1. 提供类型安全的消息传递
2. 确保Actor状态类型的安全性
3. 简化Actor的开发和使用
4. 提供更好的IDE支持和静态类型检查
5. 保持与现有代码的兼容性

## 实施进度

### 阶段一：核心类型系统 [✅]

- [x] 基础类型定义
  - [x] MessageMap接口
  - [x] Message类型
  - [x] MessageContext接口
  - [x] PID类型扩展
  - [x] ActorState接口
  - [x] Props接口扩展
  - [x] ActorContext接口
  - [x] Actor抽象类

- [x] 类型兼容层
  - [x] 类型转换函数：toTypedMessage和toBaseMessage
  - [x] 引用转换函数：actorRef

### 阶段二：核心组件实现 [✅]

- [x] TypedActorContext实现
  - [x] 消息发送方法
  - [x] Actor创建方法
  - [x] 生命周期方法
  - [x] 兼容原始ActorContext

- [x] TypedActor实现
  - [x] 行为注册和切换
  - [x] 消息处理
  - [x] 状态管理
  - [x] 生命周期钩子

- [x] 消息定义工具
  - [x] defineMessage函数
  - [x] MessageRegistry类
  - [x] 请求-响应模式支持

### 阶段三：示例和测试 [✅]

- [x] 用户管理Actor示例
  - [x] 用户CRUD操作
  - [x] 类型安全的消息处理

- [x] 单元测试
  - [x] 验证基本功能
  - [x] 验证请求-响应模式
  - [x] 验证消息验证 
  - [x] 验证类型安全性

### 阶段四：文档和集成 [✅]

- [x] API文档
  - [x] 类型系统概述
  - [x] TypedActor使用指南
  - [x] 请求-响应模式文档

- [x] 与现有系统集成
  - [x] 迁移指南
  - [x] 向后兼容性测试

## 当前挑战和待解决问题

1. **导出和导入问题** [✅]
   - 在测试中发现，从index.ts导出的某些类型和函数无法被正确识别
   - ✅ 使用直接导入可以绕过这个问题
   - ✅ 创建单独的模块管理消息相关功能，如request-response.ts

2. **TypeScript的类型系统限制** [✅]
   - ✅ 消息类型在运行时通过验证器机制进行验证
   - ✅ 提供各种验证器工具函数，如objectValidator, unionValidator等

3. **兼容性问题** [✅]
   - ✅ 确保新的类型系统与现有代码和API完全兼容
   - ✅ 处理类型擦除问题

4. **性能考虑** [✅]
   - ✅ 确保类型安全机制不会引入显著的性能开销
   - ✅ 提供可选的验证机制，默认不执行运行时验证

5. **测试环境限制** [✅]
   - ✅ 解决在Bun测试环境中导入RequestResponseProtocol的问题
   - ✅ 确保所有测试都能在CI环境中正常运行

## 下一步计划

1. ✅ 完成请求-响应模式的实现
2. ✅ 完善类型测试，确保类型安全机制正常工作
3. ✅ 编写详细的请求-响应模式文档
4. ✅ 为现有Actor提供迁移路径，确保平滑过渡
5. ✅ 添加更多高级特性，如Actor泛型和消息模式
6. ✅ 解决测试环境中的导入问题

## 进展和成就

1. **成功实现核心类型系统**：完成了MessageMap、Message、PID等核心类型的定义，提供了类型安全的基础。
2. **实现了TypedActor和TypedActorContext**：为类型安全的Actor创建提供了基础设施。
3. **创建了消息工具**：实现了defineMessage和MessageRegistry等工具，简化了类型安全消息的使用。
4. **创建并测试了示例Actor**：通过用户管理Actor示例验证了类型系统的实用性。
5. **实现了请求-响应模式**：提供了类型安全的请求-响应模式，支持异步通信。
6. **完善了部分测试**：完成了请求-响应模式的单元测试，验证了其功能。
7. **创建了迁移指南**：提供了详细的迁移指南，帮助现有项目平滑过渡到新的类型系统。

## 性能和兼容性考量

1. **性能开销**：类型系统在运行时的开销主要来自消息验证和转换，但这些开销都是可控的。
2. **内存使用**：类型信息在运行时被擦除，不会增加内存使用。
3. **兼容性**：通过提供适配层（如TypedActorContext包装BaseActorContext），保持了与现有代码的兼容性。

## 参考资源

- [TypeScript高级类型](https://www.typescriptlang.org/docs/handbook/advanced-types.html)
- [Akka Typed文档](https://doc.akka.io/docs/akka/current/typed/index.html)
- [Flix Actor模型](https://flix.dev/programming-flix/actors/)