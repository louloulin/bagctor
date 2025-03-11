/**
 * Agent selection test - simplified version
 */
import { test, expect, describe, beforeEach } from 'bun:test';
import { AgentSelector } from '../selector/agent_selector';
import { AgentSystem } from '../agent_system';
import { SkillAgent } from '../agents/skill_agent';
import { AssistantAgent } from '../agents/assistant_agent';

// Mock the agent system to avoid creating actual agents
class MockAgentSystem {
    async createAgent(): Promise<string> {
        return 'mock-pid';
    }
}

describe('Agent Selection', () => {
    let mockAgentSystem: MockAgentSystem;
    let selector: AgentSelector;

    beforeEach(() => {
        mockAgentSystem = new MockAgentSystem();
        // @ts-ignore - Using mock agent system
        selector = new AgentSelector(mockAgentSystem);
    });

    test('should score agents correctly for tasks', () => {
        // Register a developer agent type
        selector.registerAgentType({
            name: 'developer',
            description: '专注于编写和调试代码的Agent',
            agentClass: SkillAgent,
            taskTypes: ['coding', 'debugging'],
            capabilities: ['typescript', 'debugging'],
            defaultConfig: {
                role: 'skill_agent',
                capabilities: ['coding', 'debugging'],
                parameters: {
                    language: 'typescript',
                    framework: 'react',
                    testFramework: 'jest'
                }
            },
            scoreForTask: (task) => {
                if (task.type === 'coding') return 0.9;
                return 0.3;
            }
        });

        selector.registerAgentType({
            name: 'assistant',
            description: '通用助手Agent',
            agentClass: AssistantAgent,
            taskTypes: ['general', 'conversation'],
            capabilities: ['conversation', 'general_help'],
            defaultConfig: {
                role: 'assistant_agent',
                capabilities: ['conversation', 'general_help'],
                parameters: {
                    helpfulness: 0.9,
                    creativity: 0.7
                }
            },
            scoreForTask: (task) => {
                if (task.type === 'general') return 0.9;
                return 0.5;
            }
        });

        // Create tasks
        const codingTask = {
            id: 'task1',
            type: 'coding',
            description: '编写一个React组件',
            requirements: ['使用TypeScript'],
            input: {
                requirements: ['使用TypeScript'],
                framework: 'react'
            }
        };

        const generalTask = {
            id: 'task2',
            type: 'general',
            description: '解释什么是人工智能',
            requirements: [],
            input: {
                context: '面向初学者的解释'
            }
        };

        // Get all agent types
        const agentTypes = selector.getAgentTypes();

        // Test scoring for coding task
        const codingScores = agentTypes.map(type => ({
            name: type.name,
            score: type.scoreForTask(codingTask)
        }));

        // Verify developer scores higher for coding
        const developerScore = codingScores.find(s => s.name === 'developer')?.score || 0;
        const assistantScoreForCoding = codingScores.find(s => s.name === 'assistant')?.score || 0;
        expect(developerScore).toBeGreaterThan(assistantScoreForCoding);

        // Test scoring for general task
        const generalScores = agentTypes.map(type => ({
            name: type.name,
            score: type.scoreForTask(generalTask)
        }));

        // Verify assistant scores higher for general tasks
        const assistantScore = generalScores.find(s => s.name === 'assistant')?.score || 0;
        const developerScoreForGeneral = generalScores.find(s => s.name === 'developer')?.score || 0;
        expect(assistantScore).toBeGreaterThan(developerScoreForGeneral);
    });

    test('should return null when no suitable agent is found', async () => {
        // Create a task with no matching agent
        const unmatchedTask = {
            id: 'task3',
            type: 'unknown_type',
            description: '一个没有匹配Agent的任务',
            requirements: [],
            input: {}
        };

        // Try to select an agent
        const result = await selector.selectAgentForTask(unmatchedTask);

        // Verify no agent was selected
        expect(result).toBeNull();
    });
}); 