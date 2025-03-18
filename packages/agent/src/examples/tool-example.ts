/**
 * Tool definition example
 * 展示如何定义和使用工具
 */

import { z } from 'zod';
import { Bagctor } from '../bagctor';
import { defineQuery, defineAction, createTool, ToolSet } from '../tools';

// 创建一个Bagctor实例
const bagctor = new Bagctor();

// 定义一个简单的查询工具 - 搜索知识库
const searchTool = defineQuery({
    name: 'search',
    description: '搜索知识库中的内容',
    parameters: z.object({
        query: z.string().describe('搜索关键词'),
        limit: z.number().optional().describe('结果数量限制，默认10条'),
        filter: z.enum(['all', 'recent', 'popular']).optional().describe('过滤类型')
    }),
    handler: async (params) => {
        console.log(`正在搜索: ${params.query}`);
        const limit = params.limit || 10;
        const filter = params.filter || 'all';

        // 模拟搜索结果
        const results = Array.from({ length: limit }, (_, i) => {
            return {
                id: `result-${i + 1}`,
                title: `${params.query} - 搜索结果 ${i + 1}`,
                relevance: Math.random(),
                type: ['文档', '图片', '视频'][Math.floor(Math.random() * 3)]
            };
        });

        return {
            total: limit,
            filter,
            results
        };
    }
});

// 定义一个操作工具 - 创建用户
const createUserTool = defineAction({
    name: 'createUser',
    description: '在系统中创建新用户',
    parameters: z.object({
        username: z.string().describe('用户名'),
        email: z.string().email().describe('电子邮箱'),
        role: z.enum(['admin', 'user', 'guest']).default('user').describe('用户角色')
    }),
    handler: async (params) => {
        console.log(`创建用户: ${params.username}, 角色: ${params.role}`);

        // 模拟创建用户
        const userId = `user-${Date.now()}`;

        return {
            id: userId,
            username: params.username,
            email: params.email,
            role: params.role,
            createdAt: new Date().toISOString()
        };
    },
    requireConfirmation: true // 需要确认的操作
});

// 使用泛型类型的工具
const parseTool = createTool({
    id: 'parseJson',
    description: '解析JSON字符串',
    inputSchema: z.object({
        json: z.string().describe('要解析的JSON字符串')
    }),
    execute: async ({ context }) => {
        try {
            return JSON.parse(context.json);
        } catch (error) {
            return { error: 'Invalid JSON' };
        }
    }
});

// 使用非对象schema的工具
const echoTool = createTool({
    id: 'echo',
    description: '回显输入的字符串',
    inputSchema: z.string(),
    execute: async ({ context }) => {
        return `回显: ${context}`;
    }
});

// 注册工具到Bagctor
bagctor.registerTool(searchTool);
bagctor.registerTools([createUserTool, parseTool, echoTool]);

// 工具集合示例
const databaseTools = new ToolSet();

// 定义一个数据库查询工具
const queryDatabaseTool = defineQuery({
    name: 'queryDatabase',
    description: '查询数据库',
    parameters: z.object({
        table: z.string().describe('表名'),
        columns: z.array(z.string()).default(['*']).describe('列名数组'),
        where: z.record(z.string(), z.any()).optional().describe('查询条件')
    }),
    handler: async (params) => {
        const { table, columns, where } = params;
        let query = `SELECT ${columns.join(', ')} FROM ${table}`;

        if (where) {
            const conditions = Object.entries(where)
                .map(([key, value]) => `${key} = ${typeof value === 'string' ? `'${value}'` : value}`)
                .join(' AND ');

            query += ` WHERE ${conditions}`;
        }

        console.log(`执行SQL: ${query}`);

        // 模拟数据库结果
        return {
            query,
            rows: [
                { id: 1, name: 'Item 1' },
                { id: 2, name: 'Item 2' }
            ]
        };
    }
});

// 定义一个数据库更新工具
const updateDatabaseTool = defineAction({
    name: 'updateDatabase',
    description: '更新数据库记录',
    parameters: z.object({
        table: z.string().describe('表名'),
        data: z.record(z.string(), z.any()).describe('要更新的数据'),
        where: z.record(z.string(), z.any()).describe('更新条件')
    }),
    handler: async (params) => {
        const { table, data, where } = params;

        const setClause = Object.entries(data)
            .map(([key, value]) => `${key} = ${typeof value === 'string' ? `'${value}'` : value}`)
            .join(', ');

        const whereClause = Object.entries(where)
            .map(([key, value]) => `${key} = ${typeof value === 'string' ? `'${value}'` : value}`)
            .join(' AND ');

        const query = `UPDATE ${table} SET ${setClause} WHERE ${whereClause}`;

        console.log(`执行SQL: ${query}`);

        // 模拟更新结果
        return {
            query,
            affectedRows: 1
        };
    },
    requireConfirmation: true
});

// 添加工具到工具集合
databaseTools.add(queryDatabaseTool);
databaseTools.add(updateDatabaseTool);

// 主函数，执行示例
async function main() {
    try {
        console.log('===== 工具定义和执行示例 =====');

        // 执行搜索工具
        console.log('\n执行搜索工具:');
        const searchResult = await bagctor.executeTool('search', {
            query: '人工智能',
            limit: 3,
            filter: 'recent'
        });
        console.log('搜索结果:', JSON.stringify(searchResult, null, 2));

        // 执行用户创建工具
        console.log('\n执行用户创建工具:');
        const createResult = await bagctor.executeTool('createUser', {
            username: 'test_user',
            email: 'test@example.com',
            role: 'admin'
        });
        console.log('创建用户结果:', JSON.stringify(createResult, null, 2));

        // 执行JSON解析工具
        console.log('\n执行JSON解析工具:');
        const parseResult = await bagctor.executeTool('parseJson', {
            json: '{"name": "测试", "value": 123}'
        });
        console.log('解析结果:', JSON.stringify(parseResult, null, 2));

        // 执行字符串echo工具
        console.log('\n执行Echo工具:');
        const echoResult = await bagctor.executeTool('echo', '这是一个测试字符串');
        console.log('Echo结果:', echoResult);

        // 使用工具集合示例
        console.log('\n使用数据库工具集合:');

        // 执行数据库查询
        const queryResult = await databaseTools.execute('queryDatabase', {
            table: 'users',
            columns: ['id', 'name', 'email'],
            where: { status: 'active' }
        });
        console.log('查询结果:', JSON.stringify(queryResult, null, 2));

        // 执行数据库更新
        const updateResult = await databaseTools.execute('updateDatabase', {
            table: 'users',
            data: { status: 'inactive', updated_at: 'NOW()' },
            where: { id: 1 }
        });
        console.log('更新结果:', JSON.stringify(updateResult, null, 2));

        console.log('\n===== 示例执行完成 =====');
    } catch (error) {
        console.error('执行过程中出错:', error);
    }
}

// 执行主函数
if (require.main === module) {
    main();
}

// 导出供其他示例使用
export {
    bagctor,
    searchTool,
    createUserTool,
    parseTool,
    echoTool,
    databaseTools
}; 