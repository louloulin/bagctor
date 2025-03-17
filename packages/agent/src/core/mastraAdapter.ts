/**
 * Mastra代理适配器
 * 这个模块桥接Bagctor的Actor模型与Mastra的代理系统
 */

interface MastraAgent {
    name: string;
    instructions: string;
    model: {
        provider: string;
        name: string;
        toolChoice?: 'auto' | 'none';
    };
    tools?: Record<string, any>;
}

interface GenerateOptions {
    messages: {
        role: 'user' | 'assistant' | 'system';
        content: string;
        name?: string;
    }[];
}

interface ToolDefinition {
    name: string;
    description: string;
    parameters: Record<string, any>;
}

/**
 * Mastra代理适配器
 * 封装了Mastra的Agent API以便在Bagctor内使用
 */
export class MastraAdapter {
    private agent: MastraAgent;
    private tools: Map<string, (params: any) => Promise<any>> = new Map();

    /**
     * 创建Mastra代理适配器
     * @param name 代理名称
     * @param instructions 代理指令
     * @param model 模型配置
     */
    constructor(name: string, instructions: string, model: string = 'gpt-4o') {
        this.agent = {
            name,
            instructions,
            model: {
                provider: 'OPEN_AI',
                name: model,
                toolChoice: 'auto'
            }
        };
    }

    /**
     * 添加工具到代理
     * @param name 工具名称
     * @param description 工具描述
     * @param parameters 工具参数
     * @param handler 工具处理函数
     */
    addTool(name: string, description: string, parameters: Record<string, any>, handler: (params: any) => Promise<any>): void {
        const toolDef = {
            name,
            description,
            parameters
        };

        // 注册工具定义
        this.agent.tools = {
            ...this.agent.tools,
            [name]: toolDef
        };

        // 保存工具处理函数
        this.tools.set(name, handler);
    }

    /**
     * 为代理生成响应
     * @param prompt 用户提示
     * @returns 生成的响应文本
     */
    async generate(prompt: string): Promise<string> {
        // 构建消息历史
        const messages = [
            {
                role: 'system' as const,
                content: this.agent.instructions
            },
            {
                role: 'user' as const,
                content: prompt
            }
        ];

        try {
            // 模拟API调用
            // 在实际实现中，这将调用Mastra API
            const result = await this.mockGenerate({ messages });

            // 处理可能的工具调用
            if (result.toolCalls && result.toolCalls.length > 0) {
                return await this.handleToolCalls(result.toolCalls, messages);
            }

            return result.text;
        } catch (error: any) {
            console.error('Mastra生成错误:', error);
            return `生成时出错: ${error.message || 'Unknown error'}`;
        }
    }

    /**
     * 处理工具调用
     * @param toolCalls 工具调用数组
     * @param messages 消息历史
     * @returns 最终响应文本
     */
    private async handleToolCalls(toolCalls: any[], messages: any[]): Promise<string> {
        const toolResults = [];

        // 处理每个工具调用
        for (const call of toolCalls) {
            const { name, arguments: args } = call;
            const handler = this.tools.get(name);

            if (!handler) {
                toolResults.push(`工具 '${name}' 未找到`);
                continue;
            }

            try {
                // 执行工具函数
                const result = await handler(args);
                toolResults.push(`工具 '${name}' 结果: ${JSON.stringify(result)}`);

                // 添加工具响应到消息历史
                messages.push({
                    role: 'assistant' as const,
                    content: '',
                    tool_calls: [{ name, arguments: args }]
                });

                messages.push({
                    role: 'tool' as const,
                    tool_call_id: call.id || `call-${Date.now()}`,
                    name,
                    content: JSON.stringify(result)
                });
            } catch (error: any) {
                toolResults.push(`工具 '${name}' 错误: ${error.message || 'Unknown error'}`);
            }
        }

        // 再次调用模型，提供工具执行结果
        const finalResult = await this.mockGenerate({ messages });
        return finalResult.text;
    }

    /**
     * 模拟Mastra API调用
     * 在实际实现中，这将使用@mastra/core的实际API
     * @param options 生成选项
     * @returns 模拟的API响应
     */
    private async mockGenerate(options: GenerateOptions): Promise<{
        text: string;
        toolCalls?: { id: string; name: string; arguments: any }[];
    }> {
        const { messages } = options;
        const lastMessage = messages[messages.length - 1];

        // 模拟简单的响应生成
        const userMessage = lastMessage.role === 'user' ? lastMessage.content : '';

        // 检查是否包含需要工具的关键词
        const needsWeatherTool = /weather|temperature|forecast/i.test(userMessage);
        const needsSearchTool = /search|find|lookup|information about/i.test(userMessage);

        // 模拟工具调用检测
        if (needsWeatherTool && this.tools.has('getWeather')) {
            return {
                text: '我需要查看天气信息',
                toolCalls: [
                    {
                        id: `weather-${Date.now()}`,
                        name: 'getWeather',
                        arguments: { location: this.extractLocation(userMessage) || 'New York' }
                    }
                ]
            };
        }

        if (needsSearchTool && this.tools.has('search')) {
            return {
                text: '我需要搜索这个信息',
                toolCalls: [
                    {
                        id: `search-${Date.now()}`,
                        name: 'search',
                        arguments: { query: userMessage.replace(/search for|find|lookup|information about/gi, '').trim() }
                    }
                ]
            };
        }

        // 对于基本响应，生成一个基于输入的简单回复
        return {
            text: this.generateBasicResponse(userMessage)
        };
    }

    /**
     * 从用户消息中提取位置信息
     * @param message 用户消息
     * @returns 提取的位置或undefined
     */
    private extractLocation(message: string): string | undefined {
        // 简单的位置提取逻辑
        const locationMatches = message.match(/in ([A-Za-z\s]+)(?:,|\?|\.|\s|$)/);
        return locationMatches?.[1];
    }

    /**
     * 生成基本响应
     * @param message 用户消息
     * @returns 生成的响应
     */
    private generateBasicResponse(message: string): string {
        // 模拟基本的响应生成
        const responses = [
            `根据您询问的"${message}"，作为${this.agent.name}，我可以提供以下信息...`,
            `您询问了关于"${message}"的问题。${this.agent.name}在此提供帮助...`,
            `感谢您的问题"${message}"。我已分析相关信息，结果如下...`,
            `关于"${message}"，我的分析结果表明...`
        ];

        return responses[Math.floor(Math.random() * responses.length)];
    }
} 