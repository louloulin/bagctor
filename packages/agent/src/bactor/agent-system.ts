/**
 * Agent System Implementation
 * 
 * 提供统一的Agent系统管理，集成Bactor和Mastra框架
 */

import { ActorSystem, PID, Props } from "@bactor/core";
import { AgentActor, AgentActorConfig } from "./agent-actor";
import { BactorAgent, BactorAgentConfig } from "./bactor-agent";
import { MastraAgentActor, MastraAgentConfig, createMastraAgentActor } from "./mastra-agent-actor";
import { RoleAgent } from "./role-agent";
import { SkillAgent } from "./skill-agent";
import { WorkflowActor, WorkflowConfig } from "./workflow-actor";
import { ToolFactory, createToolFactory } from "./tool-factory";

/**
 * Agent系统配置
 */
export interface AgentSystemConfig {
  /** Actor系统配置 */
  actorSystemConfig?: any;
  /** 默认Agent配置 */
  defaultAgentConfig?: Partial<AgentActorConfig>;
  /** 默认Mastra配置 */
  defaultMastraConfig?: Partial<MastraAgentConfig>;
  /** 全局工具 */
  tools?: Record<string, any>;
  /** 是否启用日志 */
  logging?: boolean;
  /** 是否在控制台显示统计信息 */
  statistics?: boolean;
}

/**
 * Agent类型
 */
export enum AgentType {
  LEGACY = 'legacy',
  BACTOR = 'bactor',
  MASTRA = 'mastra',
  ROLE = 'role',
  SKILL = 'skill'
}

/**
 * Agent系统统计数据
 */
interface AgentSystemStats {
  /** Agent总数 */
  totalAgents: number;
  /** 按类型统计的Agent数量 */
  agentsByType: Record<AgentType, number>;
  /** 工具调用次数 */
  toolCalls: number;
  /** 处理的消息数量 */
  messagesProcessed: number;
  /** 启动时间 */
  startTime: number;
}

// 创建包装的Actor类，将额外的配置参数存储在ActorContext中
function createAgentActorWrapper(ActorClass: any): any {
  return class WrappedActor extends ActorClass {
    constructor(context: any) {
      // 从上下文中获取额外的参数
      const config = context.actorContext?.config;
      // 调用原始构造函数
      super(context, config);
    }
  };
}

/**
 * Agent系统类
 * 
 * 统一管理不同类型的Agent，提供创建、停止、监控等功能
 */
export class AgentSystem {
  private actorSystem: ActorSystem;
  private toolFactory: ToolFactory;
  private agents = new Map<string, { pid: PID, type: AgentType }>();
  private defaultConfig: Partial<AgentActorConfig>;
  private defaultMastraConfig: Partial<MastraAgentConfig>;
  private logging: boolean;
  private statistics: boolean;
  private stats: AgentSystemStats;

  constructor(config: AgentSystemConfig = {}) {
    this.actorSystem = new ActorSystem(config.actorSystemConfig);
    this.toolFactory = createToolFactory({ actorSystem: this.actorSystem });
    this.logging = config.logging ?? false;
    this.statistics = config.statistics ?? false;

    // 初始化统计数据
    this.stats = {
      totalAgents: 0,
      agentsByType: {
        [AgentType.LEGACY]: 0,
        [AgentType.BACTOR]: 0,
        [AgentType.MASTRA]: 0,
        [AgentType.ROLE]: 0,
        [AgentType.SKILL]: 0
      },
      toolCalls: 0,
      messagesProcessed: 0,
      startTime: Date.now()
    };

    if (config.tools) {
      this.toolFactory.registerAll(config.tools);
    }

    this.defaultConfig = config.defaultAgentConfig || {};
    this.defaultMastraConfig = config.defaultMastraConfig || {};

    if (this.logging) {
      this.log('Agent系统已初始化');
    }

    // 启动定时统计报告
    if (this.statistics) {
      setInterval(() => this.printStatistics(), 60000); // 每分钟打印一次统计
    }
  }

