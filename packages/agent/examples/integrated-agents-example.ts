/**
 * Integrated Agents Example
 * 
 * This example demonstrates how to integrate Bactor and Mastra agents
 * in a single agent system, allowing them to communicate with each other.
 */

import { AgentSystem } from '../src/bactor/agent-system';
import { MastraAgentConfig, MastraAgentMessageType } from '../src/bactor/mastra-agent-actor';
import { BactorAgentConfig } from '../src/bactor/bactor-agent';
import { simulateReadableStream } from 'ai';
import { createMemory } from './memory-factory';

/**
 * Create a fully compatible mock language model for testing
 */
function createCompatibleMockModel() {
    // Create a mock language model that implements all required methods
    return {
        specificationVersion: 'v1',
        provider: 'mock',
        modelId: 'mock-model',
        defaultObjectGenerationMode: 'json',
        requiresApiKey: false,
        isTokenLimited: false,

        // Required implementations for LanguageModelV1
        async doGenerate(props: any) {
            console.log("Mock LLM doGenerate called with:", props);
            return {
                text: "This is a response from the language model.",
                toolCalls: []
            };
        },

        async doStream(props: any) {
            console.log("Mock LLM doStream called with:", props);
            if (props.onChunk) {
                const text = "This is a streamed response from the language model.";
                const chunks = text.split(" ");
                for (const chunk of chunks) {
                    await new Promise(resolve => setTimeout(resolve, 100));
                    props.onChunk(chunk + " ");
                }
            }
            return {
                text: "This is a streamed response from the language model.",
                toolCalls: []
            };
        },

        // Method required by Mastra Agent
        async generate(props: any) {
            return this.doGenerate(props);
        },

        // Method required by Mastra Agent
        async stream(props: any) {
            return this.doStream(props);
        }
    };
}

/**
 * Main function to demonstrate the integration
 */
async function main() {
    console.log("Starting integrated agents example...");

    try {
        // Create a compatible mock language model
        const mockModel = createCompatibleMockModel();

        // Create a memory implementation for our agent
        const memory = createMemory(10);

        // Create an Agent System
        const agentSystem = new AgentSystem({
            // We don't need to explicitly provide the actor system
            // as it's created internally by the AgentSystem constructor
            logging: true,
            statistics: true,
            defaultMastraConfig: {
                model: mockModel,
                instructions: "You are a helpful assistant."
            }
        });

        // Create a Mastra Agent via the Agent System
        const mastraAgentConfig: MastraAgentConfig = {
            name: "Mastra Agent",
            instructions: "You are a Mastra-based agent that can help with various tasks.",
            model: mockModel,
            enableCache: true,
            supervision: true
        };

        console.log("Creating Mastra Agent...");
        const mastraAgentPid = await agentSystem.createMastraAgent(mastraAgentConfig);
        console.log(`Created Mastra Agent with PID: ${mastraAgentPid.id}`);

        // Create a Bactor Agent via the Agent System
        const bactorAgentConfig: BactorAgentConfig = {
            name: "Bactor Agent",
            description: "A Bactor-based agent that works alongside Mastra agents",
            instructions: "You are a helpful assistant based on the Bactor framework.",
            model: mockModel,
            memory: memory, // Use our custom memory implementation
        };

        console.log("Creating Bactor Agent...");
        const bactorAgentPid = await agentSystem.createBactorAgent(bactorAgentConfig);
        console.log(`Created Bactor Agent with PID: ${bactorAgentPid.id}`);

        // Print statistics showing all created agents
        agentSystem.printStatistics();

        // Due to the complexity of real-time message exchange in a non-running example,
        // we'll log what an interaction would look like
        console.log("\nSimulated agent interaction:");
        console.log("1. User sends a message to the Mastra Agent");
        console.log("2. Mastra Agent processes the message using the Mastra framework");
        console.log("3. Mastra Agent can collaborate with Bactor Agent on complex tasks");
        console.log("4. Results are returned through the Agent System back to the user");

        // Cleanup
        console.log("\nShutting down agent system...");
        await agentSystem.shutdown();
        console.log("Agent system shut down successfully.");
    } catch (error) {
        console.error("Error in integrated agents example:", error);
    }
}

// Run the example
main().catch(error => {
    console.error("Error in main:", error);
}); 