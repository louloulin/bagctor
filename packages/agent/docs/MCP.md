# MCP 集成指南

## 什么是 MCP？

MCP (Model Context Protocol) 是 Anthropic 提出的一个协议，用于自动发现和集成第三方 AI 工具和服务。Bagctor 实现了对 MCP 的完整支持，允许智能体无缝连接和使用外部工具。

通过 MCP 集成，Bagctor 智能体可以：

- 自动发现并使用托管在不同服务器上的工具
- 使用标准接口与工具交互，无需了解底层实现细节
- 从去中心化工具注册表（如 opentools.com 和 MCP.run）访问数百种工具
- 维持一致的开发体验和类型安全

## 配置 MCP 集成

### 基本配置

在创建 Bagctor 实例时，可以通过 `mcp` 选项启用和配置 MCP 集成：

```typescript
import { Agent } from '@mastra/core/agent';
import { Bagctor } from '@bagctor/agent';

const bagctor = new Bagctor({
  agents: { myAgent },
  mcp: {
    enabled: true,
    servers: {
      'opentools': {
        url: 'https://api.opentools.com/mcp',
        apiKey: 'your-api-key'
      }
    },
    autoDiscoverTools: true
  }
});
```

### 配置选项

| 选项 | 类型 | 描述 |
|------|------|------|
| `enabled` | `boolean` | 是否启用 MCP 集成 |
| `registryUrl` | `string?` | MCP 注册表 URL (可选) |
| `servers` | `Record<string, { url: string, apiKey?: string }>?` | MCP 服务器配置 |
| `autoDiscoverTools` | `boolean?` | 是否自动发现并注册所有工具 |

### 手动启用 MCP

如果在创建 Bagctor 时没有启用 MCP，可以稍后手动启用：

```typescript
await bagctor.enableMCP({
  enabled: true,
  servers: {
    'mcp-server': {
      url: 'https://mcp-server.example.com',
      apiKey: 'your-api-key'
    }
  }
});
```

## 使用 MCP 工具

### 自动发现和注册

如果设置了 `autoDiscoverTools: true`，Bagctor 会自动发现并向所有智能体注册可用的工具。智能体可以直接使用这些工具，无需额外配置。

### 手动注册工具

如果需要更精细的控制，可以手动注册特定工具到智能体：

```typescript
// 注册所有可用工具到特定智能体
await bagctor.registerMCPToolsToAgent('myAgent');

// 注册特定工具到智能体
await bagctor.registerMCPToolsToAgent('myAgent', ['opentools/search', 'mcprun/translator']);
```

### 查看可用工具

可以通过 MCP 管理器查看所有可用的工具：

```typescript
if (bagctor.mcpIntegration) {
  const availableTools = await bagctor.mcpIntegration.getAvailableTools();
  console.log('可用工具:');
  for (const [toolId, tool] of Object.entries(availableTools)) {
    console.log(`- ${toolId}: ${tool.description}`);
  }
}
```

## MCP 服务器集成

Bagctor 可以同时连接多个 MCP 服务器，从而访问不同来源的工具：

```typescript
const bagctor = new Bagctor({
  agents: { myAgent },
  mcp: {
    enabled: true,
    servers: {
      // 搜索工具服务器
      'search-server': {
        url: 'https://search-mcp.example.com',
        apiKey: 'search-api-key'
      },
      // 翻译工具服务器
      'translation-server': {
        url: 'https://translation-mcp.example.com',
        apiKey: 'translation-api-key'
      },
      // 图像生成服务器
      'image-server': {
        url: 'https://image-mcp.example.com',
        apiKey: 'image-api-key'
      }
    }
  }
});
```

### 动态添加和移除服务器

可以在运行时动态添加或移除 MCP 服务器：

```typescript
// 添加新的 MCP 服务器
if (bagctor.mcpIntegration) {
  bagctor.mcpIntegration.addServer('new-server', {
    url: 'https://new-mcp-server.example.com',
    apiKey: 'new-api-key'
  });
}

// 移除 MCP 服务器
if (bagctor.mcpIntegration) {
  bagctor.mcpIntegration.removeServer('old-server');
}
```

## 工具使用示例

### 搜索工具

```typescript
const response = await bagctor.agents.myAgent.generate('在网上搜索关于气候变化的最新研究');
console.log(response.text);
```

### 翻译工具

```typescript
const response = await bagctor.agents.myAgent.generate('将这段英文翻译成中文：Hello, world!');
console.log(response.text);
```

### 图像生成工具

```typescript
const response = await bagctor.agents.myAgent.generate('生成一幅日落时的海滩图像');
console.log(response.text);
```

## 故障排除

如果 MCP 集成遇到问题，可以尝试以下方法：

1. **检查连接**：确保服务器 URL 正确且可访问
2. **检查 API 密钥**：确保提供了有效的 API 密钥
3. **查看日志**：MCP 集成会在初始化和工具发现过程中输出日志
4. **手动测试**：使用 `curl` 或 Postman 测试 MCP 服务器 API

## 高级用法

### 自定义 MCP 适配器

可以创建自定义适配器，将 MCP 工具转换为特定格式：

```typescript
import { MCPTool } from '@bagctor/agent';

function customMCPAdapter(tool: MCPTool) {
  return {
    name: `custom-${tool.name}`,
    description: `Custom: ${tool.description}`,
    parameters: tool.parameters,
    handler: async (params: any) => {
      // 自定义处理逻辑
      const result = await tool.handler(params);
      return {
        ...result,
        custom_field: 'custom value'
      };
    }
  };
}
```

### 集成 MCP 注册表

如果需要从注册表发现服务器，可以使用以下方法：

```typescript
import { MCPClient } from '@bagctor/agent';

const mcpClient = new MCPClient({
  registryUrl: 'https://mcp.run/mcp.json',
  apiKey: 'registry-api-key'
});

const directory = await mcpClient.connectToRegistry();
const servers = await mcpClient.listServers();

console.log(`注册表中的服务器: ${servers.join(', ')}`);
```

## 更多资源

- [MCP 规范](https://docs.anthropic.com/mcp/reference)
- [Bagctor 示例库](../examples/mcp-example.ts)
- [opentools.com](https://opentools.com) - MCP 工具注册表
- [MCP.run](https://mcp.run) - MCP 工具注册表 