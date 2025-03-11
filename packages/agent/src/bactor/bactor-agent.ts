/**
 * Bactor Agent implementation
 */

import { Actor, ActorContext, PID, Message } from "@bactor/core";
import { Agent } from "../agent";
import { Tool } from "../tools";

interface Memory {
  add(input: string, response: string): Promise<void>;
  retrieve(query: string): Promise<Array<{ role: string, content: string }>>;
}

class DefaultMemory implements Memory {
  async add(input: string, response: string): Promise<void> { }
  async retrieve(query: string): Promise<Array<{ role: string, content: string }>> { return []; }
}

class ToolRegistry {
  private tools = new Map<string, Tool<string, any, any>>();

  register(name: string, tool: Tool<string, any, any>): void {
    this.tools.set(name, tool);
  }

  async execute(name: string, params: any): Promise<any> {
    const tool = this.tools.get(name);
    if (!tool) throw new Error(`Tool ${name} not found`);
    return await tool.execute(params);
  }
}

interface LLMService {
  generate(prompt: string): Promise<string>;
}

interface Workflow {
  execute(input: any): Promise<any>;
}

function createLLMService(config: { provider: string, name: string }): LLMService {
  return {
    generate: async (prompt: string) => "Sample response"
  };
}

export interface BactorAgentConfig {
  name: string;
  description?: string;
  instructions: string;
  model: LLMModel;
  tools?: Record<string, Tool<string, any, any>>;
  memory?: Memory;
  workflow?: Workflow;
}

export interface LLMModel {
  provider: string;
  name: string;
  apiKey?: string;
}

export interface AgentContext {
  messages: Array<{ role: string, content: string }>;
  input: string;
}

export interface AgentResponse {
  text: string;
  toolCalls: any[];
  context: AgentContext;
}

export class BactorAgent extends Actor {
  protected config: BactorAgentConfig;
  protected memory: Memory;
  protected tools: ToolRegistry;
  protected llm: LLMService;
  protected mastraAgent: Agent;

  constructor(context: ActorContext, config: BactorAgentConfig) {
    super(context);
    this.config = config;
    this.memory = config.memory || new DefaultMemory();
    this.tools = new ToolRegistry();
    this.llm = createLLMService({ provider: config.model.provider, name: config.model.name });

    if (config.tools) {
      Object.entries(config.tools).forEach(([name, tool]) => {
        this.tools.register(name, tool);
      });
    }

    this.mastraAgent = new Agent({
      name: config.name,
      description: config.description || "",
      model: config.model.name as any,
      tools: [] as any
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
          const result = await this.generate(rest.content);
          if (sender) {
            sender.tell({ type: "generateResponse", result, success: true });
          }
          break;

        case "executeTool":
          const toolResult = await this.tools.execute(rest.toolName, rest.params);
          if (sender) {
            sender.tell({ type: "executeToolResponse", result: toolResult, success: true });
          }
          break;

        default:
          throw new Error(`Unknown message type: ${type}`);
      }
    } catch (error: any) {
      if (sender) {
        sender.tell({ type: "error", error: error.message, success: false });
      }
    }
  }

  async generate(input: string): Promise<AgentResponse> {
    const context = await this.buildContext(input);
    const response = await this.llm.generate(input);
    await this.memory.add(input, response);

    return {
      text: response,
      toolCalls: [],
      context: context
    };
  }

  protected async buildContext(input: string): Promise<AgentContext> {
    const relevantMemories = await this.memory.retrieve(input);
    const messages = [
      { role: "system", content: this.config.instructions },
      ...relevantMemories.map(m => ({ role: m.role, content: m.content })),
      { role: "user", content: input }
    ];

    return { messages, input };
  }
}
