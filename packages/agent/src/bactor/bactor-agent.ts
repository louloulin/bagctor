/**
 * Bactor Agent implementation
 */

import { Actor, ActorContext, PID, Message } from "@bactor/core";
// Replace the import with a mock implementation
// import { Agent } from "@mastra/core";
import type { LanguageModelV1 } from 'ai';
import { Tool } from "../tools";

/**
 * 记忆接口
 */
interface Memory {
  add(input: string, response: string, metadata?: Record<string, any>): Promise<void>;
  retrieve(query: string, options?: RetrieveOptions): Promise<MemoryEntry[]>;
  clear(): Promise<void>;
}

/**
 * 记忆条目
 */
interface MemoryEntry {
  id: string;
  role: 'user' | 'assistant' | 'system' | 'function' | 'tool';
  content: string;
  timestamp: number;
  metadata?: Record<string, any>;
}

/**
 * 检索选项
 */
interface RetrieveOptions {
  limit?: number;
  recency?: boolean;
  filter?: (entry: MemoryEntry) => boolean;
}

/**
 * 默认内存实现 - 使用内存数组存储会话历史
 */
class DefaultMemory implements Memory {
  private entries: MemoryEntry[] = [];
  private maxEntries: number;

  constructor(maxEntries: number = 100) {
    this.maxEntries = maxEntries;
  }

  async add(input: string, response: string, metadata?: Record<string, any>): Promise<void> {
    const timestamp = Date.now();

    // 添加用户输入
    this.entries.push({
      id: `user-${timestamp}`,
      role: 'user',
      content: input,
      timestamp,
      metadata
    });

    // 添加助手响应
    this.entries.push({
      id: `assistant-${timestamp}`,
      role: 'assistant',
      content: response,
      timestamp: timestamp + 1, // 确保顺序
      metadata
    });

    // 如果超出最大数量，移除最旧的条目
    if (this.entries.length > this.maxEntries) {
      this.entries = this.entries.slice(-this.maxEntries);
    }
  }

  async retrieve(query: string, options: RetrieveOptions = {}): Promise<MemoryEntry[]> {
    const { limit = 10, recency = true, filter } = options;

    // 复制条目
    let result = [...this.entries];

    // 应用过滤器
    if (filter) {
      result = result.filter(filter);
    }

    // 按时间排序
    if (recency) {
      result.sort((a, b) => b.timestamp - a.timestamp);
    }

    // 返回指定数量的条目
    return result.slice(0, limit);
  }

  async clear(): Promise<void> {
    this.entries = [];
  }
}

class ToolRegistry {
  private tools = new Map<string, Tool<string, any, any>>();

  register(name: string, tool: Tool<string, any, any>): void {
    this.tools.set(name, tool);
  }

  async execute(name: string, params: any): Promise<any> {
    const tool = this.tools.get(name);
    if (!tool) throw new Error(`Tool ${name} not found`);

    // Add null checking before accessing execute method
    if (typeof tool.execute !== 'function') {
      throw new Error(`Tool ${name} does not have an execute method`);
    }

    return await tool.execute(params);
  }

  getToolDefinitions(): any[] {
    return Array.from(this.tools.entries()).map(([name, tool]) => {
      const toolName = (tool as any).name || name;
      const toolDescription = (tool as any).description || '';
      const toolParameters = (tool as any).parameters || {};

      return {
        type: 'function',
        function: {
          name: toolName,
          description: toolDescription,
          parameters: this.convertToJsonSchema(toolParameters)
        }
      };
    });
  }

  private convertToJsonSchema(parameters: Record<string, any>): any {
    // 转换工具参数为JSON Schema格式
    const properties: Record<string, any> = {};
    const required: string[] = [];

    for (const [name, param] of Object.entries(parameters)) {
      properties[name] = {
        type: param.type,
        description: param.description
      };

      // 添加枚举值（如果有）
      if (param.enum) {
        properties[name].enum = param.enum;
      }

      // 添加required字段（如果需要）
      if (param.required) {
        required.push(name);
      }
    }

    return {
      type: 'object',
      properties,
      required: required.length > 0 ? required : undefined
    };
  }
}

interface Workflow {
  execute(input: any): Promise<any>;
}

/**
 * Bactor Agent配置接口
 */
export interface BactorAgentConfig {
  /** Agent名称 */
  name: string;
  /** Agent描述 */
  description?: string;
  /** 系统指令 */
  instructions: string;
  /** 使用的语言模型 */
  model: LanguageModelV1;
  /** 可用工具 */
  tools?: Record<string, Tool<string, any, any>>;
  /** 内存系统 */
  memory?: Memory;
  /** 工作流 */
  workflow?: Workflow;
  /** 内存最大条目数 */
  maxMemoryEntries?: number;
}

export interface AgentContext {
  messages: Array<{ role: string, content: string }>;
  input: string;
}

export interface AgentResponse {
  text: string;
  toolCalls: any[];
  context: AgentContext;
  metadata?: Record<string, any>;
}

// Mock implementation for Agent
class Agent {
  private config: any;

  constructor(config: any) {
    this.config = config;
  }

  async generate(content: string, options?: any): Promise<any> {
    return {
      text: `Mock response for: ${content}`,
      toolCalls: []
    };
  }

