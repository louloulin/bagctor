import { ActorSystem, Props, PID } from '@bactor/core';
import { AgentConfig, AgentContext } from './types';
import { BaseAgent } from './base_agent';

export class AgentSystem {
  private system: ActorSystem;
  private agents: Map<string, PID>;

  constructor() {
    this.system = new ActorSystem();
    this.agents = new Map();
  }

  async createAgent<T extends BaseAgent>(
    AgentClass: new (...args: any[]) => T,
    config: AgentConfig
  ): Promise<PID> {
    // Extract context if it exists in the config
    const { context, ...cleanConfig } = config as any;

    const props: Props = {
      actorClass: AgentClass,
      actorContext: {
        config: cleanConfig,
        memory: {
          shortTerm: new Map(),
          longTerm: new Map()
        },
        // Add task context if provided
        ...(context ? { task: context.task } : {})
      }
    };

    const pid = await this.system.spawn(props);
    this.agents.set(config.role, pid);
    return pid;
  }

  async getAgent(role: string): Promise<PID | undefined> {
    return this.agents.get(role);
  }

  async send(target: PID, message: any): Promise<void> {
    await this.system.send(target, message);
  }

  async stopAgent(role: string): Promise<void> {
    const pid = await this.getAgent(role);
    if (pid) {
      await this.system.stop(pid);
      this.agents.delete(role);
    }
  }

  async stopAll(): Promise<void> {
    await Promise.all(
      Array.from(this.agents.values()).map(pid => this.system.stop(pid))
    );
    this.agents.clear();
  }

  getAgentRoles(): string[] {
    return Array.from(this.agents.keys());
  }

  getRunningAgents(): Map<string, PID> {
    return new Map(this.agents);
  }
} 