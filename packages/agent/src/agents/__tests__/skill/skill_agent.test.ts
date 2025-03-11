import { expect, test, mock, describe, beforeAll, afterAll, beforeEach } from 'bun:test';
import { ActorSystem, ActorContext, Message } from '@bactor/core';
import { SkillAgent, SkillAgentConfig } from '../../skill_agent';
import { AgentMessage } from '../../../interfaces';
import { Action } from '../../../interfaces/action_types';

// Test class to expose protected methods
class TestSkillAgent extends SkillAgent {
    public async testProcessTask(action: Action): Promise<any> {
        return super.processTask(action);
    }

    public async testProcessCoordination(action: string, data: any): Promise<any> {
        return super.processCoordination(action, data);
    }
}

describe('Skill Agent', () => {
    let system: ActorSystem;
    let agentPID: any;
    let agent: TestSkillAgent;
    let mockConfig: SkillAgentConfig;

    beforeAll(async () => {
        system = new ActorSystem();
        await system.start();
    });

    afterAll(async () => {
        await system.stop();
    });

    beforeEach(async () => {
        mockConfig = {
            role: 'skill_agent',
            capabilities: ['code_generation', 'code_review', 'testing'],
            parameters: {
                language: 'typescript',
                framework: 'react',
                testFramework: 'jest'
            }
        };

        agentPID = await system.spawn({
            producer: (context: ActorContext) => {
                agent = new TestSkillAgent(context, mockConfig);
                return agent;
            }
        });
    });

    describe('Code Generation', () => {
        test('should generate code based on requirements', async () => {
            const codeGenMessage: AgentMessage = {
                type: 'TASK',
                sender: agentPID,
                timestamp: Date.now(),
                payload: {
                    action: {
                        id: 'gen-1',
                        type: 'IMPLEMENT_FEATURE',
                        status: 'PENDING',
                        context: {
                            role: 'skill_agent',
                            dependencies: [],
                            resources: [],
                            constraints: []
                        },
                        priority: 'high',
                        metadata: {
                            feature: {
                                name: 'UserAuthentication',
                                requirements: [
                                    'Implement user login with email and password',
                                    'Add input validation',
                                    'Handle authentication errors'
                                ],
                                dependencies: ['@auth/core', '@validators/input']
                            }
                        }
                    }
                }
            };

            await system.send(agentPID, codeGenMessage);
            await new Promise(resolve => setTimeout(resolve, 100));

            const response = await agent.testProcessTask(codeGenMessage.payload.action);
            expect(response).toBeDefined();
            expect(response.code).toBeDefined();
            expect(response.tests).toBeDefined();
            expect(response.documentation).toBeDefined();
        });
    });

    describe('Code Review', () => {
        test('should review code and provide feedback', async () => {
            const reviewMessage: AgentMessage = {
                type: 'TASK',
                sender: agentPID,
                timestamp: Date.now(),
                payload: {
                    action: {
                        id: 'review-1',
                        type: 'REVIEW_CODE',
                        status: 'PENDING',
                        context: {
                            role: 'skill_agent',
                            dependencies: [],
                            resources: [],
                            constraints: []
                        },
                        priority: 'high',
                        metadata: {
                            code: `
                function login(email: string, password: string) {
                  // Missing input validation
                  const user = findUser(email);
                  if (!user) return null;
                  // Unsafe password comparison
                  return user.password === password ? user : null;
                }
              `,
                            context: {
                                language: 'typescript',
                                securityLevel: 'high'
                            }
                        }
                    }
                }
            };

            await system.send(agentPID, reviewMessage);
            await new Promise(resolve => setTimeout(resolve, 100));

            const response = await agent.testProcessTask(reviewMessage.payload.action);
            expect(response).toBeDefined();
            expect(response.issues).toBeDefined();
            expect(response.suggestions).toBeDefined();
            expect(response.securityConcerns).toBeDefined();
        });
    });

    describe('Test Generation', () => {
        test('should generate test cases', async () => {
            const testGenMessage: AgentMessage = {
                type: 'TASK',
                sender: agentPID,
                timestamp: Date.now(),
                payload: {
                    action: {
                        id: 'test-1',
                        type: 'WRITE_TEST',
                        status: 'PENDING',
                        context: {
                            role: 'skill_agent',
                            dependencies: [],
                            resources: [],
                            constraints: []
                        },
                        priority: 'high',
                        metadata: {
                            code: `
                export function validateEmail(email: string): boolean {
                  const pattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
                  return pattern.test(email);
                }
              `,
                            requirements: [
                                'Should validate correct email formats',
                                'Should reject invalid formats',
                                'Should handle edge cases'
                            ]
                        }
                    }
                }
            };

            await system.send(agentPID, testGenMessage);
            await new Promise(resolve => setTimeout(resolve, 100));

            const response = await agent.testProcessTask(testGenMessage.payload.action);
            expect(response).toBeDefined();
            expect(response.testCases).toBeDefined();
            expect(response.coverage).toBeDefined();
            expect(response.testCases.length).toBeGreaterThan(0);
        });
    });

    describe('Error Handling', () => {
        test('should handle invalid code generation requests', async () => {
            const invalidMessage: AgentMessage = {
                type: 'TASK',
                sender: agentPID,
                timestamp: Date.now(),
                payload: {
                    action: {
                        id: 'invalid-1',
                        type: 'IMPLEMENT_FEATURE',
                        status: 'PENDING',
                        context: {
                            role: 'skill_agent',
                            dependencies: [],
                            resources: [],
                            constraints: []
                        },
                        priority: 'high',
                        metadata: {
                            // Missing required feature specification
                        }
                    }
                }
            };

            await system.send(agentPID, invalidMessage);
            await new Promise(resolve => setTimeout(resolve, 100));

            try {
                await agent.testProcessTask(invalidMessage.payload.action);
                throw new Error('Should have thrown an error');
            } catch (error) {
                expect(error).toBeDefined();
            }
        });

        test('should handle unsupported programming languages', async () => {
            const unsupportedMessage: AgentMessage = {
                type: 'TASK',
                sender: agentPID,
                timestamp: Date.now(),
                payload: {
                    action: {
                        id: 'unsupported-1',
                        type: 'IMPLEMENT_FEATURE',
                        status: 'PENDING',
                        context: {
                            role: 'skill_agent',
                            dependencies: [],
                            resources: [],
                            constraints: []
                        },
                        priority: 'high',
                        metadata: {
                            feature: {
                                name: 'Calculator',
                                requirements: ['Basic arithmetic operations'],
                                language: 'brainfuck'
                            }
                        }
                    }
                }
            };

            await system.send(agentPID, unsupportedMessage);
            await new Promise(resolve => setTimeout(resolve, 100));

            try {
                await agent.testProcessTask(unsupportedMessage.payload.action);
                throw new Error('Should have thrown an error');
            } catch (error: any) {
                expect(error).toBeDefined();
                expect(error.message).toContain('Unsupported language');
            }
        });
    });
}); 