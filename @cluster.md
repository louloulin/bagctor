# Bactor 集群功能设计文档

## 概述

Bactor 集群功能允许多个 Bactor 实例组成一个分布式 Actor 系统，提供以下核心能力：

- [x] 节点发现与自动加入集群
- [x] 故障检测与恢复
- [x] Actor 放置与路由
- [x] 消息传递与状态同步
- [x] 负载均衡与扩缩容
- [x] 背压管理
- [x] 集群指标与监控

## 组件设计

### ClusterManager

**[已实现]** 集群管理器，负责协调所有集群功能。

```typescript
export class ClusterManager extends EventEmitter {
    // ... 实现细节 ...
}
```

主要功能:
- [x] 集群状态维护
- [x] 节点管理
- [x] 故障检测协调
- [x] Actor 放置策略
- [x] 消息路由

### 集群通信

**[已实现]** 负责节点间通信的传输层。

```typescript
export class LibP2pClusterTransport extends EventEmitter {
    // ... 实现细节 ...
}
```

主要功能:
- [x] 点对点通信
- [x] 集群范围广播
- [x] 消息序列化与反序列化
- [x] 连接管理

### 故障检测

**[已实现]** 故障检测与共识机制。

```typescript
export class FailureDetectionConsensus extends EventEmitter {
    // ... 实现细节 ...
}
```

主要功能:
- [x] 心跳机制
- [x] 基于投票的故障检测
- [x] 网络分区检测
- [x] 节点恢复处理

### Actor 放置

**[已实现]** Actor 在集群中的放置策略。

```typescript
export class ConsistentHashActorPlacement {
    // ... 实现细节 ...
}
```

主要功能:
- [x] 一致性哈希算法
- [x] Actor 迁移
- [x] 虚拟节点
- [x] 负载感知放置

### 系统指标采集

**[已实现]** 收集系统性能指标。

```typescript
export class SystemMetricsCollector {
    // ... 实现细节 ...
}
```

主要功能:
- [x] CPU 使用率采集
- [x] 内存使用率采集
- [x] 消息处理速率
- [x] Actor 数量统计

### 背压机制

**[已实现]** 系统过载保护。

```typescript
export class BackpressureManager {
    // ... 实现细节 ...
}
```

主要功能:
- [x] 三种策略: DROP, THROTTLE, BUFFER
- [x] 动态阈值调整
- [x] 适应性恢复
- [x] 过载警报

## 接口定义

### 类型定义

**[已实现]** 主要类型定义已完成，包括：

- [x] `NodeInfo`: 节点信息
- [x] `ClusterState`: 集群状态
- [x] `ClusterConfig`: 集群配置
- [x] `BackpressureConfig`: 背压配置
- [x] `PartitionConfig`: 分区配置
- [x] `LoadBalancingConfig`: 负载均衡配置

### 事件

**[已实现]** 集群事件系统：

- [x] 节点加入/离开事件
- [x] 故障检测事件
- [x] 分区检测事件
- [x] 状态变更事件
- [x] 背压事件

## 配置示例

```typescript
const clusterConfig: ClusterConfig = {
    nodeId: 'node-1',
    heartbeatInterval: 1000,
    failureDetectionTimeout: 5000,
    partitionDetectionTimeout: 10000,
    bootstrapList: ['node-0.example.com:8080'],
    listenAddresses: ['/ip4/0.0.0.0/tcp/8080'],
    enableDHT: true,
    enablePubSub: true,
    enableGossip: true
};

const loadBalancingConfig: LoadBalancingConfig = {
    strategy: LoadBalancingStrategy.LEAST_LOADED,
    thresholds: {
        cpu: 80,
        memory: 80,
        messageRate: 1000,
        actorCount: 1000
    },
    rebalanceInterval: 60000
};

const backpressureConfig: BackpressureConfig = {
    enabled: true,
    strategy: BackpressureStrategy.ADAPTIVE,
    thresholds: {
        messageRate: 10000,
        queueSize: 1000,
        processingTime: 100,
        errorRate: 0.1,
        cpuUsage: 80,
        memoryUsage: 80
    },
    recoveryPolicy: RecoveryPolicy.GRADUAL,
    samplingInterval: 1000
};

const clusterManager = new ClusterManager(
    clusterConfig,
    loadBalancingConfig,
    undefined, // partitionConfig
    backpressureConfig
);
```

## 未来扩展

- [ ] 分区容错与数据复制
- [ ] 跨数据中心部署
- [ ] 加密通信通道
- [ ] 认证与授权
- [ ] 集群运维管理工具
- [ ] 与云平台集成 