/**
 * 工具系统单元测试
 */
import { test, expect, describe, beforeEach } from 'bun:test';
import { Tool, ToolRegistry, ToolParameter } from '../tools/tool_interface';
import { globalToolRegistry, initializeTools } from '../tools';

// 添加一个重置全局工具注册表的函数
function resetGlobalToolRegistry() {
    // 清空全局工具注册表
    (globalToolRegistry as any).tools = new Map();
}

describe('工具系统测试', () => {
    // 在每个测试之前重置工具注册表
    let registry: ToolRegistry;

    beforeEach(() => {
        registry = new ToolRegistry();
    });

    test('应成功注册工具', () => {
        // 创建测试工具
        const testTool: Tool = {
            name: 'test_tool',
            description: '测试工具',
            parameters: [
                {
                    name: 'input',
                    type: 'string',
                    description: '输入参数',
                    required: true
                }
            ],
            execute: async (args: Record<string, any>) => {
                return { result: `processed: ${args.input}` };
            }
        };

        // 注册工具
        registry.register(testTool);

        // 验证工具已注册
        const retrievedTool = registry.get('test_tool');
        expect(retrievedTool).toBeDefined();
        expect(retrievedTool?.name).toBe('test_tool');
        expect(retrievedTool?.description).toBe('测试工具');
    });

    test('不应允许重复注册相同名称的工具', () => {
        // 创建测试工具
        const testTool: Tool = {
            name: 'duplicate_tool',
            description: '测试工具',
            parameters: [],
            execute: async () => ({ result: 'ok' })
        };

        // 首次注册应成功
        registry.register(testTool);

        // 第二次注册应抛出错误
        expect(() => {
            registry.register(testTool);
        }).toThrow();
    });

    test('应成功执行工具', async () => {
        // 创建并注册测试工具
        const testTool: Tool = {
            name: 'echo_tool',
            description: '回显输入',
            parameters: [
                {
                    name: 'message',
                    type: 'string',
                    description: '要回显的消息',
                    required: true
                }
            ],
            execute: async (args: Record<string, any>) => {
                return { echoed: args.message };
            }
        };

        registry.register(testTool);

        // 执行工具
        const result = await registry.executeTool('echo_tool', {
            message: 'hello world'
        });

        // 验证执行结果
        expect(result.success).toBe(true);
        expect(result.data).toEqual({ echoed: 'hello world' });
    });

    test('执行不存在的工具应返回错误', async () => {
        const result = await registry.executeTool('nonexistent_tool', {});

        expect(result.success).toBe(false);
        expect(result.error).toContain('not found');
    });

    test('缺少必需参数应返回错误', async () => {
        // 创建并注册测试工具
        const testTool: Tool = {
            name: 'required_param_tool',
            description: '需要必需参数的工具',
            parameters: [
                {
                    name: 'required_param',
                    type: 'string',
                    description: '必需参数',
                    required: true
                }
            ],
            execute: async () => ({ result: 'ok' })
        };

        registry.register(testTool);

        // 不提供必需参数执行工具
        const result = await registry.executeTool('required_param_tool', {});

        // 验证执行结果
        expect(result.success).toBe(false);
        expect(result.error).toContain('Missing required parameter');
    });

    test('内部错误应正确处理', async () => {
        // 创建出错的工具
        const errorTool: Tool = {
            name: 'error_tool',
            description: '总是抛出错误的工具',
            parameters: [],
            execute: async () => {
                throw new Error('故意抛出的错误');
            }
        };

        registry.register(errorTool);

        // 执行工具
        const result = await registry.executeTool('error_tool', {});

        // 验证执行结果
        expect(result.success).toBe(false);
        expect(result.error).toContain('故意抛出的错误');
    });
});

describe('全局工具注册表测试', () => {
    beforeEach(() => {
        // 在每个测试前重置全局工具注册表
        resetGlobalToolRegistry();
    });

    test('应成功初始化内置工具', () => {
        // 初始化内置工具
        initializeTools();

        // 验证内置工具已注册
        const webSearchTool = globalToolRegistry.get('web_search');
        const textSummarizeTool = globalToolRegistry.get('text_summarize');
        const executeCodeTool = globalToolRegistry.get('execute_code');

        expect(webSearchTool).toBeDefined();
        expect(textSummarizeTool).toBeDefined();
        expect(executeCodeTool).toBeDefined();

        // 验证工具描述
        expect(webSearchTool?.description).toContain('搜索');
        expect(textSummarizeTool?.description).toContain('摘要');
        expect(executeCodeTool?.description).toContain('代码');
    });

    test('web_search工具应正常工作', async () => {
        initializeTools();

        const result = await globalToolRegistry.executeTool('web_search', {
            query: '测试查询'
        });

        expect(result.success).toBe(true);
        expect(result.data).toHaveProperty('results');
        expect(result.data).toHaveProperty('query', '测试查询');
        expect(Array.isArray(result.data.results)).toBe(true);
    });

    test('text_summarize工具应正常工作', async () => {
        initializeTools();

        const longText = 'This is a long text that needs to be summarized. ' +
            'It contains multiple sentences and should be shortened by the summary tool.';

        const result = await globalToolRegistry.executeTool('text_summarize', {
            text: longText,
            max_length: 20
        });

        expect(result.success).toBe(true);
        expect(result.data).toHaveProperty('summary');
        expect(result.data.summary.length).toBeLessThanOrEqual(20 + 3); // +3 for '...'
    });
}); 