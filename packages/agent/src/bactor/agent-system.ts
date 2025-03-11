/**
 * Agent System Implementation
 */

import { ActorSystem, PID } from "@bactor/core";
import { AgentActor, AgentActorConfig } from "./agent-actor";
import { BactorAgent, BactorAgentConfig } from "./bactor-agent";
import { RoleAgent } from "./role-agent";
import { SkillAgent } from "./skill-agent";
import { WorkflowActor, WorkflowConfig } from "./workflow-actor";
import { ToolFactory, createToolFactory } from "./tool-factory";

export interface AgentSystemConfig {
  actorSystemConfig?: any;
  defaultAgentConfig?: Partial<AgentActorConfig>;
  tools?: Record<string, any>;
}

export class AgentSystem {
  private actorSystem: ActorSystem;
  private toolFactory: ToolFactory;
  private agents = new Map<string, PID>();
  private defaultConfig: Partial<AgentActorConfig>;

  constructor(config: AgentSystemConfig = {}) {
    this.actorSystem = new ActorSystem(config.actorSystemConfig);
    this.toolFactory = createToolFactory({ actorSystem: this.actorSystem });
    if (config.tools) {
      this.toolFactory.registerAll(config.tools);
    }
    this.defaultConfig = config.defaultAgentConfig || {};
  }

  async createAgent(config: AgentActorConfig): Promise<PID> {
    const finalConfig = { ...this.defaultConfig, ...config };
    const pid = this.actorSystem.spawn(
      AgentActor,
      { args: finalConfig },
      finalConfig.actorName || `agent-${finalConfig.name.toLowerCase().replace(/\s+/g, "-")}`
    );
    const agentId = pid.path.toString();
    this.agents.set(agentId, pid);
    return pid;
  }

  async createBactorAgent(config: BactorAgentConfig): Promise<PID> {
    const pid = this.actorSystem.spawn(
      BactorAgent,
      { args: config },
      `bactor-${config.name.toLowerCase().replace(/\s+/g, "-")}`
    );
    const agentId = pid.path.toString();
    this.agents.set(agentId, pid);
    return pid;
  }

  async createRoleAgent(role: string, config: AgentActorConfig): Promise<PID> {
    const finalConfig = { 
      ...this.defaultConfig, 
      ...config,
      role 
    };
    const pid = this.actorSystem.spawn(
      RoleAgent,
      { args: finalConfig },
      finalConfig.actorName || `role-${role.toLowerCase().replace(/\s+/g, "-")}`
    );
    const agentId = pid.path.toString();
    this.agents.set(agentId, pid);
    return pid;
  }

  async createSkillAgent(skill: string, config: AgentActorConfig): Promise<PID> {
    const finalConfig = { 
      ...this.defaultConfig, 
      ...config,
      skill 
    };
    const pid = this.actorSystem.spawn(
      SkillAgent,
      { args: finalConfig },
      finalConfig.actorName || `skill-${skill.toLowerCase().replace(/\s+/g, "-")}`
    );
    const agentId = pid.path.toString();
    this.agents.set(agentId, pid);
    return pid;
  }

  async createWorkflow(config: WorkflowConfig): Promise<PID> {
    return this.actorSystem.spawn(
      WorkflowActor,
      { args: config },
      `workflow-${config.name.toLowerCase().replace(/\s+/g, "-")}`
    );
  }

  getAgent(agentId: string): PID | undefined {
    return this.agents.get(agentId);
  }

  async stopAgent(agentId: string): Promise<void> {
    const agent = this.agents.get(agentId);
    if (agent) {
      await this.actorSystem.stop(agent);
      this.agents.delete(agentId);
    }
  }

  async shutdown(): Promise<void> {
    for (const agentId of this.agents.keys()) {
      await this.stopAgent(agentId);
    }
    await this.actorSystem.shutdown();
  }

  getActorSystem(): ActorSystem {
    return this.actorSystem;
  }

  getToolFactory(): ToolFactory {
    return this.toolFactory;
  }

  registerTool(name: string, tool: any): void {
    this.toolFactory.register(name, tool);
  }

  async executeTool(name: string, params: any): Promise<any> {
    return this.toolFactory.executeTool(name, params);
  }
}