  /**
   * 创建传统Agent
   */
  async createAgent(config: AgentActorConfig): Promise<PID> {
    const finalConfig = { ...this.defaultConfig, ...config };
    const actorName = finalConfig.actorName || `agent-${finalConfig.name.toLowerCase().replace(/\s+/g, "-")}`;

    // 创建一个包装的AgentActor类
    const WrappedAgentActor = createAgentActorWrapper(AgentActor);

    const pid = await this.actorSystem.spawn({
      actorClass: WrappedAgentActor,
      actorContext: { config: finalConfig },
      dispatcher: undefined,
      mailboxType: undefined,
      supervisorStrategy: undefined,
      address: undefined,
    });

    const agentId = pid.id;
    this.agents.set(agentId, { pid, type: AgentType.LEGACY });
    this.incrementAgentCount(AgentType.LEGACY);

    if (this.logging) {
      this.log(`已创建传统Agent: ${finalConfig.name}`);
    }

    return pid;
  }

  /**
   * 创建Bactor Agent
   */
  async createBactorAgent(config: BactorAgentConfig): Promise<PID> {
    const actorName = `bactor-${config.name.toLowerCase().replace(/\s+/g, "-")}`;

    // 创建一个包装的BactorAgent类
    const WrappedBactorAgent = createAgentActorWrapper(BactorAgent);

    const pid = await this.actorSystem.spawn({
      actorClass: WrappedBactorAgent,
      actorContext: { config },
      dispatcher: undefined,
      mailboxType: undefined,
      supervisorStrategy: undefined,
      address: undefined,
    });

    const agentId = pid.id;
    this.agents.set(agentId, { pid, type: AgentType.BACTOR });
    this.incrementAgentCount(AgentType.BACTOR);

    if (this.logging) {
      this.log(`已创建Bactor Agent: ${config.name}`);
    }

    return pid;
  }

  /**
   * 创建Mastra Agent
   */
  async createMastraAgent(config: MastraAgentConfig): Promise<PID> {
    const finalConfig = { ...this.defaultMastraConfig, ...config };

    // 使用专门的工厂函数创建Mastra Agent
    const pid = await createMastraAgentActor(this.actorSystem, finalConfig);

    const agentId = pid.id;
    this.agents.set(agentId, { pid, type: AgentType.MASTRA });
    this.incrementAgentCount(AgentType.MASTRA);

    if (this.logging) {
      this.log(`已创建Mastra Agent: ${finalConfig.name}`);
    }

    return pid;
  }

  /**
   * 创建角色Agent
   */
  async createRoleAgent(role: string, config: AgentActorConfig): Promise<PID> {
    const finalConfig = {
      ...this.defaultConfig,
      ...config,
      role
    };
    const actorName = finalConfig.actorName || `role-${role.toLowerCase().replace(/\s+/g, "-")}`;

    // 创建一个包装的RoleAgent类
    const WrappedRoleAgent = createAgentActorWrapper(RoleAgent);

    const pid = await this.actorSystem.spawn({
      actorClass: WrappedRoleAgent,
      actorContext: { config: finalConfig },
      dispatcher: undefined,
      mailboxType: undefined,
      supervisorStrategy: undefined,
      address: undefined,
    });

    const agentId = pid.id;
    this.agents.set(agentId, { pid, type: AgentType.ROLE });
    this.incrementAgentCount(AgentType.ROLE);

    if (this.logging) {
      this.log(`已创建角色Agent: ${role}`);
    }

    return pid;
  }

  /**
   * 创建技能Agent
   */
  async createSkillAgent(skill: string, config: AgentActorConfig): Promise<PID> {
    const finalConfig = {
      ...this.defaultConfig,
      ...config,
      skill
    };
    const actorName = finalConfig.actorName || `skill-${skill.toLowerCase().replace(/\s+/g, "-")}`;

    // 创建一个包装的SkillAgent类
    const WrappedSkillAgent = createAgentActorWrapper(SkillAgent);

    const pid = await this.actorSystem.spawn({
      actorClass: WrappedSkillAgent,
      actorContext: { config: finalConfig },
      dispatcher: undefined,
      mailboxType: undefined,
      supervisorStrategy: undefined,
      address: undefined,
    });

    const agentId = pid.id;
    this.agents.set(agentId, { pid, type: AgentType.SKILL });
    this.incrementAgentCount(AgentType.SKILL);

    if (this.logging) {
      this.log(`已创建技能Agent: ${skill}`);
    }

    return pid;
  }

  /**
   * 创建工作流
   */
  async createWorkflow(config: WorkflowConfig): Promise<PID> {
    const actorName = `workflow-${config.name.toLowerCase().replace(/\s+/g, "-")}`;

    // 创建一个包装的WorkflowActor类
    const WrappedWorkflowActor = createAgentActorWrapper(WorkflowActor);

    const pid = await this.actorSystem.spawn({
      actorClass: WrappedWorkflowActor,
      actorContext: { config },
      dispatcher: undefined,
      mailboxType: undefined,
      supervisorStrategy: undefined,
      address: undefined,
    });

    if (this.logging) {
      this.log(`已创建工作流: ${config.name}`);
    }

    return pid;
  }

