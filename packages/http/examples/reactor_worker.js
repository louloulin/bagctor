/**
 * reactor_worker.js
 * 
 * 反应器Worker实现
 * 用于处理特定核心上的HTTP请求
 */

const { parentPort, workerData } = require('worker_threads');
const { registerWorkerAffinity } = require('../src/core/performance/thread_affinity');
const {
    getCpuUsage,
    getCurrentThreadCore
} = require('../src/core/performance/thread_binding');
const http = require('http');

// 注册Worker亲和性（自动将Worker绑定到指定核心）
registerWorkerAffinity();

// 获取Worker数据
const reactorId = workerData.reactorId;
const config = workerData.config || {};
const port = config.port || (3000 + reactorId);

// 状态追踪
let requestsHandled = 0;
let activeConnections = 0;
const startTime = Date.now();

// 创建HTTP服务器
const server = http.createServer((req, res) => {
    activeConnections++;

    // 请求开始时间
    const requestStart = process.hrtime();

    // 记录请求信息
    const requestInfo = {
        id: requestsHandled + 1,
        method: req.method,
        url: req.url,
        headers: req.headers
    };

    // 模拟一些处理工作
    simulateWork(req.url);

    // 发送响应
    res.writeHead(200, { 'Content-Type': 'application/json' });

    const responseData = {
        reactorId: reactorId,
        cpuCore: getCurrentThreadCore(),
        requestInfo: requestInfo,
        timestamp: Date.now(),
        uptime: Math.floor((Date.now() - startTime) / 1000)
    };

    res.end(JSON.stringify(responseData, null, 2));

    // 请求结束，计算持续时间
    const hrDuration = process.hrtime(requestStart);
    const duration = hrDuration[0] * 1000 + hrDuration[1] / 1000000;

    // 更新统计
    requestsHandled++;
    activeConnections--;

    // 每100个请求报告一次状态
    if (requestsHandled % 100 === 0 || requestsHandled === 1) {
        reportStatus(1);
    }
});

// 启动服务器
server.listen(port, () => {
    // 向主线程发送就绪消息
    parentPort.postMessage({
        type: 'ready',
        reactorId: reactorId,
        port: port,
        cpuCore: getCurrentThreadCore()
    });

    // 定期发送状态报告
    setInterval(() => reportStatus(), 5000);
});

// 处理错误
server.on('error', (error) => {
    parentPort.postMessage({
        type: 'error',
        reactorId: reactorId,
        error: error.message
    });
});

// 处理Worker消息
parentPort.on('message', (message) => {
    if (message.type === 'shutdown') {
        // 关闭服务器
        server.close(() => {
            parentPort.postMessage({
                type: 'shutdown_complete',
                reactorId: reactorId
            });
        });

        // 确保在5秒后强制关闭
        setTimeout(() => {
            process.exit(0);
        }, 5000);
    }
});

/**
 * 向主线程报告状态
 */
function reportStatus(newRequests = 0) {
    const cpuUsage = getCpuUsage(getCurrentThreadCore());

    parentPort.postMessage({
        type: 'stats',
        reactorId: reactorId,
        timestamp: Date.now(),
        uptime: Math.floor((Date.now() - startTime) / 1000),
        requestsHandled: requestsHandled,
        newRequests: newRequests,
        activeConnections: activeConnections,
        cpuUsage: cpuUsage,
        cpuCore: getCurrentThreadCore()
    });
}

/**
 * 模拟处理工作
 * 根据URL复杂度执行不同强度的CPU工作
 */
function simulateWork(url) {
    // 基本工作量
    let workFactor = 100000;

    // 根据URL增加工作量
    if (url.includes('heavy')) {
        workFactor *= 10; // 重负载
    } else if (url.includes('medium')) {
        workFactor *= 5;  // 中负载
    }

    // 进行一些CPU密集型计算
    let result = 0;
    for (let i = 0; i < workFactor; i++) {
        result += Math.sqrt(i * Math.sin(i));
    }

    return result;
} 