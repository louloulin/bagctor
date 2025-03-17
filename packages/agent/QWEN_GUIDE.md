# Bagctor Agent 使用 Qwen 模型指南

本指南介绍如何在 Bagctor Agent 中使用通义千问(Qwen)模型，替代原先的 OpenAI 模型。

## 安装依赖

首先，需要安装 `qwen-ai-provider` 包：

```bash
# 使用 npm
npm install qwen-ai-provider

# 使用 yarn
yarn add qwen-ai-provider

# 使用 bun
bun add qwen-ai-provider
```

## 基本用法

下面是使用 Qwen 模型创建智能体的基本示例：

```typescript
import { Agent } from '@mastra/core/agent';
import { createQwen } from 'qwen-ai-provider';
import { Bagctor } from '@bagctor/agent';

// 配置 Qwen 模型
const qwen = createQwen({
    baseURL: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    apiKey: 'YOUR_API_KEY', // 替换为您的 API 密钥
});

// 创建智能体
const myAgent = new Agent({
    name: 'MyAgent',
    instructions: '你是一个有帮助的助手。',
    model: qwen('qwen-plus-2024-12-20'), // 使用 Qwen 模型
});

// 创建 Bagctor 实例
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

## 可用的 Qwen 模型

Qwen 提供了多种模型版本，您可以根据需求选择：

- `qwen-plus-2024-12-20` - 通义千问大模型，适用于通用场景
- `qwen-plus-2024-12-20-32k` - 支持长文本的通义千问大模型
- `qwen-max` - 通义千问最强大的模型，适用于复杂任务
- `qwen-max-1201` - 通义千问 Max 的特定版本

示例：

```typescript
// 使用标准模型
model: qwen('qwen-plus-2024-12-20')

// 使用长文本模型
model: qwen('qwen-plus-2024-12-20-32k')

// 使用最强大的模型
model: qwen('qwen-max')
```

## 工具使用

Qwen 模型支持工具调用，与 Mastra 框架完全兼容。以下是一个使用工具的示例：

```typescript
const searchTool = {
    name: 'search-tool',
    description: '搜索信息的工具',
    parameters: {
        type: 'object',
        properties: {
            query: {
                type: 'string',
                description: '搜索查询'
            }
        },
        required: ['query']
    },
    handler: async ({ query }) => {
        // 工具实现
        return { results: [`关于 ${query} 的搜索结果`] };
    }
};

const assistantAgent = new Agent({
    name: 'AssistantAgent',
    instructions: '你是一个有帮助的助手，使用提供的工具来回答问题。',
    model: qwen('qwen-plus-2024-12-20'),
    tools: {
        searchTool
    },
});
```

## 完整示例

在 `packages/agent/src/examples` 目录下提供了完整的示例应用程序：

1. `qwen-chef-example.ts` - 简单的厨师智能体示例
2. `qwen-chef-app.ts` - 命令行版本的厨师智能体应用
3. `qwen-chef-web.ts` - Web 版本的厨师智能体应用
4. `qwen-agent-example.ts` - 多个 Qwen 智能体协作的示例

可以通过以下命令运行这些示例：

```bash
# 运行 CLI 示例
bun run packages/agent/src/examples/qwen-chef-app.ts

# 运行 Web 示例
bun run packages/agent/src/examples/qwen-chef-web.ts
# 然后在浏览器中访问 http://localhost:3000
```

## 注意事项

1. API 密钥：确保使用有效的 Qwen API 密钥，并妥善保管
2. 成本管理：根据使用量控制 API 调用频率
3. 性能考虑：Qwen 模型可能与 OpenAI 模型有不同的响应时间和特性

## 故障排除

如果遇到问题，请确保：

1. API 密钥正确
2. 使用了正确的模型名称
3. 网络连接正常
4. 查看 Qwen API 的错误响应获取详细信息

## 更多资源

- [通义千问官方文档](https://dashscope.aliyun.com/)
- [qwen-ai-provider NPM 包](https://www.npmjs.com/package/qwen-ai-provider) 