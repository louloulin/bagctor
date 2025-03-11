# Bactor Agent System

一个基于Bactor Actor架构的现代AI Agent系统，支持多Agent协作、LLM集成和分布式执行。

## 概述

Bactor Agent系统结合了Actor模型和现代AI Agent框架的优势，设计灵感来源于MetaGPT、AgentScope和LangGraph等框架。系统的核心是将每个Agent实现为独立的Actor，这使得Agents能够：

- ✅ 通过消息传递进行异步通信
- ✅ 维护自己的状态和内存
- ✅ 执行专业化的角色和任务
- ✅ 以分布式方式协调工作
- ✅ 与多种LLM服务集成（如Qwen、OpenAI等）
- ✅ 使用丰富的工具系统扩展能力

## 核心组件

### 1. Agent基础设施

- ✅ **BaseAgent**: 所有Agent的抽象基类，实现通用功能
- ✅ **AgentSystem**: 管理Agent生命周期和协调
- 🔄 **AgentBus**: 基于Actor的消息总线，用于Agent间通信（部分实现，示例可见于bus_message_demo.ts）

### 2. Agent类型

- ✅ **RoleAgent**: 扮演特定角色的Agent，适合角色扮演任务
- ✅ **SkillAgent**: 专注于特定技能的Agent，如代码生成、数据分析等
- ✅ **AssistantAgent**: 通用对话助手Agent，支持多轮对话
- ✅ **其他专业化Agent**: 如PlannerAgent、ArchitectAgent、ProductManagerAgent等特定领域Agent

### 3. LLM集成

- ✅ **LLMService**: 统一的LLM服务接口，基于Vercel AI SDK，支持不同的提供商
- ✅ **支持的提供商**: Qwen和OpenAI模型的完整支持，以及自定义模型的接口定义
- ✅ **对话模式**: 支持单轮对话、多轮对话和流式输出
- ✅ **单元测试**: 为LLM服务和提供商实现了完整的单元测试和集成测试

### 4. 工具系统

- ✅ **Tool接口**: 统一的工具定义接口，支持动态工具调用
- ✅ **工具注册表**: 集中管理所有可用工具
- ✅ **内置工具**: 提供基础工具集，如搜索、计算、数据处理等
- ✅ **自定义工具**: 支持开发者注册自定义工具

### 5. 记忆系统

- ✅ **短期记忆**: 处理临时信息和会话状态
- ✅ **长期记忆**: 存储重要知识和历史交互
- ✅ **标签和查询**: 支持按标签、重要性和上下文查询记忆
- ✅ **记忆管理**: 自动管理记忆容量和优先级

### 6. Agent选择器

- ✅ **AgentSelector**: 根据任务自动选择最合适的Agent
- ✅ **得分系统**: 基于任务类型、关键词和能力匹配度评分
- ✅ **动态注册**: 支持动态注册新的Agent类型
- ✅ **参数配置**: 允许自定义Agent配置

## Agent间通信

Bactor Agent系统使用Actor模型进行Agent间通信，这与现代AI Agent架构的发展趋势相符。系统支持以下消息类型：

- ✅ **TaskMessage**: 表示要执行的任务
- ✅ **ResultMessage**: 包含任务执行结果
- ✅ **FeedbackMessage**: 提供审核/批评反馈
- ✅ **CoordinationMessage**: 用于Agent协调

## 使用示例

### 创建Agent系统

```typescript
import { AgentSystem, RoleAgent, SkillAgent } from '@bactor/agent';

// 创建Agent系统
const system = new AgentSystem();

// 初始化Agents
const planner = await system.createAgent(RoleAgent, {
  role: "planner",
  systemPrompt: "你是一个专业的任务规划者，负责将复杂任务分解为可执行的步骤。",
  capabilities: ["task_decomposition", "planning"]
});

const coder = await system.createAgent(SkillAgent, {
  skill: "coding",
  systemPrompt: "你是一个专业的程序员，擅长编写清晰、高效的代码。",
  capabilities: ["code_generation", "debugging"]
});

// 启动任务
await planner.tell({
  type: "TASK",
  description: "实现一个简单的REST API",
  requirements: ["使用Express框架", "包含CRUD操作"]
});
```

