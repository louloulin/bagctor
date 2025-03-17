# Bagctor Agent 模块设计与实现

## 项目概述

Bagctor Agent模块整合Mastra的智能代理与Bagctor的Actor模型，创建强大的分布式代理系统。该系统完全兼容Mastra API，同时通过Actor模型提供分布式扩展能力，让智能代理可以在分布式环境中无缝协作。底层复用Mastra AI的能力，上层提供分布式协作和扩展。

## 1. 架构设计

### 架构图

```
+----------------------------------------------+
|                 Bagctor Agent                |
|                                              |
|  +----------------+      +----------------+  |
|  |   Mastra API   |<---->| Actor Protocol |  |
|  +----------------+      +----------------+  |
|            |                     |           |
|  +-----------------+   +------------------+  |
|  | @mastra/core    |   |  分布式Actor系统  |  |
|  | @ai-sdk/openai  |   +------------------+  |
|  +-----------------+   +------------------+  |
|            |                     |           |
|  +------------+ +--------+ +----------------+|
|  |   Memory   | |  RAG   | | 分布式工具集   ||
|  +------------+ +--------+ +----------------+|
|                                              |
|  +------------+ +--------+ +----------------+|
|  |   Mastra   | | 多代理 | | 跨节点协作     ||
|  |   兼容层   | | 编排   | | 与负载均衡     ||
|  +------------+ +--------+ +----------------+|
+----------------------------------------------+
```

### 核心设计理念

1. **100% Mastra API兼容**: 完全遵循Mastra的API设计，支持无缝迁移
2. **底层复用Mastra能力**: 核心AI能力复用Mastra实现，确保质量和兼容性
3. **Actor模型分布式扩展**: 通过Actor模型实现分布式能力，支持横向扩展
4. **多代理协作与编排**: 支持复杂的多代理协作场景，包括层次化编排
5. **AI SDK集成**: 支持@ai-sdk生态系统进行模型集成

## 2. Mastra兼容API层

Bagctor完全实现了Mastra的API接口，支持直接替换使用。

### 2.1 Agent创建

```typescript
// 标准Mastra导入方式
import { Agent } from "@mastra/core/agent";
import { openai } from "@ai-sdk/openai";

// 导入工具

// 创建Agent实例
export const myAgent = new Agent({
  name: "My Agent",
  instructions: "You are a helpful assistant that provides useful information.",
  model: openai("gpt-4o-mini"),
  tools: {
    myTool: tools.myTool,
  },
});
```

### 2.2 Mastra实例创建

```typescript
// 导入Mastra核心类
import { Mastra } from "@mastra/core";

// 导入代理
import { myAgent } from "./agents/myAgent";

// 创建Mastra实例并注册代理
export const mastra = new Mastra({
  agents: { myAgent },
});
```

### 2.3 Generate和Stream API

```typescript
// 使用Generate API
const response = await myAgent.generate("请介绍一下Actor模型");
console.log(response.text);

// 使用Stream API
await myAgent.stream("请详细解释分布式系统的特点", {
  onStart: () => console.log("开始生成..."),
  onToken: (token) => process.stdout.write(token),
  onComplete: (result) => console.log('\n完成！')
});
```

### 2.4 内存配置

```typescript
// 使用内存选项
await myAgent.stream("这个问题的后续是什么？", {
  memoryOptions: {
    lastMessages: 10,
    semanticRecall: {
      topK: 3,
      messageRange: 5,
    },
  },
  resourceId: "user_123",
  threadId: "thread_456",
});
```

### 2.5 工具定义

```typescript
// 工具定义文件 (tools/stockPrices.ts)
import { defineQuery } from "@mastra/core/tools";

export const stockPrices = defineQuery({
  name: "stockPrices",
  description: "Get the current stock price for a given symbol",
  parameters: {
    type: "object",
    properties: {
      symbol: {
        type: "string",
        description: "The stock symbol, e.g., AAPL for Apple",
      },
    },
    required: ["symbol"],
  },
  handler: async ({ symbol }) => {
    // 实际实现逻辑
    const price = await fetchStockPrice(symbol);
    return { symbol, price };
  },
});
```

### 2.6 单Agent和多Agent支持

Bagctor完全兼容Mastra的单Agent和多Agent使用模式，支持灵活的Agent交互方式。

#### 单Agent直接使用

```typescript
// 创建单个Agent并直接使用
import { Agent } from "@mastra/core/agent";
import { openai } from "@ai-sdk/openai";

const myAgent = new Agent({
  name: "SingleAgent",
  instructions: "You are a helpful assistant.",
  model: openai("gpt-4o"),
});

// 直接使用单个Agent
const response = await myAgent.generate("请解释Actor模型");
```

#### 通过Mastra注册多Agent

