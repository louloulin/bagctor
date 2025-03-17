import { Actor, Message } from '@bactor/core';
import { PID } from '@bactor/common';
import type { ActorContext } from '@bactor/core';
import { AgentMemory } from './agentMemory';
import { AgentRag, Document } from './agentRag';
import { MastraAdapter } from './mastraAdapter';
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
    memoryActor?: PID;
    ragActor?: PID;
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
export class AgentActor extends Actor<AgentActorState, Message> {
    private agent: MastraAdapter;
    private toolMap: Map<string, (params: any) => Promise<any>>;
    private memory?: AgentMemory;
    private rag?: AgentRag;

    constructor(context: ActorContext, initialState?: AgentActorState) {
        super(context, initialState || {
            name: 'DefaultAgentActor',
            instructions: 'I am a helpful assistant',
            tools: new Map()
        });

        this.toolMap = new Map();

        // 初始化Mastra代理适配器
        this.agent = new MastraAdapter(
            this.state.name,
            this.state.instructions,
            'gpt-4o' // 默认模型
        );

        // 设置Agent工具调用处理
        this.setupToolHandlers();

        // 检查是否有内存Actor引用
        if (initialState && 'memoryActor' in initialState) {
            this.setupMemory(initialState.memoryActor);
        }

        // 检查是否有RAG Actor引用
        if (initialState && 'ragActor' in initialState) {
            this.setupRag(initialState.ragActor);
        }
    }

    /**
     * 设置内存组件
     */
    private setupMemory(memoryActorRef?: PID): void {
        if (memoryActorRef) {
            this.memory = new AgentMemory(memoryActorRef, this.context);
        }
    }

    /**
     * 设置RAG组件
     */
    private setupRag(ragActorRef?: PID): void {
        if (ragActorRef) {
            this.rag = new AgentRag(ragActorRef, this.context);
        }
    }

    /**
     * 定义Actor的行为
     */
    protected behaviors(): void {
        this.addBehavior('default', this.defaultBehavior.bind(this));
        this.addBehavior('processing', this.processingBehavior.bind(this));
    }

    /**
     * 默认处理行为
     */
    private async defaultBehavior(message: Message): Promise<void> {
        try {
            if (message.type === 'generate') {
                await this.handleGenerate(message as GenerateMessage);
            } else if (message.type === 'tool_call') {
                await this.handleToolCall(message as ToolCallMessage);
            } else if (message.type === 'register_tool') {
                // 处理工具注册
                const { toolName, toolActor } = message as any;
                this.registerTool(toolName, toolActor);
            }
        } catch (error: any) {
            console.error('Agent error:', error);
            if (message.sender) {
                await this.send(message.sender, {
                    type: 'error',
                    error: error.message || String(error),
                    responseId: (message as any).responseId
                } as ErrorResponseMessage);
            }
        }
    }

    /**
     * 处理中状态的行为
     */
    private async processingBehavior(message: Message): Promise<void> {
        if (message.type === 'tool_result') {
            await this.handleToolResult(message as ToolResultMessage);
        }
    }

    /**
     * 处理生成请求
     */
    private async handleGenerate(message: GenerateMessage): Promise<void> {
        const { content, responseId } = message as any;

        try {
            // 记录到内存（如果启用）
            if (this.memory) {
                await this.memory.add({
                    content,
                    metadata: { source: 'user' },
                    type: 'message'
                });
            }

            // 如果有RAG组件，先尝试查询相关文档
            let enhancedContent = content;
            if (this.rag) {
                try {
                    const relevantDocs = await this.rag.query(content);
                    if (relevantDocs && relevantDocs.length > 0) {
                        // 将相关文档添加到提示中
                        enhancedContent = `${content}\n\nRelevant information:\n${relevantDocs.map(doc => doc.content).join('\n\n')
                            }`;
                    }
                } catch (error) {
                    console.error('RAG查询错误:', error);
                    // 失败时继续使用原始内容
                }
            }

            // 使用Mastra代理生成响应
            const response = await this.agent.generate(enhancedContent);

            // 记录代理响应到内存
            if (this.memory) {
                await this.memory.add({
                    content: response,
                    metadata: { source: 'agent' },
                    type: 'message'
                });
            }

            // 发送响应
            if (message.sender) {
                await this.send(message.sender, {
                    type: 'result',
                    payload: response,
                    responseId
                } as ResultResponseMessage);
            }
        } catch (error: any) {
            console.error('生成错误:', error);
            if (message.sender) {
                await this.send(message.sender, {
                    type: 'error',
                    error: error.message || String(error),
                    responseId
                } as ErrorResponseMessage);
            }
        }
    }

