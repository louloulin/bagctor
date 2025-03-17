import { Actor, Message } from '@bactor/core';
import { PID } from '@bactor/common';
import type { ActorContext } from '@bactor/core';
// 使用模拟的Agent类型，因为目前可能没有正确安装@mastra包
// import { Agent } from '@mastra/core/agent';
// import { openai } from '@ai-sdk/openai';

/**
 * 模拟Mastra Agent实现
 */
interface Agent {
    generate: (content: string) => Promise<any>;
    addTool: (tool: any) => void;
}

// 模拟OpenAI模型函数
const openai = (apiKey: string) => ({ id: 'fake-model-id', apiKey });

/**
 * 工具定义接口
 */
export interface ToolDefinition {
    name: string;
    description: string;
    parameters: Record<string, any>;
}

export interface AgentActorState {
    name: string;
    instructions: string;
    tools: Map<string, PID>;
}

export interface AgentActorConfig {
    name: string;
    instructions: string;
    model?: string;
    tools?: ToolDefinition[];
}

export interface GenerateMessage extends Message {
    type: 'generate';
    content: string;
}

export interface ToolCallMessage extends Message {
    type: 'tool_call';
    toolName: string;
    params: any;
}

export interface ToolResultMessage extends Message {
    type: 'tool_result';
    result: any;
}

export interface ErrorResponseMessage extends Message {
    type: 'error';
    error: string;
    responseId?: string;
}

export interface ResultResponseMessage extends Message {
    type: 'result';
    payload: any;
    responseId?: string;
}

export interface ExecuteToolMessage extends Message {
    type: 'execute';
    params: any;
    sender: PID;
    responseId?: string;
}

export type AgentMessage = GenerateMessage | ToolCallMessage | ToolResultMessage;
export type ResponseMessage = ErrorResponseMessage | ResultResponseMessage | ExecuteToolMessage;

/**
 * AgentActor将Mastra的Agent集成到Bagctor的Actor模型中
 * 允许通过Actor系统进行智能代理的分布式协作
 */
export class AgentActor extends Actor<AgentActorState, AgentMessage> {
    private agent: Agent;
    private toolMap: Map<string, (params: any) => Promise<any>>;

    constructor(context: ActorContext, initialState?: AgentActorState) {
        super(context, initialState || {
            name: 'DefaultAgentActor',
            instructions: 'I am a helpful assistant',
            tools: new Map()
        });

        this.toolMap = new Map();

        // 初始化模拟的Mastra Agent (后续会替换为真实实现)
        this.agent = this.createMockAgent(this.state.name, this.state.instructions);

        // 设置Agent工具调用处理
        this.setupToolHandlers();
    }

    /**
     * 创建一个模拟的Mastra Agent (后续会替换为真实实现)
     */
    private createMockAgent(name: string, instructions: string): Agent {
        const tools: any[] = [];

        return {
            generate: async (content: string) => {
                console.log(`Agent ${name} generating response for: ${content}`);
                return `[${name}]: I am responding to "${content}" based on my instructions: "${instructions.substring(0, 20)}..."`;
            },
            addTool: (tool: any) => {
                console.log(`Adding tool ${tool.name} to agent ${name}`);
                tools.push(tool);
            }
        };
    }

    /**
     * 设置Agent的工具调用处理程序
     */
    private setupToolHandlers(): void {
        // 当添加更多工具时，可以在此添加工具处理逻辑
    }

    /**
     * 定义Actor的行为
     */
    protected behaviors(): void {
        this.addBehavior('default', this.defaultBehavior.bind(this));
    }

