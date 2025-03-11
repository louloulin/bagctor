# Bactor Agent 系统精简设计 (XSS)

## 核心设计理念

结合 **Actor 模型**的强大并发能力与 **Mastra.ai** 的简洁 API 设计，打造高效智能体框架：

- **保留 Actor 核心优势**：消息传递、状态隔离、行为切换
- **简化 API 设计**：降低使用门槛，提高开发效率
- **统一 LLM 接口**：标准化模型调用和上下文管理
- **Actor 化工作流**：将工作流视为特殊 Actor，实现统一架构

## 核心 API 设计

### 1. 智能体创建

```typescript
// 简化的智能体创建
const agent = new Agent({
  name: 'AssistantAgent',
  // Actor 相关配置
  actorConfig: {
    behaviors: {
      default: 'task',  // 初始行为
      task: handleTask,
      result: handleResult
    }
  },
  // LLM 相关配置
  llm: {
    provider: 'openai',
    model: 'gpt-4o',
    temperature: 0.7
  },
  // 工具配置
  tools: [searchTool, calculatorTool],
  // 记忆配置
  memory: new Memory()
});

// 系统注册
const agentId = system.register(agent);
```

### 2. 消息处理

```typescript
// 行为处理函数
async function handleTask(context: ActorContext, message: Message) {
  const { content, metadata } = message;
  const { llm, memory, tools } = context;
  
  // 检索相关记忆
  const relevantMemories = await memory.query(content);
  
  // 构建 LLM 上下文
  const llmContext = new ContextBuilder("You are a helpful assistant")
    .addUserMessage(content)
    .addMemories(relevantMemories)
    .defineTools(tools)
    .build();
  
  // 调用 LLM
  const response = await llm.complete(llmContext);
  
  // 处理工具调用
  if (response.toolCalls) {
    return handleToolCalls(context, response.toolCalls, message);
  }
  
  // 发送响应
  context.send(metadata.sender, {
    type: 'result',
    content: response.content,
    metadata: { replyTo: metadata.id }
  });
}
```

### 3. 工作流定义 (Actor 化)

```typescript
// 工作流定义 (本质是特殊 Actor)
const workflow = new Workflow({
  name: 'DataProcessingFlow',
  // Actor 配置
  actorConfig: {
    behaviors: {
      default: 'start',
      start: handleStart,
      processing: handleProcessing,
      complete: handleComplete
    }
  },
  // 步骤定义
  steps: {
    fetchData: async (input) => {
      // 获取数据
      return { data: [...] };
    },
    processData: async ({ data }) => {
      // 处理数据
      return { processed: [...] };
    },
    generateReport: async ({ processed }) => {
      // 生成报告
      return { report: '...' };
    }
  }
});

// 工作流执行
const workflowId = system.register(workflow);
system.send(workflowId, {
  type: 'start',
  content: { source: 'database' }
});
```

## 改造计划

### 阶段 1: 核心接口简化 (1周)

1. **统一 Actor 接口**：
   ```typescript
   interface Actor {
     id?: string;
     name: string;
     behaviors: Record<string, BehaviorFn>;
     initialBehavior: string;
     process(context: ActorContext, message: Message): Promise<void>;
   }
   ```

2. **Agent 作为 Actor 的特化**：
   ```typescript
   class Agent implements Actor {
     constructor(config: AgentConfig) {
       this.name = config.name;
       this.behaviors = config.actorConfig.behaviors;
       this.initialBehavior = config.actorConfig.default || 'default';
       this.llm = createLLMService(config.llm);
       this.tools = registerTools(config.tools);
       this.memory = config.memory || new Memory();
     }
     
     async process(context: ActorContext, message: Message): Promise<void> {
       // 委托给当前行为处理
       const currentBehavior = this.behaviors[this.currentBehaviorName];
       await currentBehavior(context, message);
     }
   }
   ```

3. **Workflow 作为 Actor 的特化**：
   ```typescript
   class Workflow implements Actor {
     constructor(config: WorkflowConfig) {
       this.name = config.name;
       this.behaviors = config.actorConfig.behaviors;
       this.initialBehavior = config.actorConfig.default || 'start';
       this.steps = config.steps;
       this.state = new Map(); // 工作流状态
     }
     
     async process(context: ActorContext, message: Message): Promise<void> {
       // 委托给当前行为处理
       const currentBehavior = this.behaviors[this.currentBehaviorName];
       await currentBehavior(context, message);
     }
   }
   ```

### 阶段 2: LLM 服务集成 (1周)

