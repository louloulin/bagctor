/**
 * 自适应HTTP服务器示例
 * 
 * 这个示例展示了如何使用自适应HTTP服务器和自适应对象池来创建
 * 一个高性能、高效内存使用的HTTP服务。
 */

// 导入所需模块
import { createActorSystem } from 'bactor';
import { createAdaptiveHttpServer } from '../src/core/server/adaptive_http_server';
import {
    AdaptivePoolOptions
} from '../src/core/pool/adaptive_pool';
import {
    preparePoolsForTrafficBurst,
    getAllPoolStats
} from '../src/core/pool/adaptive_http_pools';

// 创建Actor系统
const system = createActorSystem();

// 配置自适应对象池选项
const poolOptions: AdaptivePoolOptions = {
    initialSize: 200,          // 初始池大小
    maxSize: 5000,             // 最大池大小
    minSize: 100,              // 最小池大小 
    adaptiveResizing: true,    // 启用自适应调整
    adaptiveCheckIntervalMs: 5000,  // 每5秒检查一次
    minGrowRatio: 0.6,         // 当使用率超过60%时扩展
    minShrinkRatio: 0.2,       // 当使用率低于20%时收缩
    growStepRatio: 0.3,        // 每次扩展30%
    shrinkStepRatio: 0.1,      // 每次收缩10%
    exhaustionPolicy: 'grow',  // 耗尽策略: 增长
    validationEnabled: true    // 启用验证
};

// 创建自适应HTTP服务器
const server = createAdaptiveHttpServer(system, {
    // 服务器选项
    port: 3000,
    hostname: '0.0.0.0',

    // 自适应功能配置
    poolOptions,
    loadMonitorIntervalMs: 2000,
    reactorPoolSize: 0, // 自动使用可用CPU数量
    enableAutoTrafficBurstPreparation: true,
    trafficBurstThresholdPercent: 30,
    trafficSamplingWindowMs: 15000,

    // 调试选项
    debug: true
});

// 添加路由 - GET /
server.tell({
    type: 'addRoute',
    method: 'GET',
    path: '/',
    handler: async (ctx) => {
        ctx.response.body = 'Hello from Adaptive HTTP Server!';
        ctx.response.headers.set('Content-Type', 'text/plain');
    }
});

// 添加路由 - GET /api/user/:id - 带参数
server.tell({
    type: 'addRoute',
    method: 'GET',
    path: '/api/user/:id',
    handler: async (ctx) => {
        const userId = ctx.params.id;
        ctx.response.body = JSON.stringify({
            id: userId,
            name: `User ${userId}`,
            timestamp: new Date().toISOString()
        });
        ctx.response.headers.set('Content-Type', 'application/json');
    }
});

// 添加路由 - POST /api/data - 处理JSON数据
server.tell({
    type: 'addRoute',
    method: 'POST',
    path: '/api/data',
    handler: async (ctx) => {
        // 读取请求体
        let body = '';
        if (typeof ctx.request.body === 'string') {
            body = ctx.request.body;
        } else if (ctx.request.body instanceof ReadableStream) {
            const reader = ctx.request.body.getReader();
            let done = false;
            while (!done) {
                const { value, done: doneReading } = await reader.read();
                done = doneReading;
                if (value) {
                    body += new TextDecoder().decode(value);
                }
            }
        }

        // 解析JSON
        let data;
        try {
            data = JSON.parse(body);
        } catch (e) {
            ctx.response.status = 400;
            ctx.response.body = JSON.stringify({ error: 'Invalid JSON' });
            ctx.response.headers.set('Content-Type', 'application/json');
            return;
        }

        // 处理数据并返回响应
        ctx.response.body = JSON.stringify({
            success: true,
            received: data,
            processed: new Date().toISOString()
        });
        ctx.response.headers.set('Content-Type', 'application/json');
    }
});

