import { RoleAgent } from './role_agent';
import { ActorContext } from '@bactor/core';
import { AgentMessage, AgentConfig } from '../types';
import { Action } from '../interfaces/action_types';

export interface Plan {
  id: string;
  tasks: Action[];
  dependencies: Map<string, string[]>;
  completedTasks: any[];
  status: 'PENDING' | 'IN_PROGRESS' | 'COMPLETED' | 'BLOCKED';
}

export interface PlannerConfig extends AgentConfig {
  role: 'planner';
  capabilities: string[];
  parameters: {
    planningStrategy: 'sequential' | 'parallel';
    maxConcurrentTasks: number;
    priorityLevels: string[];
  };
}

export class PlannerAgent extends RoleAgent {
  private activePlans: Map<string, Plan>;
  private config: PlannerConfig;

  constructor(context: ActorContext, config: PlannerConfig) {
    super(context, config);
    this.activePlans = new Map();
    this.config = config;
  }

  protected async processTask(action: Action): Promise<any> {
    // Process task based on planner capabilities
    const plan = await this.createPlan(action);
    return plan;
  }

  protected async processCoordination(action: string, data: any): Promise<any> {
    // Process coordination based on planner capabilities
    switch (action) {
      case 'UPDATE_PLAN':
        return await this.updatePlan(data);
      case 'BLOCK_PLAN':
        return await this.handleBlockedPlan(data);
      default:
        throw new Error(`Unknown coordination action: ${action}`);
    }
  }

  private async createPlan(action: Action): Promise<Plan> {
    const plan: Plan = {
      id: `PLAN-${Date.now()}`,
      tasks: [action],
      dependencies: new Map(),
      completedTasks: [],
      status: 'PENDING'
    };

    this.activePlans.set(plan.id, plan);
    return plan;
  }

  private async updatePlan(data: any): Promise<Plan> {
    const plan = this.activePlans.get(data.planId);
    if (!plan) {
      throw new Error(`Plan not found: ${data.planId}`);
    }

    // Update plan based on data
    if (data.completedTask) {
      plan.completedTasks.push(data.completedTask);
    }

    if (data.newTasks) {
      plan.tasks.push(...data.newTasks);
    }

    // Update plan status
    if (plan.completedTasks.length === plan.tasks.length) {
      plan.status = 'COMPLETED';
    }

    return plan;
  }

  private async handleBlockedPlan(data: any): Promise<Plan> {
    const plan = this.activePlans.get(data.planId);
    if (!plan) {
      throw new Error(`Plan not found: ${data.planId}`);
    }

    plan.status = 'BLOCKED';
    return plan;
  }
} 