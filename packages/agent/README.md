# Bagctor Agent

Bagctor Agent是一个分布式智能体系统，扩展了Mastra的能力并结合Actor模型，实现高效的分布式协作。

## 特性

- **100% Mastra API兼容**: 完全符合Mastra API，支持无缝迁移
- **多智能体源支持**: 支持传递智能体数组和Mastra实例数组
- **工作流支持**: 创建和执行包含多个智能体的工作流
- **智能体编排**: 通过不同策略协调多个智能体
- **分布式部署**: 支持跨多节点部署以提高可扩展性
- **智能体交互机制**: 支持智能体之间的消息传递和协作
- **共享内存**: 实现分布式环境中的状态共享
- **容错机制**: 提供节点故障检测和恢复能力

## 安装

```bash
npm install @bagctor/agent
```

## 基本使用

```typescript
import { Agent } from '@mastra/core/agent';
import { openai } from '@ai-sdk/openai';
import { Bagctor } from '@bagctor/agent';

// 创建智能体
const myAgent = new Agent({
  name: 'MyAgent',
  instructions: '你是一个有帮助的助手。',
  model: openai('gpt-4o'),
});

// 创建Bagctor实例
const bagctor = new Bagctor({
  agents: { myAgent },
  distribution: {
    clustered: true,
    serverPort: 9000
  }
});

// 使用智能体
const response = await bagctor.agents.myAgent.generate('你好，你能帮我什么？');
console.log(response.text);
```

## 多智能体和Mastra实例

Bagctor支持以对象映射和数组形式传递智能体:

```typescript
// 使用智能体数组
const bagctor = new Bagctor({
  agents: [agent1, agent2, agent3],
  distribution: {
    clustered: true
  }
});

// 使用Mastra实例
const bagctor = new Bagctor({
  mastra: [mastraInstance1, mastraInstance2],
  distribution: {
    clustered: true
  }
});

// 同时使用两者
const bagctor = new Bagctor({
  agents: { customAgent },
  mastra: [mastraInstance1, mastraInstance2],
  distribution: {
    clustered: true
  }
});
```

## 工作流

创建协调多个智能体的工作流:

```typescript
const workflow = await bagctor.createWorkflow({
  name: '研究工作流',
  steps: [
    {
      agent: 'researchAgent',
      input: '研究分布式系统',
      output: 'research'
    },
    {
      agent: 'writingAgent',
      input: (context) => `基于以下研究写一篇文章: ${context.research}`,
      output: 'article'
    }
  ]
});

const result = await workflow.execute();
console.log(result.article);
```

## 智能体交互

Bagctor提供了丰富的智能体交互机制:

### 直接消息传递

```typescript
// 直接在智能体之间发送消息
const response = await bagctor.sendMessage(
  'sourceAgentId',
  'targetAgentId',
  '处理这个研究数据并提供分析'
);
```

### 共享内存

```typescript
// 创建共享内存空间
const memoryId = await bagctor.createSharedMemory('project-xyz');

// 智能体可以通过内存ID访问共享数据
```

### 分布式编排

使用不同策略编排多个智能体:

```typescript
// 层次化编排
const hierarchicalOrchestrator = bagctor.createOrchestrator({
  agents: ['managerAgent', 'researchAgent', 'writingAgent'],
  orchestrationStrategy: 'hierarchical'
});

// 并行编排
const parallelOrchestrator = bagctor.createOrchestrator({
  agents: ['researchAgent', 'analysisAgent', 'visualizationAgent'],
  orchestrationStrategy: 'parallel'
});

// 顺序编排
const sequentialOrchestrator = bagctor.createOrchestrator({
  agents: ['planningAgent', 'executionAgent', 'reviewAgent'],
  orchestrationStrategy: 'sequential'
});
```

## 智能体团队

创建协作智能体团队:

```typescript
const contentTeam = await bagctor.createTeam({
  name: '内容创作团队',
  agents: ['researchAgent', 'writingAgent', 'editingAgent'],
  orchestrationStrategy: 'hierarchical'
});

const result = await contentTeam.execute('创建一篇关于分布式系统的文章');
```

## 分布式部署

Bagctor支持跨多节点的分布式部署:

```typescript
// 主节点
const primary = new Bagctor({
  agents: { myAgent },
  distribution: {
    nodeType: 'primary',
    serverPort: 9000
  }
});

// 工作节点
const worker = new Bagctor({
  distribution: {
    nodeType: 'worker',
    primaryHost: 'primary-host-address',
    primaryPort: 9000
  }
});

// 注册远程智能体
const remoteAgent = await worker.registerRemoteAgent('myAgent');
```

## 容错与恢复

Bagctor提供了节点故障检测和恢复机制:

```typescript
// 所有分布式功能自动包含容错能力，节点失败时会自动尝试使用备用节点
```

## API服务

启动API服务暴露智能体:

```typescript
await bagctor.serve({
  port: 4111,
  enablePlayground: true
});
```

## 许可证

MIT 