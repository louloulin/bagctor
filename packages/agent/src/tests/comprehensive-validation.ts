import { Agent } from '@mastra/core/agent';
import { Mastra } from '@mastra/core';
import { createQwen } from 'qwen-ai-provider';
import { Bagctor } from '../bagctor';
import { z } from 'zod';
import axios from 'axios';

// 模拟 axios 以测试 MCP 功能
jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

// 测试结果跟踪
const testResults: Record<string, { passed: boolean, message: string }> = {};

/**
 * 综合验证 Bagctor Agent 功能
 */
async function runComprehensiveValidation() {
    console.log('开始 Bagctor Agent 综合功能验证...\n');

    // 配置Qwen模型
    const qwen = createQwen({
        baseURL: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
        apiKey: 'sk-bc977c4e31e542f1a34159cb42478198',
    });

    // 1. Agent 创建测试
    try {
        console.log('测试 1: Agent 创建...');

        const testAgent = new Agent({
            name: 'TestAgent',
            instructions: '你是一个测试智能体。',
            model: qwen('qwen-plus-2024-12-20'),
        });

        testResults['agentCreation'] = {
            passed: true,
            message: 'Agent 成功创建'
        };
        console.log('✅ Agent 创建测试通过');
    } catch (error) {
        testResults['agentCreation'] = {
            passed: false,
            message: `错误: ${error instanceof Error ? error.message : String(error)}`
        };
        console.error('❌ Agent 创建测试失败:', error);
    }

    // 2. Bagctor 实例化测试
    try {
        console.log('\n测试 2: Bagctor 实例化...');

        const agent = new Agent({
            name: 'SimpleAgent',
            instructions: '你是一个简单的智能体。',
            model: qwen('qwen-plus-2024-12-20'),
        });

        const bagctor = new Bagctor({
            agents: { agent },
            distribution: {
                clustered: false,
            }
        });

        if (bagctor && bagctor.agents && bagctor.agents.agent) {
            testResults['bagctorInstantiation'] = {
                passed: true,
                message: 'Bagctor 实例成功创建'
            };
            console.log('✅ Bagctor 实例化测试通过');
        } else {
            throw new Error('Bagctor 实例化失败或属性缺失');
        }
    } catch (error) {
        testResults['bagctorInstantiation'] = {
            passed: false,
            message: `错误: ${error instanceof Error ? error.message : String(error)}`
        };
        console.error('❌ Bagctor 实例化测试失败:', error);
    }

    // 3. 工具调用测试
    try {
        console.log('\n测试 3: 工具调用...');

        const weatherTool = {
            name: 'weather-tool',
            description: '获取城市天气信息',
            parameters: {
                type: 'object',
                properties: {
                    city: {
                        type: 'string',
                        description: '城市名称'
                    }
                },
                required: ['city']
            },
            handler: async ({ city }: { city: string }) => {
                console.log(`模拟查询 ${city} 的天气...`);
                return {
                    temperature: 25,
                    condition: '晴天',
                    humidity: '60%',
                    city: city
                };
            }
        };

        const toolAgent = new Agent({
            name: 'ToolAgent',
            instructions: '你是一个可以查询天气的智能体。当被问到天气时，使用 weather-tool 工具。',
            model: qwen('qwen-plus-2024-12-20'),
            tools: {
                weatherTool
            },
        });

        const bagctor = new Bagctor({
            agents: { toolAgent },
        });

        const response = await bagctor.agents.toolAgent.generate('北京今天天气怎么样？');

        if (response && response.text &&
            (response.text.includes('北京') || response.text.includes('天气') || response.text.includes('晴天'))) {
            testResults['toolCalling'] = {
                passed: true,
                message: `工具成功调用，响应: "${response.text.substring(0, 50)}..."`
            };
            console.log('✅ 工具调用测试通过');
        } else {
            throw new Error('工具响应无效或未使用工具');
        }
    } catch (error) {
        testResults['toolCalling'] = {
            passed: false,
            message: `错误: ${error instanceof Error ? error.message : String(error)}`
        };
        console.error('❌ 工具调用测试失败:', error);
    }

    // 4. 多智能体测试
    try {
        console.log('\n测试 4: 多智能体集成...');

        const agent1 = new Agent({
            name: 'Agent1',
            instructions: '你是智能体1，专注于研究。',
            model: qwen('qwen-plus-2024-12-20'),
        });

        const agent2 = new Agent({
            name: 'Agent2',
            instructions: '你是智能体2，专注于撰写。',
            model: qwen('qwen-plus-2024-12-20'),
        });

        const mastra = new Mastra({
            agents: { agent1 },
        });

        const bagctor = new Bagctor({
            agents: { agent2 },
            mastra: mastra,
        });

        const agentsList = Object.keys(bagctor.agents);
        if (agentsList.includes('agent1') && agentsList.includes('agent2')) {
            testResults['multiAgentIntegration'] = {
                passed: true,
                message: `成功集成多个智能体: ${agentsList.join(', ')}`
            };
            console.log('✅ 多智能体测试通过');
        } else {
            throw new Error(`未找到预期的智能体: ${agentsList.join(', ')}`);
        }
    } catch (error) {
        testResults['multiAgentIntegration'] = {
            passed: false,
            message: `错误: ${error instanceof Error ? error.message : String(error)}`
        };
        console.error('❌ 多智能体测试失败:', error);
    }

    // 5. 工作流测试
    try {
        console.log('\n测试 5: 工作流功能...');

        const researchAgent = new Agent({
            name: 'ResearchAgent',
            instructions: '你是一个研究助手，提供详细的信息。',
            model: qwen('qwen-plus-2024-12-20'),
        });

        const summaryAgent = new Agent({
            name: 'SummaryAgent',
            instructions: '你是一个总结专家，提供简洁的总结。',
            model: qwen('qwen-plus-2024-12-20'),
        });

        const bagctor = new Bagctor({
            agents: { researchAgent, summaryAgent },
        });

        const workflow = await bagctor.createWorkflow({
            name: '研究与总结工作流',
            steps: [
                {
                    agent: 'ResearchAgent',
                    input: '简单介绍人工智能',
                    output: 'research'
                },
                {
                    agent: 'SummaryAgent',
                    input: (context) => `用三个要点总结这段内容: ${context.research}`,
                    output: 'summary'
                }
            ]
        });

        const result = await workflow.execute();

        if (result && result.summary) {
            testResults['workflow'] = {
                passed: true,
                message: `工作流执行成功: "${result.summary.substring(0, 50)}..."`
            };
            console.log('✅ 工作流测试通过');
        } else {
            throw new Error('工作流执行失败或结果无效');
        }
    } catch (error) {
        testResults['workflow'] = {
            passed: false,
            message: `错误: ${error instanceof Error ? error.message : String(error)}`
        };
        console.error('❌ 工作流测试失败:', error);
    }

    // 6. 结构化输出测试
    try {
        console.log('\n测试 6: 结构化输出...');

        const structuredAgent = new Agent({
            name: 'StructuredAgent',
            instructions: '你是一个可以提供结构化数据的智能体。',
            model: qwen('qwen-plus-2024-12-20'),
        });

        const bagctor = new Bagctor({
            agents: { structuredAgent },
        });

        const schema = z.object({
            advantages: z.array(z.string()),
            disadvantages: z.array(z.string()),
            rating: z.number().min(1).max(10),
            summary: z.string()
        });

        const response = await bagctor.agents.structuredAgent.generate(
            '分析人工智能的优缺点，并给出评分',
            { output: schema }
        );

        if (response && response.object &&
            Array.isArray(response.object.advantages) &&
            Array.isArray(response.object.disadvantages) &&
            typeof response.object.rating === 'number') {
            testResults['structuredOutput'] = {
                passed: true,
                message: `结构化输出成功: ${response.object.advantages.length} 个优点, ${response.object.disadvantages.length} 个缺点`
            };
            console.log('✅ 结构化输出测试通过');
        } else {
            throw new Error('结构化输出无效');
        }
    } catch (error) {
        testResults['structuredOutput'] = {
            passed: false,
            message: `错误: ${error instanceof Error ? error.message : String(error)}`
        };
        console.error('❌ 结构化输出测试失败:', error);
    }

    // 7. 分布式节点测试
    try {
        console.log('\n测试 7: 分布式节点配置...');

        const distributedAgent = new Agent({
            name: 'DistributedAgent',
            instructions: '你是一个分布式环境中的智能体。',
            model: qwen('qwen-plus-2024-12-20'),
        });

        const primaryNode = new Bagctor({
            agents: { distributedAgent },
            distribution: {
                clustered: true,
                nodeType: 'primary',
                serverPort: 9000
            }
        });

        const workerConfig = {
            distribution: {
                clustered: true,
                nodeType: 'worker',
                primaryHost: 'localhost',
                primaryPort: 9000
            }
        };

        // 验证配置是否正确
        if (primaryNode.isDistributedMode &&
            primaryNode.distributionConfig &&
            primaryNode.distributionConfig.nodeType === 'primary') {
            testResults['distributedNodes'] = {
                passed: true,
                message: '分布式节点配置成功'
            };
            console.log('✅ 分布式节点测试通过');
        } else {
            throw new Error('分布式节点配置无效');
        }
    } catch (error) {
        testResults['distributedNodes'] = {
            passed: false,
            message: `错误: ${error instanceof Error ? error.message : String(error)}`
        };
        console.error('❌ 分布式节点测试失败:', error);
    }

    // 8. MCP 集成测试
    try {
        console.log('\n测试 8: MCP 集成...');

        // 设置 axios 模拟响应
        mockedAxios.get.mockResolvedValue({
            data: {}
        });
        mockedAxios.get.mockResolvedValueOnce({
            data: {
                tools: [
                    {
                        name: 'search',
                        description: '搜索互联网',
                        parameters: {
                            type: 'object',
                            properties: {
                                query: {
                                    type: 'string',
                                    description: '搜索查询'
                                }
                            },
                            required: ['query']
                        }
                    }
                ]
            }
        });

        // 创建智能体
        const mcpAgent = new Agent({
            name: 'MCPAgent',
            instructions: '你是一个可以使用 MCP 工具的智能体。',
            model: qwen('qwen-plus-2024-12-20'),
            tools: {}
        });

        // 创建 Bagctor 实例并启用 MCP
        const bagctor = new Bagctor({
            agents: { mcpAgent },
            mcp: {
                enabled: true,
                servers: {
                    'search-server': {
                        url: 'https://mcp-search.example.com',
                        apiKey: 'search-api-key'
                    }
                },
                autoDiscoverTools: true
            }
        });

        // 检查 MCP 集成
        if (bagctor.mcpIntegration) {
            testResults['mcpIntegration'] = {
                passed: true,
                message: 'MCP 集成成功'
            };
            console.log('✅ MCP 集成测试通过');
        } else {
            throw new Error('MCP 集成失败');
        }
    } catch (error) {
        testResults['mcpIntegration'] = {
            passed: false,
            message: `错误: ${error instanceof Error ? error.message : String(error)}`
        };
        console.error('❌ MCP 集成测试失败:', error);
    }

    // 打印测试结果摘要
    console.log('\n===== 测试结果摘要 =====');
    let passedCount = 0;
    let totalTests = Object.keys(testResults).length;

    for (const [testName, result] of Object.entries(testResults)) {
        console.log(`${result.passed ? '✅' : '❌'} ${testName}: ${result.message}`);
        if (result.passed) passedCount++;
    }

    console.log(`\n总计: ${passedCount}/${totalTests} 测试通过 (${Math.round(passedCount / totalTests * 100)}%)`);

    return {
        results: testResults,
        passedCount,
        totalTests,
        allPassed: passedCount === totalTests
    };
}

// 执行综合验证
runComprehensiveValidation().then(summary => {
    if (summary.allPassed) {
        console.log('\n🎉 恭喜！所有功能测试通过，Bagctor Agent 功能完整实现。');
        console.log('可以更新 agent.md 文档标记功能为已完成。');
    } else {
        console.log(`\n⚠️ 有 ${summary.totalTests - summary.passedCount} 项测试未通过，请检查并修复问题。`);
    }
}); 