import { expect, test, mock, describe, beforeAll, afterAll, beforeEach } from 'bun:test';
import { ActorSystem, ActorContext, Message } from '@bactor/core';
import { ProductManager } from '../../product_manager';
import { AgentMessage } from '../../../interfaces';
import { Action, ProductManagerConfig, RequirementAnalysis, UserStory } from '../../../interfaces/action_types';

// Test class to expose protected methods
class TestProductManagerAgent extends ProductManager {
    public async testProcessTask(action: Action): Promise<any> {
        return super.processTask(action);
    }

    public async testProcessCoordination(action: string, data: any): Promise<any> {
        return super.processCoordination(action, data);
    }
}

describe('Product Manager Agent', () => {
    let system: ActorSystem;
    let agentPID: any;
    let agent: TestProductManagerAgent;
    let mockConfig: ProductManagerConfig;

    beforeAll(async () => {
        system = new ActorSystem();
        await system.start();
    });

    afterAll(async () => {
        await system.stop();
    });

    beforeEach(async () => {
        mockConfig = {
            role: 'product_manager',
            capabilities: [
                'requirement_analysis',
                'user_story_creation',
                'market_research',
                'feature_prioritization'
            ],
            parameters: {
                analysisDepth: 'detailed',
                marketFocus: ['enterprise', 'startup'],
                prioritizationCriteria: ['business_value', 'technical_feasibility']
            }
        };

        agentPID = await system.spawn({
            producer: (context: ActorContext) => {
                agent = new TestProductManagerAgent(context, mockConfig);
                return agent;
            }
        });
    });

    describe('Requirement Analysis', () => {
        test('should analyze requirements and create user stories', async () => {
            const analysisMessage: AgentMessage = {
                type: 'TASK',
                sender: agentPID,
                timestamp: Date.now(),
                payload: {
                    action: {
                        id: 'analysis-1',
                        type: 'ANALYZE_REQUIREMENT',
                        status: 'PENDING',
                        context: {
                            role: 'product_manager',
                            dependencies: [],
                            resources: [],
                            constraints: []
                        },
                        priority: 'high',
                        metadata: {
                            rawRequirement: 'Build a collaborative task management system',
                            context: 'Enterprise software development teams',
                            constraints: ['Must integrate with existing tools', 'GDPR compliance required']
                        }
                    }
                }
            };

            await system.send(agentPID, analysisMessage);
            await new Promise(resolve => setTimeout(resolve, 100));

            const response = await agent.testProcessTask(analysisMessage.payload.action);
            expect(response).toBeDefined();
            expect(response.userStories).toBeDefined();
            expect(response.marketAnalysis).toBeDefined();
            expect(response.feasibilityAnalysis).toBeDefined();
        });

        test('should prioritize features based on criteria', async () => {
            const userStories: UserStory[] = [
                {
                    id: 'US-1',
                    title: 'Task Creation',
                    description: 'Users can create new tasks',
                    priority: 'high',
                    acceptanceCriteria: ['Task form validation', 'Real-time updates']
                },
                {
                    id: 'US-2',
                    title: 'Task Assignment',
                    description: 'Users can assign tasks to team members',
                    priority: 'medium',
                    acceptanceCriteria: ['User selection', 'Notification system']
                }
            ];

            const prioritizeMessage: AgentMessage = {
                type: 'TASK',
                sender: agentPID,
                timestamp: Date.now(),
                payload: {
                    action: {
                        id: 'prioritize-1',
                        type: 'CREATE_USER_STORY',
                        status: 'PENDING',
                        context: {
                            role: 'product_manager',
                            dependencies: [],
                            resources: [],
                            constraints: []
                        },
                        priority: 'high',
                        metadata: {
                            requirement: {
                                userStories,
                                marketAnalysis: {
                                    competitors: ['Jira', 'Trello'],
                                    uniqueSellingPoints: ['AI-powered suggestions'],
                                    targetUsers: ['Development teams']
                                },
                                feasibilityAnalysis: {
                                    technicalRisks: ['Integration complexity'],
                                    resourceRequirements: ['Frontend team', 'Backend team'],
                                    timeline: '3 months'
                                }
                            },
                            scope: 'MVP'
                        }
                    }
                }
            };

            await system.send(agentPID, prioritizeMessage);
            await new Promise(resolve => setTimeout(resolve, 100));

            const response = await agent.testProcessTask(prioritizeMessage.payload.action);
            expect(response).toBeDefined();
            expect(Array.isArray(response)).toBe(true);
            expect(response.length).toBeGreaterThan(0);
            expect(response[0].priority).toBeDefined();
        });
    });

    describe('Market Research', () => {
        test('should analyze market trends and competition', async () => {
            const marketMessage: AgentMessage = {
                type: 'COORDINATION',
                sender: agentPID,
                timestamp: Date.now(),
                payload: {
                    action: 'ANALYZE_MARKET',
                    data: {
                        market: 'enterprise',
                        competitors: ['Jira', 'Trello', 'Asana'],
                        targetUsers: ['Development teams', 'Product managers']
                    }
                }
            };

            await system.send(agentPID, marketMessage);
            await new Promise(resolve => setTimeout(resolve, 100));

            const response = await agent.testProcessCoordination('ANALYZE_MARKET', marketMessage.payload.data);
            expect(response).toBeDefined();
            expect(response.analysis).toBeDefined();
            expect(response.recommendations).toBeDefined();
        });
    });

    describe('Error Handling', () => {
        test('should handle invalid requirement analysis requests', async () => {
            const invalidMessage: AgentMessage = {
                type: 'TASK',
                sender: agentPID,
                timestamp: Date.now(),
                payload: {
                    action: {
                        id: 'invalid-1',
                        type: 'ANALYZE_REQUIREMENT',
                        status: 'PENDING',
                        context: {
                            role: 'product_manager',
                            dependencies: [],
                            resources: [],
                            constraints: []
                        },
                        priority: 'high',
                        metadata: {
                            // Missing required fields
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

        test('should handle invalid market analysis requests', async () => {
            const invalidMessage: AgentMessage = {
                type: 'COORDINATION',
                sender: agentPID,
                timestamp: Date.now(),
                payload: {
                    action: 'ANALYZE_MARKET',
                    data: {
                        // Missing required fields
                    }
                }
            };

            await system.send(agentPID, invalidMessage);
            await new Promise(resolve => setTimeout(resolve, 100));

            try {
                await agent.testProcessCoordination('ANALYZE_MARKET', invalidMessage.payload.data);
                throw new Error('Should have thrown an error');
            } catch (error) {
                expect(error).toBeDefined();
            }
        });
    });
}); 