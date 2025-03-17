import { Agent } from '@mastra/core/agent';
import { z } from 'zod';
import { SharedAgentMemory } from './distributed-interaction';
import { NodeIdentifier } from './types';

/**
 * Mastra兼容的工作流上下文
 */
export class MachineContext {
    private data: Record<string, any> = {};
    private stepResults: Record<string, any> = {};
    private workflowId: string;

    constructor(workflowId: string, triggerData?: any) {
        this.workflowId = workflowId;
        this.data = { triggerData };
    }

    /**
     * 获取上下文数据
     */
    getData(): Record<string, any> {
        return this.data;
    }

    /**
     * 设置上下文数据
     */
    setData(key: string, value: any): void {
        this.data[key] = value;
    }

    /**
     * 设置步骤执行结果
     */
    setStepResult(stepId: string, result: any): void {
        this.stepResults[stepId] = result;
    }

    /**
     * 获取指定步骤的执行结果
     * 兼容Mastra的getStepPayload方法
     */
    getStepPayload<T>(stepId: string): T {
        return this.stepResults[stepId] as T;
    }

    /**
     * 获取工作流ID
     */
    getWorkflowId(): string {
        return this.workflowId;
    }

    /**
     * 获取触发数据
     */
    get triggerData(): any {
        return this.data.triggerData;
    }
}

/**
 * 步骤执行上下文
 */
interface StepExecutionContext {
    machineContext: MachineContext;
    agentsMap: Record<string, Agent>;
    stepId: string;
    [key: string]: any;
}

/**
 * 工作流步骤配置
 */
interface StepConfig {
    id: string;
    outputSchema?: z.ZodTypeAny;
    execute: (context: { context: StepExecutionContext }) => Promise<any>;
}

/**
 * 兼容Mastra API的工作流步骤
 */
export class Step {
    private id: string;
    private executeFn: (context: { context: StepExecutionContext }) => Promise<any>;
    private outputSchema?: z.ZodTypeAny;
    private nodeAssignment?: NodeIdentifier;

    constructor(config: StepConfig) {
        this.id = config.id;
        this.executeFn = config.execute;
        this.outputSchema = config.outputSchema;
    }

    /**
     * 获取步骤ID
     */
    getId(): string {
        return this.id;
    }

    /**
     * 设置步骤的节点分配
     */
    assignToNode(nodeId: NodeIdentifier): Step {
        this.nodeAssignment = nodeId;
        return this;
    }

    /**
     * 获取步骤的节点分配
     */
    getNodeAssignment(): NodeIdentifier | undefined {
        return this.nodeAssignment;
    }

    /**
     * 执行步骤
     */
    async execute(context: StepExecutionContext): Promise<any> {
        try {
            // 执行步骤逻辑
            const result = await this.executeFn({ context });

            // 如果有输出模式，验证结果
            if (this.outputSchema) {
                return this.outputSchema.parse(result);
            }

            return result;
        } catch (error) {
            console.error(`步骤 ${this.id} 执行失败:`, error);
            throw error;
        }
    }
}

/**
 * 工作流配置
 */
interface WorkflowConfig {
    name: string;
    triggerSchema?: z.ZodTypeAny;
    nodeAssignment?: Record<string, NodeIdentifier>;
}

/**
 * 工作流执行结果
 */
interface WorkflowExecutionResult {
    runId: string;
    results: Record<string, any>;
}

/**
 * 兼容Mastra API的工作流
 */
export class Workflow {
    private name: string;
    private steps: Step[] = [];
    private stepSequence: string[] = [];
    private triggerSchema?: z.ZodTypeAny;
    private nodeAssignment: Record<string, NodeIdentifier> = {};
    private isCommitted: boolean = false;
    private workflowContextId?: string;

    constructor(config: WorkflowConfig) {
        this.name = config.name;
        this.triggerSchema = config.triggerSchema;
        this.nodeAssignment = config.nodeAssignment || {};
    }

    /**
     * 添加一个步骤到工作流
     */
    step(step: Step): Workflow {
        if (this.isCommitted) {
            throw new Error('工作流已提交，无法添加更多步骤');
        }

        this.steps.push(step);
        this.stepSequence.push(step.getId());

        // 如果有节点分配，应用到步骤
        const nodeId = this.nodeAssignment[step.getId()];
        if (nodeId) {
            step.assignToNode(nodeId);
        }

        return this;
    }

    /**
     * 链式添加步骤
     */
    then(step: Step): Workflow {
        return this.step(step);
    }

    /**
     * 获取工作流步骤列表
     */
    getSteps(): Step[] {
        return [...this.steps];
    }

    /**
     * 完成工作流定义
     */
    commit(): Workflow {
        this.isCommitted = true;
        return this;
    }

    /**
     * 创建工作流运行实例
     */
    createRun(): { runId: string; start: (options: { triggerData?: any }) => Promise<WorkflowExecutionResult> } {
        const runId = `run_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;

        return {
            runId,
            start: async (options: { triggerData?: any }) => {
                if (this.triggerSchema && options.triggerData) {
                    // 验证触发数据
                    this.triggerSchema.parse(options.triggerData);
                }

                return await this.executeWorkflow(runId, options.triggerData);
            }
        };
    }

    /**
     * 执行工作流
     */
    private async executeWorkflow(runId: string, triggerData?: any): Promise<WorkflowExecutionResult> {
        // 创建或获取工作流上下文
        if (!this.workflowContextId) {
            this.workflowContextId = await SharedAgentMemory.createWorkflowContext(runId);
        }

        // 创建机器上下文
        const machineContext = new MachineContext(runId, triggerData);

        // 收集所有步骤的结果
        const results: Record<string, any> = {};

        // 按顺序执行每个步骤
        for (const stepId of this.stepSequence) {
            const step = this.steps.find(s => s.getId() === stepId);
            if (!step) {
                throw new Error(`未找到步骤: ${stepId}`);
            }

            try {
                // 执行步骤
                const result = await step.execute({
                    machineContext,
                    agentsMap: {}, // 这里需要传入实际的agentsMap
                    stepId
                });

                // 存储结果
                results[stepId] = result;
                machineContext.setStepResult(stepId, result);
            } catch (error) {
                console.error(`步骤 ${stepId} 执行失败:`, error);
                throw error;
            }
        }

        return {
            runId,
            results
        };
    }
} 