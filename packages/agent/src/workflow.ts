import { Agent } from '@mastra/core/agent';
import { WorkflowConfig, WorkflowStep } from './types';

/**
 * 工作流执行结果
 */
interface WorkflowResult {
    [key: string]: any;
}

/**
 * 工作流执行上下文
 */
interface WorkflowContext {
    [key: string]: any;
}

/**
 * 工作流
 * 用于编排多个智能体协同工作
 */
export class Workflow {
    private config: WorkflowConfig;
    private agents: Record<string, Agent>;
    private context: WorkflowContext = {};
    private maxRetries: number = 0;
    private retryDelay: number = 1000;

    /**
     * 创建一个新的工作流
     * @param config 工作流配置
     * @param agents 智能体映射或Bagctor实例
     */
    constructor(config: WorkflowConfig, agents: Record<string, Agent>) {
        this.config = config;
        this.agents = agents;

        // 设置重试配置
        if (config.retry) {
            this.maxRetries = config.retry.maxAttempts;
            this.retryDelay = config.retry.delay;
        }
    }

    /**
     * 执行工作流
     * @returns 工作流执行结果
     */
    async execute(): Promise<WorkflowResult> {
        console.log(`开始执行工作流: ${this.config.name}`);
        const context: WorkflowContext = {};

        // 按顺序执行每个步骤
        for (let i = 0; i < this.config.steps.length; i++) {
            const step = this.config.steps[i];
            console.log(`执行步骤 ${i + 1}/${this.config.steps.length}: ${step.agent}`);

            // 获取智能体
            const agent = this.agents[step.agent];
            if (!agent) {
                throw new Error(`找不到智能体: ${step.agent}`);
            }

            // 生成输入
            let input: string;
            if (typeof step.input === 'function') {
                input = step.input(context);
            } else {
                input = step.input;
            }

            // 执行步骤，带重试
            let result = null;
            let attempts = 0;
            let success = false;

            while (!success && attempts <= this.maxRetries) {
                attempts++;
                try {
                    // 执行智能体
                    result = await agent.generate(input);
                    success = true;
                } catch (error) {
                    console.error(`步骤 ${i + 1} 执行失败 (尝试 ${attempts}/${this.maxRetries + 1}):`, error);

                    if (attempts <= this.maxRetries) {
                        console.log(`等待 ${this.retryDelay}ms 后重试...`);
                        await new Promise(resolve => setTimeout(resolve, this.retryDelay));
                    } else {
                        throw new Error(`步骤 ${i + 1} 执行失败: ${error instanceof Error ? error.message : String(error)}`);
                    }
                }
            }

            // 更新上下文
            if (result) {
                context[step.output] = result.text;
            }
        }

        console.log(`工作流 ${this.config.name} 执行完成`);
        return context;
    }

    /**
     * 将对象转换为 JSON 字符串
     */
    toJSON(): string {
        return JSON.stringify({
            name: this.config.name,
            steps: this.config.steps.map(step => ({
                agent: step.agent,
                input: typeof step.input === 'function' ? '<函数>' : step.input,
                output: step.output
            }))
        }, null, 2);
    }

    /**
     * Get the workflow's name
     */
    get name(): string {
        return this.config.name;
    }

    /**
     * Get the workflow's steps
     */
    get steps(): WorkflowStep[] {
        return [...this.config.steps];
    }
} 