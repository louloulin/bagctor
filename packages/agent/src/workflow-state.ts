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
     * 获取工作流名称
     */
    get name(): string {
        return this.config.name;
    }

    /**
     * 获取工作流步骤
     */
    get steps(): WorkflowStep[] {
        return [...this.config.steps];
    }

    /**
     * 获取当前状态
     */
    getState(): {
        currentStep: number;
        status: WorkflowStatus;
        context: WorkflowContext;
        error?: string;
    } {
        return {
            currentStep: this.currentStep,
            status: this.status,
            context: { ...this.context },
            error: this.error
        };
    }

    /**
     * 执行工作流
     * @returns 工作流结果
     */
    async execute(): Promise<WorkflowContext> {
        if (this.status === 'running') {
            throw new Error('工作流已在运行中');
        }

        // 重置状态
        this.reset();
        this.status = 'running';
        this.emit('status', this.status);

        // 创建执行 Promise
        this.executionPromise = this.executeSteps();
        return this.executionPromise;
    }

    /**
     * 执行工作流步骤
     * @private
     */
    private async executeSteps(): Promise<WorkflowContext> {
        try {
            // 从第一步开始执行
            this.currentStep = 0;

            // 执行每一步，直到完成
            while (this.currentStep < this.config.steps.length) {
                const step = this.config.steps[this.currentStep];
                this.emit('step', this.currentStep, step);

                // 获取智能体
                const agent = this.agents[step.agent];

                // 生成输入
                let input: string;
                if (typeof step.input === 'function') {
                    input = step.input(this.context);
                } else {
                    input = step.input;

                    // 替换输入字符串中的占位符
                    if (input.includes('${')) {
                        Object.entries(this.context).forEach(([key, value]) => {
                            input = input.replace(`\${${key}}`, String(value));
                        });
                    }
                }

                // 执行智能体
                try {
                    // 实现重试逻辑
                    let maxRetries = this.config.retry?.maxAttempts || 0;
                    let retryDelay = this.config.retry?.delay || 1000;
                    let attempt = 0;
                    let success = false;
                    let result;

                    while (!success && attempt <= maxRetries) {
                        attempt++;
                        try {
                            result = await agent.generate(input);
                            success = true;
                        } catch (error) {
                            if (attempt <= maxRetries) {
                                console.warn(`步骤 ${this.currentStep + 1} 执行失败，正在重试 (${attempt}/${maxRetries + 1})...`);
                                // 等待重试
                                await new Promise(resolve => setTimeout(resolve, retryDelay));
                            } else {
                                throw error;
                            }
                        }
                    }

                    // 更新上下文
                    if (result && step.output) {
                        this.context[step.output] = result.text;
                        this.emit('output', step.output, result.text);
                    }

                    // 前进到下一步
                    this.currentStep++;
                } catch (error) {
                    this.status = 'failed';
                    this.error = error instanceof Error ? error.message : String(error);
                    this.emit('error', this.error);
                    throw new Error(`步骤 ${this.currentStep + 1} 执行失败: ${this.error}`);
                }
            }

            // 工作流完成
            this.status = 'completed';
            this.emit('status', this.status);
            this.emit('completed', this.context);
            return { ...this.context };
        } catch (error) {
            this.status = 'failed';
            this.error = error instanceof Error ? error.message : String(error);
            this.emit('status', this.status);
            this.emit('error', this.error);
            throw error;
        }
    }

    /**
     * 等待工作流完成
     * @returns 工作流结果
     */
    async waitForCompletion(): Promise<WorkflowContext> {
        if (!this.executionPromise) {
            throw new Error('工作流尚未启动');
        }
        return this.executionPromise;
    }

    /**
     * 重置工作流
     */
    reset(): void {
        this.context = {};
        this.currentStep = 0;
        this.status = 'idle';
        this.error = undefined;
        this.executionPromise = undefined;
        this.emit('status', this.status);
        this.emit('reset');
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
 * 创建工作流图
 * @param config 工作流配置
 * @param agents 智能体映射
 * @returns 工作流图
 */
export function createWorkflowGraph(config: WorkflowConfig, agents: Record<string, Agent>): WorkflowGraph {
    return new WorkflowGraph(config, agents);
} 