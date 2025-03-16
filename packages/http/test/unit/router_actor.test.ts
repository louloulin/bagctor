import { test, expect, describe, mock, beforeEach } from 'bun:test';
import { ActorSystem, ActorContext } from '@bactor/core';
import { RouterActor, RouteConfig, RouteGroupConfig } from '../../src/actors/router_actor';
import { HttpRequest, HttpContext } from '../../src/types';

describe('RouterActor', () => {
    let system;
    let context;
    let router;

    // Setup before each test
    beforeEach(() => {
        system = new ActorSystem('test');

        // Mock the context since we can't directly access the real context
        context = {
            self: { id: 'test-router' },
            send: mock(() => Promise.resolve()),
            request: mock(() => Promise.resolve({
                type: 'router.response',
                payload: {
                    status: 200,
                    headers: new Headers({ 'Content-Type': 'application/json' }),
                    body: JSON.stringify({ message: 'Hello' })
                }
            }))
        };

        router = new RouterActor(context);
    });

    test('should add a single route', async () => {
        // Mock route handler
        const mockHandler = mock(async (context) => {
            return {
                status: 200,
                headers: new Headers({ 'Content-Type': 'application/json' }),
                body: JSON.stringify({ message: 'Hello' })
            };
        });

        // Add route
        const routeConfig = {
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
        const listHandler = mock(() => { });
        const getHandler = mock(() => { });

        // Create route group
        const groupConfig = {
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
        expect(params.id).toBe('123');
    });

    test('should match route with optional parameters when present', async () => {
        const params = router['matchRoute']('/users/123', '/users/:id?');
        expect(params).not.toBe(null);
        expect(params.id).toBe('123');
    });

    test('should match route with optional parameters when missing', async () => {
        const params = router['matchRoute']('/users', '/users/:id?');
        expect(params).not.toBe(null);
        expect(params.id).toBe(undefined);
    });

    test('should match wildcard routes', async () => {
        const params = router['matchRoute']('/files/images/photo.jpg', '/files/*');
        expect(params).not.toBe(null);
        expect(params['*']).toBe('images/photo.jpg');
    });
}); 