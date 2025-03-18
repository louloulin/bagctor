/**
 * Tools definitions tests
 * 测试工具定义功能
 */

import { describe, test, expect, vi, beforeEach } from 'vitest';
import { z } from 'zod';
import { defineQuery, defineAction, createTool, ToolSet } from '../tools';
import { Bagctor } from '../bagctor';

describe('Tool Definition API', () => {
    test('defineQuery creates a valid tool', () => {
        // 创建一个查询工具
        const searchTool = defineQuery({
            name: 'search',
            description: '搜索知识库',
            parameters: z.object({
                query: z.string().describe('搜索关键词'),
                limit: z.number().optional().describe('结果数量限制')
            }),
            handler: async (params) => {
                return { results: [`搜索结果: ${params.query}`] };
            }
        });

        // 验证工具结构
        expect(searchTool.name).toBe('search');
        expect(searchTool.description).toBe('搜索知识库');
        expect(searchTool.parameters.type).toBe('object');
        expect(searchTool.parameters.properties.query.type).toBe('string');
        expect(searchTool.parameters.properties.limit.type).toBe('number');
        expect(searchTool.parameters.required).toContain('query');
        expect(searchTool.parameters.required).not.toContain('limit');
    });

    test('defineAction creates a valid tool', () => {
        // 创建一个操作工具
        const createUserTool = defineAction({
            name: 'createUser',
            description: '创建新用户',
            parameters: z.object({
                username: z.string().describe('用户名'),
                email: z.string().describe('邮箱'),
                role: z.enum(['admin', 'user', 'guest']).describe('用户角色')
            }),
            handler: async (params) => {
                return {
                    id: '123',
                    username: params.username,
                    email: params.email,
                    role: params.role
                };
            },
            requireConfirmation: true
        });

        // 验证工具结构
        expect(createUserTool.name).toBe('createUser');
        expect(createUserTool.description).toBe('创建新用户');
        expect(createUserTool.parameters.type).toBe('object');
        expect(createUserTool.parameters.properties.username.type).toBe('string');
        expect(createUserTool.parameters.properties.email.type).toBe('string');
        expect(createUserTool.parameters.properties.role.type).toBe('string');
        expect(createUserTool.parameters.properties.role.enum).toEqual(['admin', 'user', 'guest']);
        expect(createUserTool.parameters.required).toContain('username');
        expect(createUserTool.parameters.required).toContain('email');
        expect(createUserTool.parameters.required).toContain('role');
    });

    test('createTool with non-object schema', () => {
        // 创建使用非对象schema的工具
        const stringTool = createTool({
            id: 'echo',
            description: '回显输入的字符串',
            inputSchema: z.string(),
            execute: async ({ context }) => {
                return `回显: ${context}`;
            }
        });

        // 验证工具结构
        expect(stringTool.name).toBe('echo');
        expect(stringTool.parameters.type).toBe('object');
        expect(stringTool.parameters.properties.value.type).toBe('string');
    });
});

describe('ToolSet', () => {
    let toolSet: ToolSet;
    let searchTool: any;
    let createUserTool: any;

    beforeEach(() => {
        toolSet = new ToolSet();

        // 创建测试工具
        searchTool = defineQuery({
            name: 'search',
            description: '搜索知识库',
            parameters: z.object({
                query: z.string()
            }),
            handler: async (params) => {
                return { results: [`搜索结果: ${params.query}`] };
            }
        });

        createUserTool = defineAction({
            name: 'createUser',
            description: '创建新用户',
            parameters: z.object({
                username: z.string()
            }),
            handler: async (params) => {
                return { id: '123', username: params.username };
            }
        });
    });

    test('add and get tools', () => {
        // 添加工具
        toolSet.add(searchTool);
        toolSet.add(createUserTool);

        // 获取单个工具
        expect(toolSet.get('search')).toBe(searchTool);
        expect(toolSet.get('createUser')).toBe(createUserTool);
        expect(toolSet.get('notExist')).toBeUndefined();

        // 获取所有工具
        const allTools = toolSet.getAll();
        expect(Object.keys(allTools).length).toBe(2);
        expect(allTools.search).toBe(searchTool);
        expect(allTools.createUser).toBe(createUserTool);
    });

    test('execute tool', async () => {
        // 添加工具并执行
        toolSet.add(searchTool);

        const result = await toolSet.execute('search', { query: 'test' });
        expect(result).toEqual({ results: ['搜索结果: test'] });

        // 执行不存在的工具
        await expect(toolSet.execute('notExist', {})).rejects.toThrow('Tool not found: notExist');
    });
});

describe('Bagctor Tool Integration', () => {
    let bagctor: Bagctor;
    let searchTool: any;

    beforeEach(() => {
        bagctor = new Bagctor();

        searchTool = defineQuery({
            name: 'search',
            description: '搜索知识库',
            parameters: z.object({
                query: z.string()
            }),
            handler: async (params) => {
                return { results: [`搜索结果: ${params.query}`] };
            }
        });
    });

    test('register and use tools', async () => {
        // 注册单个工具
        bagctor.registerTool(searchTool);

        // 获取工具
        const tool = bagctor.getTool('search');
        expect(tool).toBe(searchTool);

        // 执行工具
        const result = await bagctor.executeTool('search', { query: 'test' });
        expect(result).toEqual({ results: ['搜索结果: test'] });

        // 获取所有工具
        const allTools = bagctor.getAllTools();
        expect(Object.keys(allTools).length).toBe(1);
        expect(allTools.search).toBe(searchTool);
    });

    test('register multiple tools', () => {
        const createUserTool = defineAction({
            name: 'createUser',
            description: '创建新用户',
            parameters: z.object({
                username: z.string()
            }),
            handler: async (params) => {
                return { id: '123', username: params.username };
            }
        });

        // 注册多个工具
        bagctor.registerTools([searchTool, createUserTool]);

        // 获取所有工具
        const allTools = bagctor.getAllTools();
        expect(Object.keys(allTools).length).toBe(2);
        expect(allTools.search).toBe(searchTool);
        expect(allTools.createUser).toBe(createUserTool);
    });
}); 