1. **简化的 LLM 服务**：
   ```typescript
   interface LLMService {
     complete(params: CompletionParams): Promise<CompletionResult>;
     stream(params: CompletionParams, handlers: StreamHandlers): Promise<void>;
     embeddings(texts: string[]): Promise<number[][]>;
   }
   
   // 工厂函数
   function createLLMService(config: LLMConfig): LLMService {
     switch (config.provider) {
       case 'openai':
         return new OpenAIService(config);
       case 'anthropic':
         return new AnthropicService(config);
       default:
         throw new Error(`Unknown provider: ${config.provider}`);
     }
   }
   ```

2. **上下文构建器**：
   ```typescript
   class ContextBuilder {
     constructor(systemMessage: string) {
       this.messages = [{ role: 'system', content: systemMessage }];
     }
     
     addUserMessage(content: string): this {
       this.messages.push({ role: 'user', content });
       return this;
     }
     
     // 其他方法...
     
     build(): CompletionParams {
       return {
         messages: this.messages,
         tools: this.tools,
         temperature: this.temperature,
         maxTokens: this.maxTokens
       };
     }
   }
   ```

### 阶段 3: 工具和记忆系统 (1周)

1. **统一工具接口**：
   ```typescript
   interface Tool {
     name: string;
     description: string;
     parameters: Schema;
     execute(params: any): Promise<any>;
   }
   
   // 工具注册
   function registerTools(tools: Tool[]): ToolRegistry {
     const registry = new ToolRegistry();
     for (const tool of tools) {
       registry.register(tool);
     }
     return registry;
   }
   ```

2. **简化记忆系统**：
   ```typescript
   class Memory {
     constructor(config?: MemoryConfig) {
       this.storage = config?.storage || new InMemoryStorage();
       this.embedder = config?.embedder || new DefaultEmbedder();
     }
     
     async add(item: MemoryItem): Promise<void> {
       // 存储记忆
     }
     
     async query(text: string, options?: QueryOptions): Promise<MemoryItem[]> {
       // 检索相关记忆
     }
   }
   ```

### 阶段 4: 系统集成 (1周)

1. **统一 ActorSystem**：
   ```typescript
   class ActorSystem {
     private actors: Map<string, Actor> = new Map();
     
     register(actor: Actor): string {
       const id = actor.id || generateId();
       this.actors.set(id, actor);
       
       // 初始化 Actor
       const context = this.createContext(id);
       actor.process(context, { type: 'init' });
       
       return id;
     }
     
     send(target: string, message: Message): void {
       const actor = this.actors.get(target);
       if (!actor) throw new Error(`Actor not found: ${target}`);
       
       const context = this.createContext(target, message.sender);
       actor.process(context, message);
     }
     
     private createContext(self: string, sender?: string): ActorContext {
       return {
         self,
         sender,
         system: this,
         send: (target, msg) => this.send(target, { ...msg, sender: self })
       };
     }
   }
   ```

## 示例应用

```typescript
// 创建系统
const system = new ActorSystem();

// 创建智能体
const assistant = new Agent({
  name: 'Assistant',
  actorConfig: {
    behaviors: {
      default: handleMessage
    }
  },
  llm: {
    provider: 'openai',
    model: 'gpt-4o'
  },
  tools: [searchTool, calculatorTool]
});

// 注册智能体
const assistantId = system.register(assistant);

// 创建工作流
const dataFlow = new Workflow({
  name: 'DataProcessingFlow',
  actorConfig: {
    behaviors: {
      start: handleStart,
      processing: handleProcessing,
      complete: handleComplete
    }
  },
  steps: {
    fetchData,
    processData,
    generateReport
  }
});

// 注册工作流
const dataFlowId = system.register(dataFlow);

// 启动工作流
system.send(dataFlowId, {
  type: 'start',
  content: { query: 'sales data' },
  sender: 'user'
});

// 工作流完成后发送给助手
async function handleComplete(context, message) {
  const { report } = message.content;
  
  context.send(assistantId, {
    type: 'task',
    content: `Summarize this report: ${report}`,
    sender: context.self
  });
}
```

## 迁移策略

1. **保持向后兼容**：创建适配层支持现有代码
2. **渐进式采用**：允许混合使用新旧 API
3. **示例驱动**：提供完整示例展示新架构优势

## 后续步骤

1. 实现核心接口和基础设施
2. 开发示例应用验证设计
3. 编写迁移指南和文档
4. 逐步将现有功能迁移到新架构 