// 添加路由 - GET /api/stats - 返回服务器统计信息
server.tell({
    type: 'addRoute',
    method: 'GET',
    path: '/api/stats',
    handler: async (ctx) => {
        // 获取统计信息
        server.tell({ type: 'getStats' }, (statsData) => {
            const { server: serverStats, pools } = statsData;

            // 返回响应
            ctx.response.body = JSON.stringify({
                serverStats,
                poolStats: pools,
                timestamp: new Date().toISOString()
            }, null, 2);
            ctx.response.headers.set('Content-Type', 'application/json');
        });

        // 等待异步消息处理
        await new Promise(resolve => setTimeout(resolve, 10));
    }
});

// 添加路由 - POST /api/prepare - 手动触发流量突发准备
server.tell({
    type: 'addRoute',
    method: 'POST',
    path: '/api/prepare',
    handler: async (ctx) => {
        // 读取请求体
        let body = '';
        if (typeof ctx.request.body === 'string') {
            body = ctx.request.body;
        } else if (ctx.request.body instanceof ReadableStream) {
            const reader = ctx.request.body.getReader();
            let done = false;
            while (!done) {
                const { value, done: doneReading } = await reader.read();
                done = doneReading;
                if (value) {
                    body += new TextDecoder().decode(value);
                }
            }
        }

        // 解析因子
        let factor = 2.0;
        try {
            const data = JSON.parse(body);
            if (data.factor && typeof data.factor === 'number') {
                factor = data.factor;
            }
        } catch (e) {
            // 使用默认因子
        }

        // 准备流量突发
        server.tell({
            type: 'prepareForTrafficBurst',
            factor
        });

        // 返回响应
        ctx.response.body = JSON.stringify({
            success: true,
            message: `准备处理流量突发，使用因子 ${factor}`,
            timestamp: new Date().toISOString()
        });
        ctx.response.headers.set('Content-Type', 'application/json');
    }
});

// 添加带中间件的路由 - 认证示例
const authMiddleware = async (ctx, next) => {
    const authHeader = ctx.request.headers.get('Authorization');

    if (!authHeader || authHeader !== 'Bearer secret-token') {
        ctx.response.status = 401;
        ctx.response.body = JSON.stringify({ error: 'Unauthorized' });
        ctx.response.headers.set('Content-Type', 'application/json');
        return;
    }

    // 通过认证，继续处理请求
    await next();
};

server.tell({
    type: 'addRoute',
    method: 'GET',
    path: '/api/protected',
    middleware: [authMiddleware],
    handler: async (ctx) => {
        ctx.response.body = JSON.stringify({
            message: 'Protected resource accessed successfully',
            timestamp: new Date().toISOString()
        });
        ctx.response.headers.set('Content-Type', 'application/json');
    }
});

// 启动服务器
server.tell({ type: 'start' });

console.log('自适应HTTP服务器启动在 http://localhost:3000');
console.log('可用路由:');
console.log('  GET  /');
console.log('  GET  /api/user/:id');
console.log('  POST /api/data');
console.log('  GET  /api/stats');
console.log('  POST /api/prepare');
console.log('  GET  /api/protected (需要Authorization: Bearer secret-token)');

// 事件处理 - 优雅关闭
process.on('SIGINT', () => {
    console.log('\n正在关闭服务器...');
    server.tell({ type: 'stop' });

    setTimeout(() => {
        console.log('释放资源并关闭Actor系统...');
        system.shutdown();
        process.exit(0);
    }, 1000);
});

// 预热对象池，为即将到来的流量做准备
setTimeout(() => {
    console.log('预热对象池...');
    preparePoolsForTrafficBurst(3.0);

    // 输出初始对象池统计信息
    const stats = getAllPoolStats();
    console.log('初始对象池状态:');
    console.log(`  请求池: ${stats.requestPool.size} 总, ${stats.requestPool.idle} 空闲`);
    console.log(`  响应池: ${stats.responsePool.size} 总, ${stats.responsePool.idle} 空闲`);
    console.log(`  上下文池: ${stats.contextPool.size} 总, ${stats.contextPool.idle} 空闲`);
}, 500); 