import { RoleAgent } from './role_agent';
import { ActorContext } from '@bactor/core';
import { AgentMessage, AgentConfig } from '../types';
import { Action } from '../interfaces/action_types';

export interface Plan {
  id: string;
  tasks: Action[];
  dependencies: Map<string, string[]>;
  completedTasks: Action[];
  status: 'PENDING' | 'IN_PROGRESS' | 'COMPLETED' | 'BLOCKED';
  priority: string;
  concurrentTasks: number;
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

  public async processTask(action: Action): Promise<any> {
    switch (action.type) {
      case 'CREATE_PLAN':
        if (!action.metadata?.tasks) {
          throw new Error('Tasks are required for plan creation');
        }
        return await this.createPlan(action);
      case 'EXECUTE_PLAN':
        if (!action.metadata?.planId) {
          throw new Error('Plan ID is required for plan execution');
        }
        return await this.executePlan(action.metadata.planId);
      default:
        throw new Error(`Unknown task type: ${action.type}`);
    }
  }

  public async processCoordination(action: string, data: any): Promise<any> {
    if (!data.planId) {
      throw new Error('Plan ID is required for coordination actions');
    }

    switch (action) {
      case 'UPDATE_PLAN':
        return await this.updatePlan(data);
      case 'BLOCK_PLAN':
        return await this.handleBlockedPlan(data);
      case 'PRIORITIZE_PLAN':
        return await this.prioritizePlan(data);
      default:
        throw new Error(`Unknown coordination action: ${action}`);
    }
  }

  private async createPlan(action: Action): Promise<Plan> {
    const plan: Plan = {
      id: `PLAN-${Date.now()}`,
      tasks: this.decomposeTasks(action),
      dependencies: this.analyzeDependencies(action),
      completedTasks: [],
      status: 'PENDING',
      priority: this.determinePriority(action),
      concurrentTasks: 0
    };

    this.activePlans.set(plan.id, plan);
    return plan;
  }

  private async executePlan(planId: string): Promise<Plan> {
    const plan = this.activePlans.get(planId);
    if (!plan) {
      throw new Error(`Plan not found: ${planId}`);
    }

    plan.status = 'IN_PROGRESS';

    if (this.config.parameters.planningStrategy === 'parallel') {
      await this.executeParallel(plan);
    } else {
      await this.executeSequential(plan);
    }

    return plan;
  }

  private async executeParallel(plan: Plan): Promise<void> {
    const availableTasks = this.getAvailableTasks(plan);
    const maxTasks = Math.min(
      this.config.parameters.maxConcurrentTasks - plan.concurrentTasks,
      availableTasks.length
    );

    for (let i = 0; i < maxTasks; i++) {
      const task = availableTasks[i];
      plan.concurrentTasks++;
      await this.executeTask(plan, task);
    }
  }

  private async executeSequential(plan: Plan): Promise<void> {
    const nextTask = this.getNextTask(plan);
    if (nextTask) {
      await this.executeTask(plan, nextTask);
    }
  }

  private async executeTask(plan: Plan, task: Action): Promise<void> {
    // Execute task logic here
    // This would typically involve sending the task to appropriate agents
    // For now, we'll just simulate task execution
    await new Promise(resolve => setTimeout(resolve, 10)); // Simulate task execution

    plan.completedTasks.push(task);
    plan.concurrentTasks--;

    // Only mark as completed if all tasks are done AND we're not executing more tasks
    if (plan.completedTasks.length === plan.tasks.length && plan.concurrentTasks === 0) {
      plan.status = 'COMPLETED';
    }
  }

  private getAvailableTasks(plan: Plan): Action[] {
    return plan.tasks.filter(task => {
      if (plan.completedTasks.some(completed => completed.id === task.id)) {
        return false;
      }
      const deps = plan.dependencies.get(task.id) || [];
      return deps.every(depId =>
        plan.completedTasks.some(completed => completed.id === depId)
      );
    });
  }

  private getNextTask(plan: Plan): Action | undefined {
    return this.getAvailableTasks(plan)[0];
  }

  private async updatePlan(data: any): Promise<Plan> {
    const plan = this.activePlans.get(data.planId);
    if (!plan) {
      // Create a new plan if it doesn't exist
      const newPlan: Plan = {
        id: data.planId,
        tasks: [],
        dependencies: new Map(),
        completedTasks: [],
        status: 'PENDING',
        priority: this.config.parameters.priorityLevels[0],
        concurrentTasks: 0
      };
      this.activePlans.set(data.planId, newPlan);
      return newPlan;
    }

    if (data.completedTask) {
      if (!plan.completedTasks.some(task => task.id === data.completedTask.id)) {
        plan.completedTasks.push(data.completedTask);
        plan.concurrentTasks = Math.max(0, plan.concurrentTasks - 1);
      }
    }

    if (data.newTasks) {
      const newTasks = this.decomposeTasks(data.newTasks);
      plan.tasks.push(...newTasks);
      this.updateDependencies(plan, newTasks);
    }

    if (plan.completedTasks.length === plan.tasks.length && plan.concurrentTasks === 0) {
      plan.status = 'COMPLETED';
    } else if (plan.status === 'IN_PROGRESS') {
      if (this.config.parameters.planningStrategy === 'parallel') {
        await this.executeParallel(plan);
      } else {
        await this.executeSequential(plan);
      }
    }

    return plan;
  }

  private async handleBlockedPlan(data: any): Promise<Plan> {
    let plan = this.activePlans.get(data.planId);
    if (!plan) {
      // Create a new plan if it doesn't exist
      plan = {
        id: data.planId,
        tasks: [],
        dependencies: new Map(),
        completedTasks: [],
        status: 'PENDING',
        priority: this.config.parameters.priorityLevels[0],
        concurrentTasks: 0
      };
      this.activePlans.set(data.planId, plan);
    }

    plan.status = 'BLOCKED';
    return plan;
  }

  private async prioritizePlan(data: any): Promise<Plan> {
    let plan = this.activePlans.get(data.planId);
    if (!plan) {
      // Create a new plan if it doesn't exist
      plan = {
        id: data.planId,
        tasks: [],
        dependencies: new Map(),
        completedTasks: [],
        status: 'PENDING',
        priority: this.config.parameters.priorityLevels[0],
        concurrentTasks: 0
      };
      this.activePlans.set(data.planId, plan);
    }

    if (this.config.parameters.priorityLevels.includes(data.priority)) {
      plan.priority = data.priority;
    }

    return plan;
  }

  private decomposeTasks(action: Action): Action[] {
    return action.metadata?.tasks || [action];
  }

  private analyzeDependencies(action: Action): Map<string, string[]> {
    const dependencies = new Map<string, string[]>();

    if (action.metadata?.dependencies instanceof Map) {
      for (const [taskId, deps] of action.metadata.dependencies) {
        dependencies.set(taskId, deps);
      }
    } else if (action.metadata?.tasks) {
      action.metadata.tasks.forEach((task: Action) => {
        if (task.context?.dependencies) {
          dependencies.set(task.id, task.context.dependencies);
        }
      });
    }

    return dependencies;
  }

  private updateDependencies(plan: Plan, newTasks: Action[]): void {
    newTasks.forEach(task => {
      if (!plan.dependencies.has(task.id)) {
        plan.dependencies.set(task.id, task.context?.dependencies || []);
      }
    });
  }

  private determinePriority(action: Action): string {
    return action.priority || this.config.parameters.priorityLevels[0] || 'medium';
  }
} 