# 多方式加载插件示例

这个示例展示了如何通过两种不同的方式加载BActor插件：

1. **Package.json依赖方式** - 通过package.json声明依赖并安装
2. **动态加载方式** - 在运行时动态加载插件

## 项目结构

```
multi-loader-demo/
├── README.md                 # 本文档
├── src/                      # 主程序源码
│   ├── index.ts              # 入口点
│   └── plugin-loader.ts      # 插件加载器
├── plugins/                  # 插件目录
│   ├── static-plugin/        # 静态加载的插件
│   │   ├── package.json      # 插件包描述
│   │   └── src/              # 插件源码
│   │       └── index.ts      # 插件实现
│   └── dynamic-plugin/       # 动态加载的插件
│       ├── package.json      # 插件包描述
│       └── src/              # 插件源码
│           └── index.ts      # 插件实现
└── package.json              # 示例程序包描述
```

## 两种加载方式的区别

### 1. Package.json依赖方式

这种方式通过在主应用的package.json中声明插件依赖，然后通过包管理器安装：

```json
{
  "dependencies": {
    "my-static-plugin": "^1.0.0"
  }
}
```

然后在代码中引用：

```typescript
import { loadPlugin } from './plugin-loader';
import MyStaticPlugin from 'my-static-plugin';

// 加载静态插件
const plugin = await loadPlugin(MyStaticPlugin);
```

### 2. 动态加载方式

这种方式允许在运行时从文件系统、URL或其他来源动态加载插件：

```typescript
import { loadDynamicPlugin } from './plugin-loader';

// 从文件系统加载
const plugin1 = await loadDynamicPlugin('./plugins/dynamic-plugin');

// 从远程URL加载
const plugin2 = await loadDynamicPlugin('https://example.com/plugins/my-plugin.js');
```

## 运行示例

```bash
# 安装依赖
cd packages/plugin/examples/multi-loader-demo
bun install

# 运行示例
bun run start
```

## 插件开发指南

查看各个插件目录中的README了解如何开发兼容这两种加载方式的插件。 