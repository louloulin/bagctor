import { describe, test, expect } from 'bun:test';
import { Agent } from '@mastra/core/agent';
import { GenerateTextResult, ToolsInput, Metric } from '@mastra/core/types';
import { Workflow, WorkflowConfig } from '../workflow';
import { z } from 'zod';

class MockAgent extends Agent<ToolsInput, Record<string, Metric>> {
    private shouldFail: boolean;

    constructor(name: string, shouldFail: boolean = false) {
        super({
            name,
            instructions: `Mock agent ${name}`,
            model: {
                name: 'mock',
                provider: 'mock',
                temperature: 0.7,
                maxTokens: 1000,
                generate: async (prompt: string) => {
                    if (shouldFail) {
                        throw new Error('Step execution failed');
                    }
                    return {
                        text: JSON.stringify({ result: `${name} processed: ${prompt}` }),
                        usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 }
                    };
                }
            },
            tools: {}
        });
        this.shouldFail = shouldFail;
    }

    async generate(prompt: string): Promise<GenerateTextResult> {
        if (this.shouldFail) {
            throw new Error('Step execution failed');
        }
        return {
            text: JSON.stringify({ result: `${this.name} processed: ${prompt}` }),
            usage: { total_tokens: 0 },
            reasoning: '',
            reasoningDetails: [],
            sources: [],
            experimental_output: null,
            raw: null,
            metrics: {},
            metadata: {},
            tools: [],
            toolCalls: [],
            toolResults: [],
            context: {},
            finishReason: 'stop',
            warnings: [],
            steps: [],
            request: { messages: [{ role: 'user', content: prompt }] },
            response: { text: JSON.stringify({ result: `${this.name} processed: ${prompt}` }) },
            model: 'mock',
            temperature: 0.7,
            maxTokens: 1000
        };
    }
}

describe('Multi-Agent Workflow Tests', () => {
    test('should execute workflow with multiple agents in sequence', async () => {
        const agents = new Map([
            ['agent1', new MockAgent('Agent1')],
            ['agent2', new MockAgent('Agent2')]
        ]);

        const config: WorkflowConfig = {
            name: 'test-workflow',
            triggerSchema: z.object({ input: z.string() }),
            steps: [
                {
                    id: 'step1',
                    agent: 'agent1',
                    prompt: 'Process {trigger.input}',
                    outputSchema: z.object({ result: z.string() })
                },
                {
                    id: 'step2',
                    agent: 'agent2',
                    prompt: 'Process {step1.result}',
                    outputSchema: z.object({ result: z.string() })
                }
            ]
        };

        const workflow = new Workflow(config, agents);
        const result = await workflow.execute({ input: 'test data' });

        expect(result.trigger.input).toBe('test data');
        expect(result.steps.step1.result).toContain('Agent1 processed');
        expect(result.steps.step2.result).toContain('Agent2 processed');
    });

    test('should execute workflow with parallel steps', async () => {
        const agents = new Map([
            ['agent1', new MockAgent('Agent1')],
            ['agent2', new MockAgent('Agent2')]
        ]);

        const config: WorkflowConfig = {
            name: 'parallel-workflow',
            triggerSchema: z.object({ input: z.string() }),
            steps: [
                {
                    id: 'step1',
                    agent: 'agent1',
                    prompt: 'Process {trigger.input} in parallel 1',
                    outputSchema: z.object({ result: z.string() })
                },
                {
                    id: 'step2',
                    agent: 'agent2',
                    prompt: 'Process {trigger.input} in parallel 2',
                    outputSchema: z.object({ result: z.string() })
                }
            ],
            parallel: ['step1', 'step2']
        };

        const workflow = new Workflow(config, agents);
        const result = await workflow.execute({ input: 'parallel test' });

        expect(result.trigger.input).toBe('parallel test');
        expect(result.steps.step1.result).toContain('Agent1 processed');
        expect(result.steps.step2.result).toContain('Agent2 processed');
    });

    test('should handle step failures gracefully', async () => {
        const agents = new Map([
            ['agent1', new MockAgent('Agent1')],
            ['failingAgent', new MockAgent('FailingAgent', true)]
        ]);

        const config: WorkflowConfig = {
            name: 'failure-workflow',
            triggerSchema: z.object({ input: z.string() }),
            steps: [
                {
                    id: 'step1',
                    agent: 'agent1',
                    prompt: 'Process {trigger.input}',
                    outputSchema: z.object({ result: z.string() })
                },
                {
                    id: 'step2',
                    agent: 'failingAgent',
                    prompt: 'This step will fail',
                    outputSchema: z.object({ result: z.string() }),
                    retry: {
                        maxAttempts: 2,
                        backoff: 'linear'
                    }
                }
            ]
        };

        const workflow = new Workflow(config, agents);

        // We expect the workflow execution to throw an error because of the failing step
        await expect(async () => {
            await workflow.execute({ input: 'fail test' });
        }).toThrow('Step execution failed');
    });

    test('should maintain workflow state between steps', async () => {
        const agents = new Map([
            ['agent1', new MockAgent('Agent1')],
            ['agent2', new MockAgent('Agent2')]
        ]);

        const config: WorkflowConfig = {
            name: 'state-workflow',
            triggerSchema: z.object({ input: z.string() }),
            steps: [
                {
                    id: 'step1',
                    agent: 'agent1',
                    prompt: 'Process {trigger.input}',
                    outputSchema: z.object({ result: z.string() })
                },
                {
                    id: 'step2',
                    agent: 'agent2',
                    prompt: 'Process result from step1: {step1.result}',
                    outputSchema: z.object({ result: z.string() })
                }
            ]
        };

        const workflow = new Workflow(config, agents);
        const result = await workflow.execute({ input: 'state test' });

        expect(result.trigger.input).toBe('state test');
        expect(result.steps.step1.result).toContain('Agent1 processed');
        expect(result.steps.step2.result).toContain('step1.result');
    });
}); 