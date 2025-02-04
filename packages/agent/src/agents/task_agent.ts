import { log, Message } from '@bactor/core';
import { AgentActor, AgentConfig } from '../core/agent';
import { SystemMessageTypes } from '../core/message_bus';

export interface TaskAgentConfig extends AgentConfig {
    capabilities: string[];
    maxConcurrentTasks?: number;
    taskTimeout?: number;
}

interface TaskResult {
    taskId: string;
    status: 'success' | 'failure' | 'partial';
    output: any;
    error?: string;
    metrics?: {
        startTime: number;
        endTime: number;
        steps: number;
    };
}

interface Task {
    id: string;
    type: string;
    input: any;
    priority?: 'high' | 'normal' | 'low';
    deadline?: number;
    dependencies?: string[];
}

export class TaskAgent extends AgentActor {
    private taskConfig: TaskAgentConfig;
    private activeTasks: Map<string, Task>;
    private taskResults: Map<string, TaskResult>;

    constructor(context: any, config: TaskAgentConfig) {
        super(context, {
            ...config,
            role: 'task-processor'
        });
        this.taskConfig = config;
        this.activeTasks = new Map();
        this.taskResults = new Map();
    }

    async receive(message: Message): Promise<void> {
        log.info(`[${this.taskConfig.name}] Received message of type: ${message.type}`);

        if (message.type === SystemMessageTypes.TASK_ASSIGNED) {
            try {
                const task = message.payload;
                log.info(`[${this.taskConfig.name}] Starting task ${task.id} (${task.type})`);
                log.info(`[${this.taskConfig.name}] Task input: ${JSON.stringify(task.input, null, 2)}`);

                const result = await this.processTask(task);
                log.info(`[${this.taskConfig.name}] Task ${task.id} completed`);
                log.info(`[${this.taskConfig.name}] Task result: ${JSON.stringify(result.output, null, 2)}`);
                log.info(`[${this.taskConfig.name}] Task confidence: ${result.confidence}`);

                if (message.sender) {
                    await this.context.send(message.sender, {
                        type: SystemMessageTypes.TASK_COMPLETED,
                        payload: {
                            taskId: task.id,
                            result
                        }
                    });
                }
            } catch (error) {
                log.error(`[${this.taskConfig.name}] Task processing failed:`, error);
                if (message.sender) {
                    await this.context.send(message.sender, {
                        type: SystemMessageTypes.TASK_FAILED,
                        payload: {
                            taskId: message.payload.id,
                            error: error instanceof Error ? error.message : 'Unknown error'
                        }
                    });
                }
            }
        } else {
            await super.receive(message);
        }
    }

    protected async processTask(task: Task): Promise<{ output: any; confidence: number }> {
        try {
            // Check if we can handle this task type
            if (!this.taskConfig.capabilities.includes(task.type)) {
                throw new Error(`Task type '${task.type}' not supported by this agent`);
            }

            // Check task dependencies
            if (task.dependencies?.length) {
                for (const depId of task.dependencies) {
                    const depResult = this.taskResults.get(depId);
                    if (!depResult || depResult.status === 'failure') {
                        throw new Error(`Dependency task ${depId} not completed successfully`);
                    }
                }
            }

            // Check concurrent task limit
            if (this.taskConfig.maxConcurrentTasks &&
                this.activeTasks.size >= this.taskConfig.maxConcurrentTasks) {
                throw new Error('Maximum concurrent task limit reached');
            }

            // Start task execution
            const startTime = Date.now();
            this.activeTasks.set(task.id, task);

            log.info(`[${this.taskConfig.name}] Starting task ${task.id} of type ${task.type}`);

            // Store task context in short-term memory
            await this.remember(`task:${task.id}:context`, {
                startTime,
                type: task.type,
                input: task.input
            });

            // Process task based on type
            let result: any;
            let confidence = 1.0;
            let steps = 0;

            switch (task.type) {
                case 'data-analysis':
                    result = await this.processDataAnalysis(task);
                    steps = result.steps;
                    confidence = result.confidence;
                    break;

                case 'text-processing':
                    result = await this.processTextTask(task);
                    steps = result.steps;
                    confidence = result.confidence;
                    break;

                case 'decision-making':
                    result = await this.processDecisionTask(task);
                    steps = result.steps;
                    confidence = result.confidence;
                    break;

                default:
                    throw new Error(`Unsupported task type: ${task.type}`);
            }

            const endTime = Date.now();

            // Store task result
            const taskResult: TaskResult = {
                taskId: task.id,
                status: 'success',
                output: result.output,
                metrics: {
                    startTime,
                    endTime,
                    steps
                }
            };

            this.taskResults.set(task.id, taskResult);
            this.activeTasks.delete(task.id);

            // Store result in long-term memory if confidence is high
            if (confidence > 0.8) {
                await this.remember(`task:${task.id}:result`, taskResult, true);
            }

            log.info(`[${this.taskConfig.name}] Completed task ${task.id} successfully`);

            return {
                output: result.output,
                confidence
            };

        } catch (error) {
            const taskResult: TaskResult = {
                taskId: task.id,
                status: 'failure',
                output: null,
                error: error instanceof Error ? error.message : 'Unknown error'
            };

            this.taskResults.set(task.id, taskResult);
            this.activeTasks.delete(task.id);

            throw error;
        }
    }

