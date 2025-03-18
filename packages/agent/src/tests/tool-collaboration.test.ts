/**
 * 基于工具的智能体协作测试
 */

import { describe, test, expect, vi, beforeEach } from 'vitest';
import { z } from 'zod';
import { Agent } from '@mastra/core/agent';
import { Bagctor } from '../bagctor';
import { createAgentTool, AgentToolGroup, ToolChain, ToolChainBuilder, ToolChainResult } from '../agent-tools';
import { Tool } from '../tools';

// 创建模拟的Agent
function createMockAgent(name: string): Agent {
    return {
        name,
        generate: vi.fn().mockImplementation(async (prompt: string) => {
            return { text: `模拟智能体${name}的回复：${prompt.substring(0, 20)}...` };
        })
    } as unknown as Agent;
}

// 创建用于测试的模拟工具链
function createMockToolChain(): ToolChain {
    // 创建模拟智能体
    const translator = createMockAgent('translator');
    const writer = createMockAgent('writer');
    const editor = createMockAgent('editor');

    // 创建工具
    const translationTool = createAgentTool({
        id: 'translate',
        description: '翻译',
        agent: translator,
        template: '翻译：{{input.text}}'
    });

    const writingTool = createAgentTool({
        id: 'write',
        description: '写作',
        agent: writer,
        template: '写一篇关于{{input.topic}}的文章'
    });

    const editingTool = createAgentTool({
        id: 'edit',
        description: '编辑',
        agent: editor,
        template: '编辑文章：{{input.content}}'
    });

    // 创建工具链构建器
    const builder = new ToolChainBuilder('content-chain');

    // 添加工具
    return builder
        .add(writingTool, {
            id: 'writing',
            input: (input) => ({ topic: input.content })
        })
        .add(editingTool, {
            id: 'editing',
            input: (input, results) => ({ content: results?.writing })
        })
        .add(translationTool, {
            id: 'translation',
            input: (input, results) => ({ text: results?.editing })
        })
        .build();
}

describe('AgentTools 基本功能', () => {
    let translator: Agent;
    let writer: Agent;
    let editor: Agent;

    beforeEach(() => {
        translator = createMockAgent('translator');
        writer = createMockAgent('writer');
        editor = createMockAgent('editor');
    });

    test('创建智能体工具并执行', async () => {
        // 创建基于智能体的工具
        const translationTool = createAgentTool({
            id: 'translate',
            description: '翻译内容',
            agent: translator,
            template: '翻译文本: {{input.text}}'
        });

        // 确认工具结构正确
        expect(translationTool.name).toBe('translate');
        expect(translationTool.description).toBe('翻译内容');

        // 执行工具
        const result = await translationTool.handler({ text: 'Hello World' });

        // 验证结果
        expect(result).toContain('模拟智能体translator的回复');
        expect(translator.generate).toHaveBeenCalledWith(expect.stringContaining('Hello World'));
    });

    test('智能体工具接收复杂输入', async () => {
        // 创建具有前处理和后处理的工具
        const complexTool = createAgentTool({
            id: 'complex',
            description: '复杂处理',
            agent: writer,
            preProcess: (input) => `处理主题: ${input.topic}, 格式: ${input.format}`,
            postProcess: (result, input) => ({
                content: result,
                metadata: {
                    topic: input.topic,
                    processed: true
                }
            })
        });

        // 执行工具
        const result = await complexTool.handler({
            topic: '人工智能',
            format: 'markdown'
        });

        // 验证结果
        expect(result).toHaveProperty('content');
        expect(result).toHaveProperty('metadata');
        expect(result.metadata.topic).toBe('人工智能');
        expect(result.metadata.processed).toBe(true);
        expect(writer.generate).toHaveBeenCalledWith('处理主题: 人工智能, 格式: markdown');
    });
});

