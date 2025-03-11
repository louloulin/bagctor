# Bactor Agent 系统优化路线图 (XS)

## 1. 当前架构概览

Bactor Agent 系统基于 Actor 模型构建，通过消息传递实现代理间通信：

- **Actor 基础架构**：每个代理是独立 Actor，具有自己的状态和行为
- **消息驱动**：通过 `send` 方法传递消息，实现异步通信
- **行为管理**：使用 `become` 方法切换代理行为状态
- **代理系统**：`AgentSystem` 作为协调器管理代理生命周期

## 2. 现存挑战

我们的分析发现以下核心问题：

1. **复杂接口**：代理创建和消息处理接口过于复杂，提高了使用门槛
2. **行为管理混乱**：行为切换逻辑不清晰，缺乏集中式的行为注册和管理
3. **工具调用不标准**：缺少统一规范的工具调用接口
4. **记忆管理受限**：没有高效的记忆检索和上下文构建机制
5. **可观测性不足**：缺乏内置的日志、追踪和评估系统
6. **开发体验欠佳**：没有专门的调试和测试工具
7. **LLM 集成不完善**：缺少标准化的 LLM 配置和管理接口

## 3. 优化目标

保留 Actor 模型的核心优势，同时整合现代代理设计模式：

1. **简化 API**：提供更直观的代理创建和交互接口
2. **标准化工具系统**：统一工具定义和调用规范
3. **增强记忆管理**：支持短期/长期记忆、向量存储和语义搜索
4. **增加可观测性**：集成日志、追踪和评估功能
5. **改进开发体验**：提供本地开发环境和可视化调试工具
6. **工作流支持**：提供任务编排和多代理协作框架
7. **LLM 统一接口**：提供标准化 LLM 配置和上下文管理机制

## 4. 实施方案

### 阶段一：核心接口优化 (2周)

1. **简化代理创建接口**：
   ```typescript
   // 新接口
   const agent = new Agent({
     name: 'GreetingAgent',
     instructions: "You are a helpful assistant...",
     llm: {  // 新增 LLM 配置
       provider: 'openai',
       model: 'gpt-4o',
       temperature: 0.7,
       maxTokens: 1000
     },
     behaviors: {
       default: handleDefault,
       greeting: handleGreeting
     },
     tools: [searchDatabase, sendEmail]
   });
   ```

2. **增强 Actor Context**：
   ```typescript
   interface ActorContext {
     self: PID;
     sender: PID;
     system: ActorSystem;
     llm: LLMService;     // 新增
     memory: Memory;      // 新增
     tools: ToolRegistry; // 新增
     logger: Logger;      // 新增
   }
   ```

3. **标准化消息格式**：
   ```typescript
   interface Message {
     type: string;          // 消息类型
     content: any;          // 消息内容
     metadata: {            // 元数据
       sender: PID;
       timestamp: number;
       conversationId: string;
     }
   }
   ```

### 阶段二：LLM 集成系统 (2周)

1. **统一 LLM 提供商接口**：
   ```typescript
   // LLM 提供商接口
   interface LLMProvider {
     id: string;
     name: string;
     supportedModels: string[];
     complete(params: CompletionParams): Promise<CompletionResult>;
     generateEmbeddings(text: string[]): Promise<number[][]>;
   }

   // 实现示例
   class OpenAIProvider implements LLMProvider {
     id = 'openai';
     name = 'OpenAI';
     supportedModels = ['gpt-4o', 'gpt-3.5-turbo', 'text-embedding-3-small'];
     
     async complete(params: CompletionParams): Promise<CompletionResult> {
       // 实现 OpenAI 调用
     }
     
     async generateEmbeddings(text: string[]): Promise<number[][]> {
       // 实现嵌入生成
     }
   }
   ```

