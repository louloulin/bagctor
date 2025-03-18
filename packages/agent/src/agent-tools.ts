/**
 * 基于工具的智能体协作
 * 提供智能体封装为工具、工具链和协作模式的功能
 */

import { z } from 'zod';
import { Agent } from '@mastra/core/agent';
import { Tool, createTool, ToolContext } from './tools';
import { EventEmitter } from 'events';

/**
 * 智能体工具选项
 */
export interface AgentToolOptions<TInput = any, TOutput = any> {
    /**
     * 工具ID
     */
    id: string;

    /**
     * 工具描述
     */
    description: string;

    /**
     * 代理智能体
     */
    agent: Agent | string;

    /**
     * 智能体指令模板
     * 可以使用 {{input}} 引用输入参数
     */
    template?: string;

    /**
     * 输入参数模式定义
     */
    inputSchema?: z.ZodType<TInput>;

    /**
     * 输出参数模式定义
     */
    outputSchema?: z.ZodType<TOutput>;

    /**
     * 前处理函数
     * 用于在调用智能体前处理输入
     */
    preProcess?: (input: TInput) => Promise<string> | string;

    /**
     * 后处理函数
     * 用于在智能体返回结果后处理输出
     */
    postProcess?: (result: string, input: TInput) => Promise<TOutput> | TOutput;
}

/**
 * 工具链节点定义
 */
export interface ToolChainNode {
    /**
     * 节点ID
     */
    id: string;

    /**
     * 工具
     */
    tool: Tool;

    /**
     * 输入映射函数
     */
    input: (input: any, results?: Record<string, any>) => any;
}

/**
 * 工具链执行选项
 */
export interface ToolChainExecuteOptions {
    /**
     * 上下文
     */
    context?: ToolContext;

    /**
     * 是否继续执行，即使某些步骤失败
     */
    continueOnError?: boolean;
}

/**
 * 工具链执行结果
 */
export interface ToolChainResult {
    /**
     * 是否成功
     */
    success: boolean;

    /**
     * 各步骤结果
     */
    results: Record<string, any>;

    /**
     * 执行时间
     */
    executionTime: number;

    /**
     * 错误信息
     */
    error?: Error;
}

/**
 * 工具链构建器 - 用于创建和执行工具序列
 */
export class ToolChainBuilder {
    private nodes: ToolChainNode[] = [];
    private name: string;
    private events = new EventEmitter();

    /**
     * 创建工具链构建器
     * @param name 工具链名称
     */
    constructor(name: string = 'tool-chain') {
        this.name = name;
    }

    /**
     * 添加工具到链中
     * @param tool 工具
     * @param options 节点选项
     */
    add(tool: Tool, options: { id: string; input: (input: any, results?: Record<string, any>) => any }): ToolChainBuilder {
        this.nodes.push({
            id: options.id,
            tool,
            input: options.input
        });
        return this;
    }

    /**
     * 构建工具链
     */
    build(): ToolChain {
        return new ToolChain({
            name: this.name,
            nodes: [...this.nodes]
        });
    }

    /**
     * 监听事件
     */
    on(event: string, handler: (...args: any[]) => void): ToolChainBuilder {
        this.events.on(event, handler);
        return this;
    }
}

/**
 * 工具链 - 按顺序执行多个工具
 */
export class ToolChain extends EventEmitter {
    private name: string;
    private nodes: ToolChainNode[];

    /**
     * 创建工具链
     */
    constructor({ name, nodes }: { name: string; nodes: ToolChainNode[] }) {
        super({ captureRejections: false });
        this.name = name;
        this.nodes = nodes;
    }

    /**
     * 执行工具链
     * @param input 输入参数
     * @param options 执行选项
     */
    async execute(input: any, options: ToolChainExecuteOptions = {}): Promise<ToolChainResult> {
        const startTime = Date.now();
        const results: Record<string, any> = {};

        // 确保至少有一个错误事件监听器，以避免未处理的错误
        if (this.listenerCount('error') === 0) {
            this.on('error', () => {
                // 静默处理，防止未捕获的错误
            });
        }

        try {
            this.emit('start', { input, chainName: this.name });

            let lastResult = input;

            // 按顺序执行各节点
            for (const node of this.nodes) {
                try {
                    this.emit('nodeStart', { nodeId: node.id, input: lastResult });

                    // 计算节点输入
                    const nodeInput = node.input(lastResult, results);

                    // 执行工具
                    const result = await node.tool.handler(nodeInput, options.context);

                    // 保存结果
                    results[node.id] = result;
                    lastResult = result;

                    this.emit('nodeComplete', { nodeId: node.id, result });
                } catch (error) {
                    // 先发出节点错误事件，但不抛出未处理的错误
                    this.emit('nodeError', { nodeId: node.id, error });

                    if (!options.continueOnError) {
                        // 构建失败结果
                        const executionTime = Date.now() - startTime;
                        const failureResult: ToolChainResult = {
                            success: false,
                            results,
                            executionTime: Math.max(1, executionTime),
                            error: error as Error
                        };

                        // 发出链错误事件，但不会导致未处理的错误
                        this.emit('error', failureResult);

                        return failureResult;
                    }
                }
            }

            const executionTime = Date.now() - startTime;
            const finalResult: ToolChainResult = {
                success: true,
                results,
                executionTime: Math.max(1, executionTime)
            };

            this.emit('complete', finalResult);
            return finalResult;
        } catch (error) {
            const executionTime = Date.now() - startTime;
            const failureResult: ToolChainResult = {
                success: false,
                results,
                executionTime: Math.max(1, executionTime),
                error: error as Error
            };

            // 发出链错误事件，但不会导致未处理的错误
            this.emit('error', failureResult);
            return failureResult;
        }
    }
}

