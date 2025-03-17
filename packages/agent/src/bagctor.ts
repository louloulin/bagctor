import { Agent } from '@mastra/core/agent';
import { Mastra } from '@mastra/core';
import { BagctorConfig, ServeConfig, TeamConfig, WorkflowConfig } from './types';
import { Workflow } from './workflow';

/**
 * Bagctor is a distributed agent system that extends Mastra with Actor model capabilities
 */
export class Bagctor {
    private agentsMap: Record<string, Agent> = {};
    private distributionConfig: BagctorConfig['distribution'];

    /**
     * Create a new Bagctor instance
     * @param config Configuration for the Bagctor instance
     */
    constructor(config: BagctorConfig = {}) {
        this.distributionConfig = config.distribution || {};

        // Process agents
        if (config.agents) {
            if (Array.isArray(config.agents)) {
                // Handle array of agents
                config.agents.forEach(agent => {
                    if (agent.name) {
                        this.agentsMap[agent.name] = agent;
                    } else {
                        throw new Error('Agent must have a name property');
                    }
                });
            } else {
                // Handle record of agents
                this.agentsMap = { ...config.agents };
            }
        }

        // Process Mastra instances
        if (config.mastra) {
            if (Array.isArray(config.mastra)) {
                // Handle array of Mastra instances
                config.mastra.forEach(mastraInstance => {
                    if (mastraInstance.agents) {
                        this.agentsMap = { ...this.agentsMap, ...mastraInstance.agents };
                    }
                });
            } else {
                // Handle single Mastra instance
                if (config.mastra.agents) {
                    this.agentsMap = { ...this.agentsMap, ...config.mastra.agents };
                }
            }
        }
    }

    /**
     * Get access to registered agents
     */
    get agents() {
        return this.agentsMap;
    }

    /**
     * Register a remote agent
     * @param agentName Name of the remote agent to register
     */
    async registerRemoteAgent(agentName: string): Promise<Agent> {
        // Implementation for remote agent registration
        // This would handle connecting to the primary node and registering the agent

        // Placeholder implementation
        return Promise.resolve({} as Agent);
    }

    /**
     * Create a workflow for orchestrating multiple agents
     * @param config Workflow configuration
     */
    async createWorkflow(config: WorkflowConfig) {
        return new Workflow(config, this.agentsMap);
    }

    /**
     * Create a team of agents for collaboration
     * @param config Team configuration
     */
    async createTeam(config: TeamConfig) {
        // Implementation for team creation
        // This would create an orchestrator for the specified agents

        // Placeholder implementation
        return {
            execute: async (input: string) => {
                // Simple implementation that runs the first agent
                const firstAgentName = config.agents[0];
                const agent = this.agentsMap[firstAgentName];
                if (!agent) {
                    throw new Error(`Agent ${firstAgentName} not found`);
                }

                return await agent.generate(input);
            }
        };
    }

    /**
     * Create an orchestrator for complex agent coordination
     * @param config Orchestrator configuration
     */
    createOrchestrator(config: { agents: string[], orchestrationStrategy: string }) {
        // Implementation for orchestrator creation

        // Placeholder implementation
        return {
            execute: async (input: string) => {
                // Simple implementation
                const result = await Promise.all(
                    config.agents.map(async agentName => {
                        const agent = this.agentsMap[agentName];
                        if (!agent) {
                            throw new Error(`Agent ${agentName} not found`);
                        }
                        return await agent.generate(input);
                    })
                );

                return result.map(r => r.text).join('\n\n');
            }
        };
    }

    /**
     * Start the Bagctor service
     * @param config Service configuration
     */
    async serve(config: ServeConfig) {
        const { port, enablePlayground = false } = config;

        console.log(`Starting Bagctor service on port ${port}...`);
        console.log(`Playground ${enablePlayground ? 'enabled' : 'disabled'}`);

        // Implementation for starting the service

        return {
            port,
            stop: async () => {
                console.log('Stopping Bagctor service...');
                // Implementation for stopping the service
            }
        };
    }
} 