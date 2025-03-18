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

### 2.1 Agent创建 ✅

```typescript
// 标准Mastra导入方式
import { Agent } from "@mastra/core/agent";
import { createQwen } from "qwen-ai-provider";

// 导入工具

// 创建Agent实例
export const myAgent = new Agent({
  name: "My Agent",
  instructions: "You are a helpful assistant that provides useful information.",
  model: qwen("qwen-plus-2024-12-20"),
  tools: {
    myTool: tools.myTool,
  },
});
```

### 2.2 Mastra实例创建 ✅

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

### 2.3 Generate和Stream API ✅

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

### 2.4 内存配置 ✅

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

// 高级内存配置示例
import { createMemoryManager } from "@bagctor/agent";
import { createEnhancedAgent } from "@bagctor/agent";
import { ImportanceLevel } from "@bagctor/agent";

// 创建内存管理器
const memoryManager = createMemoryManager();

// 创建增强的Agent，添加内存功能
const enhancedAgent = createEnhancedAgent(myAgent, memoryManager);

// 向会话添加记忆
await enhancedAgent.addToMemory(
  "用户喜欢研究分布式系统和Actor模型",
  {
    type: "fact",
    importance: ImportanceLevel.High,
    resourceId: "user_123",
    threadId: "conversation_456",
    metadata: { category: "interest" }
  }
);

// 使用增强的generate方法，自动应用内存上下文
const response = await enhancedAgent.generate(
  "我应该研究哪些技术？",
  {
    resourceId: "user_123",
    threadId: "conversation_456",
    memoryOptions: {
      lastMessages: 10,
      semanticRecall: {
        topK: 5,
        threshold: 0.7
      }
    }
  }
);
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
import { createQwen } from "qwen-ai-provider";