2. **LLM 配置和预设管理**：
   ```typescript
   // LLM 配置
   interface LLMConfig {
     provider: string;        // 提供商 ID
     model: string;           // 模型名称
     temperature?: number;    // 温度 (创造性)
     maxTokens?: number;      // 最大令牌数
     topP?: number;           // 核采样
     frequencyPenalty?: number; // 频率惩罚
     presencePenalty?: number;  // 存在惩罚
     stopSequences?: string[];  // 停止序列
   }
   
   // 预设系统
   const llmPresets = {
     creative: {
       temperature: 0.9,
       topP: 0.95,
       frequencyPenalty: 0.1
     },
     precise: {
       temperature: 0.1,
       topP: 0.9,
       frequencyPenalty: 0.2
     }
   };
   
   // 使用预设
   const agent = new Agent({
     name: 'StoryWriter',
     llm: {
       provider: 'openai',
       model: 'gpt-4o',
       ...llmPresets.creative
     },
     // 其他配置
   });
   ```

3. **提示模板系统**：
   ```typescript
   // 提示模板
   class PromptTemplate {
     constructor(
       private template: string,
       private variables: string[]
     ) {}
     
     format(values: Record<string, string>): string {
       let result = this.template;
       for (const [key, value] of Object.entries(values)) {
         result = result.replace(`{${key}}`, value);
       }
       return result;
     }
   }
   
   // 使用示例
   const greetingTemplate = new PromptTemplate(
     "Hello {name}, welcome to {service}!",
     ["name", "service"]
   );
   
   const prompt = greetingTemplate.format({
     name: "John",
     service: "Our Platform"
   });
   ```

### 阶段三：工具和记忆系统 (3周)

1. **工具注册和调用接口**：
   ```typescript
   // 工具定义
   interface Tool {
     name: string;
     description: string;
     parameters: Schema;
     execute(params: any): Promise<any>;
   }
   
   // 工具调用
   const result = await context.tools.call('searchDatabase', {
     query: 'customer records',
     limit: 10
   });
   ```

2. **记忆管理系统**：
   ```typescript
   // 记忆存储和检索
   await context.memory.add({
     role: 'user',
     content: 'My name is Alex',
     timestamp: Date.now()
   });
   
   // 检索相关记忆
   const memories = await context.memory.query('What is my name?', {
     limit: 5,
     recency: 0.3,    // 权重因子
     relevance: 0.7   // 权重因子
   });
   ```

### 阶段四：可观测性和开发体验 (2周)

1. **日志和追踪系统**：
   ```typescript
   // 记录事件
   context.logger.info('Processing message', { 
     type: message.type,
     sender: message.metadata.sender 
   });
   
   // 开始跟踪
   const span = context.tracer.startSpan('handle_task');
   try {
     // 处理任务
     span.addEvent('tool_call', { tool: 'searchDatabase' });
     // 完成处理
   } finally {
     span.end();
   }
   ```

2. **本地开发环境**：
   设计命令行工具 `bactor dev` 启动本地开发服务器，提供：
   - 代理聊天界面
   - 消息流可视化
   - 工具调用监控
   - 记忆内容浏览
   - LLM 响应检查和调试

### 阶段五：工作流和多代理协作 (3周)

1. **工作流定义和执行**：
   ```typescript
   const workflow = new Workflow({
     name: 'CustomerOnboarding',
     steps: {
       validateEmail: async ({ email }) => {
         // 验证电子邮件
         return { isValid: true };
       },
       createAccount: async ({ email, isValid }) => {
         // 创建账户
         return { accountId: 'acc123' };
       },
       sendWelcome: async ({ email, accountId }) => {
         // 发送欢迎邮件
         return { success: true };
       }
     }
   });
   
   // 执行工作流
   const result = await workflow.execute({
     email: 'user@example.com'
   });
   ```

2. **代理协作框架**：
   ```typescript
   // 团队定义
   const team = new AgentTeam({
     manager: managerAgent,
     workers: [researchAgent, writingAgent, editingAgent],
     coordinator: 'manager'  // 团队协调者
   });
   
   // 分配任务
   await team.assignTask({
     type: 'research_and_write',
     content: 'Create a report on AI trends'
   });
   ```

## 5. LLM 集成详细设计

### LLM 服务架构

