import { Agent } from '@mastra/core/agent';
import { Mastra } from '@mastra/core';
import { createQwen } from 'qwen-ai-provider';
import { Bagctor } from '../bagctor';
import { z } from 'zod';
import { MCPClient, MCPIntegrationManager } from '../mcp';
import axios from 'axios';

// 模拟 axios 以测试 MCP 功能
jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

/**
 * MCP 集成验证测试
 * 验证 Bagctor 与 MCP (Model Context Protocol) 的集成
 */
async function testMCPIntegration() {
    console.log('开始 Bagctor 的 MCP 集成验证测试...\n');

    // 记录测试结果
    const testResults: Record<string, { passed: boolean; message: string }> = {};

    // 配置 Qwen 模型
    const qwen = createQwen({
        baseURL: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
        apiKey: 'sk-bc977c4e31e542f1a34159cb42478198', // 测试用 API 密钥
    });

    // 1. MCP 客户端测试
    try {
        console.log('测试 1: MCP 客户端连接...');

        // 设置 axios 模拟响应
        mockedAxios.get.mockResolvedValueOnce({
            data: {
                name: 'MCP 测试服务器',
                description: '用于测试的 MCP 服务器',
                version: '1.0.0',
                servers: ['server1', 'server2']
            },
        });

        const mcpClient = new MCPClient({
            registryUrl: 'https://mcp.run/mcp.json',
            apiKey: 'test-api-key'
        });

        const directory = await mcpClient.connectToRegistry();

        if (directory && directory.servers && directory.servers.length === 2) {
            testResults['mcpClient'] = {
                passed: true,
                message: 'MCP 客户端成功连接到注册表'
            };
            console.log('✅ MCP 客户端测试通过');
        } else {
            throw new Error('MCP 客户端连接失败');
        }
    } catch (error) {
        testResults['mcpClient'] = {
            passed: false,
            message: `错误: ${error instanceof Error ? error.message : String(error)}`
        };
        console.error('❌ MCP 客户端测试失败:', error);
    }

    // 2. MCP 工具发现测试
    try {
        console.log('\n测试 2: MCP 工具发现...');

        // 设置 axios 模拟响应
        mockedAxios.get.mockResolvedValueOnce({
            data: {
                tools: [
                    {
                        name: 'weather',
                        description: '查询天气信息',
                        parameters: {
                            type: 'object',
                            properties: {
                                city: {
                                    type: 'string',
                                    description: '城市名称'
                                }
                            },
                            required: ['city']
                        }
                    },
                    {
                        name: 'calculator',
                        description: '执行数学计算',
                        parameters: {
                            type: 'object',
                            properties: {
                                expression: {
                                    type: 'string',
                                    description: '数学表达式'
                                }
                            },
                            required: ['expression']
                        }
                    }
                ]
            }
        });

        const mcpClient = new MCPClient({
            serverUrl: 'https://mcp-server.example.com',
            apiKey: 'test-api-key'
        });

        await mcpClient.connectToServer();
        const tools = await mcpClient.discoverTools();

        if (tools && tools.length === 2 && tools.some(t => t.name === 'weather') && tools.some(t => t.name === 'calculator')) {
            testResults['mcpToolDiscovery'] = {
                passed: true,
                message: `成功发现 ${tools.length} 个 MCP 工具`
            };
            console.log('✅ MCP 工具发现测试通过');
        } else {
            throw new Error('MCP 工具发现失败');
        }
    } catch (error) {
        testResults['mcpToolDiscovery'] = {
            passed: false,
            message: `错误: ${error instanceof Error ? error.message : String(error)}`
        };
        console.error('❌ MCP 工具发现测试失败:', error);
    }

    // 3. MCP 集成到 Bagctor 测试
    try {
        console.log('\n测试 3: MCP 集成到 Bagctor...');

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
        const agent = new Agent({
            name: 'TestAgent',
            instructions: '你是一个测试智能体。',
            model: qwen('qwen-plus-2024-12-20'),
        });

        // 创建 Bagctor 实例并启用 MCP
        const bagctor = new Bagctor({
            agents: { agent },
            mcp: {
                enabled: true,
                servers: {
                    'test-server': {
                        url: 'https://mcp-server.example.com',
                        apiKey: 'test-api-key'
                    }
                },
                autoDiscoverTools: true
            }
        });

        // 检查 MCP 集成是否成功
        if (bagctor.mcpIntegration) {
            testResults['mcpBagctorIntegration'] = {
                passed: true,
                message: 'MCP 成功集成到 Bagctor'
            };
            console.log('✅ MCP 集成到 Bagctor 测试通过');
        } else {
            throw new Error('MCP 未成功集成到 Bagctor');
        }
    } catch (error) {
        testResults['mcpBagctorIntegration'] = {
            passed: false,
            message: `错误: ${error instanceof Error ? error.message : String(error)}`
        };
        console.error('❌ MCP 集成到 Bagctor 测试失败:', error);
    }

    // 4. 手动启用 MCP 测试
    try {
        console.log('\n测试 4: 手动启用 MCP...');

        // 设置 axios 模拟响应
        mockedAxios.get.mockResolvedValue({
            data: {}
        });
        mockedAxios.get.mockResolvedValueOnce({
            data: {
                tools: [
                    {
                        name: 'translator',
                        description: '翻译文本',
                        parameters: {
                            type: 'object',
                            properties: {
                                text: {
                                    type: 'string',
                                    description: '要翻译的文本'
                                },
                                targetLanguage: {
                                    type: 'string',
                                    description: '目标语言'
                                }
                            },
                            required: ['text', 'targetLanguage']
                        }
                    }
                ]
            }
        });

        // 创建智能体
        const agent = new Agent({
            name: 'TestAgent',
            instructions: '你是一个测试智能体。',
            model: qwen('qwen-plus-2024-12-20'),
        });

        // 创建 Bagctor 实例
        const bagctor = new Bagctor({
            agents: { agent }
        });

        // 手动启用 MCP
        await bagctor.enableMCP({
            enabled: true,
            servers: {
                'translation-service': {
                    url: 'https://translation-mcp.example.com',
                    apiKey: 'translation-api-key'
                }
            },
            autoDiscoverTools: false
        });

        // 验证 MCP 启用成功
        if (bagctor.mcpIntegration) {
            testResults['mcpManualEnable'] = {
                passed: true,
                message: 'MCP 成功手动启用'
            };
            console.log('✅ 手动启用 MCP 测试通过');
        } else {
            throw new Error('手动启用 MCP 失败');
        }
    } catch (error) {
        testResults['mcpManualEnable'] = {
            passed: false,
            message: `错误: ${error instanceof Error ? error.message : String(error)}`
        };
        console.error('❌ 手动启用 MCP 测试失败:', error);
    }

    // 5. 注册 MCP 工具到智能体测试
    try {
        console.log('\n测试 5: 注册 MCP 工具到智能体...');

        // 设置 axios 模拟响应
        mockedAxios.get.mockResolvedValue({
            data: {}
        });
        mockedAxios.get.mockResolvedValueOnce({
            data: {
                tools: [
                    {
                        name: 'imageGenerator',
                        description: '生成图像',
                        parameters: {
                            type: 'object',
                            properties: {
                                prompt: {
                                    type: 'string',
                                    description: '图像描述'
                                }
                            },
                            required: ['prompt']
                        }
                    }
                ]
            }
        });

        // 创建智能体
        const agent = new Agent({
            name: 'TestAgent',
            instructions: '你是一个测试智能体。',
            model: qwen('qwen-plus-2024-12-20'),
            tools: {}
        });

        // 创建 Bagctor 实例并启用 MCP
        const bagctor = new Bagctor({
            agents: { agent },
            mcp: {
                enabled: true,
                servers: {
                    'image-service': {
                        url: 'https://image-mcp.example.com',
                        apiKey: 'image-api-key'
                    }
                },
                autoDiscoverTools: false
            }
        });

        // 手动注册 MCP 工具到智能体
        const registeredTools = await bagctor.registerMCPToolsToAgent('TestAgent');

        if (registeredTools && registeredTools.length > 0) {
            testResults['mcpToolRegistration'] = {
                passed: true,
                message: `成功注册 ${registeredTools.length} 个 MCP 工具到智能体`
            };
            console.log('✅ 注册 MCP 工具到智能体测试通过');
        } else {
            throw new Error('注册 MCP 工具到智能体失败');
        }
    } catch (error) {
        testResults['mcpToolRegistration'] = {
            passed: false,
            message: `错误: ${error instanceof Error ? error.message : String(error)}`
        };
        console.error('❌ 注册 MCP 工具到智能体测试失败:', error);
    }

    // 打印测试结果摘要
    console.log('\n===== MCP 集成测试结果摘要 =====');
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

// 执行测试
testMCPIntegration().then(summary => {
    if (summary.allPassed) {
        console.log('\n🎉 恭喜！MCP 集成功能测试全部通过。');
    } else {
        console.log(`\n⚠️ 有 ${summary.totalTests - summary.passedCount} 项 MCP 测试未通过，请检查问题。`);
    }
}); 