    private async processDataAnalysis(task: Task): Promise<{ output: any; confidence: number; steps: number }> {
        const { data, operation } = task.input;
        let output: any;
        let confidence = 0.95;
        let steps = 1;

        switch (operation) {
            case 'statistics':
                steps = 4;
                const sum = data.reduce((a: number, b: number) => a + b, 0);
                const mean = sum / data.length;
                const sortedData = [...data].sort((a, b) => a - b);
                const median = data.length % 2 === 0
                    ? (sortedData[data.length / 2 - 1] + sortedData[data.length / 2]) / 2
                    : sortedData[Math.floor(data.length / 2)];

                output = {
                    sum,
                    mean,
                    median,
                    min: Math.min(...data),
                    max: Math.max(...data),
                    count: data.length
                };
                break;

            case 'clustering':
                steps = 3;
                // Simple clustering based on value ranges
                const clusters: { [key: string]: number[] } = {
                    low: [],
                    medium: [],
                    high: []
                };

                const min = Math.min(...data);
                const max = Math.max(...data);
                const range = max - min;

                data.forEach((value: number) => {
                    const normalized = (value - min) / range;
                    if (normalized < 0.33) {
                        clusters.low.push(value);
                    } else if (normalized < 0.66) {
                        clusters.medium.push(value);
                    } else {
                        clusters.high.push(value);
                    }
                });

                output = clusters;
                break;

            default:
                throw new Error(`Unsupported operation: ${operation}`);
        }

        return { output, confidence, steps };
    }

    private async processTextTask(task: Task): Promise<{ output: any; confidence: number; steps: number }> {
        const { text, operation } = task.input;
        let output: any;
        let confidence = 0.85;
        let steps = 1;

        switch (operation) {
            case 'sentiment-analysis':
                steps = 3;
                // Simple sentiment analysis based on keyword matching
                const positiveWords = ['good', 'great', 'awesome', 'excellent', 'happy', 'love'];
                const negativeWords = ['bad', 'poor', 'terrible', 'awful', 'sad', 'hate'];

                const tokens = text.toLowerCase().split(/\W+/);
                let score = 0;

                tokens.forEach((token: string) => {
                    if (positiveWords.includes(token)) score += 1;
                    if (negativeWords.includes(token)) score -= 1;
                });

                output = {
                    score,
                    sentiment: score > 0 ? 'positive' : score < 0 ? 'negative' : 'neutral',
                    confidence: Math.min(0.9, 0.5 + Math.abs(score) * 0.1)
                };
                confidence = output.confidence;
                break;

            case 'summarization':
                steps = 2;
                // Simple summarization by selecting first few words
                const textWords = text.split(/\s+/);
                const summary = textWords.slice(0, 10).join(' ') + (textWords.length > 10 ? '...' : '');

                output = {
                    summary,
                    originalLength: text.length,
                    summaryLength: summary.length
                };
                break;

            default:
                throw new Error(`Unsupported operation: ${operation}`);
        }

        return { output, confidence, steps };
    }

    private async processDecisionTask(task: Task): Promise<{ output: any; confidence: number; steps: number }> {
        const { options, criteria } = task.input;
        let output: any;
        let confidence = 0.8;
        let steps = 1;

        if (!Array.isArray(options) || !Array.isArray(criteria)) {
            throw new Error('Invalid input: options and criteria must be arrays');
        }

        steps = 4;
        // Simple decision making using weighted random selection
        const scores = options.map(option => ({
            option,
            score: Math.random() * criteria.length // Each criterion adds a random weight
        }));

        // Sort by score
        scores.sort((a, b) => b.score - a.score);

        // Calculate confidence based on score difference
        const scoreDiff = scores[0].score - (scores[1]?.score ?? 0);
        confidence = Math.min(0.95, 0.7 + scoreDiff * 0.5);

        output = {
            selectedOption: scores[0].option,
            confidence,
            rankings: scores.map(s => ({
                option: s.option,
                score: s.score
            }))
        };

        return { output, confidence, steps };
    }

    // Task management methods
    async getTaskStatus(taskId: string): Promise<TaskResult | null> {
        return this.taskResults.get(taskId) || null;
    }

    async cancelTask(taskId: string): Promise<void> {
        const task = this.activeTasks.get(taskId);
        if (task) {
            const taskResult: TaskResult = {
                taskId,
                status: 'failure',
                output: null,
                error: 'Task cancelled by user'
            };
            this.taskResults.set(taskId, taskResult);
            this.activeTasks.delete(taskId);
            log.info(`[${this.taskConfig.name}] Cancelled task ${taskId}`);
        }
    }

    getActiveTaskCount(): number {
        return this.activeTasks.size;
    }

    async cleanup(): Promise<void> {
        // Clean up old task results
        const now = Date.now();
        const maxAge = 24 * 60 * 60 * 1000; // 24 hours

        for (const [taskId, result] of this.taskResults.entries()) {
            if (result.metrics && (now - result.metrics.endTime > maxAge)) {
                this.taskResults.delete(taskId);
            }
        }
    }
} 