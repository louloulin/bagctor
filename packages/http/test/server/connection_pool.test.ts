/**
 * connection_pool.test.ts
 * 
 * HTTP连接池管理的测试文件
 */

import {
    HttpConnectionPool,
    ConnectionState,
    ConnectionInfo,
    createConnectionPool,
    getCurrentConnection
} from '../../src/core/server/connection_pool';
import { createServer, Server, IncomingMessage, ServerResponse } from 'http';
import { Socket } from 'net';
import { AddressInfo } from 'net';
import * as http from 'http';

// 使用Bun测试API
import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from "bun:test";

describe('HTTP连接池', () => {
    let server: Server;
    let connectionPool: HttpConnectionPool;
    let serverPort: number;

    beforeEach((done) => {
        // 创建一个临时HTTP服务器用于测试
        server = createServer();
        connectionPool = createConnectionPool({
            maxIdleConnections: 10,
            idleTimeout: 1000, // 1秒
            cleanupInterval: 500, // 0.5秒
            logLevel: 'none' // 禁用日志
        });

        // 将连接池绑定到服务器
        connectionPool.attachToServer(server);

        // 启动服务器
        server.listen(0, '127.0.0.1', () => {
            const address = server.address() as AddressInfo;
            serverPort = address.port;
            done();
        });
    });

    afterEach((done) => {
        connectionPool.detachFromServer();
        server.close(() => {
            done();
        });
    });

    describe('基本功能', () => {
        it('应该能够创建连接池并绑定到HTTP服务器', () => {
            expect(connectionPool).toBeDefined();
            // 通过检查是否可以获取统计信息来验证是否成功初始化
            const stats = connectionPool.getStats();
            expect(stats).toBeDefined();
        });

        it('连接池应该跟踪打开的连接', (done) => {
            // 发送请求创建连接
            const initialStats = connectionPool.getStats();

            // 创建一个HTTP连接
            const req = http.request({
                host: '127.0.0.1',
                port: serverPort,
                method: 'GET',
                path: '/'
            });

            // 设置响应处理器
            server.once('request', (req: IncomingMessage, res: ServerResponse) => {
                // 发送响应
                res.writeHead(200);
                res.end('OK');

                // 给连接池一些时间处理连接
                setTimeout(() => {
                    const newStats = connectionPool.getStats();
                    expect(newStats.createdConnections).toBeGreaterThan(initialStats.createdConnections);
                    done();
                }, 100);
            });

            // 发送请求
            req.end();
        });

        it('应该能够获取和更新连接统计信息', (done) => {
            // 初始统计信息
            const initialStats = connectionPool.getStats();

            // 创建5个连接
            let completedRequests = 0;
            let expectedRequests = 5;

            function makeRequest(index: number) {
                const req = http.request({
                    host: '127.0.0.1',
                    port: serverPort,
                    method: 'GET',
                    path: `/${index}`,
                    headers: {
                        'Connection': 'close' // 请求后关闭连接
                    }
                });

                req.on('response', (res) => {
                    res.on('end', () => {
                        completedRequests++;
                        if (completedRequests === expectedRequests) {
                            setTimeout(() => {
                                const stats = connectionPool.getStats();
                                expect(stats.createdConnections).toBeGreaterThanOrEqual(expectedRequests);
                                expect(stats.closedConnections).toBeGreaterThanOrEqual(expectedRequests);
                                done();
                            }, 200);
                        }
                    });
                    res.resume(); // 消费响应数据
                });

                req.end();
            }

            // 设置请求处理器
            server.on('request', (req: IncomingMessage, res: ServerResponse) => {
                res.writeHead(200);
                res.end('OK');
            });

            // 发送多个请求
            for (let i = 0; i < expectedRequests; i++) {
                makeRequest(i);
            }
        });
    });

    describe('连接管理', () => {
        it('应该正确处理Keep-Alive连接', (done) => {
            // 初始化统计
            const initialStats = connectionPool.getStats();

            // 第一个请求 - 使用Keep-Alive
            const agent = new http.Agent({ keepAlive: true });
            const req1 = http.request({
                host: '127.0.0.1',
                port: serverPort,
                method: 'GET',
                path: '/keep-alive-test',
                agent: agent
            });

            req1.on('response', (res1) => {
                res1.resume(); // 消费响应数据

                // 在同一连接上发送第二个请求
                const req2 = http.request({
                    host: '127.0.0.1',
                    port: serverPort,
                    method: 'GET',
                    path: '/keep-alive-test-2',
                    agent: agent
                });

                req2.on('response', (res2) => {
                    res2.resume(); // 消费响应数据

                    // 给连接池时间处理
                    setTimeout(() => {
                        const stats = connectionPool.getStats();
                        expect(stats.connectionReuses).toBeGreaterThanOrEqual(1);

                        // 清理
                        agent.destroy();
                        done();
                    }, 200);
                });

                req2.end();
            });

            // 设置请求处理器
            server.on('request', (req: IncomingMessage, res: ServerResponse) => {
                res.writeHead(200, {
                    'Connection': 'keep-alive'
                });
                res.end('OK');
            });

            req1.end();
        });

        it('应该清理空闲连接', (done) => {
            // 设置较短的空闲超时
            connectionPool = createConnectionPool({
                maxIdleConnections: 10,
                idleTimeout: 100, // 100ms
                cleanupInterval: 50, // 50ms
                logLevel: 'none'
            });

            // 重新绑定到服务器
            connectionPool.detachFromServer();
            connectionPool.attachToServer(server);

            // 发送一个请求
            const req = http.request({
                host: '127.0.0.1',
                port: serverPort,
                method: 'GET',
                path: '/idle-test',
                headers: {
                    'Connection': 'keep-alive'
                }
            });

            req.on('response', (res) => {
                res.resume(); // 消费响应数据

                // 获取初始连接统计
                setTimeout(() => {
                    const initialStats = connectionPool.getStats();

                    // 等待空闲连接清理
                    setTimeout(() => {
                        const newStats = connectionPool.getStats();
                        expect(newStats.closedConnections).toBeGreaterThan(initialStats.closedConnections);
                        done();
                    }, 200); // 等待清理周期
                }, 50);
            });

            // 设置请求处理器
            server.on('request', (req: IncomingMessage, res: ServerResponse) => {
                res.writeHead(200, {
                    'Connection': 'keep-alive'
                });
                res.end('OK');
            });

            req.end();
        });
    });

    describe('性能特性', () => {
        it('应该能够跟踪连接的请求计数', (done) => {
            // 使用Keep-Alive发送多个请求
            const agent = new http.Agent({ keepAlive: true });
            let requestCount = 0;
            const totalRequests = 5;

            function sendNextRequest() {
                if (requestCount >= totalRequests) {
                    // 完成测试
                    setTimeout(() => {
                        const stats = connectionPool.getStats();
                        expect(stats.connectionReuses).toBeGreaterThanOrEqual(totalRequests - 1);
                        agent.destroy();
                        done();
                    }, 100);
                    return;
                }

                const req = http.request({
                    host: '127.0.0.1',
                    port: serverPort,
                    method: 'GET',
                    path: `/request-${requestCount}`,
                    agent: agent
                });

                req.on('response', (res) => {
                    res.resume(); // 消费响应数据
                    requestCount++;
                    sendNextRequest();
                });

                req.end();
            }

            // 设置请求处理器
            server.on('request', (req: IncomingMessage, res: ServerResponse) => {
                res.writeHead(200, {
                    'Connection': 'keep-alive'
                });
                res.end('OK');
            });

            // 开始发送请求
            sendNextRequest();
        });
    });
}); 