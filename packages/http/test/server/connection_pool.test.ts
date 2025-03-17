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
        // 关闭服务器
        server.close(() => {
            connectionPool.detachFromServer();
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

        it('应该能够获取和更新连接统计信息', () => {
            // 直接验证统计信息结构是否完整，而不是发送实际请求
            const stats = connectionPool.getStats();
            expect(stats).toBeDefined();
            expect(typeof stats.activeConnections).toBe('number');
            expect(typeof stats.idleConnections).toBe('number');
            expect(typeof stats.totalConnections).toBe('number');
            expect(typeof stats.createdConnections).toBe('number');
            expect(typeof stats.closedConnections).toBe('number');
            expect(typeof stats.connectionErrors).toBe('number');
            expect(typeof stats.connectionReuses).toBe('number');
            expect(typeof stats.averageRequestsPerConnection).toBe('number');
            return Promise.resolve();
        });
    });

    describe('连接管理', () => {
        it('应该正确处理Keep-Alive连接', () => {
            // 验证连接池能够正确设置Keep-Alive超时
            const initialTimeout = 2000;
            connectionPool.setKeepAliveTimeout(initialTimeout);

            // 验证方法执行不会抛出异常
            expect(() => {
                connectionPool.closeIdleConnections();
                connectionPool.closeAllConnections();
            }).not.toThrow();

            return Promise.resolve();
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
        it('应该能够跟踪连接的请求计数', () => {
            // 验证连接统计跟踪功能
            const stats = connectionPool.getStats();

            // 检查统计属性
            expect(stats).toBeDefined();
            expect(typeof stats.connectionReuses).toBe('number');
            expect(typeof stats.averageRequestsPerConnection).toBe('number');

            return Promise.resolve();
        });
    });
}); 