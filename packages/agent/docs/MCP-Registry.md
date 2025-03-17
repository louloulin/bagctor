# MCP 注册表集成

本文档详细介绍了 Bagctor 对 Mastra MCP 注册表的集成支持，包括如何使用标准化的注册表发现工具和服务器，以及如何与不同类型的 MCP 服务器通信。

## MCP 注册表简介

MCP (Model Context Protocol) 注册表是一个中央目录，用于发现和管理 MCP 服务器及其提供的工具。Bagctor 实现了与 MCP 注册表的标准化交互，支持 `.well-known/mcp.json` 规范，使您能够轻松发现和配置可用的 MCP 服务器。

## 核心功能

Bagctor 的 MCP 注册表集成提供以下核心功能：

1. **注册表发现和连接**：连接到 MCP 注册表并获取可用服务器列表
2. **服务器定义检索**：获取特定服务器的详细定义，包括配置模式
3. **配置验证**：使用服务器的模式验证用户提供的配置
4. **多传输类型支持**：支持 HTTP、SSE 和 stdio 三种传输方式
5. **统一工具接口**：提供一致的 API 来发现和使用工具，无论其来源如何

## 使用注册表客户端

Bagctor 提供了两种使用注册表的方式：直接使用 `MCPClient` 或通过高级 `MCPConfiguration` 接口。

### 使用 MCPClient

```typescript
import { MCPClient } from '@bagctor/agent';

// 连接到注册表
const client = new MCPClient({
  registryUrl: 'https://mcp.run/.well-known/mcp.json'
});

// 获取注册表目录信息
const directory = await client.connectToRegistry();
console.log('连接到注册表:', directory.name, directory.homepage);

// 列出所有可用服务器
const allServers = await client.listServers();
console.log('可用服务器:', allServers);

// 获取特定服务器的定义
const serverDefinition = await client.getServerDefinition('search-server');
console.log('服务器定义:', serverDefinition.name, serverDefinition.description);

// 验证服务器配置
const isValid = client.validateServerConfig(serverDefinition, {
  apiKey: 'your-api-key',
  region: 'us-west'
});
console.log('配置有效?', isValid);
```

### 使用 MCPConfiguration

```typescript
import { MCPConfiguration } from '@bagctor/agent';

// 创建配置
const configuration = new MCPConfiguration({
  registry: 'https://mcp.run/.well-known/mcp.json',
  servers: {
    'search-server': {
      url: 'https://api.search.example.com',
      apiKey: 'your-api-key'
    },
    'translation-server': {
      url: 'https://api.translation.example.com',
      apiKey: 'your-translation-api-key'
    }
  }
});

// 获取所有服务器的工具
const toolsets = await configuration.getConnectedTools();
console.log('已连接的工具集:', Object.keys(toolsets));

// 动态添加新服务器
configuration.addServer('new-server', {
  url: 'https://api.new.example.com',
  apiKey: 'new-api-key'
});

// 移除服务器
configuration.removeServer('old-server');
```

## 支持的传输类型

Bagctor 支持三种 MCP 传输类型：

### 1. HTTP 传输

适用于标准 REST API 端点：

```typescript
const client = new MCPClient({
  serverUrl: 'https://api.example.com/mcp',
  apiKey: 'your-api-key',
  transport: 'http'
});

await client.connect();
const tools = await client.discoverTools();
```

### 2. SSE (Server-Sent Events) 传输

适用于基于事件的长连接：

```typescript
const client = new MCPClient({
  transport: 'sse',
  server: {
    url: new URL('https://sse.example.com/mcp'),
    requestInit: {
      headers: {
        'Authorization': 'Bearer your-api-key'
      }
    }
  }
});

await client.connect();
const tools = await client.discoverTools();
```

### 3. Stdio 传输

适用于本地进程通信：

```typescript
const client = new MCPClient({
  transport: 'stdio',
  server: {
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-sequential-thinking']
  }
});

await client.connect();
const tools = await client.discoverTools();
// 使用完毕后断开连接
await client.disconnect();
```

## 与 Mastra MCP 接口兼容

Bagctor 的 MCP 实现提供了与 `@mastra/mcp` 包兼容的接口，使您可以无缝使用 Mastra 文档中的示例：

```typescript
import { MastraMCPClient } from '@bagctor/agent';

// 使用 Stdio 传输
const sequentialThinkingClient = new MastraMCPClient({
  name: 'sequential-thinking',
  server: {
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-sequential-thinking']
  }
});

// 连接到服务器
await sequentialThinkingClient.connect();

// 获取工具
const tools = await sequentialThinkingClient.tools();

// 使用完毕后断开连接
await sequentialThinkingClient.disconnect();
```

## 最佳实践

1. **优先使用注册表**：使用注册表 URL 而不是直接连接服务器，以便自动发现新服务器和工具
2. **缓存服务器定义**：服务器定义和工具已在客户端缓存，无需重复获取
3. **合理管理连接**：使用 `disconnect()` 方法正确关闭连接，特别是使用 SSE 或 stdio 传输时
4. **验证配置**：使用服务器模式验证配置，确保正确性
5. **使用工具集分组**：将相关工具分组到不同的服务器中，便于管理和重用

## 常见问题解答

**问：MCP 注册表和服务器有什么区别？**

答：注册表是集中目录，包含可用 MCP 服务器的列表；服务器提供实际工具和功能。

**问：如何在本地开发时使用 MCP？**

答：可以使用 stdio 传输类型与本地 MCP 服务器进程通信，或设置本地 HTTP/SSE 服务器。

**问：如何处理 MCP 服务器的认证？**

答：通过 `apiKey` 或在 `requestInit` 中提供认证头。

**问：如何调试 MCP 连接问题？**

答：使用 `try/catch` 包装连接代码，捕获并记录详细错误信息。

## 相关资源

- [Mastra MCP 博文](https://mastra.ai/blog/mastra-mcp)
- [MCP 规范文档](https://docs.anthropic.com/mcp/reference)
- [开放工具注册表](https://opentools.com)
- [MCP.run 注册表](https://mcp.run)
- [Bagctor MCP 集成指南](./MCP.md) 