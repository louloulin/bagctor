/**
 * Agent选择器单元测试
 * 测试自动Agent选择机制
 */

import { test, expect, describe, beforeEach } from 'bun:test';
import { AgentSelector, AgentType, AgentTask } from '../selector/agent_selector';
import { AssistantAgent } from '../agents/assistant_agent';
import { SkillAgent } from '../agents/skill_agent';
import { BaseAgent } from '../base_agent';
import { AbstractAgent } from '../agent/abstract_agent';

describe('Agent选择器测试', () => {
    let selector: AgentSelector;

    beforeEach(() => {
        // 创建新的选择器实例
        selector = new AgentSelector();
    });

    test('应能注册新的Agent类型', () => {
        // 注册两种不同类型的Agent
        const developerType: AgentType = {
            id: 'developer',
            name: '开发者Agent',
            description: '专注于编写和调试代码的Agent',
            agentClass: SkillAgent,
            defaultConfig: {
                role: 'skill_agent',
                parameters: {
                    language: 'typescript',
                    framework: 'react',
                    testFramework: 'jest'
                }
            },
            scoreForTask: (task: Task) => {
                if (task.type === 'coding' || task.type === 'debugging') {
                    return 0.9;
                }
                // 根据关键词匹配
                const keywordMatch = ['代码', '编程', '开发', 'bug', '错误', '函数'].some(
                    keyword => task.description.includes(keyword)
                );
                return keywordMatch ? 0.7 : 0.3;
            }
        };

        const assistantType: AgentType = {
            id: 'assistant',
            name: '通用助手Agent',
            description: '通用问答和信息检索的Agent',
            agentClass: AssistantAgent,
            defaultConfig: {
                role: 'assistant_agent',
                parameters: {
                    helpfulness: 0.9,
                    creativity: 0.7
                }
            },
            scoreForTask: (task: Task) => {
                if (task.type === 'qa' || task.type === 'information') {
                    return 0.9;
                }
                return 0.5; // 通用助手可以处理大多数任务
            }
        };

        // 注册Agent类型
        selector.registerAgentType(developerType);
        selector.registerAgentType(assistantType);

        // 检查是否成功注册
        const registeredTypes = selector.getRegisteredTypes();
        expect(registeredTypes.length).toBe(2);
        expect(registeredTypes.find(t => t.id === 'developer')).toBeDefined();
        expect(registeredTypes.find(t => t.id === 'assistant')).toBeDefined();
    });

    test('不能注册重复的Agent类型ID', () => {
        // 注册第一个类型
        const type1: AgentType = {
            id: 'duplicate_test',
            name: '测试Agent 1',
            description: '测试重复注册',
            agentClass: SkillAgent,
            defaultConfig: {
                role: 'skill_agent',
                parameters: {}
            },
            scoreForTask: () => 0.5
        };

        // 注册第二个带有相同ID的类型
        const type2: AgentType = {
            id: 'duplicate_test', // 重复的ID
            name: '测试Agent 2',
            description: '另一个测试重复注册',
            agentClass: AssistantAgent,
            defaultConfig: {
                role: 'assistant_agent',
                parameters: {}
            },
            scoreForTask: () => 0.6
        };

        // 第一次注册应成功
        const result1 = selector.registerAgentType(type1);
        expect(result1).toBe(true);

        // 第二次尝试注册相同ID应失败
        const result2 = selector.registerAgentType(type2);
        expect(result2).toBe(false);

        // 检查已注册的类型
        const registeredTypes = selector.getRegisteredTypes();
        expect(registeredTypes.length).toBe(1);
        expect(registeredTypes[0].name).toBe('测试Agent 1'); // 仍然是第一个注册的
    });

    test('应根据任务自动选择最合适的Agent', () => {
        // 注册不同类型的Agent
        const developerType: AgentType = {
            id: 'developer',
            name: '开发者Agent',
            description: '专注于编写和调试代码的Agent',
            agentClass: SkillAgent,
            defaultConfig: {
                role: 'skill_agent',
                parameters: {
                    language: 'typescript'
                }
            },
            scoreForTask: (task: Task) => {
                if (task.type === 'coding') return 0.9;
                return 0.3;
            }
        };

        const qaType: AgentType = {
            id: 'qa',
            name: '问答Agent',
            description: '专注于回答问题的Agent',
            agentClass: AssistantAgent,
            defaultConfig: {
                role: 'assistant_agent',
                parameters: {}
            },
            scoreForTask: (task: Task) => {
                if (task.type === 'qa') return 0.9;
                return 0.4;
            }
        };

        // 注册Agent类型
        selector.registerAgentType(developerType);
        selector.registerAgentType(qaType);

        // 测试编码任务
        const codingTask: Task = {
            id: 'task1',
            type: 'coding',
            description: '编写一个React组件',
            requirements: ['使用TypeScript', '遵循最佳实践']
        };

        const codingAgent = selector.selectAgentForTask(codingTask);
        expect(codingAgent).toBeDefined();
        expect(codingAgent!.type.id).toBe('developer');

        // 测试问答任务
        const qaTask: Task = {
            id: 'task2',
            type: 'qa',
            description: '什么是人工智能？',
            requirements: []
        };

        const qaAgent = selector.selectAgentForTask(qaTask);
        expect(qaAgent).toBeDefined();
        expect(qaAgent!.type.id).toBe('qa');
    });

    test('应返回得分最高的Agent，即使多个符合条件', () => {
        // 注册三种类型的Agent，都适合某个任务但得分不同
        const type1: AgentType = {
            id: 'type1',
            name: '类型1',
            description: '测试Agent 1',
            agentClass: SkillAgent,
            defaultConfig: {
                role: 'skill_agent',
                parameters: {}
            },
            scoreForTask: (task: Task) => {
                if (task.type === 'test_multi') return 0.7;
                return 0.3;
            }
        };

        const type2: AgentType = {
            id: 'type2',
            name: '类型2',
            description: '测试Agent 2',
            agentClass: SkillAgent,
            defaultConfig: {
                role: 'skill_agent',
                parameters: {}
            },
            scoreForTask: (task: Task) => {
                if (task.type === 'test_multi') return 0.9; // 最高得分
                return 0.3;
            }
        };

        const type3: AgentType = {
            id: 'type3',
            name: '类型3',
            description: '测试Agent 3',
            agentClass: AssistantAgent,
            defaultConfig: {
                role: 'assistant_agent',
                parameters: {}
            },
            scoreForTask: (task: Task) => {
                if (task.type === 'test_multi') return 0.8;
                return 0.3;
            }
        };

        // 注册所有类型
        selector.registerAgentType(type1);
        selector.registerAgentType(type2);
        selector.registerAgentType(type3);

        // 创建测试任务
        const multiTask: Task = {
            id: 'multi_task',
            type: 'test_multi',
            description: '测试多个Agent评分',
            requirements: []
        };

        // 选择Agent
        const selectedAgent = selector.selectAgentForTask(multiTask);

        // 验证选择了得分最高的Agent
        expect(selectedAgent).toBeDefined();
        expect(selectedAgent!.type.id).toBe('type2'); // 应该选择得分最高的type2
    });

    test('如果没有合适的Agent，应返回undefined', () => {
        // 注册一个只对特定任务类型适用的Agent
        const specificType: AgentType = {
            id: 'specific',
            name: '特定Agent',
            description: '只处理特定任务',
            agentClass: SkillAgent,
            defaultConfig: {
                role: 'skill_agent',
                parameters: {}
            },
            scoreForTask: (task: Task) => {
                // 只对'specific_task'类型评分高
                if (task.type === 'specific_task') return 0.8;
                return 0.1; // 对其他任务评分很低
            }
        };

        selector.registerAgentType(specificType);

        // 创建一个不匹配的任务
        const unmatchedTask: Task = {
            id: 'unmatched',
            type: 'unknown_type',
            description: '这个任务没有合适的Agent',
            requirements: []
        };

        // 设置最低得分阈值
        selector.setMinimumScoreThreshold(0.5);

        // 尝试选择Agent
        const selectedAgent = selector.selectAgentForTask(unmatchedTask);

        // 验证没有选择任何Agent
        expect(selectedAgent).toBeUndefined();
    });

    test('应能实例化选定的Agent', () => {
        // 注册Agent类型
        const testType: AgentType = {
            id: 'test_instantiation',
            name: '测试实例化',
            description: '测试Agent实例化',
            agentClass: SkillAgent,
            defaultConfig: {
                role: 'skill_agent',
                parameters: {
                    skill: 'testing'
                }
            },
            scoreForTask: () => 0.9 // 高分，确保被选中
        };

        selector.registerAgentType(testType);

        // 创建任务
        const task: Task = {
            id: 'instantiation_task',
            type: 'test',
            description: '测试Agent实例化',
            requirements: []
        };

        // 选择并实例化Agent
        const selection = selector.selectAgentForTask(task);
        expect(selection).toBeDefined();

        const agent = selection!.instantiate();

        // 验证实例化的Agent
        expect(agent).toBeInstanceOf(SkillAgent);
        expect((agent as SkillAgent).config).toEqual(testType.defaultConfig);
    });

    test('应能自定义Agent配置参数', () => {
        // 注册Agent类型
        const configType: AgentType = {
            id: 'configurable',
            name: '可配置Agent',
            description: '测试自定义配置',
            agentClass: SkillAgent,
            defaultConfig: {
                role: 'skill_agent',
                parameters: {
                    defaultParam: 'default'
                }
            },
            scoreForTask: () => 0.9
        };

        selector.registerAgentType(configType);

        // 创建任务
        const task: Task = {
            id: 'config_task',
            type: 'test',
            description: '测试自定义配置',
            requirements: []
        };

        // 选择Agent
        const selection = selector.selectAgentForTask(task);
        expect(selection).toBeDefined();

        // 使用自定义配置实例化
        const customConfig = {
            role: 'skill_agent',
            parameters: {
                defaultParam: 'custom',
                additionalParam: 'added'
            }
        };

        const agent = selection!.instantiate(customConfig);

        // 验证配置已被自定义
        expect((agent as SkillAgent).config.parameters.defaultParam).toBe('custom');
        expect((agent as SkillAgent).config.parameters.additionalParam).toBe('added');
    });
}); 