### 使用LLM服务

```typescript
import { createLLMService } from '@bactor/agent';

// 创建LLM服务
const llmService = createLLMService({
  defaultProvider: 'qwen',
  defaultModel: 'qwen-plus',
  apiKeys: {
    qwen: process.env.DASHSCOPE_API_KEY,
    openai: process.env.OPENAI_API_KEY,
    custom: ''
  }
});

// 单轮对话
const response = await llmService.complete("什么是Agent系统？");

// 多轮对话
const chatResponse = await llmService.chat([
  { role: "system", content: "你是一个有用的助手。" },
  { role: "user", content: "解释Actor模型。" }
]);

// 流式输出
await llmService.streamChat(
  [{ role: "user", content: "写一个简短的故事。" }],
  (chunk) => console.log(chunk)
);
```

### 使用工具系统

```typescript
import { ToolRegistry, registerTool } from '@bactor/agent';

// 创建工具注册表
const toolRegistry = new ToolRegistry();

// 注册自定义工具
registerTool({
  name: 'calculator',
  description: '执行数学计算',
  parameters: {
    operation: {
      type: 'string',
      description: '数学运算，例如 add, subtract, multiply, divide',
      required: true
    },
    a: {
      type: 'number',
      description: '第一个操作数',
      required: true
    },
    b: {
      type: 'number',
      description: '第二个操作数',
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
      default: throw new Error('不支持的操作');
    }
  }
});

// 使用工具
const result = await toolRegistry.executeTool('calculator', {
  operation: 'add',
  a: 5,
  b: 3
});
// result: { result: 8 }
```

### 使用记忆系统

```typescript
import { MemoryStore } from '@bactor/agent';

// 创建记忆存储
const memory = new MemoryStore({
  shortTermCapacity: 100,
  longTermCapacity: 500,
  accessThreshold: 3,
  importanceThreshold: 0.7
});

// 存储短期记忆
memory.setShortTerm('user_preference', { theme: 'dark', language: 'zh' });

// 读取记忆
const preference = memory.getShortTerm('user_preference');

// 高重要性记忆会自动升级到长期记忆
memory.setShortTerm('critical_info', '重要安全信息', { importance: 0.9 });

// 按标签查询记忆
memory.setShortTerm('contact_alice', '联系人: Alice', { tags: ['contact', 'important'] });
memory.setShortTerm('contact_bob', '联系人: Bob', { tags: ['contact'] });

const contacts = memory.queryShortTerm({ tags: ['contact'] });
// 返回两个联系人记忆
```

### 使用Agent选择器

```typescript
import { AgentSelector, SkillAgent, AssistantAgent } from '@bactor/agent';

// 创建选择器
const selector = new AgentSelector();

// 注册Agent类型
selector.registerAgentType({
  id: 'developer',
  name: '开发者Agent',
  description: '专注于编写和调试代码的Agent',
  agentClass: SkillAgent,
  defaultConfig: {
    role: 'skill_agent',
    parameters: { language: 'typescript' }
  },
  scoreForTask: (task) => {
    if (task.type === 'coding') return 0.9;
    return 0.3;
  }
});

selector.registerAgentType({
  id: 'assistant',
  name: '助手Agent',
  description: '通用问答Agent',
  agentClass: AssistantAgent,
  defaultConfig: {
    role: 'assistant_agent',
    parameters: {}
  },
  scoreForTask: (task) => {
    if (task.type === 'qa') return 0.9;
    return 0.5;
  }
});

// 根据任务自动选择Agent
const task = {
  id: 'task1',
  type: 'coding',
  description: '编写一个React组件',
  requirements: ['使用TypeScript']
};

const selectedAgent = selector.selectAgentForTask(task);
// 返回开发者Agent，因为得分更高

// 实例化选定的Agent
const agent = selectedAgent.instantiate();
```

## 架构特点