/**
 * 创建基于智能体的工具
 * 包装智能体作为工具使用
 */
export function createAgentTool<TInput = any, TOutput = any>(
    options: AgentToolOptions<TInput, TOutput>
): Tool<TInput, TOutput> {
    const inputSchema = options.inputSchema || z.any();
    const agentInstance = typeof options.agent === 'string'
        ? null  // 后续需要解析
        : options.agent;

    // 使用createTool函数创建工具
    return createTool({
        id: options.id,
        description: options.description,
        inputSchema,
        outputSchema: options.outputSchema,
        execute: async ({ context }) => {
            // 获取智能体实例
            const agent = agentInstance || context?.agentRegistry?.[options.agent as string];
            if (!agent) {
                throw new Error(`找不到智能体: ${options.agent}`);
            }

            // 构建智能体提示
            let prompt: string;

            if (options.preProcess) {
                // 使用预处理函数处理输入
                prompt = await Promise.resolve(options.preProcess(context as TInput));
            } else if (options.template) {
                // 使用模板构建提示，支持对象路径格式如 input.property
                prompt = options.template.replace(/\{\{input\}\}/g, JSON.stringify(context))
                    .replace(/\{\{input\.([^}]+)\}\}/g, (match, path) => {
                        const pathParts = path.split('.');
                        let value = context;
                        for (const part of pathParts) {
                            if (value === null || value === undefined) return '';
                            value = value[part];
                        }
                        return typeof value === 'object' ? JSON.stringify(value) : String(value || '');
                    });
            } else {
                // 默认提示格式
                prompt = `处理以下输入:\n${JSON.stringify(context, null, 2)}`;
            }

            // 调用智能体
            const result = await agent.generate(prompt);
            const agentOutput = typeof result === 'string' ? result : result.text;

            // 处理输出
            if (options.postProcess) {
                return await Promise.resolve(options.postProcess(agentOutput, context as TInput));
            }

            return agentOutput as unknown as TOutput;
        }
    });
}

/**
 * 创建协作工具组
 * 注册多个智能体工具并管理它们
 */
export class AgentToolGroup extends EventEmitter {
    private tools: Record<string, Tool> = {};
    private agents: Record<string, Agent> = {};

    /**
     * 添加智能体
     */
    addAgent(id: string, agent: Agent): this {
        this.agents[id] = agent;
        return this;
    }

    /**
     * 创建并添加智能体工具
     */
    createTool<TInput = any, TOutput = any>(
        options: Omit<AgentToolOptions<TInput, TOutput>, 'agent'> & { agent: string }
    ): this {
        const agent = this.agents[options.agent];
        if (!agent) {
            throw new Error(`找不到智能体: ${options.agent}`);
        }

        const tool = createAgentTool({
            ...options,
            agent
        });

        this.tools[options.id] = tool;
        return this;
    }

    /**
     * 添加工具
     */
    addTool(tool: Tool): this {
        this.tools[tool.name] = tool;
        return this;
    }

    /**
     * 获取工具
     */
    getTool(id: string): Tool | undefined {
        return this.tools[id];
    }

    /**
     * 获取所有工具
     */
    getAllTools(): Record<string, Tool> {
        return { ...this.tools };
    }

    /**
     * 执行工具
     */
    async executeTool(id: string, input: any, context?: ToolContext): Promise<any> {
        const tool = this.getTool(id);
        if (!tool) {
            throw new Error(`找不到工具: ${id}`);
        }

        // 添加智能体注册表到上下文
        const enrichedContext = {
            ...context,
            agentRegistry: this.agents
        };

        this.emit('toolStart', { toolId: id, input });

        try {
            const result = await tool.handler(input, enrichedContext);
            this.emit('toolComplete', { toolId: id, result });
            return result;
        } catch (error) {
            this.emit('toolError', { toolId: id, error });
            throw error;
        }
    }

    /**
     * 创建工具链构建器
     */
    createChain(name?: string): ToolChainBuilder {
        return new ToolChainBuilder(name);
    }
}

/**
 * 创建协作者智能体
 * 使用工具实现智能体之间的协作
 */
export interface CoordinatorAgentOptions {
    /**
     * 智能体名称
     */
    name: string;

    /**
     * 指令
     */
    instructions: string;

    /**
     * 模型提供者
     */
    model: any;

    /**
     * 智能体工具
     */
    tools: Record<string, Tool>;
}

/**
 * 构建协作者智能体
 * 协调多个智能体工具执行复杂任务
 */
export function createCoordinatorAgent(
    options: CoordinatorAgentOptions
): Agent {
    return new Agent({
        name: options.name,
        instructions: options.instructions,
        model: options.model,
        tools: options.tools
    });
}