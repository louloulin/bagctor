import { Agent } from '@mastra/core/agent';
import { WorkflowConfig, WorkflowStep } from './types';

/**
 * 工作流执行器
 * 负责编排和执行多个智能体的工作流
 */
export class Workflow {
    private config: WorkflowConfig;
    private agents: Record<string, Agent>;

    constructor(config: WorkflowConfig, agents: Record<string, Agent>) {
        this.config = config;
        this.agents = agents;
    }

    /**
     * 执行工作流
     * @param context 执行上下文
     * @returns 执行结果
     */
    async execute(context: any = {}): Promise<any> {
        const results = {};

        for (const step of this.config.steps) {
            try {
                // 准备输入
                const input = typeof step.input === 'function'
                    ? step.input(context)
                    : step.input;

                // 执行步骤
                const agent = this.agents[step.agent];
                if (!agent) {
                    throw new Error(`Agent ${step.agent} not found`);
                }

                const result = await agent.generate(input);

                // 存储结果
                if (step.output) {
                    results[step.output] = result.text;
                    context[step.output] = result.text;
                }
            } catch (error) {
                // 如果有重试配置，尝试重试
                if (step.retryConfig || this.config.retry) {
                    const retryResult = await this.retryStep(step, context, error);
                    if (step.output) {
                        results[step.output] = retryResult.text;
                        context[step.output] = retryResult.text;
                    }
                } else {
                    throw new Error(`Step ${step.agent} failed: ${error.message}`);
                }
            }
        }

        return results;
    }

    /**
     * 重试执行步骤
     */
    private async retryStep(step: WorkflowStep, context: any, originalError: Error) {
        const retryConfig = step.retryConfig || this.config.retry;
        if (!retryConfig) {
            throw originalError;
        }

        let lastError = originalError;
        let attempts = 1;

        while (attempts < retryConfig.maxAttempts) {
            try {
                // 等待指定延迟
                await new Promise(resolve => setTimeout(resolve, retryConfig.delay));

                // 重试执行
                const input = typeof step.input === 'function'
                    ? step.input(context)
                    : step.input;

                const agent = this.agents[step.agent];
                return await agent.generate(input);
            } catch (error) {
                lastError = error;
                attempts++;
            }
        }

        throw new Error(
            `Step ${step.agent} failed after ${attempts} attempts: ${lastError.message}`
        );
    }

    /**
     * 将对象转换为 JSON 字符串
     */
    toJSON(): string {
        return JSON.stringify({
            name: this.config.name,
            steps: this.config.steps.map(step => ({
                agent: step.agent,
                input: typeof step.input === 'function' ? 'function' : step.input,
                output: step.output,
                retryConfig: step.retryConfig
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