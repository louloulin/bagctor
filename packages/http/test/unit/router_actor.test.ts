import { test, expect, describe, mock, beforeEach } from 'bun:test';
import { ActorSystem, ActorContext, PID, Message } from '@bactor/core';
import { RouterActor, RouteConfig, RouteGroupConfig } from '../../src/actors/router_actor';
import { HttpRequest, HttpContext, HttpResponse } from '../../src/types';

describe('RouterActor', () => {
    let system: ActorSystem;
    let context: Partial<ActorContext>;
    let router: RouterActor;

    // Setup before each test
    beforeEach(() => {
        system = new ActorSystem('test');

        // Mock the context since we can't directly access the real context
        context = {
            self: { id: 'test-router' },
            send: mock(() => Promise.resolve()),
            // Use as any to bypass the type check for the mock function
            request: mock((_target: PID, _message: Message) => Promise.resolve({
                type: 'router.response',
                payload: {
                    status: 200,
                    headers: new Headers({ 'Content-Type': 'application/json' }),
                    body: JSON.stringify({ message: 'Hello' })
                }
            })) as any
        };

        router = new RouterActor(context as ActorContext);
    });

    test('should add a single route', async () => {
        // Mock route handler
        const mockHandler = mock(async (context: HttpContext): Promise<HttpResponse> => {
            return {
                status: 200,
                headers: new Headers({ 'Content-Type': 'application/json' }),
                body: JSON.stringify({ message: 'Hello' })
            };
        });

        // Add route
        const routeConfig: RouteConfig = {
            method: 'GET',
            pattern: '/hello',
            handler: mockHandler
        };

        // Manually call the method being tested
        router['addRoute'](routeConfig.method, routeConfig.pattern, routeConfig.handler);

        // Access the private routes array directly for assertion
        expect(router['routes'].length).toBe(1);
        expect(router['routes'][0].method).toBe('GET');
        expect(router['routes'][0].pattern).toBe('/hello');
    });

    test('should add a route group', async () => {
        // Mock route handlers
        const listHandler = mock((context: HttpContext): Promise<HttpResponse> => {
            return Promise.resolve({
                status: 200,
                headers: new Headers(),
                body: ''
            });
        });
        const getHandler = mock((context: HttpContext): Promise<HttpResponse> => {
            return Promise.resolve({
                status: 200,
                headers: new Headers(),
                body: ''
            });
        });

        // Create route group
        const groupConfig: RouteGroupConfig = {
            prefix: '/api/users',
            routes: [
                {
                    method: 'GET',
                    pattern: '/',
                    handler: listHandler
                },
                {
                    method: 'GET',
                    pattern: '/:id',
                    handler: getHandler
                }
            ]
        };

        // Manually call the method being tested
        router['addRouteGroup'](groupConfig);

        // Access the private routes array directly for assertion
        expect(router['routes'].length).toBe(2);
        expect(router['routes'][0].method).toBe('GET');
        expect(router['routes'][0].pattern).toBe('/api/users/');
        expect(router['routes'][1].method).toBe('GET');
        expect(router['routes'][1].pattern).toBe('/api/users/:id');
    });

    test('should match route with parameters', async () => {
        const params = router['matchRoute']('/users/123', '/users/:id');
        expect(params).not.toBe(null);
        if (params) {
            expect(params.id).toBe('123');
        }
    });

    test('should match route with optional parameters when present', async () => {
        const params = router['matchRoute']('/users/123', '/users/:id?');
        expect(params).not.toBe(null);
        if (params) {
            expect(params.id).toBe('123');
        }
    });

    test('should match route with optional parameters when missing', async () => {
        const params = router['matchRoute']('/users', '/users/:id?');
        expect(params).not.toBe(null);
        if (params) {
            // 使用 toBe(undefined) 或 toBeUndefined() 都可以
            expect(params.id).toBeUndefined();
        }
    });

    test('should match wildcard routes', async () => {
        const params = router['matchRoute']('/files/images/photo.jpg', '/files/*');
        expect(params).not.toBe(null);
        if (params) {
            expect(params['*']).toBe('images/photo.jpg');
        }
    });
}); 