const myAgent = new Agent({
  name: "SingleAgent",
  instructions: "You are a helpful assistant.",
  model: qwen("qwen-plus-2024-12-20"),
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

### 3.4 分布式工作流 ✅

Bagctor提供了强大的分布式工作流功能，完全兼容Mastra的工作流API，同时扩展了分布式执行能力。

#### 3.4.1 创建分布式工作流 ✅

```typescript
import { Step, MastraWorkflow } from "@bagctor/agent";
import { z } from "zod";

// 创建工作流适配器
const workflowAdapter = bagctor.createWorkflowAdapter();

// 定义工作流触发模式
const triggerSchema = z.object({
  topic: z.string().describe('文章主题'),
});

// 创建兼容Mastra的工作流
const contentWorkflow = workflowAdapter.createWorkflow({
  name: 'content-creation-workflow',
  triggerSchema,
  // 分配步骤到不同节点
  nodeAssignment: {
    researchStep: 'node-1',
    writingStep: 'node-2',
    editingStep: 'node-3'
  }
});

// 创建研究步骤
const researchStep = workflowAdapter.createStep({
  id: 'researchStep',
  outputSchema: z.object({
    research: z.string()
  }),
  execute: async ({ context }) => {
    const topic = context.machineContext.triggerData?.topic;
    const agent = context.agentsMap['researchAgent'];
    
    const result = await agent.generate(`研究主题: ${topic}`);
    return { research: result.text };
  }
});

// 创建写作步骤
const writingStep = workflowAdapter.createStep({
  id: 'writingStep',
  execute: async ({ context }) => {
    const research = context.machineContext.getStepPayload('researchStep').research;
    const agent = context.agentsMap['writingAgent'];
    
    const result = await agent.generate(`基于研究创建文章: ${research}`);
    return { article: result.text };
  }
});

// 按顺序添加步骤并提交工作流
contentWorkflow.step(researchStep).then(writingStep).commit();
```

#### 3.4.2 执行分布式工作流 ✅

```typescript
// 创建运行实例
const { runId, start } = contentWorkflow.createRun();

// 执行工作流
const results = await start({
  triggerData: { topic: '分布式系统的优势' }
});

console.log('工作流执行结果:', results.results);
```

#### 3.4.3 工作流容错与恢复 ✅

Bagctor的分布式工作流提供了自动容错和恢复能力：

```typescript
// 创建带有容错特性的工作流
const robustWorkflow = workflowAdapter.createWorkflow({
  name: 'robust-workflow',
  // 启用自动恢复
  recovery: {
    enabled: true,
    maxRetries: 3,
    retryDelay: 1000
  }
});

// 创建可能失败的步骤
const unreliableStep = workflowAdapter.createStep({
  id: 'unreliableStep',
  execute: async ({ context }) => {
    // 业务逻辑
    // 如果步骤失败，Bagctor会自动尝试在其他节点上重新执行
  }
});

// 创建恢复步骤
const recoveryStep = workflowAdapter.createStep({
  id: 'recoveryStep',
  execute: async ({ context }) => {
    try {
      // 尝试获取前一步骤的结果
      const prevResult = context.machineContext.getStepPayload('unreliableStep');
      return { finalResult: prevResult };
    } catch (error) {
      // 前一步骤失败，执行恢复逻辑
      return { finalResult: '备用结果' };
    }
  }
});

robustWorkflow.step(unreliableStep).then(recoveryStep).commit();
```

### 3.5 智能体交互协议

Bagctor提供了智能体之间的直接通信机制：

```typescript
// 直接在智能体之间发送消息
const response = await bagctor.sendMessage(
  'sourceAgentId',
  'targetAgentId',
  '处理这个研究数据并提供分析'
);

// 创建共享内存空间
const memoryId = await bagctor.createSharedMemory('project-xyz');
```

### 3.6 Bagctor的Agent传递扩展 ✅

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

### 跨节点Agent通信 ✅

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

### 3.7 分布式调度系统 ✅

Bagctor实现了强大的分布式调度系统，用于在集群中高效分配和执行任务：

```typescript
// 配置分布式调度策略
const bagctor = new Bagctor({
  agents: { myAgent },
  distribution: {
    clustered: true,
    scheduler: {
      strategy: "load-balanced", // 负载均衡策略
      priorityQueues: true,      // 启用优先级队列
      resourceAwareness: {       // 资源感知调度
        enabled: true,
        cpuThreshold: 80,        // CPU利用率阈值
        memoryThreshold: 70      // 内存利用率阈值
      }
    }
  }
});
```

#### 3.7.1 调度策略

Bagctor支持多种分布式调度策略：

1. **负载均衡**: 根据节点负载分配任务
2. **就近执行**: 将任务分配到数据所在节点，减少数据传输
3. **资源感知**: 考虑CPU、内存等资源状况进行任务分配
4. **亲和性调度**: 相关任务分配到同一节点
5. **容错式调度**: 考虑节点可靠性进行任务分配

#### 3.7.2 优先级调度

```typescript
// 创建不同优先级的任务
const criticalTask = await bagctor.schedule({
  agentId: "emergencyAgent",
  input: "处理紧急情况",
  priority: "critical" // 最高优先级
});

const normalTask = await bagctor.schedule({
  agentId: "regularAgent",
  input: "处理常规请求",
  priority: "normal"  // 正常优先级
});

// 批量调度任务
const tasks = await bagctor.scheduleBatch([
  { agentId: "agent1", input: "任务1", priority: "high" },
  { agentId: "agent2", input: "任务2", priority: "medium" },
  { agentId: "agent3", input: "任务3", priority: "low" }
]);

// 等待所有任务完成
const results = await Promise.all(tasks.map(task => task.completed()));
```

### 3.8 基于工具的智能体协作

Bagctor支持基于工具的智能体协作模式，与Mastra完全兼容，可以用工具封装智能体，创建层次化的协作系统。

#### 3.8.1 智能体封装为工具

```typescript
import { createQwen } from "qwen-ai-provider";
import { anthropic } from "@ai-sdk/anthropic";
import { Agent, createTool } from "@bagctor/agent";
import { z } from "zod";

// 创建专业领域智能体
const copywriterAgent = new Agent({
  name: "Copywriter",
  instructions: "你是一个专业文案撰写者，能够创作高质量的博客文章。",
  model: anthropic("claude-3-5-sonnet-20241022"),
});

const editorAgent = new Agent({
  name: "Editor",
  instructions: "你是一个专业编辑，擅长修改和完善文章。",
  model: qwen("qwen-plus-2024-12-20"),
});

// 将智能体封装为工具
const copywriterTool = createTool({
  id: "copywriter-agent",
  description: "调用文案撰写智能体来创作博客文章。",
  inputSchema: z.object({
    topic: z.string().describe("博客主题"),
    keywords: z.array(z.string()).optional().describe("关键词列表")
  }),
  outputSchema: z.object({
    copy: z.string().describe("博客文章内容")
  }),
  execute: async ({ context }) => {
    const prompt = context.keywords 
      ? `创作一篇关于${context.topic}的博客文章，包含以下关键词：${context.keywords.join(', ')}`
      : `创作一篇关于${context.topic}的博客文章`;
      
    const result = await copywriterAgent.generate(prompt);
    return { copy: result.text };
  }
});

const editorTool = createTool({
  id: "editor-agent",
  description: "调用编辑智能体来修改和完善文章。",
  inputSchema: z.object({
    copy: z.string().describe("待编辑的文章"),
    focus: z.string().optional().describe("编辑重点")
  }),
  outputSchema: z.object({
    editedCopy: z.string().describe("编辑后的文章")
  }),
  execute: async ({ context }) => {
    const prompt = context.focus
      ? `编辑以下文章，重点关注${context.focus}：\n\n${context.copy}`
      : `编辑以下文章，提升质量：\n\n${context.copy}`;
      
    const result = await editorAgent.generate(prompt);
    return { editedCopy: result.text };
  }
});
```

#### 3.8.2 协调智能体（发布者模式）

```typescript
// 创建协调者智能体
const publisherAgent = new Agent({
  name: "Publisher",
  instructions: `你是一个内容发布协调者。
你的任务是协调文章创作过程：
1. 首先调用文案撰写者创建初始内容
2. 然后调用编辑完善文章
3. 最后返回最终的高质量文章`,
  model: qwen("qwen-plus-2024-12-20"),
  tools: { 
    copywriterTool, 
    editorTool 
  }
});

// 创建Bagctor实例
const bagctor = new Bagctor({
  agents: { 
    publisherAgent,
    copywriterAgent,
    editorAgent
  },
  distribution: {
    clustered: true,
    // 分配智能体到不同节点
    nodeAssignment: {
      "publisherAgent": "primary-node",
      "copywriterAgent": "worker-node-1",
      "editorAgent": "worker-node-2"
    }
  }
});

// 使用协调智能体
const result = await bagctor.agents.publisherAgent.generate(
  "创建一篇关于分布式系统架构的博客文章"
);

console.log("最终文章:", result.text);
```

#### 3.8.3 工具链模式

```typescript
// 创建工具链
const contentCreationChain = bagctor.createToolChain()
  .add(copywriterTool, { 
    id: "writing", 
    input: (input) => ({ topic: input.topic, keywords: input.keywords })
  })
  .add(editorTool, {
    id: "editing",
    input: (input, results) => ({ copy: results.writing.copy, focus: input.focus })
  })
  .build();

// 执行工具链
const articleResult = await contentCreationChain.execute({
  topic: "微服务架构",
  keywords: ["容器化", "服务发现", "API网关"],
  focus: "实践案例"
});

console.log("最终文章:", articleResult.editing.editedCopy);
```

### 3.9 智能体团队构建 ✅

Bagctor提供了创建智能体团队的高级API，支持复杂协作场景。

```typescript
// 创建内容创作团队
const contentTeam = await bagctor.createTeam({
  name: "内容创作团队",
  agents: {
    manager: {
      agent: "managerAgent",
      role: "coordinator",
      permissions: ["tool_access", "agent_delegation"]
    },
    writer: {
      agent: "writerAgent",
      role: "specialist"
    },
    editor: {
      agent: "editorAgent",
      role: "specialist"
    },
    researcher: {
      agent: "researcherAgent",
      role: "supporter",
      tools: ["search", "dataRetrieval"]
    }
  },
  collaborationModel: "hierarchical",
  communicationProtocol: "event-based"
});

// 执行团队任务
const result = await contentTeam.execute({
  task: "创建一篇关于量子计算的综合报告",
  parameters: {
    length: "2000字",
    audience: "技术读者",
    deadline: "24小时"
  }
});

// 监控团队活动
contentTeam.on("agentActivity", (event) => {
  console.log(`智能体 ${event.agentId} 正在执行: ${event.activity}`);
});

contentTeam.on("taskCompleted", (event) => {
  console.log(`子任务完成: ${event.taskId}`);
});
```

### 3.10 智能体知识共享和同步 ✅

在分布式环境中，Bagctor提供了智能体间的知识共享机制。

```typescript
// 创建共享知识库
const knowledgeSpace = await bagctor.createKnowledgeSpace("project-quantum");

// 智能体贡献知识
await knowledgeSpace.contribute({
  agentId: "researchAgent",
  knowledge: "量子比特的纠缠性质可以用于实现超密集编码。",
  metadata: {
    domain: "量子信息学",
    confidence: 0.95,
    source: "研究论文分析"
  }
});

// 其他智能体访问知识
const quantumKnowledge = await knowledgeSpace.query({
  topic: "量子计算",
  minConfidence: 0.8,
  limit: 10
});

// 创建可同步的分布式内存
const syncedMemory = await bagctor.createSyncedMemory({
  id: "quantum-project-memory",
  syncInterval: 500, // 毫秒
  persistenceEnabled: true,
  accessControl: {
    writeAccess: ["researchAgent", "scientistAgent"],
    readAccess: "all"
  }
});

// 智能体使用同步内存
await researchAgent.useMemory(syncedMemory);
await scientistAgent.useMemory(syncedMemory);
```

### 3.11 高级工作流模式

Bagctor支持多种高级工作流模式，适用于复杂的业务场景。

#### 3.11.1 并行执行工作流

```typescript
// 创建并行执行工作流
const parallelWorkflow = workflowAdapter.createWorkflow({
  name: "parallel-processing",
  triggerSchema: z.object({
    topic: z.string().describe("分析主题"),
  })
});

// 创建多个并行执行的步骤
const marketAnalysisStep = workflowAdapter.createStep({
  id: "marketAnalysis",
  execute: async ({ context }) => {
    const topic = context.machineContext.triggerData?.topic;
    const result = await context.agentsMap.marketAnalyst.generate(
      `分析${topic}的市场前景`
    );
    return { marketAnalysis: result.text };
  }
});

const techAnalysisStep = workflowAdapter.createStep({
  id: "techAnalysis",
  execute: async ({ context }) => {
    const topic = context.machineContext.triggerData?.topic;
    const result = await context.agentsMap.techAnalyst.generate(
      `分析${topic}的技术可行性`
    );
    return { techAnalysis: result.text };
  }
});

const riskAnalysisStep = workflowAdapter.createStep({
  id: "riskAnalysis",
  execute: async ({ context }) => {
    const topic = context.machineContext.triggerData?.topic;
    const result = await context.agentsMap.riskAnalyst.generate(
      `评估${topic}的潜在风险`
    );
    return { riskAnalysis: result.text };
  }
});
```

### 3.17 工作流图可视化系统 ✅

Bagctor提供了强大的工作流图可视化系统，支持不同格式的输出和分析。

```typescript
import { createWorkflowGraph, exportGraphAsDOT, exportGraphAsJSON, analyzeGraph } from "@bagctor/agent";

// 创建工作流
const workflow = await bagctor.createWorkflow({
  name: "分布式数据处理",
  steps: [
    {
      agent: "dataCollector",
      input: "收集网站用户行为数据",
      output: "rawData"
    },
    {
      agent: "dataProcessor",
      input: (context) => `处理原始数据: ${context.rawData}`,
      output: "processedData" 
    },
    {
      agent: "dataAnalyzer",
      input: (context) => `分析处理后的数据: ${context.processedData}`,
      output: "analysis"
    },
    {
      agent: "reportGenerator", 
      input: (context) => `根据分析生成报告: ${context.analysis}`,
      output: "report"
    }
  ]
});

// 从工作流配置生成工作流图
const graph = createWorkflowGraph(workflow.config);

// 导出为DOT格式 (用于Graphviz)
const dotOutput = exportGraphAsDOT(graph);
fs.writeFileSync("workflow.dot", dotOutput);

// 导出为JSON格式 (用于web可视化)
const jsonOutput = exportGraphAsJSON(graph);
fs.writeFileSync("workflow.json", jsonOutput);

// 导出为Mermaid格式 (用于Markdown文档)
const mermaidOutput = exportGraphAsMermaid(graph);
fs.writeFileSync("workflow.mmd", mermaidOutput);

// 分析工作流图并获取优化建议
const suggestions = analyzeGraph(graph);
console.log("工作流优化建议:", suggestions);
```

### 3.12 Mastra兼容的智能体网络 ✅

Bagctor实现了与Mastra完全兼容的AgentNetwork API，提供多智能体协作网络功能，同时充分利用Bagctor的分布式能力。

```typescript
import { AgentNetwork } from "@bagctor/agent";
import { Agent } from "@mastra/core/agent";
import { openai } from "@ai-sdk/openai";

// 创建专业智能体
const researchAgent = new Agent({
  name: "Research",
  instructions: "You search for and gather information on topics",
  model: openai("gpt-4o"),
});

const summaryAgent = new Agent({
  name: "Summary",
  instructions: "You summarize information into concise points",
  model: openai("gpt-4o"),
});

// 创建智能体网络
export const researchNetwork = new AgentNetwork({
  name: "Research Assistant",
  instructions:
    "This network researches topics and provides summarized information.",
  agents: [researchAgent, summaryAgent],
  routingModel: openai("gpt-4o"),
});

// 处理任务
const result = await researchNetwork.process("Tell me about quantum computing");
console.log(result.result);

// 监听网络事件
researchNetwork.on('taskStarted', (data) => {
  console.log(`任务开始: ${data.taskId}`);
});

researchNetwork.on('taskCompleted', (data) => {
  console.log(`任务完成: ${data.taskId}`);
});

// 添加新的智能体到网络
const analysisAgent = new Agent({
  name: "Analysis",
  instructions: "You analyze information and identify patterns",
  model: openai("gpt-4o"),
});

researchNetwork.addAgent(analysisAgent);