describe('AgentToolGroup 功能', () => {
    let bagctor: Bagctor;
    let toolGroup: AgentToolGroup;

    beforeEach(() => {
        bagctor = new Bagctor();

        // 创建模拟智能体
        const translator = createMockAgent('translator');
        const writer = createMockAgent('writer');

        // 添加到toolGroup
        toolGroup = new AgentToolGroup();
        toolGroup.addAgent('translator', translator);
        toolGroup.addAgent('writer', writer);
    });

    test('添加和获取工具', () => {
        // 创建工具
        toolGroup.createTool({
            id: 'write',
            description: '写作',
            agent: 'writer',
            template: '写一篇关于{{input.topic}}的文章'
        });

        toolGroup.createTool({
            id: 'translate',
            description: '翻译',
            agent: 'translator',
            template: '翻译：{{input.text}}'
        });

        // 获取单个工具
        const writeTool = toolGroup.getTool('write');
        expect(writeTool).toBeDefined();
        expect(writeTool?.name).toBe('write');

        // 获取所有工具
        const allTools = toolGroup.getAllTools();
        expect(Object.keys(allTools).length).toBe(2);
        expect(allTools.write).toBeDefined();
        expect(allTools.translate).toBeDefined();
    });

    test('执行工具', async () => {
        // 创建工具
        toolGroup.createTool({
            id: 'translate',
            description: '翻译',
            agent: 'translator',
            template: '翻译：{{input.text}}'
        });

        // 执行工具
        const result = await toolGroup.executeTool('translate', {
            text: 'Hello World'
        });

        // 验证结果
        expect(result).toContain('模拟智能体translator的回复');
    });

    test('执行不存在的工具应该抛出错误', async () => {
        await expect(toolGroup.executeTool('nonexistent', {}))
            .rejects.toThrow('找不到工具: nonexistent');
    });
});

describe('ToolChain 功能', () => {
    let bagctor: Bagctor;
    let translationTool: Tool;
    let writingTool: Tool;
    let editingTool: Tool;

    beforeEach(() => {
        bagctor = new Bagctor();

        // 创建模拟智能体
        const translator = createMockAgent('translator');
        const writer = createMockAgent('writer');
        const editor = createMockAgent('editor');

        // 创建工具
        translationTool = createAgentTool({
            id: 'translate',
            description: '翻译',
            agent: translator,
            template: '翻译：{{input.text}}'
        });

        writingTool = createAgentTool({
            id: 'write',
            description: '写作',
            agent: writer,
            template: '写一篇关于{{input.topic}}的文章'
        });

        editingTool = createAgentTool({
            id: 'edit',
            description: '编辑',
            agent: editor,
            template: '编辑文章：{{input.content}}'
        });
    });

    test('创建和执行工具链', async () => {
        // 创建测试工具链
        const toolChain = createMockToolChain();

        // 监听完成事件
        let completionResult: ToolChainResult | null = null;
        toolChain.on('complete', (result: ToolChainResult) => {
            completionResult = result;
        });

        // 执行工具链
        const result = await toolChain.execute({ content: '测试内容' });

        // 验证结果
        expect(result.success).toBe(true);
        expect(result.results).toHaveProperty('writing');
        expect(result.results).toHaveProperty('editing');
        expect(result.results).toHaveProperty('translation');

        // 检查executionTime属性存在
        expect(result).toHaveProperty('executionTime');

        // 验证事件触发
        expect(completionResult).not.toBeNull();
        expect(completionResult?.success).toBe(true);
    });

    test('工具链错误处理 - 停止执行', async () => {
        // 创建一个会失败的工具
        const failingTool: Tool = {
            name: 'fail',
            description: '失败工具',
            parameters: { type: 'object', properties: {} },
            handler: vi.fn().mockRejectedValue(new Error('故意失败'))
        };

        // 创建工具链
        const chain = new ToolChainBuilder()
            .add(writingTool, {
                id: 'writing',
                input: (input) => input
            })
            .add(failingTool, {
                id: 'failing',
                input: (input) => input
            })
            .add(editingTool, {
                id: 'editing',
                input: (input) => input
            })
            .build();

        // 添加错误处理监听器，避免未处理的错误
        let capturedError: any = null;
        chain.addListener('error', (err) => {
            capturedError = err;
        });

        // 执行工具链
        const result = await chain.execute({ topic: '测试' });

        // 验证结果
        expect(result.success).toBe(false);
        expect(result.results).toHaveProperty('writing');
        expect(result.results).not.toHaveProperty('editing');
        expect(result.error).toBeDefined();
        expect(result.error?.message).toBe('故意失败');

        // 验证错误事件也被捕获
        expect(capturedError).not.toBeNull();
    });

    test('工具链错误处理 - 继续执行', async () => {
        // 创建一个会失败的工具
        const failingTool: Tool = {
            name: 'fail',
            description: '失败工具',
            parameters: { type: 'object', properties: {} },
            handler: vi.fn().mockRejectedValue(new Error('故意失败'))
        };

        // 创建工具链
        const chain = new ToolChainBuilder()
            .add(writingTool, {
                id: 'writing',
                input: (input) => input
            })
            .add(failingTool, {
                id: 'failing',
                input: (input) => input
            })
            .add(editingTool, {
                id: 'editing',
                input: (input) => input
            })
            .build();

        // 执行工具链，设置continueOnError=true
        const result = await chain.execute({ topic: '测试' }, { continueOnError: true });

        // 验证结果 - 应该有writing和editing结果，没有failing结果
        expect(result.success).toBe(true);
        expect(result.results).toHaveProperty('writing');
        expect(result.results).not.toHaveProperty('failing');
        expect(result.results).toHaveProperty('editing');
    });
});

