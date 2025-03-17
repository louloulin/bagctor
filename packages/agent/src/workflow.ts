import { Agent } from '@mastra/core/agent';
import { WorkflowConfig, WorkflowStep } from './types';

/**
 * Workflow represents a sequence of agent operations
 */
export class Workflow {
    private config: WorkflowConfig;
    private agentsMap: Record<string, Agent>;

    /**
     * Create a new workflow
     * @param config Workflow configuration
     * @param agentsMap Map of available agents
     */
    constructor(config: WorkflowConfig, agentsMap: Record<string, Agent>) {
        this.config = config;
        this.agentsMap = agentsMap;

        // Validate that all agents referenced in steps exist
        for (const step of config.steps) {
            if (!agentsMap[step.agent]) {
                throw new Error(`Agent "${step.agent}" referenced in workflow "${config.name}" does not exist`);
            }
        }
    }

    /**
     * Execute the workflow
     * @param initialInput Optional initial input to the workflow
     */
    async execute(initialInput?: string): Promise<Record<string, any>> {
        const context: Record<string, any> = {};

        // Add initial input to context if provided
        if (initialInput) {
            context['initialInput'] = initialInput;
        }

        // Execute each step in sequence
        for (const step of this.config.steps) {
            const agent = this.agentsMap[step.agent];

            // Determine input for this step
            let stepInput: string;
            if (typeof step.input === 'function') {
                stepInput = step.input(context);
            } else {
                stepInput = step.input;

                // Replace placeholders in the input string if it's a template
                if (stepInput.includes('${')) {
                    Object.keys(context).forEach(key => {
                        stepInput = stepInput.replace(`\${${key}}`, context[key]);
                    });
                }
            }

            // Execute the agent
            const result = await agent.generate(stepInput);

            // Store the result in the context with the specified output key
            context[step.output] = result.text;
        }

        return context;
    }

    /**
     * Get the workflow's name
     */
    get name(): string {
        return this.config.name;
    }

    /**
     * Get the workflow's steps
     */
    get steps(): WorkflowStep[] {
        return [...this.config.steps];
    }
} 