1. **多提供商支持**：
   ```typescript
   // LLM 服务中心
   class LLMService {
     private providers: Map<string, LLMProvider> = new Map();
     private defaultProvider: string;
     
     constructor(config: LLMServiceConfig) {
       this.defaultProvider = config.defaultProvider;
       // 注册提供商
       this.registerProviders(config.providers);
     }
     
     // 注册 LLM 提供商
     registerProvider(provider: LLMProvider): void {
       this.providers.set(provider.id, provider);
     }
     
     // 获取提供商
     getProvider(id?: string): LLMProvider {
       const providerId = id || this.defaultProvider;
       const provider = this.providers.get(providerId);
       if (!provider) {
         throw new Error(`LLM provider '${providerId}' not found`);
       }
       return provider;
     }
     
     // 文本补全
     async complete(params: CompletionParams, providerId?: string): Promise<CompletionResult> {
       const provider = this.getProvider(providerId);
       return provider.complete(params);
     }
     
     // 生成嵌入
     async embed(texts: string[], providerId?: string): Promise<number[][]> {
       const provider = this.getProvider(providerId);
       return provider.generateEmbeddings(texts);
     }
   }
   ```

2. **上下文构建**：
   ```typescript
   // 消息类型
   type MessageRole = 'system' | 'user' | 'assistant' | 'tool';
   
   // 消息格式
   interface ChatMessage {
     role: MessageRole;
     content: string;
     name?: string;      // 用于工具消息
     toolCallId?: string; // 用于工具调用响应
   }
   
   // 上下文构建器
   class ContextBuilder {
     private systemMessage: string;
     private messages: ChatMessage[] = [];
     private toolDefinitions: Tool[] = [];
     
     constructor(systemMessage: string) {
       this.systemMessage = systemMessage;
     }
     
     // 添加用户消息
     addUserMessage(content: string): this {
       this.messages.push({ role: 'user', content });
       return this;
     }
     
     // 添加助手消息
     addAssistantMessage(content: string): this {
       this.messages.push({ role: 'assistant', content });
       return this;
     }
     
     // 添加工具消息
     addToolMessage(toolName: string, content: string, toolCallId: string): this {
       this.messages.push({
         role: 'tool',
         content,
         name: toolName,
         toolCallId
       });
       return this;
     }
     
     // 定义可用工具
     defineTools(tools: Tool[]): this {
       this.toolDefinitions = tools;
       return this;
     }
     
     // 构建上下文
     build(): CompletionParams {
       return {
         messages: [
           { role: 'system', content: this.systemMessage },
           ...this.messages
         ],
         tools: this.toolDefinitions.length > 0 ? this.toolDefinitions : undefined
       };
     }
   }
   ```

3. **流式响应处理**：
   ```typescript
   // 流式响应接口
   interface StreamHandler {
     onStart?: () => void;
     onToken: (token: string) => void;
     onToolCall?: (toolCall: ToolCall) => void;
     onComplete?: (fullResponse: string) => void;
     onError?: (error: Error) => void;
   }
   
   // 流式处理
   async streamCompletion(params: CompletionParams, handler: StreamHandler, providerId?: string): Promise<void> {
     const provider = this.getProvider(providerId);
     
     try {
       handler.onStart?.();
       
       // 实现特定于提供商的流式处理
       await provider.streamComplete(params, {
         onToken: (token) => handler.onToken(token),
         onToolCall: (toolCall) => handler.onToolCall?.(toolCall),
         onComplete: (response) => handler.onComplete?.(response),
       });
     } catch (error) {
       handler.onError?.(error as Error);
       throw error;
     }
   }
   ```

### LLM 配置和调优

