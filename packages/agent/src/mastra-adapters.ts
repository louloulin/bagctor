import { Agent } from '@mastra/core/agent';
import { Mastra } from '@mastra/core';
import { z } from 'zod';
import { Workflow as BagctorWorkflow } from './workflow';
import { Step, Workflow as MastraWorkflow } from './workflow-compat';
import { DistributedWorkflowScheduler, DistributedWorkflowExecutor } from './distributed-workflow';
import { NodeIdentifier, DistributedNode } from './types';
import { SharedAgentMemory } from './distributed-interaction';

/**
 * Mastra Workflow适配器
 * 用于将Mastra风格的工作流转换为Bagctor的分布式工作流
 */
export class MastraWorkflowAdapter {
    private agentsMap: Record<string, Agent>;
    private nodes: Map<NodeIdentifier, DistributedNode>;
    private defaultNodeId: NodeIdentifier;
    private scheduler: DistributedWorkflowScheduler;
    private executor: DistributedWorkflowExecutor;

    constructor(agentsMap: Record<string, Agent>, nodes: Map<NodeIdentifier, DistributedNode>, defaultNodeId: NodeIdentifier) {
        this.agentsMap = agentsMap;
        this.nodes = nodes;
        this.defaultNodeId = defaultNodeId;

        // 创建分布式工作流调度器
        this.scheduler = new DistributedWorkflowScheduler(agentsMap, nodes, defaultNodeId);

        // 创建分布式工作流执行器
        this.executor = new DistributedWorkflowExecutor(this.scheduler, agentsMap);
    }

    /**
     * 创建一个符合Mastra API的工作流
     */
    createWorkflow(config: { name: string; triggerSchema?: z.ZodTypeAny; nodeAssignment?: Record<string, NodeIdentifier> }): MastraWorkflow {
        return new MastraWorkflow(config);
    }

    /**
     * 创建一个符合Mastra API的步骤
     */
    createStep(config: {
        id: string;
        outputSchema?: z.ZodTypeAny;
        execute: (context: any) => Promise<any>;
    }): Step {
        return new Step(config);
    }

    /**
     * 执行Mastra风格的工作流
     */
    async executeWorkflow(workflow: MastraWorkflow, runOptions: { triggerData?: any }): Promise<any> {
        const runId = `run_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
        return await this.executor.executeWorkflow(workflow, runId, runOptions.triggerData);
    }

    /**
     * 将Bagctor工作流转换为Mastra风格的工作流
     */
    adaptBagctorWorkflow(bagctorWorkflow: BagctorWorkflow): MastraWorkflow {
        // 创建一个新的Mastra风格工作流
        const mastraWorkflow = this.createWorkflow({
            name: bagctorWorkflow.name
        });

        // 将Bagctor工作流的步骤转换为Mastra风格的步骤
        for (const bagctorStep of bagctorWorkflow.steps) {
            const mastraStep = this.createStep({
                id: `step_${bagctorStep.agent}`,
                execute: async ({ context }) => {
                    const agentName = bagctorStep.agent;
                    const agent = this.agentsMap[agentName];

                    if (!agent) {
                        throw new Error(`智能体 ${agentName} 不存在`);
                    }

                    // 确定输入内容
                    let input: string;
                    if (typeof bagctorStep.input === 'function') {
                        // 函数形式的输入
                        input = bagctorStep.input(context.machineContext.getData());
                    } else {
                        // 字符串形式的输入
                        input = bagctorStep.input;
                    }

                    // 调用智能体
                    const response = await agent.generate(input);

                    // 返回结果
                    return { [bagctorStep.output]: response.text };
                }
            });

            // 添加步骤到工作流
            mastraWorkflow.step(mastraStep);
        }

        // 提交工作流
        return mastraWorkflow.commit();
    }
}

/**
 * Mastra实例适配器
 * 用于将Mastra实例集成到Bagctor系统中
 */
export class MastraInstanceAdapter {
    private mastraInstance: Mastra;
    private workflowAdapter: MastraWorkflowAdapter;

    constructor(mastraInstance: Mastra, workflowAdapter: MastraWorkflowAdapter) {
        this.mastraInstance = mastraInstance;
        this.workflowAdapter = workflowAdapter;
    }

    /**
     * 获取Mastra实例的所有工作流
     */
    getWorkflows(): Record<string, any> {
        return this.mastraInstance.getWorkflows?.() || {};
    }

    /**
     * 获取指定名称的工作流
     */
    getWorkflow(name: string): any {
        const workflows = this.mastraInstance.getWorkflows?.() || {};
        if (!workflows || !workflows[name]) {
            throw new Error(`工作流 ${name} 不存在`);
        }
        return workflows[name];
    }

    /**
     * 执行指定工作流
     */
    async executeWorkflow(workflowName: string, options: { triggerData?: any }): Promise<any> {
        const workflow = this.getWorkflow(workflowName);

        if (!workflow) {
            throw new Error(`工作流 ${workflowName} 不存在`);
        }

        // 创建一个运行实例
        const { runId, start } = workflow.createRun();

        // 执行工作流
        return await start({ triggerData: options.triggerData });
    }

    /**
     * 将所有Mastra工作流适配到Bagctor系统
     */
    adaptAllWorkflows(): Record<string, MastraWorkflow> {
        const workflows = this.getWorkflows();
        const adaptedWorkflows: Record<string, MastraWorkflow> = {};

        for (const [name, workflow] of Object.entries(workflows)) {
            const adaptedWorkflow = this.adaptWorkflow(workflow);
            adaptedWorkflows[name] = adaptedWorkflow;
        }

        return adaptedWorkflows;
    }

    /**
     * 适配单个Mastra工作流到Bagctor系统
     */
    private adaptWorkflow(workflow: any): MastraWorkflow {
        // 这里需要根据Mastra工作流的具体实现进行适配
        // 由于没有完整的Mastra工作流实现细节，这里提供一个框架

        // 创建一个新的Mastra风格工作流
        const adaptedWorkflow = this.workflowAdapter.createWorkflow({
            name: workflow.name,
            triggerSchema: workflow.triggerSchema
        });

        // 将原工作流的步骤添加到适配后的工作流
        // 这里需要根据Mastra工作流的具体实现进行处理

        // 提交工作流
        return adaptedWorkflow.commit();
    }
} 