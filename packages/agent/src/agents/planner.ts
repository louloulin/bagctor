import { BaseAgent } from '../base_agent';
import { AgentMessage, TaskMessage } from '../types';

export class PlannerAgent extends BaseAgent {
  protected async handleTask(message: AgentMessage): Promise<void> {
    const taskMessage = message as TaskMessage;
    const { description, requirements } = taskMessage.payload;

    // Create a plan based on the task description and requirements
    const plan = await this.createPlan(description, requirements);

    // Store the plan in memory
    const planId = `plan_${Date.now()}`;
    await this.remember(planId, plan);

    // Distribute subtasks to executor agents
    await this.distributeSubtasks(planId, plan);
  }

  protected async handleResult(message: AgentMessage): Promise<void> {
    // Update plan progress based on executor results
    const planId = message.payload.taskId;
    const plan = this.recall(planId);
    
    if (plan) {
      // Update plan status
      plan.completedTasks.push(message.payload.result);
      await this.remember(planId, plan);

      // Check if plan is complete
      if (this.isPlanComplete(plan)) {
        await this.finalizePlan(planId);
      }
    }
  }

  protected async handleFeedback(message: AgentMessage): Promise<void> {
    // Adjust planning strategy based on feedback
    const feedback = message.payload;
    const feedbackId = `feedback_${Date.now()}`;
    await this.remember(feedbackId, feedback, true);
  }

  protected async handleCoordination(message: AgentMessage): Promise<void> {
    // Handle coordination messages from other agents
    switch (message.payload.action) {
      case 'REQUEST_PLAN_UPDATE':
        await this.updatePlan(message.payload.data);
        break;
      case 'PLAN_BLOCKED':
        await this.handleBlockedPlan(message.payload.data);
        break;
    }
  }

  private async createPlan(description: string, requirements: string[]): Promise<any> {
    // Implement planning logic here
    return {
      description,
      requirements,
      tasks: this.decomposeTasks(description, requirements),
      completedTasks: [],
      status: 'IN_PROGRESS'
    };
  }

  private decomposeTasks(description: string, requirements: string[]): any[] {
    // Implement task decomposition logic
    return requirements.map(req => ({
      taskId: `task_${Date.now()}_${Math.random().toString(36).substring(7)}`,
      requirement: req,
      status: 'PENDING'
    }));
  }

  private async distributeSubtasks(planId: string, plan: any): Promise<void> {
    for (const task of plan.tasks) {
      await this.tell('executor', {
        type: 'TASK',
        sender: this.agentContext.self,
        timestamp: Date.now(),
        payload: {
          planId,
          taskId: task.taskId,
          description: task.requirement,
          context: plan.description
        }
      });
    }
  }

  private isPlanComplete(plan: any): boolean {
    return plan.completedTasks.length === plan.tasks.length;
  }

  private async finalizePlan(planId: string): Promise<void> {
    const plan = this.recall(planId);
    plan.status = 'COMPLETED';
    
    // Notify interested parties about plan completion
    await this.tell('reviewer', {
      type: 'RESULT',
      sender: this.agentContext.self,
      timestamp: Date.now(),
      payload: {
        planId,
        result: plan
      }
    });
  }

  private async updatePlan(data: any): Promise<void> {
    const plan = this.recall(data.planId);
    if (plan) {
      // Update plan based on new information
      Object.assign(plan, data.updates);
      await this.remember(data.planId, plan);
    }
  }

  private async handleBlockedPlan(data: any): Promise<void> {
    const plan = this.recall(data.planId);
    if (plan) {
      // Implement recovery strategy for blocked plans
      const recoveryPlan = await this.createRecoveryPlan(plan, data.reason);
      await this.updatePlan({
        planId: data.planId,
        updates: recoveryPlan
      });
    }
  }

  private async createRecoveryPlan(plan: any, reason: string): Promise<any> {
    // Implement recovery plan creation logic
    return {
      ...plan,
      status: 'RECOVERING',
      recoverySteps: [
        {
          reason,
          action: 'RETRY',
          timestamp: Date.now()
        }
      ]
    };
  }
} 