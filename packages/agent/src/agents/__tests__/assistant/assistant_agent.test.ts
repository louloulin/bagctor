import { expect, test, mock, describe, beforeAll, afterAll, beforeEach } from 'bun:test';
import { ActorSystem, ActorContext, Message } from '@bactor/core';
import { AssistantAgent, AssistantConfig } from '../../assistant_agent';
import { AgentMessage } from '../../../interfaces';
import { Action } from '../../../interfaces/action_types';

// Test class to expose protected methods
class TestAssistantAgent extends AssistantAgent {
    public async testProcessTask(action: Action): Promise<any> {
        return super.processTask(action);
    }

    public async testProcessCoordination(action: string, data: any): Promise<any> {
        return super.processCoordination(action, data);
    }
}

describe('Assistant Agent', () => {
    let system: ActorSystem;
    let agentPID: any;
    let agent: TestAssistantAgent;
    let mockConfig: AssistantConfig;

    beforeAll(async () => {
        system = new ActorSystem();
        await system.start();
    });

    afterAll(async () => {
        await system.stop();
    });

    beforeEach(async () => {
        mockConfig = {
            role: 'assistant',
            capabilities: ['conversation', 'task_management', 'knowledge_base'],
            parameters: {
                responseStyle: 'detailed',
                expertise: ['typescript', 'react', 'node.js'],
                contextMemory: 10
            }
        };

        agentPID = await system.spawn({
            producer: (context: ActorContext) => {
                agent = new TestAssistantAgent(context, mockConfig);
                return agent;
            }
        });
    });

    describe('Conversation Handling', () => {
        test('should process user messages', async () => {
            const message: AgentMessage = {
                type: 'TASK',
                sender: agentPID,
                timestamp: Date.now(),
                payload: {
                    action: {
                        id: 'msg-1',
                        type: 'PROCESS_MESSAGE',
                        status: 'PENDING',
                        context: {
                            role: 'assistant',
                            dependencies: [],
                            resources: [],
                            constraints: []
                        },
                        priority: 'high',
                        metadata: {
                            message: 'How can I create a new React component?',
                            context: {
                                previousMessages: [],
                                userPreferences: {
                                    language: 'typescript',
                                    framework: 'react'
                                }
                            }
                        }
                    }
                }
            };

            const response = await agent.testProcessTask(message.payload.action);
            expect(response).toBeDefined();
            expect(response.reply).toBeDefined();
            expect(response.suggestions).toBeDefined();
            expect(response.codeSnippets).toBeDefined();
        });

        test('should maintain conversation context', async () => {
            const followUpMessage: AgentMessage = {
                type: 'TASK',
                sender: agentPID,
                timestamp: Date.now(),
                payload: {
                    action: {
                        id: 'msg-2',
                        type: 'PROCESS_MESSAGE',
                        status: 'PENDING',
                        context: {
                            role: 'assistant',
                            dependencies: [],
                            resources: [],
                            constraints: []
                        },
                        priority: 'high',
                        metadata: {
                            message: 'How do I add props to it?',
                            context: {
                                previousMessages: [
                                    {
                                        role: 'user',
                                        content: 'How can I create a new React component?'
                                    },
                                    {
                                        role: 'assistant',
                                        content: 'Here\'s how to create a basic React component...'
                                    }
                                ],
                                userPreferences: {
                                    language: 'typescript',
                                    framework: 'react'
                                }
                            }
                        }
                    }
                }
            };

            const response = await agent.testProcessTask(followUpMessage.payload.action);
            expect(response).toBeDefined();
            expect(response.reply).toBeDefined();
            expect(response.reply).toContain('props');
            expect(response.codeSnippets).toBeDefined();
        });
    });

    describe('Task Management', () => {
        test('should delegate tasks to appropriate agents', async () => {
            const taskMessage: AgentMessage = {
                type: 'TASK',
                sender: agentPID,
                timestamp: Date.now(),
                payload: {
                    action: {
                        id: 'task-1',
                        type: 'DELEGATE_TASK',
                        status: 'PENDING',
                        context: {
                            role: 'assistant',
                            dependencies: [],
                            resources: [],
                            constraints: []
                        },
                        priority: 'high',
                        metadata: {
                            task: {
                                type: 'code_review',
                                content: 'Review this React component for best practices',
                                code: `
                  function UserProfile({ name }) {
                    return <div>{name}</div>;
                  }
                `
                            }
                        }
                    }
                }
            };

            const response = await agent.testProcessTask(taskMessage.payload.action);
            expect(response).toBeDefined();
            expect(response.delegatedTo).toBeDefined();
            expect(response.taskId).toBeDefined();
        });
    });

    describe('Knowledge Base', () => {
        test('should retrieve relevant documentation', async () => {
            const docMessage: AgentMessage = {
                type: 'TASK',
                sender: agentPID,
                timestamp: Date.now(),
                payload: {
                    action: {
                        id: 'doc-1',
                        type: 'RETRIEVE_DOCS',
                        status: 'PENDING',
                        context: {
                            role: 'assistant',
                            dependencies: [],
                            resources: [],
                            constraints: []
                        },
                        priority: 'high',
                        metadata: {
                            query: 'React hooks lifecycle',
                            filters: {
                                framework: 'react',
                                version: '>=16.8'
                            }
                        }
                    }
                }
            };

            const response = await agent.testProcessTask(docMessage.payload.action);
            expect(response).toBeDefined();
            expect(response.documents).toBeDefined();
            expect(response.documents.length).toBeGreaterThan(0);
        });
    });

    describe('Error Handling', () => {
        test('should handle invalid message formats', async () => {
            const invalidMessage: AgentMessage = {
                type: 'TASK',
                sender: agentPID,
                timestamp: Date.now(),
                payload: {
                    action: {
                        id: 'invalid-1',
                        type: 'PROCESS_MESSAGE',
                        status: 'PENDING',
                        context: {
                            role: 'assistant',
                            dependencies: [],
                            resources: [],
                            constraints: []
                        },
                        priority: 'high',
                        metadata: {
                            // Missing required message content
                        }
                    }
                }
            };

            try {
                await agent.testProcessTask(invalidMessage.payload.action);
                throw new Error('Should have thrown an error');
            } catch (error: any) {
                expect(error).toBeDefined();
                expect(error.message).toContain('Invalid message format');
            }
        });

        test('should handle unsupported task types', async () => {
            const unsupportedMessage: AgentMessage = {
                type: 'TASK',
                sender: agentPID,
                timestamp: Date.now(),
                payload: {
                    action: {
                        id: 'unsupported-1',
                        type: 'UNSUPPORTED_ACTION',
                        status: 'PENDING',
                        context: {
                            role: 'assistant',
                            dependencies: [],
                            resources: [],
                            constraints: []
                        },
                        priority: 'high',
                        metadata: {}
                    }
                }
            };

            try {
                await agent.testProcessTask(unsupportedMessage.payload.action);
                throw new Error('Should have thrown an error');
            } catch (error: any) {
                expect(error).toBeDefined();
                expect(error.message).toContain('Unsupported task type');
            }
        });
    });
}); 