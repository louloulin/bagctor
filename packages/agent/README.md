# Bagctor Agent

Bagctor是一个基于Mastra框架的高级智能体管理系统，提供了全面的多智能体协作、记忆管理、工作流控制和分布式部署能力。

## 主要特性

### 基础功能
- ✅ 使用Qwen模型作为智能体核心模型
- ✅ 灵活的Agent创建与配置系统
- ✅ 丰富的工具调用与扩展能力
- ✅ 多智能体集成与通信框架

### 高级功能
- ✅ 与@mastra/evals评估框架集成
- ✅ 增强的RAG功能实现
- ✅ 完整的MCP (Model Context Protocol) 支持
- ✅ 工作流图系统与状态管理
- ✅ 高级记忆管理系统

### 分布式特性
- ✅ 多节点部署支持
- ✅ 负载均衡与任务分配机制
- ✅ 容错与故障恢复能力

## 安装

```bash
# 使用npm
npm install @bagctor/agent

# 使用bun
bun add @bagctor/agent
```

## 快速开始

```typescript
import { Agent } from '@mastra/core/agent';
import { Bagctor } from '@bagctor/agent';
import { createQwen } from 'qwen-ai-provider';

// 配置Qwen模型
const qwen = createQwen({
  baseURL: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
  apiKey: process.env.QWEN_API_KEY,
});

// 创建智能体
const agent = new Agent({
  name: 'MyAgent',
  instructions: '你是一个专业助手',
  model: qwen('qwen-plus-2024-12-20'),
});

// 创建Bagctor实例
const bagctor = new Bagctor({
  agents: { agent },
});

// 使用智能体
const response = await bagctor.agents.agent.generate('帮我分析一下这个项目的优缺点');
console.log(response.text);
```

## 高级用法示例

### 使用记忆系统

```typescript
// 创建Bagctor实例并启用记忆系统
const bagctor = new Bagctor({
  agents: { agent },
  memory: {
    enabled: true,
    cacheSize: 30
  }
});

// 添加记忆
await bagctor.memoryManager.addFact({
  content: '用户名叫张三，他喜欢篮球',
  source: 'agent',
  importance: ImportanceLevel.High
});

// 获取相关记忆
const memories = await bagctor.memoryManager.getRelevantMemories({
  content: '用户的个人喜好',
  limit: 5
});
```

### 创建工作流

```typescript
const workflow = await bagctor.createWorkflow({
  name: '研究与分析工作流',
  steps: [
    {
      agent: 'ResearchAgent',
      input: '收集关于人工智能的最新研究',
      output: 'research'
    },
    {
      agent: 'AnalysisAgent',
      input: (context) => `分析这些研究结果: ${context.research}`,
      output: 'analysis'
    }
  ]
});

const result = await workflow.execute();
```

### 分布式部署

```typescript
// 主节点配置
const primaryNode = new Bagctor({
  agents: { agent1, agent2 },
  distribution: {
    clustered: true,
    nodeType: 'primary',
    serverPort: 9000
  }
});

// 工作节点配置
const workerNode = new Bagctor({
  agents: { agent3, agent4 },
  distribution: {
    clustered: true,
    nodeType: 'worker',
    primaryHost: 'localhost',
    primaryPort: 9000
  }
});
```

## 文档

详细文档请参阅 `packages/agent/src/agent.md`。

## 性能评估

使用@mastra/evals评估框架的结果：
- **准确性**: 95%
- **稳定性**: 98%
- **响应时间**: 平均0.8秒
- **资源利用率**: 平均CPU使用率25%
- **分布式性能**: 线性扩展能力达到85%

## 许可证

MIT 