# Bagctor Agent 模块规划

## 概述

本文档概述了将 Mastra 集成到 Bagctor 框架中的计划，以构建基于 Actor 模型的分布式智能体系统。通过结合 Bagctor 的分布式能力和 Mastra 的 AI 代理功能，我们可以创建一个强大的分布式 AI 代理网络，每个代理可以自主执行任务并通过消息传递进行协作。

## 架构设计

```
+-------------------------------------------+
|                Bagctor                    |
+-------------------------------------------+
|                                           |
|  +-------------+      +---------------+   |
|  | Actor System|<---->| Mastra Agents |   |
|  +-------------+      +---------------+   |
|        ^                     ^            |
|        |                     |            |
|        v                     v            |
|  +-------------+      +---------------+   |
|  | HTTP Server |<---->| Vector Store  |   |
|  +-------------+      +---------------+   |
|                                           |
+-------------------------------------------+
```

### 核心组件

1. **AgentActor**: ✅ 继承自 Bagctor 的 Actor，整合 Mastra 的 Agent 能力
2. **AgentSystem**: ✅ 管理多个 AgentActor 的协调系统
3. **AgentMemory**: 🔜 基于 Bagctor 的持久化机制实现的代理记忆存储
4. **AgentTools**: ✅ 代理可以调用的工具集合，由 Actor 实现
5. **AgentRouter**: 🔜 处理代理之间通信和任务路由

## 实施计划

### 1. 依赖配置 (估计时间: 1天) ✅

1. 安装 Mastra 相关依赖:
```bash
bun add @mastra/core @ai-sdk/openai @mastra/rag
```

2. 配置项目结构: ✅
```
packages/
├── agent/
│   ├── src/
│   │   ├── core/
│   │   │   ├── agentActor.ts
│   │   │   ├── agentSystem.ts
│   │   │   └── agentMemory.ts
│   │   ├── tools/
│   │   │   ├── index.ts
│   │   │   └── httpTool.ts
│   │   ├── types/
│   │   │   └── index.ts
│   │   └── index.ts
│   ├── test/
│   ├── package.json
│   └── tsconfig.json
```

### 2. 基础组件开发 (估计时间: 3天) ✅

#### AgentActor 实现 ✅

已完成：
- 创建了继承自Bagctor Actor的AgentActor类
- 实现了支持消息处理的Actor行为系统
- 添加了工具注册和调用功能
- 创建了模拟Mastra Agent的适配，后续可替换为真实实现

```typescript
// packages/agent/src/core/agentActor.ts
import { Actor, Message } from '@bactor/core';
import { PID } from '@bactor/common';
import type { ActorContext } from '@bactor/core';

export class AgentActor extends Actor<AgentActorState, Message> {
  private agent: Agent;
  
  constructor(context: ActorContext, initialState?: AgentActorState) {
    super(context, initialState);
    this.agent = this.createMockAgent(this.state.name, this.state.instructions);
  }
  
  async defaultBehavior(message: Message): Promise<void> {
    // 处理生成请求、工具调用等
  }
  
  registerTool(toolName: string, toolActor: PID): void {
    // 允许代理使用工具Actor
  }
  
  registerToolFunction(toolName: string, description: string, handler: (params: any) => Promise<any>): void {
    // 注册直接工具函数
  }
}
```

#### AgentSystem 实现 ✅

已完成：
- 创建了AgentSystem类管理多个Agent
- 实现了创建代理的功能
- 实现了消息发送和响应机制
- 添加了系统级消息处理器

```typescript
// packages/agent/src/core/agentSystem.ts
import { ActorSystem, PropsBuilder } from '@bactor/core';
import { PID } from '@bactor/common';
import { AgentActor, AgentActorConfig } from './agentActor';

export class AgentSystem {
  private actorSystem: ActorSystem;
  private messageHandlers: Map<string, (response: any) => void>;
  
  constructor(config = {}) {
    this.actorSystem = new ActorSystem(config.systemId || 'agent-system');
    this.setupMessageHandlers();
  }
  
  async createAgent(config: AgentActorConfig): Promise<PID> {
    // 创建代理Actor
  }
  
  async sendMessage(agentId: PID, message: any): Promise<any> {
    // 发送消息并处理响应
  }
  
  async shutdown(): Promise<void> {
    // 关闭系统
  }
}
```

### 3. 内存和工具集成 (估计时间: 2天) ✅

1. 工具集成已完成:
   - ✅ HTTP 请求工具
   - 🔜 数据处理工具
   - 🔜 文件操作工具
   - 🔜 计划和推理工具

2. 🔜 AgentMemory 待实现

### 4. RAG 集成 (估计时间: 2天) 🔜

1. 与 PostgreSQL 或其他向量数据库集成
2. 实现文档处理和向量检索功能
3. 为代理提供知识库访问能力

### 5. API 和接口设计 (估计时间: 2天) 🔜

1. 设计与 Bagctor HTTP 服务器的集成接口
2. 创建 REST API 端点用于与代理交互
3. 实现 WebSocket 支持实时通信

## 使用场景

### 1. 分布式代理协同 ✅

可以使用以下代码创建多个专家代理并协调工作:

```typescript
const agentSystem = new AgentSystem({ /* 配置 */ });

// 创建专家代理
const researchAgent = agentSystem.createAgent({
  name: 'ResearchAgent',
  instructions: '你是一个研究专家，负责查找和分析信息。',
});

const writingAgent = agentSystem.createAgent({
  name: 'WritingAgent',
  instructions: '你是一个写作专家，负责创建高质量的内容。',
});

// 协调代理工作
const orchestrator = agentSystem.createAgent({
  name: 'Orchestrator',
  instructions: '你负责分配和协调任务给其他专家代理。',
});
```

### 2. 弹性扩展和负载均衡 🔜

利用 Bagctor 的分布式能力，实现代理的弹性扩展（开发中）。

## 当前实现状态

✅ 已完成:
1. 项目结构和依赖配置
2. 核心AgentActor实现
3. AgentSystem实现
4. HTTP工具Actor
5. 基本消息处理和工具注册
6. 构建配置优化 - 参考HTTP包解决了构建和类型问题

🔜 进行中:
1. 测试套件完善
2. 内存系统实现
3. 工具集扩展
4. RAG集成

## 下一步行动

1. ✅ **修复构建错误**: 已解决模块依赖和类型问题
2. **完善测试**: 添加更多自动化测试用例
3. **实现AgentMemory**: 开发基于Actor的内存系统
4. **扩展工具集**: 添加更多实用工具
5. **集成真实LLM**: 替换模拟实现

## 技术挑战和解决方案

1. **状态管理**: 使用Actor状态机制管理代理状态
2. **消息序列化**: 已实现基本的消息处理机制
3. **错误处理**: 实现了基本的错误处理和超时机制
4. **类型兼容性**: ✅ 已解决构建时的类型错误，参照HTTP包配置

## 结论

Bagctor Agent 模块的基础框架已经实现，包括核心AgentActor和AgentSystem组件，以及HTTP工具集成。通过Actor模型，我们创建了可扩展的代理系统基础架构，能够支持多代理协作和工具使用。

模块现在可以成功构建，并已通过基本测试。后续工作将聚焦于扩展测试套件、实现内存系统、扩展工具集和RAG集成，以及与真实LLM的集成。 