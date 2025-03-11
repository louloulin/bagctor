import { expect, test, mock, describe, beforeAll, afterAll, beforeEach } from 'bun:test';
import { ActorSystem, ActorContext, Message } from '@bactor/core';
import { PlannerAgent, PlannerConfig, Plan } from '../../planner';
import { AgentMessage, Action, ActionType } from '../../../interfaces/action_types';

describe('Planner Agent', () => {
    let system: ActorSystem;
    let agentPID: any;
    let agent: PlannerAgent;
    let mockConfig: PlannerConfig;
    let planId: string;

    beforeAll(async () => {
        system = new ActorSystem();
        await system.start();
    });

    afterAll(async () => {
        await system.stop();
    });

    beforeEach(async () => {
        mockConfig = {
            role: 'planner',
            capabilities: ['task_planning', 'resource_allocation'],
            parameters: {
                planningStrategy: 'sequential',
                maxConcurrentTasks: 5,
                priorityLevels: ['high', 'medium', 'low']
            }
        };

        agentPID = await system.spawn({
            producer: (context: ActorContext) => {
                agent = new PlannerAgent(context, mockConfig);
                return agent;
            }
        });
    });

    describe('Plan Creation', () => {
        test('should create a new plan', async () => {
            const createPlanAction: Action = {
                id: 'plan-1',
                type: 'CREATE_PLAN' as ActionType,
                status: 'PENDING',
                priority: 'high',
                context: {
                    role: 'planner',
                    dependencies: [],
                    resources: [],
                    constraints: []
                },
                metadata: {
                    tasks: [
                        {
                            id: 'task-1',
                            type: 'IMPLEMENT_FEATURE',
                            status: 'PENDING',
                            priority: 'high',
                            context: {
                                role: 'developer',
                                dependencies: [],
                                resources: [],
                                constraints: []
                            },
                            metadata: {}
                        }
                    ]
                }
            };

            const plan = await agent.processTask(createPlanAction);
            expect(plan).toBeDefined();
            expect(plan.id).toBeDefined();
            expect(plan.tasks.length).toBe(1);
            expect(plan.status).toBe('PENDING');
            planId = plan.id; // Store plan ID for later tests
        });

        test('should handle plan with dependencies', async () => {
            const createPlanAction: Action = {
                id: 'plan-2',
                type: 'CREATE_PLAN' as ActionType,
                status: 'PENDING',
                priority: 'high',
                context: {
                    role: 'planner',
                    dependencies: [],
                    resources: [],
                    constraints: []
                },
                metadata: {
                    tasks: [
                        {
                            id: 'task-2',
                            type: 'IMPLEMENT_FEATURE',
                            status: 'PENDING',
                            priority: 'high',
                            context: {
                                role: 'developer',
                                dependencies: ['task-1'],
                                resources: [],
                                constraints: []
                            },
                            metadata: {}
                        }
                    ],
                    dependencies: new Map([['task-2', ['task-1']]])
                }
            };

            const plan = await agent.processTask(createPlanAction);
            expect(plan).toBeDefined();
            const deps = plan.dependencies.get('task-2');
            expect(deps).toBeDefined();
            expect(deps).toEqual(['task-1']);
        });
    });

    describe('Plan Execution', () => {
        test('should execute plan sequentially', async () => {
            const createPlanAction: Action = {
                id: 'plan-3',
                type: 'CREATE_PLAN' as ActionType,
                status: 'PENDING',
                priority: 'high',
                context: {
                    role: 'planner',
                    dependencies: [],
                    resources: [],
                    constraints: []
                },
                metadata: {
                    tasks: [
                        {
                            id: 'task-3',
                            type: 'IMPLEMENT_FEATURE',
                            status: 'PENDING',
                            priority: 'high',
                            context: {
                                role: 'developer',
                                dependencies: [],
                                resources: [],
                                constraints: []
                            },
                            metadata: {}
                        }
                    ]
                }
            };

            const plan = await agent.processTask(createPlanAction);

            const executePlanAction: Action = {
                id: 'exec-1',
                type: 'EXECUTE_PLAN' as ActionType,
                status: 'PENDING',
                priority: 'high',
                context: {
                    role: 'planner',
                    dependencies: [],
                    resources: [],
                    constraints: []
                },
                metadata: {
                    planId: plan.id
                }
            };

            const executedPlan = await agent.processTask(executePlanAction);
            expect(executedPlan).toBeDefined();
            expect(executedPlan.status).toBe('IN_PROGRESS');
        });

        test('should execute plan in parallel', async () => {
            mockConfig.parameters.planningStrategy = 'parallel';
            mockConfig.parameters.maxConcurrentTasks = 2;

            const createPlanAction: Action = {
                id: 'plan-4',
                type: 'CREATE_PLAN' as ActionType,
                status: 'PENDING',
                priority: 'high',
                context: {
                    role: 'planner',
                    dependencies: [],
                    resources: [],
                    constraints: []
                },
                metadata: {
                    tasks: [
                        {
                            id: 'task-4a',
                            type: 'IMPLEMENT_FEATURE',
                            status: 'PENDING',
                            priority: 'high',
                            context: {
                                role: 'developer',
                                dependencies: [],
                                resources: [],
                                constraints: []
                            },
                            metadata: {}
                        },
                        {
                            id: 'task-4b',
                            type: 'IMPLEMENT_FEATURE',
                            status: 'PENDING',
                            priority: 'high',
                            context: {
                                role: 'developer',
                                dependencies: [],
                                resources: [],
                                constraints: []
                            },
                            metadata: {}
                        }
                    ]
                }
            };

            const plan = await agent.processTask(createPlanAction);

            const executePlanAction: Action = {
                id: 'exec-2',
                type: 'EXECUTE_PLAN' as ActionType,
                status: 'PENDING',
                priority: 'high',
                context: {
                    role: 'planner',
                    dependencies: [],
                    resources: [],
                    constraints: []
                },
                metadata: {
                    planId: plan.id
                }
            };

            const executedPlan = await agent.processTask(executePlanAction);
            expect(executedPlan).toBeDefined();
            expect(executedPlan.status).toBe('IN_PROGRESS');
            expect(executedPlan.concurrentTasks).toBe(2);
        });
    });

    describe('Plan Updates', () => {
        test('should update plan when tasks are completed', async () => {
            const updateMessage: AgentMessage = {
                type: 'COORDINATION',
                sender: agentPID,
                timestamp: Date.now(),
                payload: {
                    action: 'UPDATE_PLAN',
                    data: {
                        planId: planId, // Use stored plan ID
                        completedTask: {
                            id: 'task-1',
                            type: 'IMPLEMENT_FEATURE',
                            status: 'COMPLETED',
                            priority: 'high',
                            context: {
                                role: 'developer',
                                dependencies: [],
                                resources: [],
                                constraints: []
                            },
                            metadata: {}
                        }
                    }
                }
            };

            const response = await agent.processCoordination('UPDATE_PLAN', updateMessage.payload.data);
            expect(response).toBeDefined();
            expect(response.completedTasks.length).toBe(1);
            expect(response.completedTasks[0].id).toBe('task-1');
        });
    });

    describe('Plan Prioritization', () => {
        test('should update plan priority', async () => {
            const priorityMessage: AgentMessage = {
                type: 'COORDINATION',
                sender: agentPID,
                timestamp: Date.now(),
                payload: {
                    action: 'PRIORITIZE_PLAN',
                    data: {
                        planId: planId, // Use stored plan ID
                        priority: 'high'
                    }
                }
            };

            const response = await agent.processCoordination('PRIORITIZE_PLAN', priorityMessage.payload.data);
            expect(response).toBeDefined();
            expect(response.priority).toBe('high');
        });
    });

    describe('Error Handling', () => {
        test('should handle invalid plan requests', async () => {
            const invalidAction: Action = {
                id: 'invalid-1',
                type: 'CREATE_PLAN' as ActionType,
                status: 'PENDING',
                priority: 'high',
                context: {
                    role: 'planner',
                    dependencies: [],
                    resources: [],
                    constraints: []
                },
                metadata: {} // Missing required tasks
            };

            await expect(agent.processTask(invalidAction)).rejects.toThrow('Tasks are required for plan creation');
        });

        test('should handle blocked plans', async () => {
            const blockMessage: AgentMessage = {
                type: 'COORDINATION',
                sender: agentPID,
                timestamp: Date.now(),
                payload: {
                    action: 'BLOCK_PLAN',
                    data: {
                        planId: planId, // Use stored plan ID
                        reason: 'Resource unavailable'
                    }
                }
            };

            const response = await agent.processCoordination('BLOCK_PLAN', blockMessage.payload.data);
            expect(response).toBeDefined();
            expect(response.status).toBe('BLOCKED');
        });
    });
}); 