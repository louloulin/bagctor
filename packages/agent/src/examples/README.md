# Bagctor 示例

本目录包含 Bagctor Agent 的示例代码，演示如何使用不同功能和集成方法。

## 示例列表

### 1. 基础智能体演示 (demo.ts)

展示了 Bagctor 的基本功能，包括创建多个智能体并通过工作流进行协作，完成从研究到分析的任务链，并生成结构化输出。

运行方法：
```bash
# 确保在 packages/agent 目录下
npm run build
node dist/examples/demo.js
```

### 2. MCP 集成示例 (mcp-example.ts)

演示如何在 Bagctor 中集成 MCP (Model Context Protocol)，从外部服务器自动发现和使用工具，包括搜索、翻译等功能。

运行方法：
```bash
# 确保在 packages/agent 目录下
npm run build
node dist/examples/mcp-example.js
```

### 3. 分布式部署示例 (distributed-example.ts)

展示如何设置 Bagctor 的分布式部署，配置主节点和工作节点，以及如何在分布式环境中使用智能体。

运行方法：
```bash
# 主节点 (运行在一个终端)
npm run build
node dist/examples/distributed-example.js --mode=primary

# 工作节点 (运行在另一个终端)
npm run build
node dist/examples/distributed-example.js --mode=worker
```

## 注意事项

1. 在运行示例前，请确保已经设置了必要的环境变量。可以在根目录创建 `.env` 文件：

```
QWEN_API_KEY=your_qwen_api_key_here
OPENTOOLS_API_KEY=your_opentools_api_key_here
MCPRUN_API_KEY=your_mcprun_api_key_here
```

2. 所有示例都可以通过修改代码中的参数来适应不同的使用场景。

3. 这些示例仅用于演示目的，在生产环境中使用时，请确保进行适当的错误处理和安全配置。

## 运行所有示例

使用以下命令可以运行所有示例：

```bash
# 确保在 packages/agent 目录下
npm run examples
``` 