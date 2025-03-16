/**
 * adaptive_server_with_dashboard.ts
 * 
 * 示例文件：展示如何使用自适应HTTP服务器和监控仪表盘，
 * 包含不同类型的路由和如何模拟不同负载场景。
 */

import { createActorSystem } from 'bactor';
import { createAdaptiveHttpServer } from '../src/core/server/adaptive_http_server';
import { createDashboard } from '../src/monitoring/adaptive_dashboard';
import { AdaptivePoolOptions } from '../src/core/pool/adaptive_pool';

// 配置
const SERVER_PORT = 3000;
const DASHBOARD_PORT = 8090;

/**
 * 自适应对象池配置
 */
const poolOptions: AdaptivePoolOptions = {
    initialSize: 100,         // 初始大小
    maxSize: 2000,            // 最大大小
    minSize: 50,              // 最小大小
    adaptiveResizing: true,   // 启用自适应调整
    adaptiveCheckIntervalMs: 2000, // 每2秒检查一次
    minGrowRatio: 0.7,        // 当使用率超过70%时增长
    minShrinkRatio: 0.3,      // 当使用率低于30%时收缩
    growStepRatio: 0.2,       // 每次增长20%
    shrinkStepRatio: 0.1      // 每次收缩10%
};

async function main() {
    console.log('启动自适应HTTP服务器示例 (带监控仪表盘)');

    // 创建Actor系统
    const system = createActorSystem();

    // 创建自适应HTTP服务器
    const server = createAdaptiveHttpServer(system, {
        port: SERVER_PORT,
        hostname: '0.0.0.0',
        poolOptions,
        enableAutoTrafficBurstPreparation: true,   // 自动准备流量突发
        trafficBurstThresholdPercent: 40,          // 流量增长40%触发突发准备
        loadMonitorIntervalMs: 5000,               // 每5秒监控一次负载
        debug: true                                // 启用调试日志
    });

    // 创建基本路由
    server.tell({
        type: 'addRoute',
        method: 'GET',
        path: '/',
        handler: async (ctx) => {
            // 提供一个HTML页面，显示服务器信息和测试按钮
            const html = `
        <!DOCTYPE html>
        <html>
        <head>
          <title>自适应HTTP服务器演示</title>
          <style>
            body { 
              font-family: system-ui, sans-serif; 
              max-width: 800px; 
              margin: 0 auto; 
              padding: 20px;
            }
            .card {
              background: #f7f9fc;
              border-radius: 8px;
              padding: 20px;
              margin-bottom: 20px;
              box-shadow: 0 2px 10px rgba(0,0,0,0.05);
            }
            .buttons {
              display: grid;
              grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
              gap: 10px;
              margin: 20px 0;
            }
            button {
              padding: 10px;
              border: none;
              border-radius: 4px;
              background: #0066ff;
              color: white;
              cursor: pointer;
              font-size: 14px;
            }
            button:hover {
              background: #0052cc;
            }
            h1 { margin-top: 0; }
            pre { 
              background: #f0f0f0; 
              padding: 10px; 
              border-radius: 4px; 
              overflow-x: auto;
            }
            .info {
              display: grid;
              grid-template-columns: 1fr 1fr;
              gap: 10px;
            }
          </style>
        </head>
        <body>
          <h1>自适应HTTP服务器演示</h1>
          
          <div class="card">
            <h2>服务器信息</h2>
            <div class="info">
              <div>
                <p><strong>服务器地址:</strong> http://localhost:${SERVER_PORT}</p>
                <p><strong>监控仪表盘:</strong> <a href="http://localhost:${DASHBOARD_PORT}" target="_blank">打开仪表盘</a></p>
              </div>
              <div>
                <p><strong>对象池:</strong> 自适应 (${poolOptions.initialSize} → ${poolOptions.maxSize})</p>
                <p><strong>自动突发准备:</strong> 已启用 (阈值: ${40}%)</p>
              </div>
            </div>
          </div>

          <div class="card">
            <h2>负载测试</h2>
            <p>点击下面的按钮生成不同级别的负载，观察仪表盘上的变化：</p>
            
            <div class="buttons">
              <button onclick="generateLoad('light')">生成轻度负载</button>
              <button onclick="generateLoad('medium')">生成中度负载</button>
              <button onclick="generateLoad('heavy')">生成重度负载</button>
              <button onclick="prepareBurst()">手动准备突发</button>
            </div>
            
            <div id="result"></div>
          </div>

          <div class="card">
            <h2>服务器统计</h2>
            <button onclick="fetchStats()">刷新统计数据</button>
            <pre id="stats">点击刷新按钮查看统计数据...</pre>
          </div>

          <script>
            async function generateLoad(level) {
              const resultDiv = document.getElementById('result');
              resultDiv.innerHTML = '正在生成' + level + '负载...';
              
              try {
                const response = await fetch('/api/generate-load/' + level);
                const data = await response.json();
                resultDiv.innerHTML = \`生成负载成功: \${data.message}\`;
              } catch (error) {
                resultDiv.innerHTML = '负载生成失败: ' + error.message;
              }
            }

            async function prepareBurst() {
              const resultDiv = document.getElementById('result');
              resultDiv.innerHTML = '手动准备突发负载...';
              
              try {
                const response = await fetch('/api/prepare-burst', { method: 'POST' });
                const data = await response.json();
                resultDiv.innerHTML = \`突发准备成功: \${data.message}\`;
              } catch (error) {
                resultDiv.innerHTML = '突发准备失败: ' + error.message;
              }
            }

            async function fetchStats() {
              const statsElement = document.getElementById('stats');
              statsElement.innerHTML = '加载中...';
              
              try {
                const response = await fetch('/api/stats');
                const stats = await response.json();
                statsElement.innerHTML = JSON.stringify(stats, null, 2);
              } catch (error) {
                statsElement.innerHTML = '获取统计数据失败: ' + error.message;
              }
            }
          </script>
        </body>
        </html>
      `;
            ctx.response.headers['Content-Type'] = 'text/html';
            ctx.response.body = html;
        }
    });

    // API路由：获取统计数据
    server.tell({
        type: 'addRoute',
        method: 'GET',
        path: '/api/stats',
        handler: async (ctx) => {
            // 这会返回服务器内部状态的统计数据
            server.tell({ type: 'getStats' }, (statsData) => {
                ctx.response.headers['Content-Type'] = 'application/json';
                ctx.response.body = JSON.stringify(statsData);
            });
        }
    });

    // API路由：生成不同级别的负载
    server.tell({
        type: 'addRoute',
        method: 'GET',
        path: '/api/generate-load/:level',
        handler: async (ctx) => {
            // 提取参数
            const level = ctx.request.params.level;

            // 每个级别的请求数和延迟
            const loadLevels = {
                'light': { requests: 100, delayMs: 5 },  // 轻度负载：100请求，5ms延迟
                'medium': { requests: 500, delayMs: 10 }, // 中度负载：500请求，10ms延迟
                'heavy': { requests: 1000, delayMs: 20 }  // 重度负载：1000请求，20ms延迟
            };

            const config = loadLevels[level] || loadLevels.light;

            // 启动异步生成负载的过程（不阻塞响应）
            setTimeout(() => {
                generateLoad(config.requests, config.delayMs);
            }, 0);

            ctx.response.headers['Content-Type'] = 'application/json';
            ctx.response.body = JSON.stringify({
                message: `已启动${level}负载生成：${config.requests}个请求，每个延迟${config.delayMs}ms`
            });
        }
    });

    // API路由：手动准备突发
    server.tell({
        type: 'addRoute',
        method: 'POST',
        path: '/api/prepare-burst',
        handler: async (ctx) => {
            // 告诉服务器准备流量突发（预留2倍资源）
            server.tell({
                type: 'prepareForTrafficBurst',
                factor: 2.0
            });

            ctx.response.headers['Content-Type'] = 'application/json';
            ctx.response.body = JSON.stringify({
                message: '服务器已准备好处理2倍流量突发'
            });
        }
    });

    // 模拟生成负载的方法
    function generateLoad(requestCount, delayMs) {
        console.log(`生成${requestCount}个请求，每个延迟${delayMs}ms`);

        // 生成并发请求
        const batchSize = 20; // 同时发送的请求数
        const batches = Math.ceil(requestCount / batchSize);

        let completedRequests = 0;

        for (let i = 0; i < batches; i++) {
            setTimeout(() => {
                const thisBatchSize = Math.min(batchSize, requestCount - i * batchSize);

                for (let j = 0; j < thisBatchSize; j++) {
                    // 模拟请求处理
                    setTimeout(() => {
                        const level = Math.floor(Math.random() * 5) + 1;
                        // 随机选择一个测试路由
                        fetch(`http://localhost:${SERVER_PORT}/test/${level}`).then(() => {
                            completedRequests++;
                            if (completedRequests === requestCount) {
                                console.log(`负载生成完成：${requestCount}个请求`);
                            }
                        });
                    }, Math.random() * 100); // 每个请求随机延迟0-100ms发送
                }
            }, i * 200); // 每批次间隔200ms
        }
    }

    // 添加测试路由（用于负载生成）
    for (let i = 1; i <= 5; i++) {
        server.tell({
            type: 'addRoute',
            method: 'GET',
            path: `/test/${i}`,
            handler: async (ctx) => {
                // 根据路径参数执行不同的处理时间
                const processingTime = i * 10; // 路径参数决定处理时间

                // 模拟处理时间
                await new Promise(resolve => setTimeout(resolve, processingTime));

                // 模拟分配一些内存
                const data = new Array(i * 1000).fill('测试数据');

                ctx.response.headers['Content-Type'] = 'application/json';
                ctx.response.body = JSON.stringify({
                    path: ctx.request.path,
                    processingTime,
                    dataSize: data.length
                });
            }
        });
    }

    // 启动服务器
    server.tell({ type: 'start' });
    console.log(`服务器已启动在 http://localhost:${SERVER_PORT}`);

    // 启动监控仪表盘
    const dashboard = createDashboard(server, {
        port: DASHBOARD_PORT,
        collectIntervalMs: 1000,
        consoleOutput: false
    });

    console.log(`监控仪表盘已启动在 http://localhost:${DASHBOARD_PORT}`);

    // 处理进程终止
    process.on('SIGINT', () => {
        console.log('正在关闭服务器...');
        dashboard.stop();
        server.tell({ type: 'stop' });
        setTimeout(() => {
            console.log('服务器已关闭');
            process.exit(0);
        }, 500);
    });
}

// 运行示例
main().catch(console.error); 