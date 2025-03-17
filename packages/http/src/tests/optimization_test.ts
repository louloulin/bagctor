/**
 * 优化 HTTP 服务器集成测试
 * 
 * 本测试验证优化后的 HTTP 服务器功能正确性，
 * 包括路由匹配、请求处理、多反应器工作分发等核心功能
 */

import { expect, test, describe, beforeAll, afterAll } from "bun:test";
import { ActorSystem, ActorRef, ActorContext } from "@bactor/core";
import { OptimizedHttpServerActor } from "../core/server/optimized_http_server";
import { routeTests } from "./route_tests"; // 可能需要创建这个辅助测试模块

// 测试端口
const TEST_PORT = 8888;

describe("优化 HTTP 服务器集成测试", () => {
    // 共享变量
    let system: ActorSystem;
    let server: ActorRef;

    // 测试前启动服务器
    beforeAll(async () => {
        // 创建模拟Actor系统
        system = {
            actorOf: jest.fn().mockReturnValue({
                id: "test-server",
                tell: jest.fn().mockImplementation((msg: any, callback?: Function) => {
                    // 模拟消息处理
                    if (msg.type === 'start') {
                        if (callback) callback({ success: true, port: TEST_PORT });
                        return { success: true, port: TEST_PORT };
                    } else if (msg.type === 'get-stats') {
                        if (callback) callback({
                            requestsProcessed: 0,
                            reactorStats: { activeReactors: 2 }
                        });
                        return {
                            requestsProcessed: 0,
                            reactorStats: { activeReactors: 2 }
                        };
                    }
                    return {};
                })
            }),
            context: {} as ActorContext
        } as unknown as ActorSystem;

        // 创建服务器
        server = OptimizedHttpServerActor.create(
            system, // 添加系统参数
            {
                port: TEST_PORT,
                hostname: "localhost"
            }
        );

        // 添加测试路由
        await server.send({
            type: 'add-routes',
            configs: [
                // 基本路由
                {
                    method: 'GET',
                    path: '/test',
                    handler: async (ctx: any, req: any, res: any) => {
                        res.statusCode = 200;
                        res.setHeader('Content-Type', 'application/json');
                        res.end(JSON.stringify({ message: 'Test successful' }));
                    }
                },

                // 参数路由
                {
                    method: 'GET',
                    path: '/users/:id',
                    handler: async (ctx: any, req: any, res: any) => {
                        res.statusCode = 200;
                        res.setHeader('Content-Type', 'application/json');
                        res.end(JSON.stringify({
                            userId: ctx.params.id,
                            method: 'GET'
                        }));
                    }
                },

                // POST 处理
                {
                    method: 'POST',
                    path: '/users',
                    handler: async (ctx: any, req: any, res: any) => {
                        const userData = req.body;
                        res.statusCode = 201;
                        res.setHeader('Content-Type', 'application/json');
                        res.end(JSON.stringify({
                            message: 'User created',
                            user: userData
                        }));
                    }
                },

                // 嵌套路由
                {
                    method: 'GET',
                    path: '/api/v1/products/:id/reviews',
                    handler: async (ctx: any, req: any, res: any) => {
                        res.statusCode = 200;
                        res.setHeader('Content-Type', 'application/json');
                        res.end(JSON.stringify({
                            productId: ctx.params.id,
                            reviews: [{ id: 1, text: 'Great product' }]
                        }));
                    }
                },

                // 通配符路由
                {
                    method: 'GET',
                    path: '/files/*',
                    handler: async (ctx: any, req: any, res: any) => {
                        const path = ctx.params['*'] || '';
                        res.statusCode = 200;
                        res.setHeader('Content-Type', 'application/json');
                        res.end(JSON.stringify({
                            filePath: path
                        }));
                    }
                },

                // 中间件测试路由
                {
                    method: 'GET',
                    path: '/protected',
                    middleware: [
                        // 模拟认证中间件
                        async (ctx: any, req: any, res: any) => {
                            const authHeader = req.headers.get('Authorization');

                            if (!authHeader || authHeader !== 'Bearer test-token') {
                                res.statusCode = 401;
                                res.setHeader('Content-Type', 'application/json');
                                res.end(JSON.stringify({ error: 'Unauthorized' }));
                                return false; // 终止请求处理
                            }

                            // 设置用户信息到状态
                            ctx.state.set('user', { id: 'test-user' });
                        }
                    ],
                    handler: async (ctx: any, req: any, res: any) => {
                        const user = ctx.state.get('user');

                        res.statusCode = 200;
                        res.setHeader('Content-Type', 'application/json');
                        res.end(JSON.stringify({
                            message: 'Protected resource',
                            user
                        }));
                    }
                }
            ]
        });

        // 启动服务器
        const result = await server.tell({ type: 'start' }) as unknown as { success: boolean; error?: string };

        if (!result.success) {
            throw new Error(`Failed to start server: ${result.error}`);
        }

        // 等待服务器完全启动
        await new Promise(resolve => setTimeout(resolve, 500));
    });

    // 测试后关闭服务器
    afterAll(async () => {
        // 停止服务器
        await server.send({ type: 'stop' });
        await system.shutdown();
    });

    // 测试基本 GET 请求
    test("基本 GET 请求成功", async () => {
        const response = await fetch(`http://localhost:${TEST_PORT}/test`);
        const data = await response.json();

        expect(response.status).toBe(200);
        expect(data).toHaveProperty('message', 'Test successful');
    });

    // 测试参数路由
    test("参数路由正常工作", async () => {
        const userId = "user123";
        const response = await fetch(`http://localhost:${TEST_PORT}/users/${userId}`);
        const data = await response.json();

        expect(response.status).toBe(200);
        expect(data).toHaveProperty('userId', userId);
        expect(data).toHaveProperty('method', 'GET');
    });

    // 测试 POST 请求
    test("POST 请求正常工作", async () => {
        const userData = { name: "Test User", email: "test@example.com" };

        const response = await fetch(`http://localhost:${TEST_PORT}/users`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(userData)
        });

        const data = await response.json();

        expect(response.status).toBe(201);
        expect(data).toHaveProperty('message', 'User created');
        expect(data).toHaveProperty('user');
        expect(data.user).toHaveProperty('name', userData.name);
        expect(data.user).toHaveProperty('email', userData.email);
    });

    // 测试嵌套路由
    test("嵌套路由正常工作", async () => {
        const productId = "prod456";
        const response = await fetch(`http://localhost:${TEST_PORT}/api/v1/products/${productId}/reviews`);
        const data = await response.json();

        expect(response.status).toBe(200);
        expect(data).toHaveProperty('productId', productId);
        expect(data).toHaveProperty('reviews');
        expect(Array.isArray(data.reviews)).toBe(true);
    });

    // 测试通配符路由
    test("通配符路由正常工作", async () => {
        const filePath = "documents/reports/annual-2023.pdf";
        const response = await fetch(`http://localhost:${TEST_PORT}/files/${filePath}`);
        const data = await response.json();

        expect(response.status).toBe(200);
        expect(data).toHaveProperty('filePath', filePath);
    });

    // 测试中间件 - 无授权
    test("中间件拦截未授权请求", async () => {
        const response = await fetch(`http://localhost:${TEST_PORT}/protected`);
        const data = await response.json();

        expect(response.status).toBe(401);
        expect(data).toHaveProperty('error', 'Unauthorized');
    });

    // 测试中间件 - 有授权
    test("中间件通过授权请求", async () => {
        const response = await fetch(`http://localhost:${TEST_PORT}/protected`, {
            headers: {
                'Authorization': 'Bearer test-token'
            }
        });
        const data = await response.json();

        expect(response.status).toBe(200);
        expect(data).toHaveProperty('message', 'Protected resource');
        expect(data).toHaveProperty('user');
        expect(data.user).toHaveProperty('id', 'test-user');
    });

    // 测试 404 处理
    test("处理未找到的路由", async () => {
        const response = await fetch(`http://localhost:${TEST_PORT}/nonexistent-route`);

        expect(response.status).toBe(404);
        const data = await response.json();
        expect(data).toHaveProperty('error', 'Not Found');
    });

    // 测试服务器状态
    test("服务器状态正常", async () => {
        const stats = await server.tell({ type: 'get-stats' }) as unknown as {
            status: string;
            requestsProcessed: number;
            reactorStats: {
                activeReactors: number;
            };
        };

        expect(stats).toHaveProperty('status', 'running');
        expect(typeof stats.requestsProcessed).toBe('number');
        expect(stats).toHaveProperty('reactorStats');
        expect(stats.reactorStats).toHaveProperty('activeReactors', 2); // 我们配置了2个反应器
    });

    // 测试并发请求
    test("处理并发请求", async () => {
        const concurrentRequests = 10;
        const requests = Array(concurrentRequests).fill(0).map(() =>
            fetch(`http://localhost:${TEST_PORT}/test`)
        );

        const responses = await Promise.all(requests);

        // 验证所有请求都成功
        responses.forEach(response => {
            expect(response.status).toBe(200);
        });

        // 验证所有请求内容都正确
        const dataPromises = responses.map(response => response.json());
        const dataResults = await Promise.all(dataPromises);

        dataResults.forEach(data => {
            expect(data).toHaveProperty('message', 'Test successful');
        });
    });
}); 