Bactor Agent系统的架构融合了Actor模型和现代AI Agent框架的优势：

### Actor模型优势

- ✅ **细粒度隔离**: 每个Agent作为独立Actor运行，有自己的状态和行为
- ✅ **消息传递**: 通过异步消息进行通信，避免直接依赖
- ✅ **并发执行**: 内置的并发支持，每个Agent可独立处理任务
- ✅ **容错性**: 实现监督策略以处理错误情况

### AI Agent设计理念

- ✅ **自主性**: Agent可以根据其角色和技能自主执行任务
- ✅ **专业化**: 不同Agent专注于不同能力，形成专业分工
- ✅ **协作**: 通过消息传递实现Agent间协作
- ✅ **可扩展**: 易于添加新Agent类型和集成新的LLM模型
- ✅ **工具使用**: Agent可以使用各种工具扩展其能力
- ✅ **记忆管理**: 智能记忆系统支持短期和长期记忆

## 与其他框架的比较

Bactor Agent系统吸取了多个框架的设计理念：

- **MetaGPT**: 采用基于角色的多Agent合作模式
- **AgentScope**: 使用消息传递进行Agent间通信
- **LangGraph**: 将Agent视为Actor，注重状态管理和工作流
- **LangChain**: 借鉴了工具集成和记忆管理的设计
- **Vercel AI SDK**: 统一大语言模型访问接口，简化集成
- **Bactor Core**:.利用底层Actor系统实现高效的Agent通信和调度

## 实现细节

- ✅ 使用Bactor核心Actor系统实现Agent
- ✅ 利用路由器功能进行消息分发
- ✅ 为Agent特定逻辑实现自定义邮箱处理
- ✅ 提供监督策略以实现容错
- ✅ 集成多种LLM模型，支持不同类型的对话和响应格式
- ✅ 工具系统支持参数验证和错误处理
- ✅ 记忆系统实现自动优先级管理和容量控制

## 已完成功能总结

1. ✅ **Agent框架**: 基础架构，包括BaseAgent抽象类和AgentSystem管理系统
2. ✅ **Agent类型**: 实现了多种专业化Agent，如RoleAgent、SkillAgent、AssistantAgent等
3. ✅ **LLM集成**: 实现了基于Vercel AI的统一LLM服务接口，支持Qwen和OpenAI模型
4. ✅ **统一工具系统**: 实现了工具接口、注册表和基础工具集
5. ✅ **高级记忆系统**: 实现了短期和长期记忆管理系统，支持标签和重要性
6. ✅ **自动Agent选择**: 实现了基于任务得分的Agent选择器
7. ✅ **测试**: 为各主要组件实现了单元测试和集成测试
8. ✅ **示例**: 提供了多个示例程序，展示不同功能的使用方法

## 正在开发的功能

1. 🔄 **Agent协作框架**: 增强多Agent协作的能力，支持更复杂的工作流程
2. 🔄 **向量存储集成**: 为记忆系统添加基于向量的检索能力
3. 🔄 **更多外部工具集成**: 增加更多内置工具，如网络搜索、代码执行等
4. 🔄 **改进的Agent路由**: 实现更智能的任务分发和协作机制

## 未来发展

- 添加智能Agent Router进行动态任务分配
- 实现基于图的Agent工作流管理
- 集成更多LLM提供商和模型类型
- 增强工具使用和外部API集成能力
- 支持多语言Agent交互
- 添加自我反思和学习能力

## 快速开始

```bash
# 安装依赖
bun install

# 构建项目
bun run build

# 运行示例
bun run example:agent    # 运行Agent系统示例
bun run example:llm      # 运行LLM服务示例
bun run example:tools    # 运行工具系统示例
bun run example:memory   # 运行记忆系统示例
bun run example:selector # 运行Agent选择器示例

# 运行测试
bun run test             # 运行所有测试
bun run test:llm         # 仅运行LLM相关测试
bun run test:tools       # 仅运行工具相关测试
bun run test:memory      # 仅运行记忆系统测试
bun run test:watch       # 监视模式运行测试
``` 