# Bagctor 监控仪表板

这是Bagctor Actor系统的监控仪表板，使用Next.js和Tailwind CSS构建，提供实时系统指标、告警管理和Actor状态可视化。

## 功能特点

- **实时指标监控**：CPU、内存、网络吞吐量和磁盘使用情况
- **Actor系统统计**：Actor数量、状态分布、创建/重启率
- **消息传递分析**：消息速率、处理时间、待处理队列
- **告警管理**：根据严重性分组的告警、状态过滤、时间轴视图
- **响应式设计**：适配桌面和移动设备的直观界面

## 技术栈

- **Next.js**: React框架，提供服务端渲染和API路由
- **Tailwind CSS**: 实用优先的CSS框架
- **ApexCharts**: 交互式图表库
- **TypeScript**: 类型安全的JavaScript超集

## 开始使用

### 前提条件

- Node.js 18.0或更高版本
- npm 或 yarn
- Bagctor核心系统已运行（或使用模拟数据模式）

### 安装

1. 克隆仓库
   ```bash
   git clone [仓库URL]
   cd bagctor/packages/dashboard
   ```

2. 安装依赖
   ```bash
   npm install
   # 或
   yarn install
   ```

3. 开发模式运行
   ```bash
   npm run dev
   # 或
   yarn dev
   ```

4. 构建生产版本
   ```bash
   npm run build
   # 或
   yarn build
   ```

5. 启动生产服务器
   ```bash
   npm run start
   # 或
   yarn start
   ```

## 配置

编辑`.env.local`文件（如果不存在请创建）来配置环境变量：

```
# API连接
NEXT_PUBLIC_API_URL=http://localhost:3000/api

# 刷新间隔（秒）
NEXT_PUBLIC_DEFAULT_REFRESH_INTERVAL=30

# 认证（如果需要）
NEXT_PUBLIC_AUTH_ENABLED=false
```

## 项目结构

```
packages/dashboard/
├── components/        # 可复用UI组件
│   ├── dashboard/     # 仪表板特定组件
│   ├── layout/        # 布局组件
│   └── ui/            # 通用UI元素
├── pages/             # 页面和API路由
│   ├── api/           # 后端API端点
│   ├── _app.tsx       # 应用入口
│   ├── index.tsx      # 主仪表板
│   ├── metrics.tsx    # 详细指标页面
│   └── alerts.tsx     # 告警管理页面
├── public/            # 静态资源
├── styles/            # 全局样式
├── types/             # TypeScript类型定义
└── utils/             # 实用函数
```

## 开发指南

### 添加新图表

1. 在`components/dashboard/`目录中创建新的图表组件
2. 利用`ApexCharts`库或其他可视化工具
3. 在相关页面中导入并使用该组件

### 连接到实际API

目前，仪表板使用本地API路由提供模拟数据。要连接到实际的Bagctor监控API：

1. 在`pages/api/`目录中修改相应的API路由处理程序
2. 更新fetch URL指向实际API端点
3. 适配数据格式以匹配实际API响应

## 贡献

欢迎提交问题报告和拉取请求！贡献前请先查看我们的贡献指南。

## 许可证

MIT