  /**
   * 获取Agent
   */
  getAgent(agentId: string): PID | undefined {
    return this.agents.get(agentId)?.pid;
  }

  /**
   * 获取所有Agent
   */
  getAllAgents(): Array<{ id: string, pid: PID, type: AgentType }> {
    return Array.from(this.agents.entries()).map(([id, { pid, type }]) => ({
      id,
      pid,
      type
    }));
  }

  /**
   * 获取特定类型的所有Agent
   */
  getAgentsByType(type: AgentType): Array<{ id: string, pid: PID }> {
    return Array.from(this.agents.entries())
      .filter(([_, info]) => info.type === type)
      .map(([id, { pid }]) => ({ id, pid }));
  }

  /**
   * 停止Agent
   */
  async stopAgent(agentId: string): Promise<void> {
    const agent = this.agents.get(agentId);
    if (agent) {
      await this.actorSystem.stop(agent.pid);
      this.agents.delete(agentId);
      this.decrementAgentCount(agent.type);

      if (this.logging) {
        this.log(`已停止Agent: ${agentId}`);
      }
    }
  }

  /**
   * 停止所有Agent
   */
  async stopAllAgents(): Promise<void> {
    for (const agentId of this.agents.keys()) {
      await this.stopAgent(agentId);
    }

    if (this.logging) {
      this.log(`已停止所有Agent`);
    }
  }

  /**
   * 关闭整个Agent系统
   */
  async shutdown(): Promise<void> {
    if (this.logging) {
      this.log(`正在关闭Agent系统...`);
    }

    await this.stopAllAgents();
    await this.actorSystem.stop();

    if (this.logging) {
      this.log(`Agent系统已关闭`);
    }
  }

  /**
   * 获取Actor系统
   */
  getActorSystem(): ActorSystem {
    return this.actorSystem;
  }

  /**
   * 获取工具工厂
   */
  getToolFactory(): ToolFactory {
    return this.toolFactory;
  }

  /**
   * 注册工具
   */
  registerTool(name: string, tool: any): void {
    this.toolFactory.register(name, tool);

    if (this.logging) {
      this.log(`已注册工具: ${name}`);
    }
  }

  /**
   * 执行工具
   */
  async executeTool(name: string, params: any): Promise<any> {
    if (this.logging) {
      this.log(`执行工具: ${name}`);
    }

    this.stats.toolCalls++;
    return this.toolFactory.executeTool(name, params);
  }

  /**
   * 日志函数
   */
  private log(message: string): void {
    if (this.logging) {
      const timestamp = new Date().toISOString();
      console.log(`[${timestamp}] [AgentSystem] ${message}`);
    }
  }

  /**
   * 增加Agent计数
   */
  private incrementAgentCount(type: AgentType): void {
    this.stats.totalAgents++;
    this.stats.agentsByType[type]++;
  }

  /**
   * 减少Agent计数
   */
  private decrementAgentCount(type: AgentType): void {
    this.stats.totalAgents--;
    this.stats.agentsByType[type]--;
  }

  /**
   * 增加消息计数
   */
  incrementMessageCount(): void {
    this.stats.messagesProcessed++;
  }

  /**
   * 打印统计信息
   */
  printStatistics(): void {
    if (!this.statistics) return;

    const uptime = Math.floor((Date.now() - this.stats.startTime) / 1000);
    const hours = Math.floor(uptime / 3600);
    const minutes = Math.floor((uptime % 3600) / 60);
    const seconds = uptime % 60;

    console.log('\n===== Agent系统统计 =====');
    console.log(`运行时间: ${hours}小时 ${minutes}分钟 ${seconds}秒`);
    console.log(`Agent总数: ${this.stats.totalAgents}`);
    console.log('Agent类型分布:');
    for (const [type, count] of Object.entries(this.stats.agentsByType)) {
      console.log(`  - ${type}: ${count}`);
    }
    console.log(`工具调用: ${this.stats.toolCalls}`);
    console.log(`处理消息: ${this.stats.messagesProcessed}`);
    console.log('========================\n');
  }

  /**
   * 获取统计数据
   */
  getStatistics(): AgentSystemStats {
    return { ...this.stats };
  }
}
