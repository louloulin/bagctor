import { describe, expect, test, beforeAll, afterAll } from 'bun:test';
import { ActorSystem } from '@bactor/core';
import { createHttpSystem, HttpResponses, HttpStatus, RouteGroupConfig } from '../../src';
import type { HttpContext } from '../../src';

describe('Route Groups Integration', () => {
    let system;
    let httpSystem;
    let server;
    const PORT = 3000 + Math.floor(Math.random() * 1000); // Random port to avoid conflicts

    beforeAll(async () => {
        // Setup
        system = new ActorSystem('route-groups-test');
        httpSystem = await createHttpSystem(system, {
            port: PORT,
            hostname: 'localhost'
        });

        // Define API routes for users
        const userRoutes = {
            prefix: '/api/users',
            routes: [
                {
                    method: 'GET',
                    pattern: '/',
                    handler: async (context) => {
                        return HttpResponses.json(
                            { users: [{ id: 1, name: 'John' }, { id: 2, name: 'Jane' }] }
                        );
                    }
                },
                {
                    method: 'GET',
                    pattern: '/:id',
                    handler: async (context) => {
                        const userId = context.params.id;
                        return HttpResponses.json(
                            { user: { id: userId, name: 'User ' + userId } }
                        );
                    }
                }
            ]
        };

        // Add route groups to the system
        await httpSystem.addRouteGroup(userRoutes);

        // Add a single route
        await httpSystem.addRoute({
            method: 'GET',
            pattern: '/',
            handler: async (context) => {
                return HttpResponses.json({
                    message: 'Welcome to the API',
                    endpoints: {
                        users: '/api/users'
                    }
                });
            }
        });

        // Start the server
        await httpSystem.start();

        // Wait a moment for the server to start
        await new Promise(resolve => setTimeout(resolve, 100));
    });

    afterAll(async () => {
        // Teardown
        if (httpSystem) {
            await httpSystem.stop();
        }
    });

    test('should respond to the root route', async () => {
        const response = await fetch(`http://localhost:${PORT}/`);
        expect(response.status).toBe(200);

        const data = await response.json();
        expect(data.message).toBe('Welcome to the API');
        expect(data.endpoints.users).toBe('/api/users');
    });

    test('should respond to the users list route in the group', async () => {
        const response = await fetch(`http://localhost:${PORT}/api/users`);
        expect(response.status).toBe(200);

        const data = await response.json();
        expect(Array.isArray(data.users)).toBe(true);
        expect(data.users.length).toBe(2);
        expect(data.users[0].name).toBe('John');
    });

    test('should respond to the user detail route with parameters', async () => {
        const response = await fetch(`http://localhost:${PORT}/api/users/123`);
        expect(response.status).toBe(200);

        const data = await response.json();
        expect(data.user.id).toBe('123');
        expect(data.user.name).toBe('User 123');
    });
}); 