# BActor插件系统详细说明

本文档详细介绍了BActor插件系统的两种加载方式：静态加载和动态加载，并提供了开发者指南。

## 插件加载方式比较

| 特性 | 静态加载 (Package.json依赖) | 动态加载 (文件系统/URL) |
|------|--------------------------|----------------------|
| 加载时机 | 构建时 | 运行时 |
| 依赖管理 | 通过包管理器 (npm/yarn/bun) | 手动管理 |
| 版本控制 | 严格的版本控制 | 灵活的版本选择 |
| 更新方式 | 需要重新构建应用 | 可以热更新 |
| 安全性 | 较高 (由包管理器验证) | 需要额外安全措施 |
| 适用场景 | 核心功能插件 | 动态扩展、用户自定义插件 |

## 1. 静态加载方式

### 工作原理

静态加载通过package.json依赖关系来加载插件，这是Node.js生态系统的标准方式：

1. 在package.json中声明插件依赖
2. 通过包管理器安装依赖
3. 在代码中直接导入插件模块
4. 实例化并初始化插件

### 优势

- **可靠性**：构建时验证依赖关系
- **类型安全**：完整的TypeScript类型支持
- **版本控制**：严格控制依赖版本
- **打包优化**：可以通过Tree Shaking优化

### 劣势

- **灵活性低**：更新插件需要重新构建应用
- **无法动态扩展**：不支持运行时添加新功能

### 示例用法

```typescript
// 在package.json中:
// {
//   "dependencies": {
//     "my-static-plugin": "^1.0.0"
//   }
// }

import { loadStaticPlugin } from '@bagctor/plugin';
import MyPlugin from 'my-static-plugin';

// 加载静态插件
const plugin = await loadStaticPlugin(system, MyPlugin, { config: 'value' });

// 使用插件功能
const result = await plugin.handleMessage('some.capability', { data: 'value' });
```

## 2. 动态加载方式

### 工作原理

动态加载允许在运行时从文件系统或远程URL加载插件：

1. 指定插件的本地路径或远程URL
2. 系统在运行时加载插件代码
3. 验证和安装插件
4. 实例化并初始化插件

### 优势

- **灵活性高**：无需重新构建应用即可添加或更新插件
- **用户可扩展**：允许用户上传自己的插件
- **按需加载**：只在需要时加载插件，节省内存

### 劣势

- **安全风险**：需要额外的安全措施防止恶意代码
- **版本兼容性**：需要更复杂的版本管理
- **性能开销**：运行时加载有额外的性能成本

### 示例用法

```typescript
import { loadDynamicPlugin } from '@bagctor/plugin';

// 从本地文件系统加载
const localPlugin = await loadDynamicPlugin(
  system, 
  './plugins/my-local-plugin',
  { config: 'value' }
);

// 从远程URL加载
const remotePlugin = await loadDynamicPlugin(
  system,
  'https://example.com/plugins/my-remote-plugin.zip',
  { config: 'value' }
);

// 使用插件功能
const result = await localPlugin.handleMessage('some.capability', { data: 'value' });
```

## 开发插件指南

### 插件结构

一个标准的BActor插件需要包含：

1. **package.json** - 包含插件元数据和依赖
2. **入口文件** - 导出插件类和/或工厂函数
3. **实现文件** - 包含插件的实际功能

### 开发兼容两种加载方式的插件

为了支持两种加载方式，插件应该：

1. 使用`PluginBase`基类实现`BagctorPlugin`接口
2. 提供默认导出(类)和命名导出(工厂函数)
3. 定义明确的元数据和能力

```typescript
import { BagctorPlugin, PluginBase, PluginMetadata } from '@bagctor/plugin';

// 插件配置接口
export interface MyPluginConfig {
  // 配置选项...
}

// 插件实现
export class MyPlugin extends PluginBase<MyPluginConfig> {
  // 插件元数据
  metadata: PluginMetadata = {
    id: 'my-plugin',
    name: 'My Plugin',
    version: '1.0.0',
    capabilities: ['my.capability']
  };
  
  // 插件初始化
  protected async onInitialize(): Promise<void> {
    // 初始化代码...
  }
  
  // 能力处理方法 - 自动映射到'my.capability'
  async handleCapability(payload: any): Promise<any> {
    // 处理逻辑...
    return { result: 'success' };
  }
}

// 导出工厂函数 - 用于动态加载
export function createPlugin(config?: MyPluginConfig): BagctorPlugin<MyPluginConfig> {
  return new MyPlugin();
}

// 默认导出类 - 用于静态加载
export default MyPlugin;
```

### 最佳实践

1. **依赖管理**：
   - 明确声明所有依赖在package.json中
   - 使用peerDependencies避免重复依赖

2. **错误处理**：
   - 捕获并适当处理所有异常
   - 提供有意义的错误消息

3. **资源管理**：
   - 实现cleanup方法释放资源
   - 避免内存泄漏

4. **安全性**：
   - 验证所有输入数据
   - 限制插件权限范围

5. **文档**：
   - 提供详细的README
   - 文档化所有公共API和配置选项

## 插件安全最佳实践

当使用动态加载插件时，安全性尤为重要：

1. **代码验证**：
   - 实施数字签名验证
   - 使用内容哈希校验完整性

2. **沙箱执行**：
   - 使用隔离的执行环境
   - 限制文件系统和网络访问

3. **权限模型**：
   - 实现细粒度的权限控制
   - 要求插件声明所需权限

4. **资源限制**：
   - 设置CPU和内存使用限制
   - 防止DoS攻击

5. **审计日志**：
   - 记录所有插件活动
   - 设置异常检测机制

---

关于开发和使用BActor插件系统的更多信息，请参阅[BActor文档](https://bagctor.dev/docs)。 