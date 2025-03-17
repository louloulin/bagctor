import { Agent } from '@mastra/core/agent';
import { WorkflowConfig, WorkflowStep } from './types';
import { EventEmitter } from 'events';

/**
 * 工作流状态
 */
export type WorkflowStatus = 'idle' | 'running' | 'completed' | 'failed';

/**
 * 工作流上下文
 */
export interface WorkflowContext {
    [key: string]: any;
}

/**
 * 工作流图服务
 * 提供工作流状态管理和执行
 */
export class WorkflowGraph extends EventEmitter {
    private config: WorkflowConfig;
    private agents: Record<string, Agent>;
    private context: WorkflowContext = {};
    private currentStep: number = 0;
    private status: WorkflowStatus = 'idle';
    private error?: string;
    private executionPromise?: Promise<WorkflowContext>;

    /**
     * 创建工作流图服务
     * @param config 工作流配置
     * @param agents 智能体映射
     */
    constructor(config: WorkflowConfig, agents: Record<string, Agent>) {
        super();
        this.config = config;
        this.agents = agents;

        // 验证所有代理都存在
        for (const step of config.steps) {
            if (!agents[step.agent]) {
                throw new Error(`智能体 "${step.agent}" 不存在`);
            }
        }
    }

    /**
     * 获取工作流状态
     */
    get currentStatus(): WorkflowStatus {
        return this.status;
    }

    /**
     * 获取当前步骤索引
     */
    get currentStepIndex(): number {
        return this.currentStep;
    }

    /**
     * 获取工作流步骤
     */
    get steps(): WorkflowStep[] {
        return [...this.config.steps];
    }

    /**
     * 获取工作流上下文
     */
    get workflowContext(): WorkflowContext {
        return { ...this.context };
    }

    /**
     * 获取错误信息
     */
    get errorMessage(): string | undefined {
        return this.error;
    }

    /**
     * 执行工作流
     */
    async execute(): Promise<WorkflowContext> {
        if (this.status === 'running') {
            throw new Error('工作流已在执行中');
        }

        this.status = 'running';
        this.error = undefined;
        this.currentStep = 0;
        this.context = {};
        this.emit('status', this.status);

        try {
            this.executionPromise = this.executeSteps();
            const result = await this.executionPromise;
            this.status = 'completed';
            this.emit('status', this.status);
            return result;
        } catch (error) {
            this.status = 'failed';
            this.error = error instanceof Error ? error.message : String(error);
            this.emit('status', this.status);
            this.emit('error', this.error);
            throw error;
        }
    }

    /**
     * 执行工作流步骤
     */
    private async executeSteps(): Promise<WorkflowContext> {
        try {
            for (let i = 0; i < this.config.steps.length; i++) {
                this.currentStep = i;
                const step = this.config.steps[i];
                this.emit('step', { index: i, step });

                // 获取智能体
                const agent = this.agents[step.agent];
                if (!agent) {
                    throw new Error(`找不到智能体: ${step.agent}`);
                }

                // 生成输入
                let input: string;
                if (typeof step.input === 'function') {
                    input = step.input(this.context);
                } else {
                    input = step.input;
                }

                // 执行步骤
                const result = await agent.generate(input);
                this.context[step.output] = result.text;

                // 发出步骤完成事件
                this.emit('stepComplete', { index: i, result: result.text });
            }

            return this.context;
        } catch (error) {
            throw new Error(`工作流执行失败: ${error instanceof Error ? error.message : String(error)}`);
        }
    }

    /**
     * 重置工作流状态
     */
    reset(): void {
        this.status = 'idle';
        this.error = undefined;
        this.currentStep = 0;
        this.context = {};
        this.executionPromise = undefined;
        this.emit('status', this.status);
    }

    /**
     * 将工作流转换为状态图
     * 生成 GraphViz DOT 格式的工作流图
     */
    toGraph(): string {
        const nodes = this.config.steps.map((step, index) =>
            `  node${index} [label="${step.agent}\\n${step.output}"];`
        ).join('\n');

        const edges = this.config.steps.slice(0, -1).map((_, index) =>
            `  node${index} -> node${index + 1};`
        ).join('\n');

        return `digraph Workflow {\n  label="${this.config.name}";\n${nodes}\n${edges}\n}`;
    }

    /**
     * 可视化工作流
     * 返回工作流的文本表示
     */
    visualize(): string {
        const steps = this.config.steps.map((step, index) => {
            const isCurrentStep = index === this.currentStep;
            const status = isCurrentStep && this.status === 'running' ? ' [运行中]' :
                index < this.currentStep ? ' [已完成]' : '';

            return `${isCurrentStep ? '▶ ' : '  '}${index + 1}. ${step.agent} -> ${step.output}${status}`;
        }).join('\n');

        return `工作流: ${this.config.name} (${this.status})\n${steps}`;
    }
}

/**
 * 创建工作流图服务
 */
export function createWorkflowGraph(config: WorkflowConfig, agents: Record<string, Agent>): WorkflowGraph {
    return new WorkflowGraph(config, agents);
} 