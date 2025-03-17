import { Agent } from '@mastra/core/agent';
import { z } from 'zod';

export interface WorkflowStep {
    id: string;
    agent: string;
    prompt: string;
    outputSchema: z.ZodType<any>;
    retry?: {
        maxAttempts: number;
        backoff: 'linear' | 'exponential';
    };
}

export interface WorkflowConfig {
    name: string;
    triggerSchema: z.ZodType<any>;
    steps: WorkflowStep[];
    parallel?: string[];
    retry?: {
        maxAttempts: number;
        backoff: 'linear' | 'exponential';
    };
}

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
    private agentsMap: Map<string, Agent>;
    private state: Map<string, any> = new Map();

    /**
     * 创建一个新的工作流
     * @param config 工作流配置
     * @param agentsMap 智能体映射
     */
    constructor(config: WorkflowConfig, agentsMap: Map<string, Agent>) {
        this.config = config;
        this.agentsMap = agentsMap;
    }

    /**
     * 执行工作流
     * @param triggerData 触发数据
     * @returns 工作流执行结果
     */
    async execute(triggerData: any): Promise<any> {
        // Validate trigger data
        const validatedTrigger = this.config.triggerSchema.parse(triggerData);

        // Initialize state with trigger data
        this.state.set('trigger', validatedTrigger);

        // Execute steps
        const results: Record<string, any> = {};

        // Handle parallel steps
        if (this.config.parallel && this.config.parallel.length > 0) {
            const parallelSteps = this.config.steps.filter(step =>
                this.config.parallel!.includes(step.id)
            );

            const parallelResults = await Promise.all(
                parallelSteps.map(step => this.executeStep(step))
            );

            parallelSteps.forEach((step, index) => {
                results[step.id] = parallelResults[index];
            });
        }

        // Execute sequential steps
        for (const step of this.config.steps) {
            if (!this.config.parallel?.includes(step.id)) {
                results[step.id] = await this.executeStep(step);
            }
        }

        return {
            trigger: validatedTrigger,
            steps: results
        };
    }

    private async executeStep(step: WorkflowStep): Promise<any> {
        const agent = this.agentsMap.get(step.agent);
        if (!agent) {
            throw new Error(`Agent ${step.agent} not found`);
        }

        // Replace placeholders in prompt with state values
        const prompt = this.replacePlaceholders(step.prompt);

        // Execute step with retry logic if configured
        if (step.retry || this.config.retry) {
            return this.executeWithRetry(step, prompt, agent);
        }

        // Execute step without retry
        const result = await agent.generate(prompt);
        const parsedResult = JSON.parse(result.text);
        const validatedResult = step.outputSchema.parse(parsedResult);
        this.state.set(step.id, validatedResult);
        return validatedResult;
    }

    private async executeWithRetry(
        step: WorkflowStep,
        prompt: string,
        agent: Agent
    ): Promise<any> {
        const retryConfig = step.retry || this.config.retry;
        if (!retryConfig) {
            throw new Error('Retry configuration not found');
        }

        let lastError: Error | undefined;
        let delay = 1000; // Initial delay in milliseconds

        for (let attempt = 1; attempt <= retryConfig.maxAttempts; attempt++) {
            try {
                const result = await agent.generate(prompt);
                const parsedResult = JSON.parse(result.text);
                const validatedResult = step.outputSchema.parse(parsedResult);
                this.state.set(step.id, validatedResult);
                return validatedResult;
            } catch (error) {
                lastError = error as Error;
                if (attempt === retryConfig.maxAttempts) {
                    break;
                }

                // Wait before retrying
                await new Promise(resolve => setTimeout(resolve, delay));

                // Update delay based on backoff strategy
                if (retryConfig.backoff === 'exponential') {
                    delay *= 2;
                }
            }
        }

        throw lastError;
    }

    private replacePlaceholders(prompt: string): string {
        return prompt.replace(/\{([^}]+)\}/g, (match, key) => {
            const value = this.state.get(key);
            return value !== undefined ? value : match;
        });
    }

    /**
     * 将对象转换为 JSON 字符串
     */
    toJSON(): string {
        return JSON.stringify({
            name: this.config.name,
            steps: this.config.steps.map(step => ({
                id: step.id,
                agent: step.agent,
                prompt: step.prompt,
                outputSchema: step.outputSchema.toString(),
                retry: step.retry
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