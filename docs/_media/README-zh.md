# Bagctor

Bagctor (Bactor + AI Agent) 是一个混合框架，将 Actor 模型与 AI Agent 能力相结合，用于构建智能分布式系统。它无缝集成了传统的基于 Actor 的并发模型和现代 AI 代理架构，使开发者能够构建可扩展的、响应式的、智能化的应用程序。

## 概述

Bagctor 提供两个主要组件：
1. 用于处理并发和分布式的强大 Actor 系统
2. 基于 Actor 模型的 AI Agent 框架，用于协调智能代理

这种独特的组合允许你：
- 使用基于 Actor 的消息传递构建分布式系统
- 创建可以协作和通信的 AI 代理网络
- 开发混合应用程序，将传统 Actor 与 AI 能力相结合
- 从单机部署扩展到分布式集群

## 项目结构

```
bagctor/
├── packages/
│   ├── core/           # 核心 Actor 系统实现
│   │   ├── src/
│   │   │   ├── core/     # 核心组件
│   │   │   ├── remote/   # 远程通信功能
│   │   │   └── examples/ # 示例代码
│   │   └── package.json
│   │
│   └── agent/          # AI Agent 框架
│       ├── src/
│       │   ├── agents/   # AI Agent 实现
│       │   └── types.ts  # 代理系统类型定义
│       └── package.json
├── package.json        # 工作区管理配置
└── bun.workspace.ts    # Bun 工作区配置
```

## 核心功能

### @bagctor/core

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

### @bagctor/agent

AI Agent 框架提供以下功能：

1. 代理抽象层
   - 集成 Actor 模型的基础代理类
   - AI 导向的消息处理框架
   - 内存管理（短期/长期）
   - 模型集成接口

2. 专业 AI 代理实现
   - 支持 LLM 的规划代理
   - 执行代理（计划中）
   - 审查代理（计划中）
   - 评论代理（计划中）

3. 代理协调
   - 任务分解和分配
   - 带 AI 处理的结果聚合
   - 错误处理和恢复
   - 反馈处理和学习

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
import { Actor, PropsBuilder, ActorSystem } from '@bagctor/core';

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

### 使用 AI 代理

```typescript
import { AgentSystem, PlannerAgent } from '@bagctor/agent';

// 创建代理系统
const system = new AgentSystem();

// 创建具有 AI 能力的规划代理
const plannerConfig = {
  role: 'planner',
  capabilities: ['task_planning', 'coordination'],
  model: 'gpt-4',
  parameters: {
    temperature: 0.7,
    maxTokens: 2000
  }
};

const plannerId = await system.createAgent(PlannerAgent, plannerConfig);

// 分配复杂任务
const task = {
  type: 'TASK',
  sender: { id: 'user' },
  timestamp: Date.now(),
  payload: {
    description: '设计微服务架构',
    requirements: [
      '服务拆分',
      'API 设计',
      '数据一致性模式',
      '部署策略'
    ],
    context: {
      constraints: ['云原生', '高可用'],
      preferences: ['事件驱动', '领域驱动设计']
    }
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
   - Actor 消息处理延迟 < 1ms
   - Actor 消息吞吐量 > 100K/s
   - AI 代理响应时间：根据模型可配置
   - 内存占用 < 100MB（不包括 AI 模型）

## 未来规划

1. 核心功能增强
   - [ ] 具有 AI 负载均衡的集群支持
   - [ ] 智能持久化策略
   - [ ] AI 增强的性能监控
   - [ ] 智能故障转移机制

2. AI 代理系统扩展
   - [ ] 更多专业 AI 代理
   - [ ] 知识图谱集成
   - [ ] 支持多模型切换
   - [ ] 联邦学习能力
   - [ ] 代理内存优化

3. 工具和生态
   - [ ] AI 驱动的 CLI 工具
   - [ ] 智能可视化仪表板
   - [ ] 集成 AI 的示例应用
   - [ ] 自定义 AI 模型的插件系统

## 贡献指南

1. Fork 项目
2. 创建特性分支 (`git checkout -b feature/amazing-feature`)
3. 提交更改 (`git commit -m 'feat: add amazing feature'`)
4. 推送到分支 (`git push origin feature/amazing-feature`)
5. 开启 Pull Request

## 许可证

MIT

## 联系方式

- 项目主页：[GitHub](https://github.com/yourusername/bagctor)
- 问题反馈：[Issues](https://github.com/yourusername/bagctor/issues) 