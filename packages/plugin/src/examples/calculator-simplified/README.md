# BActor 简化插件系统

这个示例展示了如何使用新设计的简化插件接口来创建和使用插件。

## 设计亮点

新的插件系统设计提供了以下优势：

1. **更简单的插件接口**：通过抽象基类减少样板代码
2. **约定优于配置**：自动映射功能处理器到消息类型
3. **更好的类型安全**：利用TypeScript的泛型实现强类型支持
4. **分离关注点**：业务逻辑与Actor系统机制分离

## 项目结构

```
packages/plugin/
├── src/
│   ├── core/
│   │   └── plugin_base.ts      # 核心插件接口和基类
│   ├── adapters/
│   │   └── plugin_adapter.ts   # 适配器将新接口集成到Actor系统
│   ├── examples/
│   │   ├── calculator-simplified/
│   │   │   ├── src/
│   │   │   │   ├── index.ts    # 简化的计算器插件实现
│   │   │   └── README.md       # 本文档
│   │   ├── plugin_demo.ts      # 演示脚本
│   │   └── run_plugin_demo.ts  # 启动脚本
```

## 如何运行

### 前提条件

- 已安装Bun运行时环境
- 已克隆本仓库并安装依赖 (`bun install`)

### 运行演示

```bash
# 从项目根目录
cd packages/plugin/src/examples
bun run run_plugin_demo.ts
```

## 插件接口说明

### 1. 核心接口

```typescript
// 插件基本接口
interface BagctorPlugin<TConfig = any> {
  metadata: PluginMetadata;
  initialize(context: PluginContext, config: TConfig): Promise<void>;
  handleMessage<T = any>(type: string, payload: any): Promise<T>;
  cleanup(): Promise<void>;
}

// 插件上下文接口
interface PluginContext {
  send(target: string | PID, type: string, payload: any): Promise<void>;
  registerHandler(messageType: string, handler: Function): void;
  getPluginId(): string;
  log: typeof log;
}
```

### 2. 使用PluginBase简化插件创建

```typescript
// 简化的计算器插件实现
export class CalculatorPlugin extends PluginBase<CalculatorConfig> {
  // 定义插件元数据
  metadata: PluginMetadata = {
    id: 'calculator',
    name: 'Calculator Plugin',
    capabilities: ['calculator.calculate']
  };

  // 自动映射到calculator.calculate消息类型
  async handleCalculate(payload: CalculatorOperation): Promise<CalculatorResult> {
    // 实现计算逻辑...
  }
}
```

## 消息流程

1. Actor系统发送消息给插件Actor
2. 插件适配器接收消息并调用插件的handleMessage方法
3. 插件处理消息并返回结果
4. 适配器将结果作为响应发送回原始发送者

## 示例演示功能

演示脚本展示了以下功能：

1. 创建和初始化计算器插件
2. 发送各种计算操作 (加、减、乘、除) 
3. 处理正常计算结果
4. 处理错误情况 (除零、无效操作、参数过多)
5. 适当清理资源

## 下一步开发

- 添加插件依赖管理
- 实现插件热加载
- 开发更多示例插件
- 提供插件发现和商店机制 