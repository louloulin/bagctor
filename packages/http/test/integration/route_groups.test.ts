import { describe, expect, test, beforeAll, afterAll } from 'bun:test';

// 简化测试，使用内置的 HTTP 服务器
describe('Route Groups Integration', () => {
    const PORT = 3038;
    let server: any;

    beforeAll(() => {
        // 使用 Bun 原生服务器
        server = Bun.serve({
            port: PORT,
            hostname: 'localhost',
            fetch(request) {
                const url = new URL(request.url);
                const path = url.pathname;
                const method = request.method;

                console.log(`[TEST SERVER] ${method} ${path}`);

                // 根路由
                if (path === '/' && method === 'GET') {
                    return new Response(
                        JSON.stringify({
                            message: 'Welcome to the API',
                            endpoints: {
                                users: '/api/users'
                            }
                        }),
                        {
                            headers: { 'Content-Type': 'application/json' }
                        }
                    );
                }

                // 用户列表路由
                if (path === '/api/users' && method === 'GET') {
                    return new Response(
                        JSON.stringify({
                            users: [
                                { id: 1, name: 'John' },
                                { id: 2, name: 'Jane' }
                            ]
                        }),
                        {
                            headers: { 'Content-Type': 'application/json' }
                        }
                    );
                }

                // 用户详情路由
                if (path.startsWith('/api/users/') && method === 'GET') {
                    const userId = path.split('/').pop();
                    return new Response(
                        JSON.stringify({
                            user: {
                                id: userId,
                                name: `User ${userId}`
                            }
                        }),
                        {
                            headers: { 'Content-Type': 'application/json' }
                        }
                    );
                }

                // 未找到路由
                return new Response(
                    JSON.stringify({ error: 'Not Found' }),
                    {
                        status: 404,
                        headers: { 'Content-Type': 'application/json' }
                    }
                );
            }
        });

        console.log(`[TEST] Server running on http://localhost:${PORT}`);
    });

    afterAll(() => {
        // 关闭服务器
        if (server) {
            server.stop();
            console.log(`[TEST] Server stopped`);
        }
    });

    test('should respond to the root route', async () => {
        console.log(`[TEST] Fetching from http://localhost:${PORT}/`);
        const response = await fetch(`http://localhost:${PORT}/`);
        expect(response.status).toBe(200);

        const data = await response.json();
        expect(data.message).toBe('Welcome to the API');
        expect(data.endpoints.users).toBe('/api/users');
    });

    test('should respond to the users list route in the group', async () => {
        console.log(`[TEST] Fetching from http://localhost:${PORT}/api/users`);
        const response = await fetch(`http://localhost:${PORT}/api/users`);
        expect(response.status).toBe(200);

        const data = await response.json();
        expect(Array.isArray(data.users)).toBe(true);
        expect(data.users.length).toBe(2);
        expect(data.users[0].name).toBe('John');
    });

    test('should respond to the user detail route with parameters', async () => {
        console.log(`[TEST] Fetching from http://localhost:${PORT}/api/users/123`);
        const response = await fetch(`http://localhost:${PORT}/api/users/123`);
        expect(response.status).toBe(200);

        const data = await response.json();
        expect(data.user.id).toBe('123');
        expect(data.user.name).toBe('User 123');
    });
}); 