```typescript
// 创建多个Agent并通过Mastra注册
import { Mastra } from "@mastra/core";
import { researchAgent } from "./agents/researchAgent";
import { writingAgent } from "./agents/writingAgent";

// 注册多个Agent
export const mastra = new Mastra({
  agents: { 
    researchAgent,
    writingAgent 
  },
});

// 使用特定Agent
const response = await mastra.agents.researchAgent.generate("收集关于Actor模型的信息");
```

#### 多Agent之间传递消息

```typescript
// Agent之间的消息传递
const researchResult = await mastra.agents.researchAgent.generate("收集关于Actor模型的优势");

// 将研究结果传递给写作Agent
const article = await mastra.agents.writingAgent.generate(`
根据以下研究结果创建一篇文章:
${researchResult.text}
`);
```

## 3. Bagctor扩展层

Bagctor在Mastra API兼容层之上，提供了分布式扩展能力。

### 3.1 Bagctor系统创建

```typescript
import { Bagctor } from "@bagctor/agent";
import { myAgent } from "./agents/myAgent";

// 创建Bagctor分布式系统
export const bagctor = new Bagctor({
  // 使用兼容Mastra的Agent
  agents: { myAgent },
  // 添加分布式配置
  distribution: {
    clustered: true,
    serverPort: 9000,
    remoteEnabled: true
  }
});
```

### 3.2 分布式节点配置

```typescript
// 主节点配置
const primaryNode = new Bagctor({
  agents: { myAgent },
  distribution: {
    nodeType: "primary",
    serverPort: 9000,
    clustered: true
  }
});

// 工作节点配置
const workerNode = new Bagctor({
  distribution: {
    nodeType: "worker",
    primaryHost: "primary-host-address",
    primaryPort: 9000,
    clustered: true
  }
});

// 在工作节点中注册远程代理
const remoteAgent = await workerNode.registerRemoteAgent("myAgent");
```

### 3.3 多代理编排

```typescript
// 创建编排器
const orchestrator = bagctor.createOrchestrator({
  agents: ["researchAgent", "writingAgent", "codingAgent"],
  orchestrationStrategy: "hierarchical"
});

// 使用编排器完成复杂任务
const result = await orchestrator.execute(
  "创建一篇关于Actor模型在分布式系统中应用的文章，包括代码示例"
);
```

### 3.4 Bagctor的Agent传递扩展

Bagctor通过Actor模型增强了Mastra的Agent传递能力，支持分布式环境下的高效Agent协作。

```typescript
// 创建Bagctor系统
const bagctor = new Bagctor({
  agents: mastra.agents, // 直接使用Mastra的agents
  distribution: {
    clustered: true
  }
});

// 创建一个工作流
const workflow = await bagctor.createWorkflow({
  name: "文章创作流程",
  steps: [
    {
      agent: "researchAgent",
      input: "收集关于Actor模型的信息",
      output: "research"
    },
    {
      agent: "writingAgent",
      input: (context) => `根据以下研究创建文章: ${context.research}`,
      output: "article"
    }
  ]
});

// 执行工作流
const result = await workflow.execute();
console.log(result.article); // 最终文章输出
```

### 跨节点Agent通信

```typescript
// 部署在不同节点的Agent之间通信
const distributedWorkflow = await bagctor.createWorkflow({
  name: "分布式工作流",
  steps: [
    {
      agent: "researchAgent", // 运行在worker1节点
      input: "收集关于分布式系统的信息",
      output: "research"
    },
    {
      agent: "writingAgent", // 运行在worker2节点
      input: (context) => `根据研究创建文章: ${context.research}`,
      output: "draft"
    },
    {
      agent: "editingAgent", // 运行在worker3节点
      input: (context) => `编辑以下文章草稿: ${context.draft}`,
      output: "finalArticle"
    }
  ],
  // 指定节点分配
  nodeAssignment: {
    "researchAgent": "worker1",
    "writingAgent": "worker2",
    "editingAgent": "worker3"
  }
});

// 执行分布式工作流
const distributedResult = await distributedWorkflow.execute();
```

## 4. 服务API层

Bagctor提供与Mastra兼容的服务API，支持HTTP访问。

### 4.1 启动服务

```typescript
// 启动服务
await bagctor.serve({
  port: 4111,
  enablePlayground: true
});

// 或使用CLI (与Mastra兼容)
// bagctor dev --dir src
```

### 4.2 API端点

```
# 生成API
POST http://localhost:4111/api/agents/myAgent/generate
Content-Type: application/json

{
  "messages": [
    { "role": "user", "content": "什么是Actor模型?" }
  ]
}

# 流式API
POST http://localhost:4111/api/agents/myAgent/stream
Content-Type: application/json

{
  "messages": [
    { "role": "user", "content": "解释分布式系统原理" }
  ],
  "memoryOptions": {
    "lastMessages": 5
  },
  "resourceId": "user_123",
  "threadId": "conversation_456"
}
```

## 5. 核心组件

### 5.1 BagctorAdapter

Bagctor适配器连接Mastra API与Actor系统。

**功能**:
- 将Mastra API调用转换为Actor消息
- 处理Actor系统响应
- 管理生命周期和资源
- 支持内存和RAG集成

