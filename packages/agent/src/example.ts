import { Agent } from '@mastra/core/agent';
import { Mastra } from '@mastra/core';
import { openai } from '@ai-sdk/openai';
import { Bagctor } from './bagctor';

// Example usage of Bagctor with multiple agents and Mastra instances

// Create agents directly
const researchAgent = new Agent({
    name: 'researchAgent',
    instructions: 'You research information thoroughly.',
    model: openai('gpt-4o'),
});

const writingAgent = new Agent({
    name: 'writingAgent',
    instructions: 'You craft well-written content.',
    model: openai('gpt-4o'),
});

const codeAgent = new Agent({
    name: 'codeAgent',
    instructions: 'You write clean and efficient code.',
    model: openai('gpt-4o'),
});

// Create Mastra instances
const mastra1 = new Mastra({
    agents: {
        researchAgent,
        writingAgent
    },
});

const mastra2 = new Mastra({
    agents: {
        codeAgent
    },
});

// Example 1: Create Bagctor with array of agents
const bagctorWithAgentsArray = new Bagctor({
    agents: [researchAgent, writingAgent, codeAgent],
    distribution: {
        clustered: true,
        serverPort: 9000
    }
});

// Example 2: Create Bagctor with array of Mastra instances
const bagctorWithMastraArray = new Bagctor({
    mastra: [mastra1, mastra2],
    distribution: {
        clustered: true,
        serverPort: 9001
    }
});

// Example 3: Create Bagctor with mixed sources
const bagctorMixed = new Bagctor({
    agents: {
        customAgent: new Agent({
            name: 'customAgent',
            instructions: 'You handle custom tasks efficiently.',
            model: openai('gpt-4o'),
        })
    },
    mastra: [mastra1, mastra2],
    distribution: {
        clustered: true,
        serverPort: 9002
    }
});

// Example workflow using multiple agents
async function runWorkflowExample() {
    // Create a workflow
    const researchWorkflow = await bagctorMixed.createWorkflow({
        name: 'Research and Write Workflow',
        steps: [
            {
                agent: 'researchAgent',
                input: 'Research the benefits of distributed systems',
                output: 'research'
            },
            {
                agent: 'writingAgent',
                input: (context) => `Write an article based on this research: ${context.research}`,
                output: 'article'
            },
            {
                agent: 'codeAgent',
                input: (context) => `Write a simple distributed system demo based on this article: ${context.article}`,
                output: 'code'
            }
        ]
    });

    // Execute the workflow
    const result = await researchWorkflow.execute();

    console.log('Workflow completed with results:');
    console.log('Article:', result.article);
    console.log('Code:', result.code);
}

// Example of agent orchestration
async function runOrchestratorExample() {
    // Create an orchestrator
    const orchestrator = bagctorMixed.createOrchestrator({
        agents: ['researchAgent', 'writingAgent', 'codeAgent'],
        orchestrationStrategy: 'hierarchical'
    });

    // Execute the orchestrator
    const result = await orchestrator.execute('Create a comprehensive guide on distributed systems');

    console.log('Orchestrator result:', result);
}

// Run examples
async function runExamples() {
    try {
        console.log('Running workflow example...');
        await runWorkflowExample();

        console.log('\nRunning orchestrator example...');
        await runOrchestratorExample();
    } catch (error) {
        console.error('Error running examples:', error);
    }
}

// Run examples - this will execute when the file is run directly
runExamples(); 