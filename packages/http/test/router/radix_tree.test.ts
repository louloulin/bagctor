/**
 * radix_tree.test.ts
 * 
 * 基数树路由器的测试文件
 */

import { RadixTreeRouter, HttpMethod } from '../../src/core/router/radix_tree';
import { RouteParams } from '../../src/types';

describe('RadixTreeRouter', () => {
    let router: RadixTreeRouter;

    beforeEach(() => {
        router = new RadixTreeRouter();
    });

    describe('基本路由匹配测试', () => {
        it('应该匹配简单的路由', () => {
            const handler = jest.fn((params: RouteParams) => ({
                params,
                handler: () => { },
                middleware: []
            }));

            router.addRoute(HttpMethod.GET, '/users', handler);
            const result = router.matchRoute(HttpMethod.GET, '/users');

            expect(result.handler).toBe(handler);
            expect(result.params).toEqual({});
        });

        it('应该匹配带参数的路由', () => {
            const handler = jest.fn((params: RouteParams) => ({
                params,
                handler: () => { },
                middleware: []
            }));

            router.addRoute(HttpMethod.GET, '/users/:id', handler);
            const result = router.matchRoute(HttpMethod.GET, '/users/123');

            expect(result.handler).toBe(handler);
            expect(result.params).toEqual({ id: '123' });

            const handlerResult = result.handler(result.params, '/users/123');
            expect(handlerResult.params).toEqual({ id: '123' });
        });

        it('应该匹配带有多个参数的路由', () => {
            const handler = jest.fn((params: RouteParams) => ({
                params,
                handler: () => { },
                middleware: []
            }));

            router.addRoute(HttpMethod.GET, '/users/:userId/posts/:postId', handler);
            const result = router.matchRoute(HttpMethod.GET, '/users/123/posts/456');

            expect(result.handler).toBe(handler);
            expect(result.params).toEqual({ userId: '123', postId: '456' });
        });

        it('应该返回未找到的结果当路由不匹配时', () => {
            const result = router.matchRoute(HttpMethod.GET, '/not-exists');

            expect(result.handler).toBeUndefined();
            expect(result.params).toEqual({});
        });
    });

    describe('缓存测试', () => {
        it('应该缓存匹配结果', () => {
            const handler = jest.fn((params: RouteParams) => ({
                params,
                handler: () => { },
                middleware: []
            }));

            router.addRoute(HttpMethod.GET, '/cached-route', handler);

            // 第一次匹配
            router.matchRoute(HttpMethod.GET, '/cached-route');

            // 获取缓存相关的私有属性
            const cache = (router as any).routeCache;

            expect(cache.has(`GET:/cached-route`)).toBeTruthy();
        });

        it('应该在添加新路由后清除缓存', () => {
            const handler = jest.fn((params: RouteParams) => ({
                params,
                handler: () => { },
                middleware: []
            }));

            router.addRoute(HttpMethod.GET, '/cached-route', handler);

            // 第一次匹配
            router.matchRoute(HttpMethod.GET, '/cached-route');

            // 添加新路由
            router.addRoute(HttpMethod.GET, '/new-route', handler);

            // 获取缓存相关的私有属性
            const cache = (router as any).routeCache;

            expect(cache.has(`GET:/cached-route`)).toBeFalsy();
        });

        it('应该限制缓存大小', () => {
            const smallRouter = new RadixTreeRouter(2); // 缓存限制为2
            const handler = jest.fn((params: RouteParams) => ({
                params,
                handler: () => { },
                middleware: []
            }));

            smallRouter.addRoute(HttpMethod.GET, '/route1', handler);
            smallRouter.addRoute(HttpMethod.GET, '/route2', handler);
            smallRouter.addRoute(HttpMethod.GET, '/route3', handler);

            // 匹配所有路由
            smallRouter.matchRoute(HttpMethod.GET, '/route1');
            smallRouter.matchRoute(HttpMethod.GET, '/route2');
            smallRouter.matchRoute(HttpMethod.GET, '/route3');

            // 获取缓存相关的私有属性
            const cache = (smallRouter as any).routeCache;

            // 缓存大小应该不超过2
            expect(cache.size).toBeLessThanOrEqual(2);
        });
    });

    describe('高级路由匹配测试', () => {
        it('应该匹配通配符路由', () => {
            const handler = jest.fn((params: RouteParams) => ({
                params,
                handler: () => { },
                middleware: []
            }));

            router.addRoute(HttpMethod.GET, '/files/*filepath', handler);
            const result = router.matchRoute(HttpMethod.GET, '/files/images/logo.png');

            expect(result.handler).toBe(handler);
            expect(result.params).toEqual({ filepath: 'images/logo.png' });
        });

        it('应该按照方法匹配路由', () => {
            const getHandler = jest.fn((params: RouteParams) => ({
                params,
                handler: () => { },
                middleware: []
            }));

            const postHandler = jest.fn((params: RouteParams) => ({
                params,
                handler: () => { },
                middleware: []
            }));

            router.addRoute(HttpMethod.GET, '/resource', getHandler);
            router.addRoute(HttpMethod.POST, '/resource', postHandler);

            const getResult = router.matchRoute(HttpMethod.GET, '/resource');
            const postResult = router.matchRoute(HttpMethod.POST, '/resource');

            expect(getResult.handler).toBe(getHandler);
            expect(postResult.handler).toBe(postHandler);
        });

        it('应该处理路径中的特殊字符', () => {
            const handler = jest.fn((params: RouteParams) => ({
                params,
                handler: () => { },
                middleware: []
            }));

            router.addRoute(HttpMethod.GET, '/user-:id/profile', handler);
            const result = router.matchRoute(HttpMethod.GET, '/user-123/profile');

            expect(result.handler).toBe(handler);
            expect(result.params).toEqual({ id: '123' });
        });
    });
}); 