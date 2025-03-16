import { ActorSystem } from '@bactor/core';
import { createHttpSystem, HttpResponses, HttpStatus, RouteGroupConfig } from '../../src';
import type { HttpContext } from '../../src';

async function main() {
    // Create actor system
    const system = new ActorSystem('route-groups-example');

    // Create HTTP system
    const httpSystem = await createHttpSystem(system, {
        port: 3000
    });

    // Define API routes for users
    const userRoutes: RouteGroupConfig = {
        prefix: '/api/users',
        routes: [
            {
                method: 'GET',
                pattern: '/',
                handler: async (context: HttpContext) => {
                    return HttpResponses.json(
                        { users: [{ id: 1, name: 'John' }, { id: 2, name: 'Jane' }] }
                    );
                }
            },
            {
                method: 'GET',
                pattern: '/:id',
                handler: async (context: HttpContext) => {
                    const userId = context.params.id;
                    return HttpResponses.json(
                        { user: { id: userId, name: 'User ' + userId } }
                    );
                }
            },
            {
                method: 'POST',
                pattern: '/',
                handler: async (context: HttpContext) => {
                    // In a real app, we would parse the body and create a user
                    return HttpResponses.json(
                        { message: 'User created successfully', id: 3 },
                        HttpStatus.CREATED
                    );
                }
            }
        ]
    };

    // Define API routes for posts
    const postRoutes: RouteGroupConfig = {
        prefix: '/api/posts',
        routes: [
            {
                method: 'GET',
                pattern: '/',
                handler: async (context: HttpContext) => {
                    return HttpResponses.json(
                        { posts: [{ id: 1, title: 'Hello World' }, { id: 2, title: 'Another Post' }] }
                    );
                }
            },
            {
                method: 'GET',
                pattern: '/:id',
                handler: async (context: HttpContext) => {
                    const postId = context.params.id;
                    return HttpResponses.json(
                        { post: { id: postId, title: 'Post ' + postId, content: 'This is post ' + postId } }
                    );
                }
            }
        ]
    };

    // Add route groups to the system
    await httpSystem.addRouteGroup(userRoutes);
    await httpSystem.addRouteGroup(postRoutes);

    // Add a single route
    await httpSystem.addRoute({
        method: 'GET',
        pattern: '/',
        handler: async (context: HttpContext) => {
            return HttpResponses.json({
                message: 'Welcome to the API',
                endpoints: {
                    users: '/api/users',
                    posts: '/api/posts'
                }
            });
        }
    });

    // Start the server
    await httpSystem.start();

    console.log('Server is running at http://localhost:3000');
    console.log('Available endpoints:');
    console.log('- GET /');
    console.log('- GET /api/users');
    console.log('- GET /api/users/:id');
    console.log('- POST /api/users');
    console.log('- GET /api/posts');
    console.log('- GET /api/posts/:id');
}

main().catch(err => {
    console.error('Error starting server:', err);
    process.exit(1);
}); 