1. **Token 估算和管理**：
   ```typescript
   // Token 计数器
   class TokenCounter {
     private tokenizer: Tokenizer;
     
     constructor(tokenizerModel: string) {
       this.tokenizer = new Tokenizer(tokenizerModel);
     }
     
     // 估算 token 数量
     countTokens(text: string): number {
       return this.tokenizer.encode(text).length;
     }
     
     // 检查是否超出限制
     checkLimit(messages: ChatMessage[], limit: number): boolean {
       const totalTokens = messages.reduce(
         (sum, msg) => sum + this.countTokens(msg.content) + 4, // 4 for message overhead
         0
       ) + 3; // 3 for conversation overhead
       
       return totalTokens <= limit;
     }
     
     // 截断消息以适应 token 限制
     truncateToFit(messages: ChatMessage[], limit: number): ChatMessage[] {
       // 保留系统消息和最近的交互
       const systemMessages = messages.filter(m => m.role === 'system');
       const nonSystemMessages = messages.filter(m => m.role !== 'system');
       
       let result = [...systemMessages];
       let remainingTokens = limit - this.countTokens(systemMessages[0]?.content || '');
       
       // 从最近的消息开始添加
       for (let i = nonSystemMessages.length - 1; i >= 0; i--) {
         const msg = nonSystemMessages[i];
         const tokens = this.countTokens(msg.content) + 4;
         
         if (tokens <= remainingTokens) {
           result.unshift(msg);
           remainingTokens -= tokens;
         } else {
           break;
         }
       }
       
       return result;
     }
   }
   ```

2. **参数自动调优**：
   ```typescript
   // 参数调优器
   class LLMTuner {
     private metrics: MetricsCollector;
     
     constructor(metricsCollector: MetricsCollector) {
       this.metrics = metricsCollector;
     }
     
     // 建议参数
     suggestParameters(taskType: string, recentMetrics: LLMMetrics[]): LLMConfig {
       // 基于历史性能数据推荐参数
       switch (taskType) {
         case 'creative':
           return {
             temperature: 0.7 + this.calculateAdjustment(recentMetrics, 'creativity'),
             topP: 0.9,
             frequencyPenalty: 0.2
           };
         case 'factual':
           return {
             temperature: 0.1 - this.calculateAdjustment(recentMetrics, 'hallucination'),
             topP: 0.95,
             frequencyPenalty: 0.1
           };
         // 其他类型...
         default:
           return { temperature: 0.5, topP: 0.9 };
       }
     }
     
     private calculateAdjustment(metrics: LLMMetrics[], dimension: string): number {
       // 基于最近性能计算调整量
       return 0.05; // 简化示例
     }
   }
   ```

## 6. 兼容性和迁移策略

为确保平滑过渡，我们将：

1. **创建适配层**：允许新旧系统共存，降低迁移成本
2. **渐进式采用**：提供功能标记和配置选项，允许逐步启用新功能
3. **保留核心模型**：维持 Actor 模型的基本语义和消息传递机制

示例适配器：
```typescript
// 旧系统适配
class LegacyAgentAdapter extends BaseAgent {
  constructor(private modernAgent: Agent) {
    super();
  }
  
  async handleTask(message: any): Promise<void> {
    // 转换为现代消息格式
    const result = await this.modernAgent.process({
      type: 'task',
      content: message.data,
      metadata: { sender: message.sender }
    });
    
    // 发送响应
    this.send(message.sender, {
      type: 'result',
      data: result.content
    });
  }
}

// 旧版 LLM 调用适配
function adaptLegacyLLMCall(legacyParams: any): CompletionParams {
  return {
    messages: [
      { role: 'system', content: legacyParams.systemPrompt || '' },
      { role: 'user', content: legacyParams.prompt }
    ],
    temperature: legacyParams.temperature,
    maxTokens: legacyParams.maxTokens
  };
}
```

## 7. 预期成果

此优化方案预计将带来以下成果：

1. **开发效率提升 50%**：通过简化 API 和提供开发工具
2. **代码质量提升**：改进的结构和标准化接口
3. **功能增强**：强大的记忆管理、工具调用和 LLM 集成能力
4. **更好的扩展性**：模块化设计支持未来功能扩展
5. **提高稳定性**：通过完善的日志和监控系统
6. **优化用户体验**：更符合直觉的 API 和更完善的文档
7. **降低 LLM 使用成本**：通过智能 token 管理和缓存机制

## 8. 后续步骤

1. 优先实施阶段一的核心接口优化和阶段二的 LLM 集成系统
2. 建立兼容层确保现有代码可持续运行
3. 为每个阶段创建详细的技术规范和测试计划
4. 建立指标监控系统跟踪优化效果
5. 开发示例应用展示新架构的优势 