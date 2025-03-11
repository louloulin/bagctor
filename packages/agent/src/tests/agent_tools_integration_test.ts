/**
 * Agent工具集成单元测试
 * 测试Agent如何使用工具系统执行任务
 */

import { test, expect, describe, mock, beforeEach } from 'bun:test';
import { Tool, ToolRegistry } from '../tools/tool_interface';
import { initializeBasicTools } from '../tools/basic_tools';
import { SkillAgent } from '../agents/skill_agent';
import { AssistantAgent } from '../agents/assistant_agent';
import { AgentSystem } from '../agent_system';
import { AgentMessage, AgentConfig, TaskPayload } from '../types';
import { Action } from '../interfaces/action_types';

describe('Agent工具集成测试', () => {
    let mockLLMService: any;
    let toolRegistry: ToolRegistry;
    let agentSystem: AgentSystem;

    // 创建一个测试工具
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
        execute: async (params: any) => {
            const { operation, a, b } = params;
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

    const weatherTool: Tool = {
        name: 'weather',
        description: '获取指定城市的天气信息',
        parameters: [
            {
                name: 'city',
                type: 'string',
                description: '城市名称',
                required: true
            }
        ],
        execute: async (params: any) => {
            // 模拟天气API调用
            const { city } = params;
            // 为了测试，返回固定的天气信息
            return {
                city,
                temperature: 23,
                condition: '晴朗',
                humidity: 65
            };
        }
    };

    beforeEach(() => {
        // 创建新的工具注册表实例
        toolRegistry = new ToolRegistry();

        // 注册测试工具
        toolRegistry.register(mathTool);
        toolRegistry.register(weatherTool);

        // 注册基本工具
        initializeBasicTools();

        // 创建Agent系统
        agentSystem = new AgentSystem();

        // 创建模拟的LLM服务
        mockLLMService = {
            chat: mock(() => Promise.resolve({ content: "我会使用工具来帮助你" })),
            streamChat: mock(async (messages: any, handler: any) => {
                handler("我会使用工具来帮助你");
            })
        };
    });

    test('SkillAgent应能成功调用工具', async () => {
        // 创建SkillAgent
        const config: AgentConfig = {
            role: 'skill_agent',
            capabilities: ['tool_usage', 'calculation'],
            parameters: {
                language: 'typescript',
                framework: 'react'
            }
        };

        const agent = await agentSystem.createAgent(SkillAgent, config);

        // 创建任务消息
        const taskAction: Action = {
            type: 'EXECUTE_TOOL',
            tool: mathTool.name,
            parameters: {
                operation: 'add',
                a: 5,
                b: 3
            }
        };

        const message: AgentMessage = {
            type: 'TASK',
            sender: agent,
            timestamp: Date.now(),
            payload: {
                type: 'TASK',
                action: taskAction
            }
        };

        // 发送消息给Agent
        await agentSystem.tell(agent, message);

        // 验证工具被调用
        // TODO: Add verification logic
    });

    test('AssistantAgent应能同样使用工具', async () => {
        // 创建AssistantAgent
        const agent = new AssistantAgent({
            role: 'assistant_agent',
            parameters: {
                helpfulness: 0.9,
                creativity: 0.7
            }
        }, mockLLMService, toolRegistry);

        // 发送需要使用天气工具的请求
        const response = await agent.processMessage('北京今天的天气怎么样？');

        // 验证
        expect(mockLLMService.sendMessage).toHaveBeenCalled();
        expect(response).toBeDefined();
        // 应该包含天气工具的执行结果
        expect(response).toContain('北京');
        expect(response).toContain('晴朗');
        expect(response).toContain('23');
    });

    test('Agent应能处理工具执行错误', async () => {
        // 修改模拟LLM服务以返回会导致错误的工具调用
        mockLLMService.sendMessage = mock(() => {
            return Promise.resolve({
                role: 'assistant',
                content: '我将使用calculator工具。\n\n{\"tool\":\"calculator\",\"parameters\":{\"operation\":\"divide\",\"a\":10,\"b\":0}}'
            });
        });

        // 创建Agent
        const agent = new SkillAgent({
            role: 'skill_agent',
            parameters: {}
        }, mockLLMService, toolRegistry);

        // 发送消息
        const response = await agent.processMessage('计算10除以0');

        // 验证错误处理
        expect(response).toBeDefined();
        expect(response).toContain('错误'); // 应包含错误信息
        expect(response).toContain('除数不能为零');
    });

    test('Agent应能处理流式工具调用', async () => {
        // 创建Agent
        const agent = new SkillAgent({
            role: 'skill_agent',
            parameters: {}
        }, mockLLMService, toolRegistry);

        // 存储流式接收的消息
        let streamedMessages: string[] = [];

        // 发送消息并接收流式响应
        await agent.processMessageStream('使用calculator计算4乘以7', {
            onMessage: (message: string) => {
                streamedMessages.push(message);
            }
        });

        // 验证
        expect(mockLLMService.sendMessageStream).toHaveBeenCalled();
        expect(streamedMessages.length).toBeGreaterThan(0);
        // 应该包含某个消息包含工具执行结果
        const resultMessage = streamedMessages.find(msg => msg.includes('28')); // 4 * 7 = 28
        expect(resultMessage).toBeDefined();
    });

    test('Agent应能同时使用多个工具', async () => {
        // 修改模拟LLM以返回多个工具调用
        mockLLMService.sendMessage = mock(() => {
            return Promise.resolve({
                role: 'assistant',
                content: `我会先查询天气，然后做个计算。

{\"tool\":\"weather\",\"parameters\":{\"city\":\"上海\"}}

根据天气数据，我还需要计算一下。

{\"tool\":\"calculator\",\"parameters\":{\"operation\":\"multiply\",\"a\":23,\"b\":2}}`
            });
        });

        // 创建Agent
        const agent = new AssistantAgent({
            role: 'assistant_agent',
            parameters: {}
        }, mockLLMService, toolRegistry);

        // 发送消息
        const response = await agent.processMessage('上海的温度是多少？如果温度翻倍会是多少？');

        // 验证所有工具都被调用
        expect(response).toBeDefined();
        expect(response).toContain('上海'); // 天气工具结果
        expect(response).toContain('46'); // 23 * 2 = 46，计算工具结果
    });

    test('Agent应能处理不存在的工具调用', async () => {
        // 修改模拟LLM以返回不存在的工具调用
        mockLLMService.sendMessage = mock(() => {
            return Promise.resolve({
                role: 'assistant',
                content: '我将使用一个不存在的工具。\n\n{\"tool\":\"nonexistent_tool\",\"parameters\":{\"param\":\"value\"}}'
            });
        });

        // 创建Agent
        const agent = new SkillAgent({
            role: 'skill_agent',
            parameters: {}
        }, mockLLMService, toolRegistry);

        // 发送消息
        const response = await agent.processMessage('使用不存在的工具');

        // 验证错误处理
        expect(response).toBeDefined();
        expect(response).toContain('错误'); // 应包含错误信息
        expect(response).toContain('找不到'); // 应提到找不到工具
    });
}); 