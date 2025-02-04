import {
    Actor,
    ActorContext,
    Message,
    log,
} from '@bactor/core';

import { KnowledgeBase, Knowledge, KnowledgeQuery } from './knowledge';
import { WorkingMemory, MemoryOptions } from './memory';
import { BusMessageTypes, SystemMessageTypes, createMessage } from './message_bus';

export interface AgentConfig {
    name: string;
    role: string;
    description?: string;
    memoryOptions?: MemoryOptions;
    capabilities?: string[];
}

export interface AgentStatus {
    status: 'idle' | 'thinking' | 'acting' | 'error';
    currentTask?: string;
    lastActivity: number;
}

export class AgentActor extends Actor {
    private config: AgentConfig;
    private agentStatus: AgentStatus;
    private knowledge: KnowledgeBase;
    private memory: WorkingMemory;

    constructor(context: ActorContext, config: AgentConfig) {
        super(context);
        this.config = config;
        this.agentStatus = {
            status: 'idle',
            lastActivity: Date.now()
        };
        this.knowledge = new KnowledgeBase();
        this.memory = new WorkingMemory(config.memoryOptions);

        log.info(`Agent ${config.name} (${config.role}) created with PID: ${context.self.id}`);

        // Register behaviors in constructor
        this.registerBehaviors();
    }

    protected behaviors(): void {
        // This method is required by Actor class
        // Behaviors are registered in constructor via registerBehaviors()
    }

    protected registerBehaviors(): void {
        // Handle task assignments
        this.addBehavior(SystemMessageTypes.TASK_ASSIGNED, async (message: Message) => {
            try {
                this.agentStatus.status = 'thinking';
                this.agentStatus.currentTask = message.payload.id;
                this.agentStatus.lastActivity = Date.now();

                log.info(`[${this.config.name}] Processing task: ${JSON.stringify(message.payload)}`);

                // Store task in short-term memory
                await this.memory.store(`task:${Date.now()}`, {
                    task: message.payload,
                    timestamp: Date.now()
                });

                // Process the task
                const result = await this.processTask(message.payload);
                log.info(`[${this.config.name}] Task completed with result: ${JSON.stringify(result)}`);

                // Store result in knowledge base if significant
                if (result.confidence > 0.7) {
                    const knowledge = {
                        id: `result:${Date.now()}`,
                        topic: `task:${message.payload.id}`,
                        content: result.output,
                        metadata: {
                            source: this.config.name,
                            timestamp: Date.now(),
                            confidence: result.confidence,
                            tags: ['task-result', this.config.role]
                        }
                    };
                    await this.knowledge.learn(knowledge);
                    log.info(`[${this.config.name}] Stored result in knowledge base with confidence: ${result.confidence}`);
                }

                this.agentStatus.status = 'idle';
                this.agentStatus.currentTask = undefined;

                if (message.sender) {
                    await this.context.send(message.sender, {
                        type: SystemMessageTypes.TASK_COMPLETED,
                        payload: {
                            taskId: message.payload.id,
                            result
                        }
                    });
                }
            } catch (error) {
                this.agentStatus.status = 'error';
                log.error(`[${this.config.name}] Error processing task:`, error);
                if (message.sender) {
                    await this.context.send(message.sender, {
                        type: SystemMessageTypes.TASK_FAILED,
                        payload: {
                            taskId: message.payload.id,
                            error: error instanceof Error ? error.message : 'Unknown error'
                        }
                    });
                }
            }
        });

        // Handle knowledge sharing
        this.addBehavior(BusMessageTypes.PUBLISH, async (message: Message) => {
            if (message.payload.type === 'knowledge-share') {
                try {
                    await this.knowledge.learn(message.payload.knowledge);
                    log.info(`[${this.config.name}] Received shared knowledge: ${message.payload.knowledge.id}`);
                    if (message.sender) {
                        await this.context.send(message.sender, {
                            type: BusMessageTypes.PUBLISH,
                            payload: { success: true }
                        });
                    }
                } catch (error) {
                    log.error(`[${this.config.name}] Error learning shared knowledge:`, error);
                    if (message.sender) {
                        await this.context.send(message.sender, {
                            type: BusMessageTypes.PUBLISH,
                            payload: { success: false, error: error instanceof Error ? error.message : 'Unknown error' }
                        });
                    }
                }
            }
        });

        // Handle status queries
        this.addBehavior(BusMessageTypes.REQUEST, async (message: Message) => {
            if (message.payload.request?.type === 'get-status') {
                const status = {
                    success: true,
                    data: {
                        config: this.config,
                        status: this.agentStatus,
                        stats: {
                            knowledge: this.knowledge.getStats(),
                            memory: this.memory.getStats()
                        }
                    }
                };

                if (message.sender) {
                    await this.context.send(message.sender, {
                        type: BusMessageTypes.REQUEST,
                        payload: status
                    });
                }
            }
        });
    }

    protected async processTask(task: any): Promise<{ output: any; confidence: number }> {
        // This should be overridden by specific agent implementations
        throw new Error('processTask must be implemented by derived classes');
    }

    // Knowledge management methods
    async learnKnowledge(knowledge: Knowledge): Promise<void> {
        await this.knowledge.learn(knowledge);
    }

    async queryKnowledge(query: KnowledgeQuery): Promise<Knowledge[]> {
        return await this.knowledge.query(query);
    }

    async shareKnowledge(targetId: string, knowledgeId: string): Promise<void> {
        const knowledge = await this.knowledge.query({ topic: knowledgeId });
        if (knowledge.length > 0) {
            await this.context.send(targetId, createMessage(BusMessageTypes.PUBLISH, {
                type: 'knowledge-share',
                knowledge: knowledge[0]
            }));
        }
    }

    // Memory management methods
    async remember(key: string, value: any, isLongTerm: boolean = false): Promise<void> {
        await this.memory.store(key, value, isLongTerm);
    }

    async recall(key: string, isLongTerm: boolean = false): Promise<any | null> {
        return await this.memory.recall(key, isLongTerm);
    }

    async forget(key: string, isLongTerm: boolean = false): Promise<void> {
        await this.memory.forget(key, isLongTerm);
    }

    // Lifecycle methods
    async preStart(): Promise<void> {
        log.info(`[${this.config.name}] Starting agent...`);
        await super.preStart();
    }

    async postStop(): Promise<void> {
        log.info(`[${this.config.name}] Stopping agent...`);
        await this.memory.clear();
        await this.knowledge.clear();
        await super.postStop();
    }
} 