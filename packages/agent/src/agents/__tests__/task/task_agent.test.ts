import { expect, test, mock, describe, beforeAll, afterAll, beforeEach } from 'bun:test';
import { ActorSystem, ActorContext, Message } from '@bactor/core';
import { TaskAgent, TaskAgentConfig } from '../../task_agent';
import { AgentMessage } from '../../../interfaces';
import { Action } from '../../../interfaces/action_types';

interface Task {
    id: string;
    type: string;
    input: any;
    priority?: 'high' | 'normal' | 'low';
    deadline?: number;
    dependencies?: string[];
}

// Test class to expose protected methods
class TestTaskAgent extends TaskAgent {
    public async testProcessTask(task: Task): Promise<any> {
        return super.processTask(task);
    }

    public async getTaskStatus(taskId: string) {
        return super.getTaskStatus(taskId);
    }
}

describe('Task Agent', () => {
    let system: ActorSystem;
    let agentPID: any;
    let agent: TestTaskAgent;
    let mockConfig: TaskAgentConfig;

    beforeAll(async () => {
        system = new ActorSystem();
        await system.start();
    });

    afterAll(async () => {
        await system.stop();
    });

    beforeEach(async () => {
        mockConfig = {
            name: 'test-task-agent',
            role: 'task-processor',
            capabilities: ['data-analysis', 'text-processing', 'decision-making'],
            maxConcurrentTasks: 5,
            taskTimeout: 5000
        };

        agentPID = await system.spawn({
            producer: (context: ActorContext) => {
                agent = new TestTaskAgent(context, mockConfig);
                return agent;
            }
        });
    });

    describe('Task Execution', () => {
        test('should execute tasks and track progress', async () => {
            const task: Task = {
                id: 'task-1',
                type: 'data-analysis',
                input: {
                    data: [1, 2, 3, 4, 5],
                    operation: 'statistics'
                }
            };

            const response = await agent.testProcessTask(task);
            expect(response).toBeDefined();
            expect(response.output).toBeDefined();
            expect(response.confidence).toBeGreaterThan(0);

            const status = await agent.getTaskStatus(task.id);
            expect(status).toBeDefined();
            expect(status?.status).toBe('success');
        });

        test('should handle task dependencies', async () => {
            const dependentTask: Task = {
                id: 'task-2',
                type: 'data-analysis',
                input: {
                    data: [6, 7, 8, 9, 10],
                    operation: 'clustering'
                },
                dependencies: ['task-1']
            };

            try {
                await agent.testProcessTask(dependentTask);
                throw new Error('Should have thrown an error');
            } catch (error: any) {
                expect(error).toBeDefined();
                expect(error.message).toContain('Dependency task');
            }
        });
    });

    describe('Error Handling', () => {
        test('should handle task failures', async () => {
            const invalidTask: Task = {
                id: 'task-3',
                type: 'data-analysis',
                input: {
                    data: [1, 2, 3],
                    operation: 'invalid-operation'
                }
            };

            try {
                await agent.testProcessTask(invalidTask);
                throw new Error('Should have thrown an error');
            } catch (error: any) {
                expect(error).toBeDefined();
                expect(error.message).toContain('Unsupported operation');
            }
        });

        test('should handle unsupported task types', async () => {
            const unsupportedTask: Task = {
                id: 'task-4',
                type: 'unsupported-type',
                input: {}
            };

            try {
                await agent.testProcessTask(unsupportedTask);
                throw new Error('Should have thrown an error');
            } catch (error: any) {
                expect(error).toBeDefined();
                expect(error.message).toContain('not supported by this agent');
            }
        });
    });
}); 