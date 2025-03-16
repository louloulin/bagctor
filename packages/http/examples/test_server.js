/**
 * test_server.js
 * 
 * 线程亲和性测试服务器
 * 支持开启/关闭线程亲和性的HTTP服务器
 */

const os = require('os');
const http = require('http');
const cluster = require('cluster');
const {
    ThreadAffinityManager,
    createAffinityWorker
} = require('../src/core/performance/thread_affinity');
const {
    isNativeBindingSupported,
    bindThreadToCore,
    getCpuUsage
} = require('../src/core/performance/thread_binding');

// 解析命令行参数
const args = process.argv.slice(2);
const enableAffinity = args.some(arg => arg === '--affinity=true');

// 服务器配置
const PORT = 3000;
const WORKERS = Math.min(os.cpus().length, 8); // 最多8个worker

// 如果是主进程，创建worker
if (cluster.isMaster) {
    console.log(`主进程启动 PID: ${process.pid}`);
    console.log(`启动 ${WORKERS} 个工作进程...`);
    console.log(`线程亲和性: ${enableAffinity ? '启用' : '禁用'}`);
    console.log(`原生线程绑定支持: ${isNativeBindingSupported() ? '可用' : '不可用'}`);

    // 如果启用了亲和性，主进程也绑定到一个核心
    if (enableAffinity && isNativeBindingSupported()) {
        // 主进程通常绑定到最后一个核心
        const mainProcessCore = os.cpus().length - 1;
        const success = bindThreadToCore(mainProcessCore);
        console.log(`主进程绑定到核心 ${mainProcessCore}: ${success ? '成功' : '失败'}`);
    }

    // 创建workers
    for (let i = 0; i < WORKERS; i++) {
        const worker = cluster.fork();

        // 给worker发送其worker_id和亲和性配置
        worker.send({
            worker_id: i,
            enable_affinity: enableAffinity
        });
    }

    // 监听worker退出事件
    cluster.on('exit', (worker, code, signal) => {
        console.log(`工作进程 ${worker.process.pid} 退出`);
    });

    // 优雅关闭
    process.on('SIGINT', () => {
        console.log('正在关闭服务器...');

        // 通知所有worker关闭
        for (const id in cluster.workers) {
            cluster.workers[id].send({ command: 'shutdown' });
        }

        // 等待一段时间后退出
        setTimeout(() => {
            console.log('关闭完成');
            process.exit(0);
        }, 1000);
    });
} else {
    // worker进程
    let worker_id = -1;
    let enableWorkerAffinity = false;

    // 创建HTTP服务器
    const server = http.createServer((req, res) => {
        // 获取请求开始时间
        const startTime = process.hrtime();

        // 根据路径执行不同强度的任务
        let workload = simulateWork(req.url);

        // 构建响应
        const response = {
            worker_id: worker_id,
            worker_pid: process.pid,
            cpu_core: enableWorkerAffinity ? getCurrentThreadCore() : -1,
            request: {
                url: req.url,
                method: req.method,
                headers: req.headers
            },
            server: {
                timestamp: Date.now(),
                affinity_enabled: enableWorkerAffinity,
                cpu_usage: getCpuUsage()
            },
            work_result: workload.result,
            work_time_ms: workload.time
        };

        // 计算请求处理时间
        const hrDuration = process.hrtime(startTime);
        const duration = hrDuration[0] * 1000 + hrDuration[1] / 1000000;
        response.request_time_ms = duration;

        // 发送响应
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(response, null, 2));
    });

    // 监听消息
    process.on('message', (msg) => {
        if (msg.worker_id !== undefined) {
            worker_id = msg.worker_id;
            enableWorkerAffinity = msg.enable_affinity;

            // 如果启用了亲和性，将worker绑定到特定核心
            if (enableWorkerAffinity && isNativeBindingSupported()) {
                // 为每个worker分配不同的核心
                // 对于超过CPU核心数的worker，循环使用核心
                const coreId = worker_id % os.cpus().length;

                // 创建线程亲和性管理器
                const affinityManager = ThreadAffinityManager.getInstance({
                    enabled: true,
                    priorityStrategy: 'dynamic',
                    numaAware: true,
                    logging: false
                });

                // 绑定当前线程
                const success = affinityManager.bindCurrentThread(coreId, 50);
                console.log(`工作进程 ${process.pid} (worker ${worker_id}) 绑定到核心 ${coreId}: ${success ? '成功' : '失败'}`);
            }

            // 开始监听
            server.listen(PORT, () => {
                console.log(`工作进程 ${process.pid} (worker ${worker_id}) 监听端口 ${PORT}`);
            });
        } else if (msg.command === 'shutdown') {
            // 关闭服务器
            server.close(() => {
                console.log(`工作进程 ${process.pid} 已关闭`);
                process.exit(0);
            });

            // 确保在一段时间后强制退出
            setTimeout(() => {
                process.exit(0);
            }, 2000);
        }
    });
}

// 模拟CPU密集型工作
function simulateWork(url) {
    const startTime = process.hrtime();

    // 根据URL路径决定工作强度
    let workFactor = 100000; // 基础工作量

    if (url.includes('heavy')) {
        workFactor *= 10; // 高强度工作
    } else if (url.includes('medium')) {
        workFactor *= 5;  // 中等强度工作
    }

    // 执行一些CPU密集型计算
    let result = 0;
    for (let i = 0; i < workFactor; i++) {
        result += Math.sqrt(i * Math.sin(i));
    }

    // 计算执行时间
    const hrDuration = process.hrtime(startTime);
    const duration = hrDuration[0] * 1000 + hrDuration[1] / 1000000;

    return {
        result: result,
        time: duration
    };
}

// 获取当前线程的CPU核心
function getCurrentThreadCore() {
    if (!isNativeBindingSupported()) {
        return -1;
    }

    try {
        // 引入线程绑定模块
        const { getCurrentThreadCore } = require('../src/core/performance/thread_binding');
        return getCurrentThreadCore();
    } catch (error) {
        console.error('获取CPU核心失败:', error.message);
        return -1;
    }
} 