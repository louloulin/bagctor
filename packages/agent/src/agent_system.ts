import { ActorSystem, Props, PID } from '@bactor/core';
import { AgentConfig } from './types';
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
    const props: Props = {
      actorClass: AgentClass,
      actorContext: { config }
    };

    const pid = await this.system.spawn(props);
    this.agents.set(config.role, pid);
    return pid;
  }

  async getAgent(role: string): Promise<PID | undefined> {
    return this.agents.get(role);
  }

  async stopAgent(role: string): Promise<void> {
    const pid = this.agents.get(role);
    if (pid) {
      await this.system.stop(pid);
      this.agents.delete(role);
    }
  }

  async stopAll(): Promise<void> {
    for (const [role, pid] of this.agents) {
      await this.system.stop(pid);
    }
    this.agents.clear();
  }

  getAgentRoles(): string[] {
    return Array.from(this.agents.keys());
  }

  getRunningAgents(): Map<string, PID> {
    return new Map(this.agents);
  }
} 