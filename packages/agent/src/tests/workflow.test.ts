import { describe, test, expect } from 'bun:test';
import { Workflow } from '../workflow';
import { WorkflowConfig } from '../types';

describe('Workflow Tests', () => {
    test('should execute workflow steps in sequence', async () => {
        const mockAgent1 = {
            generate: async (input: string) => ({
                text: `Agent1 processed: ${input}`
            })
        };

        const mockAgent2 = {
            generate: async (input: string) => ({
                text: `Agent2 processed: ${input}`
            })
        };

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

        const workflow = new Workflow(config, { agent1: mockAgent1, agent2: mockAgent2 });
        const result = await workflow.execute();

        expect(result.step1).toBe('Agent1 processed: Process test data');
        expect(result.step2).toBe('Agent2 processed: Process Agent1 processed: Process test data');
    });

    test('should handle step failures and retry', async () => {
        let attempts = 0;
        const mockFailingAgent = {
            generate: async () => {
                attempts++;
                if (attempts < 2) {
                    throw new Error('Step execution failed');
                }
                return { text: 'Success after retry' };
            }
        };

        const config: WorkflowConfig = {
            name: 'retry-workflow',
            steps: [
                {
                    agent: 'failing',
                    input: 'Test input',
                    output: 'result',
                    retryConfig: {
                        maxAttempts: 3,
                        delay: 100
                    }
                }
            ]
        };

        const workflow = new Workflow(config, { failing: mockFailingAgent });
        const result = await workflow.execute();

        expect(attempts).toBe(2);
        expect(result.result).toBe('Success after retry');
    });

    test('should throw error after max retries', async () => {
        const mockFailingAgent = {
            generate: async () => {
                throw new Error('Step execution failed');
            }
        };

        const config: WorkflowConfig = {
            name: 'max-retry-workflow',
            steps: [
                {
                    agent: 'failing',
                    input: 'Test input',
                    output: 'result',
                    retryConfig: {
                        maxAttempts: 2,
                        delay: 100
                    }
                }
            ]
        };

        const workflow = new Workflow(config, { failing: mockFailingAgent });
        await expect(workflow.execute()).rejects.toThrow('Step execution failed');
    });
}); 