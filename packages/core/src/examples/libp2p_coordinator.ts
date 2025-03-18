/**
 * libp2p多进程测试 - 协调器进程
 * 
 * 该文件实现了分布式测试的协调器，负责:
 * 1. 启动多个工作进程，每个进程运行多个libp2p节点
 * 2. 收集所有节点的信息和状态
 * 3. 协调测试步骤和收集结果
 */

import { fork, ChildProcess } from 'child_process';
import { setTimeout as sleep } from 'node:timers/promises';
import * as path from 'path';
import * as fs from 'fs';

// 配置参数
const TOTAL_NODES = 50;           // 总节点数
const NODES_PER_PROCESS = 3;      // 每个进程的节点数
const PROCESS_COUNT = Math.ceil(TOTAL_NODES / NODES_PER_PROCESS);
const BASE_PORT = 40000;          // 基础端口号
const PROCESS_STARTUP_DELAY = 1000; // 进程启动间隔(毫秒)
const NETWORK_STABILIZE_TIME = 10000; // 网络稳定等待时间(毫秒)
const TEST_DURATION = 30000;      // 测试持续时间(毫秒)

interface NodeInfo {
    nodeId: string;
    processId: number;
    address: string;
    role: string;
    port: number;
}

/**
 * 运行分布式测试
 */
