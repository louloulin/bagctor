/**
 * adaptive_dashboard.ts
 * 
 * 提供实时监控自适应HTTP服务器性能的仪表盘组件。
 * 包括请求吞吐量、响应时间、对象池使用情况和资源自适应行为的可视化。
 */

import { Actor } from '@bactor/core';
import { AdaptiveHttpServerActor } from '../core/server/adaptive_http_server';
import { ServerOptions } from '../types';
import { AdaptivePoolStats } from '../core/pool/adaptive_pool';

// 为Bun添加额外的类型
declare global {
  interface Bun {
    file(path: string): { text(): Promise<string> };
  }
}

/**
 * 仪表盘配置选项接口
 */
export interface DashboardOptions {
  /** 仪表盘服务器端口 */
  port?: number;
  /** 仪表盘服务器主机名 */
  hostname?: string;
  /** 数据收集间隔(毫秒) */
  collectIntervalMs?: number;
  /** 历史数据点数量 */
  historyPointsCount?: number;
  /** 是否输出控制台日志 */
  consoleOutput?: boolean;
}

/**
 * 默认仪表盘配置
 */
const DEFAULT_DASHBOARD_OPTIONS: DashboardOptions = {
  port: 8090,
  hostname: 'localhost',
  collectIntervalMs: 1000,
  historyPointsCount: 300, // 5分钟的历史数据(假设1秒收集间隔)
  consoleOutput: true
};

/**
 * 监控数据点接口
 */
interface MonitoringDataPoint {
  /** 时间戳 */
  timestamp: number;
  /** 请求/秒 */
  requestsPerSecond: number;
  /** 平均响应时间(毫秒) */
  avgResponseTimeMs: number;
  /** 各种对象池的活跃对象数 */
  activeObjects: Record<string, number>;
  /** 各种对象池的总大小 */
  poolSizes: Record<string, number>;
  /** 内存使用(MB) */
  memoryUsageMB: number;
  /** 资源调整操作 */
  resizeOperations: Array<{
    poolType: string;
    operation: 'grow' | 'shrink';
    amount: number;
    reason: string;
  }>;
}

/**
 * 监控历史数据接口
 */
interface MonitoringHistory {
  /** 数据点历史记录 */
  dataPoints: MonitoringDataPoint[];
  /** 上次请求计数 */
  lastRequestCount: number;
  /** 上次时间戳 */
  lastTimestamp: number;
  /** 服务器启动时间 */
  serverStartTime: number;
}

/**
 * 自适应HTTP服务器监控仪表盘类
 */
export class AdaptiveDashboard {
  private server: Actor;
  private httpServer: any;
  private options: DashboardOptions;
  private history: MonitoringHistory;
  private collectInterval: NodeJS.Timeout | null = null;
  private resizeOperationsBuffer: MonitoringDataPoint['resizeOperations'] = [];

  /**
   * 创建一个新的监控仪表盘实例
   * 
   * @param server 要监控的自适应HTTP服务器Actor
   * @param options 仪表盘配置选项
   */
  constructor(server: Actor, options: DashboardOptions = {}) {
    this.server = server;
    this.options = { ...DEFAULT_DASHBOARD_OPTIONS, ...options };
    this.history = {
      dataPoints: [],
      lastRequestCount: 0,
      lastTimestamp: Date.now(),
      serverStartTime: Date.now()
    };

    // 绑定方法以便在事件监听器中使用
    this.collectData = this.collectData.bind(this);
    this.handleRequest = this.handleRequest.bind(this);
  }

  /**
   * 启动监控仪表盘
   */
  async start(): Promise<void> {
    // 请求服务器初始状态
    await this.requestInitialServerState();

    // 开始定期收集数据
    this.collectInterval = setInterval(
      this.collectData,
      this.options.collectIntervalMs || DEFAULT_DASHBOARD_OPTIONS.collectIntervalMs
    );

    // 启动仪表盘HTTP服务器
    this.httpServer = Bun.serve({
      port: this.options.port,
      hostname: this.options.hostname,
      fetch: this.handleRequest
    });

    console.log(`📊 监控仪表盘已启动在 http://${this.options.hostname}:${this.options.port}`);
  }

  /**
   * 停止监控仪表盘
   */
  stop(): void {
    if (this.collectInterval) {
      clearInterval(this.collectInterval);
      this.collectInterval = null;
    }

    if (this.httpServer) {
      this.httpServer.stop();
      this.httpServer = null;
    }

    console.log('📊 监控仪表盘已停止');
  }