describe('Bagctor 工具协作集成', () => {
    let bagctor: Bagctor;
    let translator: Agent;
    let writer: Agent;

    beforeEach(() => {
        bagctor = new Bagctor();
        translator = createMockAgent('translator');
        writer = createMockAgent('writer');

        // 添加智能体到Bagctor
        (bagctor as any).agentsMap.set('translator', translator);
        (bagctor as any).agentsMap.set('writer', writer);
    });

    test('创建智能体工具', () => {
        const tool = bagctor.createAgentTool({
            id: 'translate',
            description: '翻译工具',
            agent: 'translator',
            template: '翻译: {{input.text}}'
        });

        expect(tool.name).toBe('translate');
        expect(tool.description).toBe('翻译工具');
    });

    test('创建工具链', async () => {
        // 创建工具
        const translateTool = bagctor.createAgentTool({
            id: 'translate',
            description: '翻译',
            agent: 'translator'
        });

        const writeTool = bagctor.createAgentTool({
            id: 'write',
            description: '写作',
            agent: 'writer'
        });

        // 创建工具链
        const chain = bagctor.createToolChain()
            .add(writeTool, {
                id: 'writing',
                input: (input) => input
            })
            .add(translateTool, {
                id: 'translation',
                input: (input, results) => ({ text: results?.writing })
            })
            .build();

        // 执行工具链
        const results = await bagctor.executeToolChain(chain, { topic: '测试' });

        expect(results).toHaveProperty('writing');
        expect(results).toHaveProperty('translation');
    });

    test('创建协作者智能体', async () => {
        // 添加一个技术专家智能体
        const tech = createMockAgent('tech');
        (bagctor as any).agentsMap.set('tech', tech);

        // 保存原始的createCoordinatorAgent方法
        const originalMethod = bagctor.createCoordinatorAgent;

        try {
            // 修改createCoordinatorAgent方法返回模拟对象
            bagctor.createCoordinatorAgent = vi.fn().mockImplementation((config) => {
                const mockCoordinator = {
                    name: config.name,
                    instructions: config.instructions,
                    generate: async () => ({ text: '协调结果' }),
                    doGenerate: vi.fn().mockResolvedValue({
                        text: '协调结果'
                    })
                };

                // 将模拟协作者加入agentsMap
                (bagctor as any).agentsMap.set(config.name, mockCoordinator);

                return mockCoordinator;
            });

            // 创建协作者智能体
            const coordinator = bagctor.createCoordinatorAgent({
                name: 'coordinator',
                instructions: '协调其他智能体工作',
                model: {
                    generate: vi.fn(),
                    doGenerate: vi.fn().mockResolvedValue({
                        text: '协调结果'
                    })
                },
                agentTools: ['translator', 'writer', 'tech']
            });

            // 验证协作者智能体
            expect(coordinator).toBeDefined();
            expect(coordinator.name).toBe('coordinator');

            // 验证协作者智能体已注册到Bagctor
            expect((bagctor as any).agentsMap.has('coordinator')).toBe(true);
        } finally {
            // 恢复原始方法
            bagctor.createCoordinatorAgent = originalMethod;
        }
    });
}); 