    /**
     * 默认行为处理函数
     */
    private async defaultBehavior(message: AgentMessage): Promise<void> {
        try {
            const responseId = (message as any).responseId;

            if (message.type === 'generate') {
                // 处理文本生成请求
                try {
                    const result = await this.agent.generate(message.content);
                    if (message.sender) {
                        await this.send(message.sender, {
                            type: 'result',
                            payload: result,
                            responseId
                        } as ResultResponseMessage);
                    }
                } catch (error) {
                    if (message.sender) {
                        await this.send(message.sender, {
                            type: 'error',
                            error: error.message,
                            responseId
                        } as ErrorResponseMessage);
                    }
                }
            } else if (message.type === 'tool_call') {
                // 处理工具调用请求
                const { toolName, params } = message;

                // 首先检查内部工具映射
                if (this.toolMap.has(toolName)) {
                    try {
                        const toolFunction = this.toolMap.get(toolName)!;
                        const result = await toolFunction(params);
                        if (message.sender) {
                            await this.send(message.sender, {
                                type: 'result',
                                payload: result,
                                responseId
                            } as ResultResponseMessage);
                        }
                    } catch (error) {
                        if (message.sender) {
                            await this.send(message.sender, {
                                type: 'error',
                                error: `Error executing tool '${toolName}': ${error.message}`,
                                responseId
                            } as ErrorResponseMessage);
                        }
                    }
                    return;
                }

                // 如果内部没有找到，检查Actor工具
                const toolActor = this.state.tools.get(toolName);
                if (!toolActor) {
                    if (message.sender) {
                        await this.send(message.sender, {
                            type: 'error',
                            error: `Tool '${toolName}' not found`,
                            responseId
                        } as ErrorResponseMessage);
                    }
                    return;
                }

                try {
                    // 请求工具Actor执行操作
                    await this.send(toolActor, {
                        type: 'execute',
                        params,
                        sender: this.context.self,
                        responseId
                    } as ExecuteToolMessage);
                } catch (error) {
                    if (message.sender) {
                        await this.send(message.sender, {
                            type: 'error',
                            error: `Error calling tool '${toolName}': ${error.message}`,
                            responseId
                        } as ErrorResponseMessage);
                    }
                }
            } else if (message.type === 'tool_result') {
                // 处理来自工具Actor的结果
                if (message.sender) {
                    await this.send(message.sender, {
                        type: 'result',
                        payload: message.result,
                        responseId
                    } as ResultResponseMessage);
                }
            }
        } catch (error) {
            console.error("AgentActor处理消息出错:", error);
            if (message.sender) {
                await this.send(message.sender, {
                    type: 'error',
                    error: `Internal error: ${error.message}`,
                    responseId: (message as any).responseId
                } as ErrorResponseMessage);
            }
        }
    }

    /**
     * 注册工具Actor，允许代理调用这些工具
     * @param toolName 工具名称
     * @param toolActor 实现工具功能的Actor的PID
     */
    registerTool(toolName: string, toolActor: PID): void {
        const updatedTools = new Map(this.state.tools);
        updatedTools.set(toolName, toolActor);

        this.setState({
            tools: updatedTools
        });

        // 同时更新Mastra Agent的工具列表
        this.agent.addTool({
            name: toolName,
            description: `External tool: ${toolName}`,
            handler: async (params: any) => {
                // 通过Actor消息调用工具
                return new Promise((resolve, reject) => {
                    this.send(toolActor, {
                        type: 'execute',
                        params,
                        sender: this.context.self
                    } as ExecuteToolMessage).then(() => {
                        // 工具执行请求已发送，结果将通过消息异步返回
                        resolve({ status: 'pending', message: `Tool ${toolName} execution requested` });
                    }).catch(error => {
                        reject(error);
                    });
                });
            }
        });
    }

    /**
     * 注册内部工具函数，直接由代理执行而非通过Actor
     * @param toolName 工具名称
     * @param description 工具描述
     * @param handler 工具处理函数
     */
    registerToolFunction(toolName: string, description: string, handler: (params: any) => Promise<any>): void {
        // 存储到内部工具映射
        this.toolMap.set(toolName, handler);

        // 添加到Mastra Agent
        this.agent.addTool({
            name: toolName,
            description,
            handler
        });
    }
} 