  /**
   * 记录资源调整操作
   * 
   * @param poolType 池类型
   * @param operation 操作类型
   * @param amount 调整数量
   * @param reason 调整原因
   */
  recordResizeOperation(
    poolType: string,
    operation: 'grow' | 'shrink',
    amount: number,
    reason: string
  ): void {
    this.resizeOperationsBuffer.push({
      poolType,
      operation,
      amount,
      reason
    });
  }

  /**
   * 请求服务器初始状态
   */
  private async requestInitialServerState(): Promise<void> {
    return new Promise((resolve) => {
      this.server.tell({ type: 'status' }, (status) => {
        if (status.running) {
          this.history.serverStartTime = status.startTime || Date.now();
        }
        resolve();
      });
    });
  }

  /**
   * 收集监控数据
   */
  private async collectData(): Promise<void> {
    this.server.tell({ type: 'getStats' }, (stats) => {
      if (!stats) {
        console.warn('无法获取服务器统计信息');
        return;
      }

      const now = Date.now();
      const elapsedSec = (now - this.history.lastTimestamp) / 1000;

      // 计算每秒请求数
      const currentRequests = stats.totalRequests || 0;
      const requestDiff = currentRequests - this.history.lastRequestCount;
      const requestsPerSecond = requestDiff / elapsedSec;

      // 创建数据点
      const dataPoint: MonitoringDataPoint = {
        timestamp: now,
        requestsPerSecond,
        avgResponseTimeMs: stats.avgResponseTime || 0,
        activeObjects: this.extractActiveObjects(stats),
        poolSizes: this.extractPoolSizes(stats),
        memoryUsageMB: this.getMemoryUsage(),
        resizeOperations: [...this.resizeOperationsBuffer]
      };

      // 添加数据点到历史记录
      this.history.dataPoints.push(dataPoint);

      // 如果超过历史记录限制，移除最早的数据点
      const maxHistoryPoints = this.options.historyPointsCount ?? DEFAULT_DASHBOARD_OPTIONS.historyPointsCount ?? 300;
      if (this.history.dataPoints.length > maxHistoryPoints) {
        this.history.dataPoints.shift();
      }

      // 更新上次请求计数和时间戳
      this.history.lastRequestCount = currentRequests;
      this.history.lastTimestamp = now;

      // 清空资源调整操作缓冲区
      this.resizeOperationsBuffer = [];

      // 如果启用了控制台输出，输出统计信息
      if (this.options.consoleOutput) {
        this.logStats(dataPoint);
      }
    });
  }

  /**
   * 提取活跃对象数量
   */
  private extractActiveObjects(stats: any): Record<string, number> {
    const result: Record<string, number> = {};

    if (stats.pools) {
      for (const [poolName, poolStats] of Object.entries<any>(stats.pools)) {
        result[poolName] = poolStats.activeObjects ?? poolStats.active ?? 0;
      }
    }

    return result;
  }

  /**
   * 提取对象池大小
   */
  private extractPoolSizes(stats: any): Record<string, number> {
    const result: Record<string, number> = {};

    if (stats.pools) {
      for (const [poolName, poolStats] of Object.entries<AdaptivePoolStats>(stats.pools)) {
        result[poolName] = poolStats.size;
      }
    }

    return result;
  }

  /**
   * 获取内存使用量
   */
  private getMemoryUsage(): number {
    // Bun环境中的内存使用获取
    const memoryUsage = process.memoryUsage();
    return Math.round(memoryUsage.heapUsed / 1024 / 1024); // 转换为MB
  }

  /**
   * 输出统计信息到控制台
   */
  private logStats(dataPoint: MonitoringDataPoint): void {
    console.log('\n===== 自适应HTTP服务器监控 =====');
    console.log(`时间: ${new Date(dataPoint.timestamp).toISOString()}`);
    console.log(`请求/秒: ${dataPoint.requestsPerSecond.toFixed(2)}`);
    console.log(`平均响应时间: ${dataPoint.avgResponseTimeMs.toFixed(2)}ms`);
    console.log('活跃对象:');
    for (const [poolName, count] of Object.entries(dataPoint.activeObjects)) {
      console.log(`  - ${poolName}: ${count}`);
    }
    console.log('对象池大小:');
    for (const [poolName, size] of Object.entries(dataPoint.poolSizes)) {
      console.log(`  - ${poolName}: ${size}`);
    }
    console.log(`内存使用: ${dataPoint.memoryUsageMB}MB`);
    if (dataPoint.resizeOperations.length > 0) {
      console.log('资源调整操作:');
      for (const op of dataPoint.resizeOperations) {
        console.log(`  - ${op.poolType}: ${op.operation} by ${op.amount} (${op.reason})`);
      }
    }
    console.log('===============================\n');
  }

