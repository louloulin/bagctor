# Bactor

Bactor 是一个基于 Actor 模型的分布式系统框架，专注于构建可扩展的、响应式的应用程序。它包含了核心的 Actor 系统实现和基于 MetaGPT 风格的智能代理系统。

## 项目结构

```
bactor/
├── packages/
│   ├── core/           # 核心 Actor 系统实现
│   │   ├── src/
│   │   │   ├── core/     # 核心组件
│   │   │   ├── remote/   # 远程通信功能
│   │   │   └── examples/ # 示例代码
│   │   └── package.json
│   │
│   └── agent/          # MetaGPT 风格的代理系统
│       ├── src/
│       │   ├── agents/   # 具体代理实现
│       │   └── types.ts  # 代理系统类型定义
│       └── package.json
├── package.json        # 工作区管理配置
└── bun.workspace.ts    # Bun 工作区配置
```

## 核心功能

### @bactor/core

核心 Actor 系统提供以下功能：

1. Actor 模型基础设施
   - 消息传递和处理
   - 生命周期管理（preStart, postStop, preRestart, postRestart）
   - 状态管理和行为切换
   - 监督策略

2. 消息路由系统
   - 轮询路由（Round Robin）
   - 随机路由（Random）
   - 广播路由（Broadcast）
   - 一致性哈希路由（Consistent Hash）

3. 调度系统
   - 默认调度器（同步执行）
   - 线程池调度器（并行执行）
   - 吞吐量调度器（批处理）

4. 邮箱系统
   - 默认邮箱（FIFO）
   - 优先级邮箱
   - 自定义队列支持

5. 远程通信
   - gRPC 传输层
   - 远程 Actor 创建和管理
   - 透明的位置抽象

### @bactor/agent

智能代理系统提供以下功能：

1. 代理抽象层
   - 基础代理类（BaseAgent）
   - 消息处理框架
   - 内存管理（短期/长期）

2. 专业代理实现
   - 规划代理（PlannerAgent）
   - 执行代理（计划中）
   - 审查代理（计划中）
   - 评论代理（计划中）

3. 代理协调
   - 任务分解和分配
   - 结果聚合
   - 错误处理和恢复
   - 反馈处理

## 快速开始

### 安装

```bash
# 安装依赖
bun install
```

### 构建

```bash
# 构建所有包
bun run build

# 构建特定包
bun run build:core
bun run build:agent
```

### 测试

```bash
# 运行所有测试
bun run test

# 运行特定包的测试
bun run test:core
bun run test:agent
```

## 使用示例

### 创建简单的 Actor

```typescript
import { Actor, PropsBuilder, ActorSystem } from '@bactor/core';

// 创建 Actor 系统
const system = new ActorSystem();

// 定义 Actor 类
class GreetingActor extends Actor {
  protected initializeBehaviors(): void {
    this.addBehavior('default', async (message) => {
      console.log(`Hello, ${message.payload}!`);
    });
  }
}

// 创建 Actor 实例
const props = PropsBuilder.fromClass(GreetingActor).build();
const pid = await system.spawn(props);

// 发送消息
await system.send(pid, { type: 'greet', payload: 'World' });
```

### 使用智能代理

```typescript
import { AgentSystem, PlannerAgent } from '@bactor/agent';

// 创建代理系统
const system = new AgentSystem();

// 创建规划代理
const plannerConfig = {
  role: 'planner',
  capabilities: ['task_planning', 'coordination']
};

const plannerId = await system.createAgent(PlannerAgent, plannerConfig);

// 分配任务
const task = {
  type: 'TASK',
  sender: { id: 'user' },
  timestamp: Date.now(),
  payload: {
    description: '完成项目文档',
    requirements: ['架构说明', '接口文档', '部署指南']
  }
};

await system.send(plannerId, task);
```

## 技术规格

1. 运行时要求
   - Node.js >= 16.0.0
   - Bun >= 1.0.0

2. 依赖版本
   - TypeScript >= 5.0.0
   - gRPC >= 1.9.0
   - UUID >= 9.0.0

3. 性能指标
   - 消息处理延迟 < 1ms
   - 每秒消息处理量 > 100K
   - 内存占用 < 100MB

## 未来规划

1. 核心功能增强
   - [ ] 集群支持
   - [ ] 持久化存储
   - [ ] 性能监控
   - [ ] 故障转移

2. 代理系统扩展
   - [ ] 更多专业代理
   - [ ] 知识图谱集成
   - [ ] 学习能力
   - [ ] 多模型支持

3. 工具和生态
   - [ ] CLI 工具
   - [ ] 可视化监控
   - [ ] 示例应用
   - [ ] 插件系统

## 贡献指南

1. Fork 项目
2. 创建特性分支 (`git checkout -b feature/amazing-feature`)
3. 提交更改 (`git commit -m 'feat: add amazing feature'`)
4. 推送到分支 (`git push origin feature/amazing-feature`)
5. 开启 Pull Request

## 许可证

MIT

## 联系方式

- 项目主页：[GitHub](https://github.com/yourusername/bactor)
- 问题反馈：[Issues](https://github.com/yourusername/bactor/issues) 