    /**
     * 处理工具调用
     */
    private async handleToolCall(message: ToolCallMessage): Promise<void> {
        const { toolName, params, responseId } = message as any;

        try {
            // 查找工具处理函数
            const toolHandler = this.toolMap.get(toolName);
            if (!toolHandler) {
                throw new Error(`Tool '${toolName}' not found`);
            }

            // 记录工具调用到内存
            if (this.memory) {
                await this.memory.add({
                    content: `Tool call: ${toolName} with params: ${JSON.stringify(params)}`,
                    metadata: { tool: toolName },
                    type: 'action'
                });
            }

            // 调用工具并等待结果
            const result = await toolHandler(params);

            // 记录工具结果到内存
            if (this.memory) {
                await this.memory.add({
                    content: `Tool result: ${JSON.stringify(result)}`,
                    metadata: { tool: toolName },
                    type: 'observation'
                });
            }

            // 发送结果
            if (message.sender) {
                await this.send(message.sender, {
                    type: 'result',
                    payload: result,
                    responseId
                } as ResultResponseMessage);
            }
        } catch (error: any) {
            console.error(`工具 '${toolName}' 错误:`, error);
            if (message.sender) {
                await this.send(message.sender, {
                    type: 'error',
                    error: error.message || String(error),
                    responseId
                } as ErrorResponseMessage);
            }
        }
    }

    /**
     * 处理工具执行结果
     */
    private async handleToolResult(message: ToolResultMessage): Promise<void> {
        // 处理工具执行结果并使用它继续生成
        // 此方法将在处理中状态下被调用
        this.become('default');
    }

    /**
     * 注册Actor工具（会被ActorSystem调用）
     */
    registerTool(toolName: string, toolActor: PID): void {
        // 保存工具Actor引用
        const tools = new Map(this.state.tools);
        tools.set(toolName, toolActor);

        this.setState({
            ...this.state,
            tools
        });

        // 为工具注册工具处理函数
        this.registerToolFunction(
            toolName,
            `使用${toolName}工具执行操作`,
            async (params: any) => {
                return new Promise((resolve, reject) => {
                    this.context.send(toolActor, {
                        type: 'execute',
                        params,
                        sender: this.context.self,
                        responseId: Date.now().toString()
                    } as ExecuteToolMessage)
                        .then(() => {
                            // 切换到处理中状态以等待结果
                            this.become('processing');

                            // 超时处理，防止永久等待
                            const timeout = setTimeout(() => {
                                this.become('default');
                                reject(new Error(`工具 '${toolName}' 执行超时`));
                            }, 30000);

                            // 模拟工具结果 - 在实际实现中，这应该由工具Actor发送
                            setTimeout(() => {
                                clearTimeout(timeout);
                                this.become('default');
                                resolve({ success: true, message: `${toolName} 工具执行结果` });
                            }, 1000);
                        })
                        .catch(reject);
                });
            }
        );
    }

    /**
     * 设置工具处理器
     */
    private setupToolHandlers(): void {
        // 设置内置工具
        this.registerToolFunction(
            'echo',
            '简单地回显输入值',
            async (params: any) => {
                return params;
            }
        );
    }

    /**
     * 注册工具函数
     */
    registerToolFunction(
        name: string,
        description: string,
        handler: (params: any) => Promise<any>
    ): void {
        // 注册到工具映射
        this.toolMap.set(name, handler);

        // 向Mastra代理添加工具
        this.agent.addTool(
            name,
            description,
            {
                type: 'object',
                properties: {
                    // 基本参数定义，可以根据需要扩展
                    input: {
                        type: 'string',
                        description: '工具的输入'
                    }
                }
            },
            handler
        );
    }

    /**
     * 为RAG系统添加文档
     */
    async addDocument(content: string, metadata: Record<string, any> = {}): Promise<boolean> {
        if (!this.rag) {
            return false;
        }

        try {
            const doc: Document = {
                id: `doc_${Date.now()}`,
                content,
                metadata
            };

            await this.rag.addDocument(doc);
            return true;
        } catch (error) {
            console.error('添加文档错误:', error);
            return false;
        }
    }
} 