**实现状态**: ✅ 完成

### 5.2 AgentActor

AgentActor是核心组件，将Mastra的Agent与Actor模型结合。

**功能**:
- 处理生成请求
- 管理工具调用
- 协调内存访问
- 支持分布式部署

**实现状态**: ✅ 完成

### 5.3 ToolActor

工具Actor用于执行特定任务，可分布式部署。

**功能**:
- 执行工具逻辑
- 处理请求和响应
- 支持超时和错误处理
- 提供指标和遥测

**实现状态**: ✅ 完成

### 5.4 内存系统

分布式内存系统，支持多节点共享。

**功能**:
- 分布式内存存储
- 语义搜索和检索
- 跨节点访问支持
- 内存压缩和优化

**实现状态**: ✅ 完成

## 6. 分布式部署案例

### 6.1 基本部署

```typescript
// 导入必要组件
import { Bagctor } from "@bagctor/agent";
import { Agent } from "@mastra/core/agent";
import { openai } from "@ai-sdk/openai";

// 创建代理
const myAgent = new Agent({
  name: "DistributedAgent",
  instructions: "您是一个分布式环境中运行的助手",
  model: openai("gpt-4o"),
  // 工具定义
});

// 创建主节点
const primary = new Bagctor({
  agents: { myAgent },
  distribution: {
    nodeType: "primary",
    serverPort: 9000
  }
});

// 启动服务
await primary.serve({ port: 4111 });
```

### 6.2 多节点部署

```typescript
// 工作节点1 - 处理查询
const queryNode = new Bagctor({
  distribution: {
    nodeType: "worker",
    primaryHost: "primary-host",
    primaryPort: 9000,
    workerType: "query"
  }
});

// 工作节点2 - 处理工具调用
const toolNode = new Bagctor({
  distribution: {
    nodeType: "worker",
    primaryHost: "primary-host",
    primaryPort: 9000,
    workerType: "tool"
  }
});

// 工作节点3 - 处理内存
const memoryNode = new Bagctor({
  distribution: {
    nodeType: "worker",
    primaryHost: "primary-host",
    primaryPort: 9000,
    workerType: "memory"
  }
});
```

## 7. 与Mastra的集成

Bagctor Agent模块与Mastra的集成主要包括以下几个方面:

1. **完全兼容Mastra API**: 
   - 相同的`Agent`类和参数
   - 相同的工具定义方式
   - 一致的内存和RAG API
   - 兼容的服务API

2. **AI SDK集成**:
   - 与`@ai-sdk`生态系统无缝集成
   - 支持多种模型提供者（OpenAI, Anthropic等）
   - 统一的API接口

3. **分布式扩展**:
   - Mastra+分布式能力
   - 多节点部署支持
   - 负载均衡和容错
   - 横向扩展能力

## 8. 使用案例

### 股票价格代理

```typescript
// 导入必要模块
import { Agent } from "@mastra/core/agent";
import { openai } from "@ai-sdk/openai";

// 创建股票代理
export const stockAgent = new Agent({
  name: "Stock Agent",
  instructions: "You are a helpful assistant that provides current stock prices. When asked about a stock, use the stock price tool to fetch the stock price.",
  model: openai("gpt-4o-mini"),
  tools: {
    stockPrices: tools.stockPrices,
  },
});

// 创建Bagctor实例
import { Bagctor } from "@bagctor/agent";

const bagctor = new Bagctor({
  agents: { stockAgent },
  distribution: {
    clustered: true,
    serverPort: 9000
  }
});

// 启动服务
await bagctor.serve({ port: 4111 });
```

### 多代理团队

```typescript
// 研究代理
const researchAgent = new Agent({
  name: "Research Agent",
  instructions: "You research information thoroughly.",
  model: openai("gpt-4o"),
  tools: { search, browserTools }
});

// 写作代理
const writingAgent = new Agent({
  name: "Writing Agent",
  instructions: "You craft well-written content.",
  model: openai("gpt-4o"),
  tools: { textAnalysis }
});

// 创建Bagctor系统
const bagctor = new Bagctor({
  agents: { researchAgent, writingAgent },
  distribution: { clustered: true }
});

// 创建代理团队
const contentTeam = await bagctor.createTeam({
  name: "Content Creation Team",
  agents: ["researchAgent", "writingAgent"],
  orchestrationStrategy: "hierarchical"
});

// 使用团队执行任务
const result = await contentTeam.execute(
  "创建一篇关于分布式系统的文章"
);
```

## 9. 总结

Bagctor Agent成功实现了完全兼容Mastra API的分布式代理系统，兼具两个系统的优势：

1. **Mastra的便捷API和工具生态系统**
2. **Bagctor的分布式能力和Actor模型**

通过这种集成，开发者可以使用熟悉的Mastra API开发智能代理，同时获得分布式部署、多节点扩展和高级协作能力，适用于从简单应用到企业级解决方案的各种场景。 