async function runDistributedTest() {
    console.log('===========================================================');
    console.log(`Starting distributed libp2p test with ${TOTAL_NODES} nodes`);
    console.log(`Distributing across ${PROCESS_COUNT} processes (~${NODES_PER_PROCESS} nodes/process)`);
    console.log('===========================================================');

    const testStartTime = Date.now();
    const processes: ChildProcess[] = [];
    const nodeInfo: Map<string, NodeInfo> = new Map();
    const testResults: any[] = [];

    // 确保日志目录存在
    const logDir = path.join(__dirname, '..', '..', 'logs');
    if (!fs.existsSync(logDir)) {
        fs.mkdirSync(logDir, { recursive: true });
    }

    try {
        // 1. 启动所有工作进程
        console.log('\n[Coordinator] Starting worker processes...');

        for (let i = 0; i < PROCESS_COUNT; i++) {
            const nodesInProcess = Math.min(NODES_PER_PROCESS, TOTAL_NODES - i * NODES_PER_PROCESS);
            const startPort = BASE_PORT + (i * NODES_PER_PROCESS);
            const logFile = path.join(logDir, `worker-${i}.log`);

            console.log(`[Coordinator] Starting process ${i + 1}/${PROCESS_COUNT} with ${nodesInProcess} nodes (ports ${startPort}-${startPort + nodesInProcess - 1})`);

            // 设置进程参数和输出流
            const workerPath = path.join(__dirname, 'libp2p_worker.ts');
            const workerProcess = fork(workerPath, [
                `--processId=${i}`,
                `--nodeCount=${nodesInProcess}`,
                `--startPort=${startPort}`
            ], {
                // stdio: [null, fs.openSync(logFile, 'w'), fs.openSync(logFile, 'w'), 'ipc']
                stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
                execPath: 'bun' // 使用bun来执行TypeScript文件
            });

            // 处理工作进程的消息
            workerProcess.on('message', (message: any) => {
                handleWorkerMessage(message, i, nodeInfo, testResults);
            });

            // 处理工作进程的输出
            if (workerProcess.stdout) {
                workerProcess.stdout.on('data', (data) => {
                    const output = data.toString().trim();
                    if (output) {
                        console.log(`[Worker-${i}] ${output}`);
                        fs.appendFileSync(logFile, `[OUT] ${output}\n`);
                    }
                });
            }

            if (workerProcess.stderr) {
                workerProcess.stderr.on('data', (data) => {
                    const output = data.toString().trim();
                    if (output) {
                        console.error(`[Worker-${i} ERROR] ${output}`);
                        fs.appendFileSync(logFile, `[ERR] ${output}\n`);
                    }
                });
            }

            // 处理工作进程退出
            workerProcess.on('exit', (code, signal) => {
                console.log(`[Coordinator] Worker process ${i} exited with code ${code} and signal ${signal}`);
            });

            processes.push(workerProcess);

            // 等待一段时间再启动下一个进程，避免端口冲突和资源争抢
            await sleep(PROCESS_STARTUP_DELAY);
        }

        // 2. 等待所有节点注册和报告信息
        console.log('\n[Coordinator] Waiting for all nodes to register...');
        let registered = 0;

        // 超时机制确保不会无限等待
        const registrationTimeout = setTimeout(() => {
            console.warn(`[Coordinator] Registration timeout! Only ${registered}/${TOTAL_NODES} nodes registered.`);
        }, 60000);

        while (nodeInfo.size < TOTAL_NODES) {
            if (registered !== nodeInfo.size) {
                registered = nodeInfo.size;
                console.log(`[Coordinator] ${registered}/${TOTAL_NODES} nodes registered`);
            }
            await sleep(500);

            // 检查是否有进程已经退出
            const anyExited = processes.some(p => p.exitCode !== null);
            if (anyExited) {
                throw new Error("One or more worker processes exited prematurely");
            }
        }

        clearTimeout(registrationTimeout);
        console.log(`[Coordinator] All ${TOTAL_NODES} nodes successfully registered!`);

        // 3. 获取bootstrap节点信息
        const bootstrapNodes = Array.from(nodeInfo.values())
            .filter(info => info.role === 'bootstrap')
            .map(info => info.address);

        console.log(`[Coordinator] Selected ${bootstrapNodes.length} bootstrap nodes`);

        // 4. 通知所有进程连接bootstrap节点
        console.log('\n[Coordinator] Instructing nodes to connect to bootstrap peers...');
        for (const process of processes) {
            process.send({
                type: 'BOOTSTRAP',
                nodes: bootstrapNodes
            });
        }

        // 5. 等待网络稳定
        console.log(`[Coordinator] Waiting ${NETWORK_STABILIZE_TIME / 1000}s for network to stabilize...`);
        await sleep(NETWORK_STABILIZE_TIME);

        // 6. 开始测试阶段
        console.log('\n[Coordinator] Starting communication tests...');
        const testStart = Date.now();

        for (const process of processes) {
            process.send({
                type: 'START_TEST',
                testParams: {
                    messagingRounds: 5,
                    messageCount: 10,
                    messageInterval: 1000
                }
            });
        }

        // 7. 等待测试完成
        console.log(`[Coordinator] Tests running for ${TEST_DURATION / 1000}s...`);
        await sleep(TEST_DURATION);

        // 8. 收集测试结果
        console.log('\n[Coordinator] Collecting test results...');
        for (const process of processes) {
            process.send({ type: 'COLLECT_RESULTS' });
        }

        // 等待结果收集
        await sleep(5000);

        // 9. 汇总和展示结果
        console.log('\n[Coordinator] Test Results Summary:');
        console.log(`Total results collected: ${testResults.length}`);

        // 基本统计
        if (testResults.length > 0) {
            const totalMessages = testResults.reduce((sum, r) => sum + (r.messagesSent || 0), 0);
            const totalReceived = testResults.reduce((sum, r) => sum + (r.messagesReceived || 0), 0);
            const avgLatency = testResults.reduce((sum, r) => sum + (r.avgLatency || 0), 0) / testResults.length;
            const successRate = totalReceived / (totalMessages || 1) * 100;

            console.log(`Messages sent: ${totalMessages}`);
            console.log(`Messages received: ${totalReceived}`);
            console.log(`Success rate: ${successRate.toFixed(2)}%`);
            console.log(`Average latency: ${avgLatency.toFixed(2)}ms`);
        }
    }
    catch (error) {
        console.error('\n[Coordinator] Test failed with error:', error);
    }
    finally {
        // 10. 关闭所有进程
        console.log('\n[Coordinator] Shutting down all worker processes...');

        for (const process of processes) {
            try {
                // 给进程一个干净关闭的机会
                process.send({ type: 'SHUTDOWN' });
            } catch (e) {
                // 进程可能已经退出
            }
        }

        // 等待所有进程退出，或者强制终止
        await sleep(5000);

        for (const process of processes) {
            if (process.exitCode === null) {
                console.log('[Coordinator] Forcing process termination...');
                process.kill('SIGTERM');
            }
        }

        const testEndTime = Date.now();
        const testDuration = testEndTime - testStartTime;

        console.log('\n===========================================================');
        console.log(`Distributed libp2p test completed in ${(testDuration / 1000).toFixed(2)}s`);
        console.log('===========================================================');
    }
}

/**
 * 处理工作进程发送的消息
 */
function handleWorkerMessage(
    message: any,
    processId: number,
    nodeInfo: Map<string, NodeInfo>,
    testResults: any[]
) {
    switch (message.type) {
        case 'NODE_INFO':
            // 记录节点信息
            nodeInfo.set(message.nodeId, {
                nodeId: message.nodeId,
                processId: processId,
                address: message.info.address,
                role: message.info.role,
                port: message.info.port
            });
            break;

        case 'TEST_RESULT':
            // 收集测试结果
            testResults.push({
                nodeId: message.nodeId,
                processId: processId,
                ...message.result
            });
            break;

        case 'STATUS':
            // 状态更新
            console.log(`[Status from Worker-${processId}] ${message.status}`);
            break;

        case 'ERROR':
            // 错误报告
            console.error(`[Error from Worker-${processId}] ${message.error}`);
            break;

        default:
            console.log(`[Unknown message from Worker-${processId}]`, message);
    }
}

// 直接运行
if (require.main === module) {
    runDistributedTest().catch(err => {
        console.error('Fatal error in coordinator:', err);
        process.exit(1);
    });
}

export { runDistributedTest }; 