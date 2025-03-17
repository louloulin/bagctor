/**
 * 路由测试辅助模块
 */

/**
 * 测试路由配置
 */
export interface TestRouteConfig {
    path: string;
    method: string;
    name: string;
    description?: string;
}

/**
 * 基本测试路由
 */
export const routeTests: TestRouteConfig[] = [
    {
        path: '/api/users',
        method: 'GET',
        name: 'listUsers',
        description: '获取用户列表'
    },
    {
        path: '/api/users/:id',
        method: 'GET',
        name: 'getUser',
        description: '获取单个用户'
    },
    {
        path: '/api/users',
        method: 'POST',
        name: 'createUser',
        description: '创建用户'
    },
    {
        path: '/api/users/:id',
        method: 'PUT',
        name: 'updateUser',
        description: '更新用户'
    },
    {
        path: '/api/users/:id',
        method: 'DELETE',
        name: 'deleteUser',
        description: '删除用户'
    },
    {
        path: '/api/posts',
        method: 'GET',
        name: 'listPosts',
        description: '获取文章列表'
    },
    {
        path: '/api/posts/:id',
        method: 'GET',
        name: 'getPost',
        description: '获取单个文章'
    }
]; 