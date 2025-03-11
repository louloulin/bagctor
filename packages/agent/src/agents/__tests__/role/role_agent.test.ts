import { expect, test, mock, describe, beforeAll, afterAll, beforeEach } from 'bun:test';
import { ActorSystem, ActorContext, Message } from '@bactor/core';
import { RoleAgent } from '../../role_agent';
import { AgentMessage } from '../../../interfaces';
import { AgentConfig } from '../../../types';

// 创建一个测试用的具体角色代理
class TestRoleAgent extends RoleAgent {
    public taskResults: any[] = [];
    public coordinationResults: any[] = [];

    constructor(context: ActorContext, config: AgentConfig) {
        super(context, config);
    }

    protected async processTask(action: any): Promise<any> {
        this.taskResults.push(action);
        return { success: true, action };
    }

    protected async processCoordination(action: string, data: any): Promise<any> {
        this.coordinationResults.push({ action, data });
        return { success: true, action, data };
    }
}

describe('Role Agent', () => {
    let system: ActorSystem;
    let agentPID: any;
    let agent: TestRoleAgent;
    let mockConfig: AgentConfig;

    beforeAll(async () => {
        system = new ActorSystem();
        await system.start();
    });

    afterAll(async () => {
        await system.stop();
    });

    beforeEach(async () => {
        mockConfig = {
            role: 'test_role',
            capabilities: ['test'],
            parameters: {}
        };

        agentPID = await system.spawn({
            producer: (context: ActorContext) => {
                agent = new TestRoleAgent(context, mockConfig);
                return agent;
            }
        });
    });

    describe('Task Handling', () => {
        test('should handle task messages', async () => {
            const taskMessage: AgentMessage = {
                type: 'TASK',
                sender: agentPID,
                timestamp: Date.now(),
                payload: {
                    action: {
                        id: 'test-1',
                        type: 'TEST_ACTION',
                        status: 'PENDING'
                    }
                }
            };

            await system.send(agentPID, taskMessage);
            await new Promise(resolve => setTimeout(resolve, 100));

            expect(agent.taskResults.length).toBe(1);
            expect(agent.taskResults[0].id).toBe('test-1');
        });

        test('should handle task errors gracefully', async () => {
            const errorMessage: AgentMessage = {
                type: 'TASK',
                sender: agentPID,
                timestamp: Date.now(),
                payload: {
                    action: {
                        id: 'error-1',
                        type: 'ERROR_ACTION',
                        status: 'PENDING',
                        error: new Error('Test error')
                    }
                }
            };

            await system.send(agentPID, errorMessage);
            await new Promise(resolve => setTimeout(resolve, 100));

            expect(agent.taskResults.length).toBe(1);
            expect(agent.taskResults[0].error).toBeDefined();
        });
    });

    describe('Coordination', () => {
        test('should handle coordination messages', async () => {
            const coordMessage: AgentMessage = {
                type: 'COORDINATION',
                sender: agentPID,
                timestamp: Date.now(),
                payload: {
                    action: 'COORDINATE',
                    data: {
                        id: 'coord-1',
                        type: 'TEST_COORDINATION'
                    }
                }
            };

            await system.send(agentPID, coordMessage);
            await new Promise(resolve => setTimeout(resolve, 100));

            expect(agent.coordinationResults.length).toBe(1);
            expect(agent.coordinationResults[0].action).toBe('COORDINATE');
        });

        test('should handle concurrent coordination requests', async () => {
            const requests = Array(5).fill(null).map((_, i) => ({
                type: 'COORDINATION',
                sender: agentPID,
                timestamp: Date.now(),
                payload: {
                    action: 'COORDINATE',
                    data: {
                        id: `coord-${i}`,
                        type: 'TEST_COORDINATION'
                    }
                }
            }));

            await Promise.all(requests.map(req => system.send(agentPID, req)));
            await new Promise(resolve => setTimeout(resolve, 500));

            expect(agent.coordinationResults.length).toBe(5);
        });
    });

    describe('State Management', () => {
        test('should maintain agent state', async () => {
            const states = ['INIT', 'PROCESSING', 'COMPLETE'];

            for (const state of states) {
                const message: AgentMessage = {
                    type: 'TASK',
                    sender: agentPID,
                    timestamp: Date.now(),
                    payload: {
                        action: {
                            id: `state-${state}`,
                            type: 'STATE_UPDATE',
                            status: state
                        }
                    }
                };

                await system.send(agentPID, message);
                await new Promise(resolve => setTimeout(resolve, 100));
            }

            expect(agent.taskResults.length).toBe(3);
            expect(agent.taskResults[2].status).toBe('COMPLETE');
        });
    });

    describe('Error Handling', () => {
        test('should handle invalid messages', async () => {
            const invalidMessage = {
                type: 'INVALID',
                sender: agentPID,
                timestamp: Date.now(),
                payload: {}
            };

            await system.send(agentPID, invalidMessage as Message);
            await new Promise(resolve => setTimeout(resolve, 100));

            // Should not process invalid message
            expect(agent.taskResults.length).toBe(0);
            expect(agent.coordinationResults.length).toBe(0);
        });

        test('should handle missing payload', async () => {
            const invalidMessage = {
                type: 'TASK',
                sender: agentPID,
                timestamp: Date.now()
            };

            await system.send(agentPID, invalidMessage as Message);
            await new Promise(resolve => setTimeout(resolve, 100));

            // Should not process message with missing payload
            expect(agent.taskResults.length).toBe(0);
        });
    });
}); 