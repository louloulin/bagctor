# Bactor Agent System

Bactor Agent System是一个基于Bactor Actor架构和Mastra框架构建的AI Agent框架，旨在提供灵活、可扩展和强大的AI Agent系统。

## 特性

- 📝 **基于Actor的Agent系统**: 利用Bactor的Actor模型，轻松构建可扩展、具有消息传递能力的Agent
- 🔧 **灵活的工具集成**: 简单直观的工具定义和集成方式，支持各种外部功能
- 🧠 **智能记忆系统**: 支持短期和长期记忆，实现上下文感知的交互，包括向量记忆
- 🔄 **强大的工作流系统**: 基于Actor的工作流定义和执行机制，支持复杂的决策流程
- 🚀 **高并发设计**: 基于Actor模型的并发设计，轻松处理高负载场景
- 🧩 **模块化架构**: 易于扩展和集成新功能

## 快速开始

### 安装

```bash
npm install bactor-agent @bactor/core
```

### 创建简单Agent

```typescript
import { ActorSystem } from '@bactor/core';
import { createAgentActor } from 'bactor-agent/bactor';

async function main() {
  const system = new ActorSystem();
  
  // 创建一个简单的助手Agent
  const assistantPid = await createAgentActor(system, {
    name: 'Assistant',
    instructions: 'You are a helpful assistant that answers questions.',
    model: { 
      provider: 'openai', 
      name: 'gpt-4o-mini', 
      apiKey: process.env.OPENAI_API_KEY 
    }
  });
  
  // 发送请求并获取响应
  const response = await system.ask(assistantPid, {
    type: 'generate',
    content: 'What is the capital of France?'
  });
  
  console.log(`Response: ${response.result.text}`);
  
  // 清理
  await system.stop(assistantPid);
}
```

### 使用工具

```typescript
import { ActorSystem } from '@bactor/core';
import { createAgentActor, createTool, AgentSystem } from 'bactor-agent/bactor';

async function main() {
  // 创建Agent系统
  const agentSystem = new AgentSystem();
  
  // 创建计算器工具
  const calculatorTool = createTool({
    id: 'calculator',
    description: 'Perform mathematical calculations',
    parameters: {
      operation: {
        type: 'string',
        description: 'Mathematical operation: add, subtract, multiply, divide',
        required: true,
        enum: ['add', 'subtract', 'multiply', 'divide']
      },
      a: {
        type: 'number',
        description: 'First operand',
        required: true
      },
      b: {
        type: 'number',
        description: 'Second operand',
        required: true
      }
    },
    execute: async (params) => {
      const { operation, a, b } = params;
      
      switch (operation) {
        case 'add': return { result: a + b };
        case 'subtract': return { result: a - b };
        case 'multiply': return { result: a * b };
        case 'divide': return { result: a / b };
        default: throw new Error(`Unknown operation: ${operation}`);
      }
    }
  });
  
  // 创建具有计算器工具的Agent
  const mathAgent = agentSystem.createAgent({
    name: 'Math Assistant',
    description: '数学助手，可以执行各种计算',
    instructions: 'You are a math assistant that can perform calculations.',
    model: { 
      provider: 'openai', 
      name: 'gpt-4-turbo', 
      apiKey: process.env.OPENAI_API_KEY
    },
    tools: {
      calculator: calculatorTool
    }
  });
  
  // 发送任务
  const result = await agentSystem.sendTask(
    mathAgent.path,
    'Calculate 135 multiplied by 28'
  );
  
  console.log('Response:', result);
  
  // 关闭系统
  await agentSystem.stop();
}
```

### 创建和运行工作流

```typescript
import { ActorSystem } from '@bactor/core';
import { createWorkflowActor } from 'bactor-agent/bactor';

async function main() {
  const system = new ActorSystem();
  
  // 创建一个数据处理工作流
  const workflowActor = await createWorkflowActor(system, {
    name: 'data-processing-workflow',
    description: '一个简单的数据处理工作流'
  });
  
  // 定义工作流
  await system.ask(workflowActor, {
    type: 'defineWorkflow',
    steps: [
      {
        id: 'fetchData',
        execute: async ({ context }) => {
          // 获取数据
          return { data: [1, 2, 3, 4, 5] };
        }
      },
      {
        id: 'processData',
        execute: async ({ context }) => {
          const { data } = context.steps.fetchData.output;
          // 处理数据
          const processedData = data.map(x => x * 2);
          return { processedData };
        }
      },
      {
        id: 'analyzeData',
        execute: async ({ context }) => {
          const { processedData } = context.steps.processData.output;
          // 分析数据
          const sum = processedData.reduce((a, b) => a + b, 0);
          const average = sum / processedData.length;
          return { sum, average };
        }
      }
    ],
    connections: [
      { from: 'fetchData', to: 'processData' },
      { from: 'processData', to: 'analyzeData' }
    ]
  });
  
  // 启动工作流
  const { runId, result } = await system.ask(workflowActor, {
    type: 'startWorkflow',
    input: { source: 'example' }
  });
  
  console.log('Workflow result:', result);
}
```

