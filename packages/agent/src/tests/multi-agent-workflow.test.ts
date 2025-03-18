import { describe, test, expect } from 'bun:test';
import { Agent } from '@mastra/core/agent';
import { Workflow } from '../workflow';
import { WorkflowConfig } from '../types';

class MockAgent extends Agent {
    private shouldFail: boolean;

    constructor(name: string, shouldFail: boolean = false) {
        super({
            name,
            instructions: `Mock agent ${name}`,
            model: {
                provider: 'mock',
                generate: async (prompt: string) => {
                    if (shouldFail) {
                        throw new Error('Step execution failed');
                    }
                    return {
                        text: `${name} processed: ${prompt}`,
                        usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 },
                        logprobs: null,
                        providerMetadata: {},
                        experimental_providerMetadata: {}
                    };
                }
            },
            tools: {}
        });
        this.shouldFail = shouldFail;
    }

    async generate(prompt: string) {
        if (this.shouldFail) {
            throw new Error('Step execution failed');
        }
        return {
            text: `${this.name} processed: ${prompt}`,
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
            response: { text: `${this.name} processed: ${prompt}` },
            model: 'mock',
            logprobs: null,
            providerMetadata: {},
            experimental_providerMetadata: {}
        };
    }
}

describe('Multi-Agent Workflow Tests', () => {
    test('should execute workflow with multiple agents in sequence', async () => {
        const agent1 = new MockAgent('Agent1');
        const agent2 = new MockAgent('Agent2');
        const agents = { agent1, agent2 };

        const config: WorkflowConfig = {
            name: 'test-workflow',
            steps: [
                {
                    agent: 'agent1',
                    input: 'Process test data',
                    output: 'step1'
                },
                {
                    agent: 'agent2',
                    input: (context) => `Process ${context.step1}`,
                    output: 'step2'
                }
            ]
        };

        const workflow = new Workflow(config, agents);
        const result = await workflow.execute();

        expect(result.step1).toContain('Agent1 processed');
        expect(result.step2).toContain('Agent2 processed');
    });

    test('should execute workflow with parallel steps', async () => {
        const agent1 = new MockAgent('Agent1');
        const agent2 = new MockAgent('Agent2');
        const agents = { agent1, agent2 };

        const config: WorkflowConfig = {
            name: 'parallel-workflow',
            steps: [
                {
                    agent: 'agent1',
                    input: 'Process in parallel 1',
                    output: 'step1'
                },
                {
                    agent: 'agent2',
                    input: 'Process in parallel 2',
                    output: 'step2'
                }
            ]
        };

        const workflow = new Workflow(config, agents);
        const result = await workflow.execute();

        expect(result.step1).toContain('Agent1 processed');
        expect(result.step2).toContain('Agent2 processed');
    });

    test('should handle step failures gracefully', async () => {
        const agent1 = new MockAgent('Agent1');
        const failingAgent = new MockAgent('FailingAgent', true);
        const agents = { agent1, failingAgent };

        const config: WorkflowConfig = {
            name: 'failure-workflow',
            steps: [
                {
                    agent: 'agent1',
                    input: 'Process test data',
                    output: 'step1'
                },
                {
                    agent: 'failingAgent',
                    input: 'This step will fail',
                    output: 'step2',
                    retryConfig: {
                        maxAttempts: 2,
                        delay: 100
                    }
                }
            ]
        };

        const workflow = new Workflow(config, agents);

        // We expect the workflow execution to throw an error because of the failing step
        await expect(async () => {
            await workflow.execute();
        }).toThrow('Step execution failed');
    });

    test('should maintain workflow state between steps', async () => {
        const agent1 = new MockAgent('Agent1');
        const agent2 = new MockAgent('Agent2');
        const agents = { agent1, agent2 };

        const config: WorkflowConfig = {
            name: 'state-workflow',
            steps: [
                {
                    agent: 'agent1',
                    input: 'Initial input',
                    output: 'step1'
                },
                {
                    agent: 'agent2',
                    input: (context) => `Process result from step1: ${context.step1}`,
                    output: 'step2'
                }
            ]
        };

        const workflow = new Workflow(config, agents);
        const result = await workflow.execute();

        expect(result.step1).toContain('Agent1 processed');
        expect(result.step2).toContain('Agent2 processed');
        expect(result.step2).toContain('step1');
    });
}); 