  /**
   * 处理HTTP请求
   */
  private async handleRequest(request: Request): Promise<Response> {
    const url = new URL(request.url);

    // 服务API端点
    if (url.pathname === '/api/data') {
      return new Response(JSON.stringify({
        history: this.history.dataPoints,
        serverUptime: Date.now() - this.history.serverStartTime
      }), {
        headers: {
          'Content-Type': 'application/json',
          'Cache-Control': 'no-cache',
        }
      });
    }

    // 服务主页
    return new Response(await this.getDashboardHtml(), {
      headers: {
        'Content-Type': 'text/html',
        'Cache-Control': 'no-cache',
      }
    });
  }

  /**
   * 获取仪表盘HTML
   */
  private async getDashboardHtml(): Promise<string> {
    return `
<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>自适应HTTP服务器监控仪表盘</title>
  <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
  <style>
    body {
      font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
      margin: 0;
      padding: 0;
      background-color: #f8f9fa;
      color: #333;
    }
    .container {
      max-width: 1200px;
      margin: 0 auto;
      padding: 20px;
    }
    header {
      background-color: #333;
      color: white;
      padding: 1em;
      margin-bottom: 20px;
      border-radius: 5px;
    }
    h1 {
      margin: 0;
      font-size: 1.8em;
    }
    .stats-summary {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
      gap: 15px;
      margin-bottom: 20px;
    }
    .stat-card {
      background-color: white;
      border-radius: 5px;
      padding: 15px;
      box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
    }
    .stat-card h3 {
      margin-top: 0;
      color: #555;
      font-size: 1em;
    }
    .stat-card .value {
      font-size: 2em;
      font-weight: bold;
      color: #0066ff;
    }
    .chart-container {
      background-color: white;
      border-radius: 5px;
      padding: 15px;
      margin-bottom: 20px;
      box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
    }
    .chart-row {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(500px, 1fr));
      gap: 20px;
      margin-bottom: 20px;
    }
    .activity-log {
      background-color: white;
      border-radius: 5px;
      padding: 15px;
      box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
      height: 200px;
      overflow-y: auto;
    }
    .activity-log h2 {
      margin-top: 0;
    }
    .log-entry {
      border-bottom: 1px solid #eee;
      padding: 8px 0;
    }
    .grow {
      color: #28a745;
    }
    .shrink {
      color: #dc3545;
    }
    footer {
      text-align: center;
      margin-top: 40px;
      color: #777;
      font-size: 0.9em;
    }
    @media (max-width: 768px) {
      .chart-row {
        grid-template-columns: 1fr;
      }
    }
  </style>
</head>
<body>
  <div class="container">
    <header>
      <h1>自适应HTTP服务器监控仪表盘</h1>
      <div id="server-uptime">服务器运行时间: 计算中...</div>
    </header>

    <div class="stats-summary">
      <div class="stat-card">
        <h3>请求/秒</h3>
        <div id="rps" class="value">--</div>
      </div>
      <div class="stat-card">
        <h3>平均响应时间</h3>
        <div id="response-time" class="value">-- ms</div>
      </div>
      <div class="stat-card">
        <h3>活跃对象总数</h3>
        <div id="active-objects" class="value">--</div>
      </div>
      <div class="stat-card">
        <h3>内存使用</h3>
        <div id="memory-usage" class="value">-- MB</div>
      </div>
    </div>

    <div class="chart-row">
      <div class="chart-container">
        <h2>请求处理性能</h2>
        <canvas id="performance-chart"></canvas>
      </div>
      <div class="chart-container">
        <h2>资源使用</h2>
        <canvas id="resource-chart"></canvas>
      </div>
    </div>

    <div class="chart-row">
      <div class="chart-container">
        <h2>对象池使用情况</h2>
        <canvas id="pool-usage-chart"></canvas>
      </div>
      <div class="chart-container">
        <h2>对象池大小变化</h2>
        <canvas id="pool-size-chart"></canvas>
      </div>
    </div>

    <div class="activity-log">
      <h2>资源调整历史</h2>
      <div id="resize-log"></div>
    </div>

    <footer>
      <p>自适应HTTP服务器监控仪表盘 | 刷新间隔: ${this.options.collectIntervalMs}ms</p>
    </footer>
  </div>

  <script>
    // 图表配置
    const chartOptions = {
      animation: false,
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        x: {
          grid: {
            display: false
          }
        },
        y: {
          beginAtZero: true
        }
      },
      elements: {
        point: {
          radius: 0
        },
        line: {
          tension: 0.2
        }
      },
      plugins: {
        legend: {
          position: 'top'
        }
      }
    };

    // 初始化图表
    const performanceCtx = document.getElementById('performance-chart').getContext('2d');
    const resourceCtx = document.getElementById('resource-chart').getContext('2d');
    const poolUsageCtx = document.getElementById('pool-usage-chart').getContext('2d');
    const poolSizeCtx = document.getElementById('pool-size-chart').getContext('2d');

    const perfChart = new Chart(performanceCtx, {
      type: 'line',
      data: {
        labels: [],
        datasets: [
          {
            label: '请求/秒',
            data: [],
            borderColor: '#0066ff',
            backgroundColor: 'rgba(0, 102, 255, 0.1)',
            fill: true
          },
          {
            label: '响应时间(ms)',
            data: [],
            borderColor: '#ff6b6b',
            backgroundColor: 'rgba(255, 107, 107, 0.1)',
            fill: true,
            yAxisID: 'y1'
          }
        ]
      },
      options: {
        ...chartOptions,
        scales: {
          ...chartOptions.scales,
          y: {
            beginAtZero: true,
            title: {
              display: true,
              text: '请求/秒'
            }
          },
          y1: {
            beginAtZero: true,
            position: 'right',
            title: {
              display: true,
              text: '响应时间(ms)'
            },
            grid: {
              drawOnChartArea: false
            }
          }
        }
      }
    });

    const resourceChart = new Chart(resourceCtx, {
      type: 'line',
      data: {
        labels: [],
        datasets: [
          {
            label: '内存使用(MB)',
            data: [],
            borderColor: '#20c997',
            backgroundColor: 'rgba(32, 201, 151, 0.1)',
            fill: true
          }
        ]
      },
      options: chartOptions
    });

    const poolUsageChart = new Chart(poolUsageCtx, {
      type: 'line',
      data: {
        labels: [],
        datasets: []
      },
      options: chartOptions
    });

    const poolSizeChart = new Chart(poolSizeCtx, {
      type: 'line',
      data: {
        labels: [],
        datasets: []
      },
      options: chartOptions
    });

    // 颜色生成器
    function getPoolColor(index) {
      const colors = [
        '#0066ff', '#ff6b6b', '#20c997', '#ffa500', 
        '#9370db', '#3cb371', '#ff6347', '#4682b4'
      ];
      return colors[index % colors.length];
    }

    // 格式化时间戳为HH:MM:SS
    function formatTimestamp(timestamp) {
      const date = new Date(timestamp);
      return date.toLocaleTimeString();
    }

    // 格式化时间差为可读格式
    function formatUptime(ms) {
      const seconds = Math.floor(ms / 1000);
      const minutes = Math.floor(seconds / 60);
      const hours = Math.floor(minutes / 60);
      const days = Math.floor(hours / 24);
      
      return \`\${days}天 \${hours % 24}小时 \${minutes % 60}分钟 \${seconds % 60}秒\`;
    }

    // 保持数据集与池类型同步
    function syncPoolDatasets(chart, poolTypes, accessor, labelPrefix = '') {
      const currentLabels = chart.data.datasets.map(ds => ds.label);
      
      // 添加新的池类型数据集
      for (const poolType of poolTypes) {
        const label = labelPrefix + poolType;
        if (!currentLabels.includes(label)) {
          const index = chart.data.datasets.length;
          chart.data.datasets.push({
            label,
            data: Array(chart.data.labels.length).fill(null),
            borderColor: getPoolColor(index),
            backgroundColor: 'transparent'
          });
        }
      }

      // 返回池类型到数据集索引的映射
      return poolTypes.reduce((map, poolType, i) => {
        const label = labelPrefix + poolType;
        const index = chart.data.datasets.findIndex(ds => ds.label === label);
        if (index !== -1) {
          map[poolType] = index;
        }
        return map;
      }, {});
    }

    // 更新日志
    function updateResizeLog(resizeOperations) {
      const logContainer = document.getElementById('resize-log');
      
      for (const op of resizeOperations) {
        const entry = document.createElement('div');
        entry.className = 'log-entry';
        
        const timestamp = new Date().toLocaleTimeString();
        const operationClass = op.operation === 'grow' ? 'grow' : 'shrink';
        
        entry.innerHTML = \`
          <span>\${timestamp}</span> - 
          <span>\${op.poolType}</span> 
          <strong class="\${operationClass}">\${op.operation === 'grow' ? '增加' : '减少'} \${op.amount}</strong> 
          <span>(\${op.reason})</span>
        \`;
        
        logContainer.prepend(entry);
      }
      
      // 限制日志条目数
      while (logContainer.children.length > 100) {
        logContainer.removeChild(logContainer.lastChild);
      }
    }

    // 定时更新数据
    async function fetchAndUpdateData() {
      try {
        const response = await fetch('/api/data');
        const data = await response.json();
        
        if (!data.history || data.history.length === 0) {
          setTimeout(fetchAndUpdateData, 1000);
          return;
        }
        
        // 更新服务器运行时间
        document.getElementById('server-uptime').textContent = 
          '服务器运行时间: ' + formatUptime(data.serverUptime);
        
        // 获取最新数据点
        const latestData = data.history[data.history.length - 1];
        
        // 更新概览数据
        document.getElementById('rps').textContent = 
          latestData.requestsPerSecond.toFixed(2);
        document.getElementById('response-time').textContent = 
          latestData.avgResponseTimeMs.toFixed(2) + ' ms';
        
        const totalActiveObjects = Object.values(latestData.activeObjects)
          .reduce((sum, val) => sum + val, 0);
        document.getElementById('active-objects').textContent = 
          totalActiveObjects;
        
        document.getElementById('memory-usage').textContent = 
          latestData.memoryUsageMB + ' MB';
        
        // 准备图表数据
        const timestamps = data.history.map(d => formatTimestamp(d.timestamp));
        const rpsData = data.history.map(d => d.requestsPerSecond);
        const responseTimeData = data.history.map(d => d.avgResponseTimeMs);
        const memoryData = data.history.map(d => d.memoryUsageMB);
        
        // 获取所有的池类型
        const poolTypes = Array.from(
          new Set(
            data.history.flatMap(d => 
              [...Object.keys(d.activeObjects), ...Object.keys(d.poolSizes)]
            )
          )
        );
        
        // 同步池使用图表数据集
        const poolUsageIndices = syncPoolDatasets(
          poolUsageChart, 
          poolTypes, 
          'activeObjects', 
          '活跃: '
        );
        
        // 同步池大小图表数据集
        const poolSizeIndices = syncPoolDatasets(
          poolSizeChart, 
          poolTypes, 
          'poolSizes', 
          '大小: '
        );
        
        // 更新性能图表
        perfChart.data.labels = timestamps;
        perfChart.data.datasets[0].data = rpsData;
        perfChart.data.datasets[1].data = responseTimeData;
        
        // 更新资源图表
        resourceChart.data.labels = timestamps;
        resourceChart.data.datasets[0].data = memoryData;
        
        // 更新池使用图表
        poolUsageChart.data.labels = timestamps;
        for (const point of data.history) {
          for (const [poolType, count] of Object.entries(point.activeObjects)) {
            const index = poolUsageIndices[poolType];
            if (index !== undefined) {
              const pointIndex = data.history.indexOf(point);
              poolUsageChart.data.datasets[index].data[pointIndex] = count;
            }
          }
        }
        
        // 更新池大小图表
        poolSizeChart.data.labels = timestamps;
        for (const point of data.history) {
          for (const [poolType, size] of Object.entries(point.poolSizes)) {
            const index = poolSizeIndices[poolType];
            if (index !== undefined) {
              const pointIndex = data.history.indexOf(point);
              poolSizeChart.data.datasets[index].data[pointIndex] = size;
            }
          }
        }
        
        // 更新图表
        perfChart.update();
        resourceChart.update();
        poolUsageChart.update();
        poolSizeChart.update();
        
        // 更新资源调整日志
        if (latestData.resizeOperations.length > 0) {
          updateResizeLog(latestData.resizeOperations);
        }
      } catch (error) {
        console.error('获取数据失败:', error);
      }
      
      // 继续轮询
      setTimeout(fetchAndUpdateData, ${this.options.collectIntervalMs});
    }

    // 启动数据更新
    fetchAndUpdateData();
  </script>
</body>
</html>
    `;
  }
}

/**
 * 创建并启动监控仪表盘
 * 
 * @param server 要监控的自适应HTTP服务器Actor
 * @param options 仪表盘配置选项
 * @returns 创建的仪表盘实例
 */
export function createDashboard(
  server: Actor,
  options: DashboardOptions = {}
): AdaptiveDashboard {
  const dashboard = new AdaptiveDashboard(server, options);
  dashboard.start();
  return dashboard;
} 