## 架构

Bactor Agent系统的架构基于以下核心组件：

1. **Agent Actor**: 基于Bactor Actor系统的代理实现，具有消息传递和状态管理能力
2. **Tool**: 为Agent提供特定功能的工具，可以通过参数化方式配置和使用
3. **Memory**: 管理Agent的记忆系统，支持短期记忆、长期记忆和向量记忆
4. **Workflow**: 基于Actor的工作流定义和执行系统，支持复杂的处理流程和状态管理

架构图：
```
┌─────────────────────────────┐
│        Agent System         │
│                             │
│  ┌─────────┐   ┌─────────┐  │
│  │Agent Actor│  │Workflow │  │
│  │          │  │  Actor  │  │
│  └─────────┘   └─────────┘  │
│        │            │       │
│  ┌─────────┐   ┌─────────┐  │
│  │  Tools  │   │  Memory │  │
│  └─────────┘   └─────────┘  │
└─────────────────────────────┘
```

## 进阶用法

### 自定义记忆实现

```typescript
import { Memory, MemoryEntry } from 'bactor-agent';

class CustomMemory implements Memory {
  private entries: MemoryEntry[] = [];
  
  async add(input: string, response: string, metadata?: Record<string, any>): Promise<void> {
    // 自定义记忆实现
    // ...
  }
  
  async retrieve(query: string, options = {}): Promise<MemoryEntry[]> {
    // 自定义检索逻辑
    // ...
    return [];
  }
  
  async clear(): Promise<void> {
    this.entries = [];
  }
}

// 在Agent配置中使用自定义记忆
const agent = createAgentActor(system, {
  // ...其他配置
  memory: new CustomMemory()
});
```

### 多Agent协作

```typescript
import { ActorSystem } from '@bactor/core';
import { AgentSystem } from 'bactor-agent/bactor';

async function main() {
  const agentSystem = new AgentSystem();
  
  // 创建规划Agent
  const plannerAgent = agentSystem.createAgent({
    name: 'Planner',
    instructions: 'You are a planner that breaks down complex tasks into steps.',
    model: { provider: 'openai', name: 'gpt-4' }
  });
  
  // 创建研究Agent
  const researcherAgent = agentSystem.createAgent({
    name: 'Researcher',
    instructions: 'You are a researcher that finds information on topics.',
    model: { provider: 'openai', name: 'gpt-4' }
  });
  
  // 创建写作Agent
  const writerAgent = agentSystem.createAgent({
    name: 'Writer',
    instructions: 'You are a writer that creates content based on outlines and research.',
    model: { provider: 'openai', name: 'gpt-4' }
  });
  
  // 多Agent协作流程
  // 1. 规划阶段
  const planResult = await agentSystem.sendTask(
    plannerAgent.path,
    'Create a plan for writing an article about artificial intelligence.'
  );
  
  // 2. 研究阶段
  const researchResult = await agentSystem.sendTask(
    researcherAgent.path,
    `Research the following topics from the plan: ${planResult}`
  );
  
  // 3. 写作阶段
  const articleResult = await agentSystem.sendTask(
    writerAgent.path,
    `Write an article based on this plan: ${planResult} and this research: ${researchResult}`
  );
  
  console.log('Final article:', articleResult);
}
```

## 示例

查看`examples`目录获取更多高级用法示例，包括：

- 天气查询Agent示例 (weather-agent.ts)
- 工作流处理示例 (simple-workflow.ts)
- 基于Bactor的Agent示例 (bactor-agent-demo.ts)
- 工作流Actor示例 (bactor-workflow-demo.ts)

## 集成与兼容性

- **OpenAI API**: 完全支持最新的OpenAI API，包括函数调用
- **Qwen**: 支持阿里巴巴的Qwen模型
- **自定义LLM**: 可以轻松扩展以支持其他LLM提供商
- **Bactor Actor系统**: 与Bactor Actor系统无缝集成，利用其消息传递和并发能力

## 许可证

MIT 