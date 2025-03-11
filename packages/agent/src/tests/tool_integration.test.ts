/**
 * Tool integration test
 */
import { test, expect, describe, beforeEach } from 'bun:test';
import { Tool, ToolRegistry } from '../tools/tool_interface';

describe('Tool Integration', () => {
    let toolRegistry: ToolRegistry;

    beforeEach(() => {
        // Create a new registry for each test
        toolRegistry = new ToolRegistry();
    });

    test('should execute a simple math tool', async () => {
        // Create a simple math tool
        const mathTool: Tool = {
            name: 'calculator',
            description: '执行简单的数学计算',
            parameters: [
                {
                    name: 'operation',
                    type: 'string',
                    description: '数学运算，例如 add, subtract, multiply, divide',
                    required: true
                },
                {
                    name: 'a',
                    type: 'number',
                    description: '第一个操作数',
                    required: true
                },
                {
                    name: 'b',
                    type: 'number',
                    description: '第二个操作数',
                    required: true
                }
            ],
            execute: async (args: Record<string, any>) => {
                const { operation, a, b } = args;
                switch (operation) {
                    case 'add': return { result: a + b };
                    case 'subtract': return { result: a - b };
                    case 'multiply': return { result: a * b };
                    case 'divide':
                        if (b === 0) throw new Error('除数不能为零');
                        return { result: a / b };
                    default: throw new Error('不支持的操作');
                }
            }
        };

        // Register the tool
        toolRegistry.register(mathTool);

        // Execute the tool
        const result = await toolRegistry.executeTool('calculator', {
            operation: 'add',
            a: 5,
            b: 3
        });

        // Verify the result
        expect(result.success).toBe(true);
        expect(result.data).toEqual({ result: 8 });
    });

    test('should handle tool execution errors', async () => {
        // Try to execute a non-existent tool
        const result = await toolRegistry.executeTool('non_existent_tool', {});

        // Verify error handling
        expect(result.success).toBe(false);
        expect(result.error).toBeDefined();
        expect(result.error).toContain('not found');
    });
}); 