  async streamGenerate(content: string, options?: any): Promise<any> {
    if (options?.onChunk) {
      options.onChunk("Streaming ");
      options.onChunk("mock ");
      options.onChunk("response ");
      options.onChunk(`for: ${content}`);
    }

    if (options?.onFinish) {
      options.onFinish(`Complete mock response for: ${content}`);
    }

    return {
      text: `Complete mock response for: ${content}`,
      toolCalls: []
    };
  }
}

export class BactorAgent extends Actor {
  protected config: BactorAgentConfig;
  protected memory: Memory;
  protected tools: ToolRegistry;
  protected mastraAgent: Agent;

  constructor(context: ActorContext, config: BactorAgentConfig) {
    super(context);
    this.config = config;
    this.memory = config.memory || new DefaultMemory(config.maxMemoryEntries);
    this.tools = new ToolRegistry();

    if (config.tools) {
      Object.entries(config.tools).forEach(([name, tool]) => {
        this.tools.register(name, tool);
      });
    }

    // 创建Mastra Agent实例
    this.mastraAgent = new Agent({
      name: config.name,
      description: config.description || "",
      instructions: config.instructions,
      model: config.model,
      tools: config.tools || {}
    });
  }

  protected behaviors(): { [key: string]: (message: Message) => Promise<void> } {
    return {
      "default": (message: Message) => this.receive(message, message.sender)
    };
  }

  async receive(message: any, sender?: PID): Promise<void> {
    try {
      const { type, ...rest } = message;

      switch (type) {
        case "generate":
          const result = await this.generate(rest.content, rest.options);
          if (sender) {
            await this.send(sender, {
              type: "generateResponse",
              content: result.text,
              payload: {
                result,
                success: true
              }
            });
          }
          break;

        case "streamGenerate":
          const streamResult = await this.streamGenerate(rest.content, rest.callback, rest.options);
          if (sender) {
            await this.send(sender, {
              type: "streamResponse",
              content: "Stream completed",
              payload: {
                result: streamResult,
                success: true
              }
            });
          }
          break;

        case "executeTool":
          const toolResult = await this.tools.execute(rest.toolName, rest.params);
          if (sender) {
            await this.send(sender, {
              type: "executeToolResponse",
              content: typeof toolResult === 'string' ? toolResult : JSON.stringify(toolResult),
              payload: {
                result: toolResult,
                success: true
              }
            });
          }
          break;

        case "clearMemory":
          await this.memory.clear();
          if (sender) {
            await this.send(sender, {
              type: "clearMemoryResponse",
              content: "Memory cleared",
              payload: {
                success: true
              }
            });
          }
          break;

        default:
          throw new Error(`Unknown message type: ${type}`);
      }
    } catch (error: any) {
      console.error(`Error in BactorAgent:`, error);
      if (sender) {
        await this.send(sender, {
          type: "error",
          content: `Error: ${error.message}`,
          payload: {
            error: error.message,
            stack: error.stack,
            success: false
          }
        });
      }
    }
  }

  async generate(input: string, options?: any): Promise<AgentResponse> {
    // 构建元数据用于记忆
    const metadata = {
      timestamp: Date.now(),
      options
    };

    // 使用Mastra Agent执行生成
    const result = await this.mastraAgent.generate(input, {
      ...options,
      toolsets: this.tools ? { tools: this.tools.getToolDefinitions() } : undefined
    });

    // 获取响应文本
    const text = typeof result === "string" ? result : (result as any).text || "";

    // 获取工具调用
    const toolCalls = (result as any).toolCalls || [];

    // 构建上下文
    const context = await this.buildContext(input);

    // 更新记忆
    await this.memory.add(input, text, metadata);

    return {
      text,
      toolCalls,
      context,
      metadata
    };
  }

  async streamGenerate(input: string, callback: (chunk: string) => void, options?: any): Promise<AgentResponse> {
    // 构建元数据用于记忆
    const metadata = {
      timestamp: Date.now(),
      streaming: true,
      options
    };

    // 收集所有块以构建完整响应
    const chunks: string[] = [];
    const streamCallback = (chunk: string) => {
      chunks.push(chunk);
      if (callback) callback(chunk);
    };

    // 使用Mastra Agent执行流式生成
    const result = await this.mastraAgent.streamGenerate(input, {
      ...options,
      toolsets: this.tools ? { tools: this.tools.getToolDefinitions() } : undefined,
      onChunk: streamCallback,
      onFinish: callback
    });

    // 获取响应文本（优先使用收集的块，然后是返回的文本）
    const fullText = chunks.length > 0 ? chunks.join('') : (
      typeof result === "string" ? result : (result as any).text || ""
    );

    // 获取工具调用
    const toolCalls = (result as any).toolCalls || [];

    // 构建上下文
    const context = await this.buildContext(input);

    // 更新记忆
    await this.memory.add(input, fullText, metadata);

    return {
      text: fullText,
      toolCalls,
      context,
      metadata
    };
  }

  protected async buildContext(input: string): Promise<AgentContext> {
    // 从记忆中获取相关消息，按时间排序
    const relevantMemories = await this.memory.retrieve(input, {
      limit: 20,
      recency: true
    });

    // 构建消息列表
    const messages = [
      { role: "system", content: this.config.instructions },
      ...relevantMemories.map(m => ({ role: m.role, content: m.content })),
      { role: "user", content: input }
    ];

    return { messages, input };
  }

  /**
   * 清理资源
   */
  override async postStop(): Promise<void> {
    // 清理内存
    await this.memory.clear();

    // 调用基类方法
    await super.postStop();
  }
}
