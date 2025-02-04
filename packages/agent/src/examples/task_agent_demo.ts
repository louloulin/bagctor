import { ActorSystem, log } from '@bactor/core';
import { TaskAgent, TaskAgentConfig } from '../agents/task_agent';
import { BusMessageTypes, SystemMessageTypes } from '../core/message_bus';

interface Task {
    id: string;
    type: string;
    input: any;
    priority?: 'high' | 'normal' | 'low';
    deadline?: number;
    dependencies?: string[];
}

async function runTaskAgentDemo() {
    try {
        log.info('Starting task agent demo...');

        // Create actor system
        const system = new ActorSystem('localhost:50051');
        await system.start();
        log.info('Actor system started');

        // Create task agent
        const taskAgentConfig: TaskAgentConfig = {
            name: 'data-processor',
            role: 'task-processor',
            description: 'Agent for processing various data tasks',
            capabilities: ['data-analysis', 'text-processing', 'decision-making'],
            maxConcurrentTasks: 5,
            taskTimeout: 30000, // 30 seconds
            memoryOptions: {
                shortTermTTL: 5 * 60 * 1000, // 5 minutes
                longTermTTL: 24 * 60 * 60 * 1000, // 24 hours
                maxShortTermSize: 100,
                maxLongTermSize: 1000
            }
        };

        const taskAgent = await system.spawn({
            producer: (context) => new TaskAgent(context, taskAgentConfig)
        });
        log.info('Task agent created');

        // Example 1: Data Analysis Task
        log.info('\n=== Submitting data analysis task ===');
        const dataTask: Task = {
            id: 'task-1',
            type: 'data-analysis',
            input: {
                data: [1, 2, 3, 4, 5],
                operation: 'statistics'
            }
        };

        try {
            const dataResult = await system.send(taskAgent, {
                type: SystemMessageTypes.TASK_ASSIGNED,
                payload: dataTask
            });
            log.info('Data analysis task result:', dataResult);
        } catch (error) {
            log.error('Data analysis task failed:', error);
        }

        // Example 2: Text Processing Task with Dependencies
        log.info('\n=== Submitting text processing task ===');
        const textTask: Task = {
            id: 'task-2',
            type: 'text-processing',
            input: {
                text: 'This is a great example of text processing. I love how it works!',
                operation: 'sentiment-analysis'
            },
            dependencies: ['task-1']
        };

        try {
            const textResult = await system.send(taskAgent, {
                type: SystemMessageTypes.TASK_ASSIGNED,
                payload: textTask
            });
            log.info('Text processing task result:', textResult);
        } catch (error) {
            log.error('Text processing task failed:', error);
        }

        // Example 3: Multiple Concurrent Tasks
        log.info('\n=== Submitting multiple concurrent tasks ===');
        const tasks: Task[] = Array.from({ length: 3 }, (_, i) => ({
            id: `task-${i + 3}`,
            type: 'decision-making',
            input: {
                options: ['A', 'B', 'C'],
                criteria: ['cost', 'time', 'quality']
            }
        }));

        try {
            const results = await Promise.all(tasks.map(task =>
                system.send(taskAgent, {
                    type: SystemMessageTypes.TASK_ASSIGNED,
                    payload: task
                })
            ));
            log.info('Concurrent tasks results:', results);
        } catch (error) {
            log.error('Some concurrent tasks failed:', error);
        }

        // Example 4: Task Status Check
        log.info('\n=== Checking task statuses ===');
        const taskIds = ['task-1', 'task-2', 'task-3'];
        for (const taskId of taskIds) {
            try {
                const status = await system.send(taskAgent, {
                    type: BusMessageTypes.REQUEST,
                    payload: {
                        request: {
                            type: 'get-status',
                            taskId
                        }
                    }
                });
                log.info(`Status for task ${taskId}:`, status);
            } catch (error) {
                log.error(`Failed to get status for task ${taskId}:`, error);
            }
        }

        // Example 5: Task Cancellation
        log.info('\n=== Cancelling a task ===');
        try {
            await system.send(taskAgent, {
                type: BusMessageTypes.REQUEST,
                payload: {
                    request: {
                        type: 'cancel',
                        taskId: 'task-3'
                    }
                }
            });
            log.info('Task cancellation request sent');
        } catch (error) {
            log.error('Failed to cancel task:', error);
        }

        // Cleanup
        log.info('\nStopping actors...');
        await system.stop(taskAgent);
        await system.stop();
        log.info('Demo completed successfully');

    } catch (error) {
        log.error('Error in task agent demo:', error);
        throw error;
    }
}

// Run the demo
if (require.main === module) {
    runTaskAgentDemo().catch(error => {
        log.error('Demo failed:', error);
        process.exit(1);
    });
}

export { runTaskAgentDemo }; 