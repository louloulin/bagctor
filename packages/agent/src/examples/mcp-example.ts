import { Agent } from '@mastra/core/agent';
import { createQwen } from 'qwen-ai-provider';
import { Bagctor } from '../bagctor';
import * as dotenv from 'dotenv';

// 加载环境变量
dotenv.config();

/**
 * Bagctor MCP 集成示例
 * 演示如何使用 MCP (Model Context Protocol) 集成外部工具
 */
async function runMCPExample() {
    console.log('启动 Bagctor MCP 集成示例...\n');

    // 确保有API密钥
    if (!process.env.QWEN_API_KEY) {
        console.error('错误: 缺少环境变量 QWEN_API_KEY');
        console.log('请创建 .env 文件并添加 QWEN_API_KEY=your_key_here');
        return;
    }

    try {
        // 配置Qwen模型
        const qwen = createQwen({
            baseURL: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
            apiKey: process.env.QWEN_API_KEY,
        });

        // 创建一个助手智能体
        console.log('创建智能体...');
        const assistant = new Agent({
            name: 'AssistantAgent',
            instructions: `你是一个多功能助手，能够利用各种外部工具帮助用户。
利用可用的工具完成任务，提供详细、准确的信息。`,
            model: qwen('qwen-plus-2024-12-20'),
            tools: {} // 初始为空，稍后将通过 MCP 添加工具
        });

        // 创建 Bagctor 实例并集成 MCP
        console.log('创建 Bagctor 实例并配置 MCP...');
        const bagctor = new Bagctor({
            agents: { assistant },
            // 配置 MCP 集成
            mcp: {
                enabled: true,
                // 可以连接到一个或多个 MCP 服务器
                servers: {
                    // 使用 opentools.com 的搜索工具
                    'opentools': {
                        url: 'https://api.opentools.com/mcp',
                        apiKey: process.env.OPENTOOLS_API_KEY || 'demo-key'
                    },
                    // 使用 mcp.run 的翻译工具
                    'mcprun': {
                        url: 'https://mcp.run/api',
                        apiKey: process.env.MCPRUN_API_KEY || 'demo-key'
                    }
                },
                // 自动发现并注册所有可用工具
                autoDiscoverTools: true
            }
        });

        // 打印可用 MCP 工具
        console.log('\n检查可用的 MCP 工具...');
        if (bagctor.mcpIntegration) {
            const availableTools = await bagctor.mcpIntegration.getAvailableTools();
            console.log(`发现 ${Object.keys(availableTools).length} 个 MCP 工具:`);

            for (const [toolId, tool] of Object.entries(availableTools)) {
                console.log(`- ${toolId}: ${tool.description}`);
            }
        } else {
            console.log('MCP 集成未成功初始化');
        }

        // 使用智能体（会自动使用已注册的 MCP 工具）
        console.log('\n使用集成了 MCP 工具的智能体...');

        // 模拟几个使用 MCP 工具的请求
        const queries = [
            '帮我在网上搜索关于人工智能的最新研究',
            '将这段英文翻译成中文：Artificial Intelligence is transforming our world.',
            '查询一下上海的天气如何？'
        ];

        for (const query of queries) {
            console.log(`\n问题: ${query}`);
            console.log('正在处理...');

            const response = await bagctor.agents.assistant.generate(query);
            console.log(`回答:\n${response.text}\n`);
            console.log('-'.repeat(50));
        }

        // 手动注册特定 MCP 工具到智能体
        console.log('\n手动注册特定 MCP 工具到智能体...');

        // 假设我们想要只注册图像生成工具
        if (bagctor.mcpIntegration) {
            const imageToolIds = Object.keys(await bagctor.mcpIntegration.getAvailableTools())
                .filter(id => id.includes('image') || id.includes('picture'));

            if (imageToolIds.length > 0) {
                console.log(`找到 ${imageToolIds.length} 个图像相关工具，注册到智能体...`);
                await bagctor.registerMCPToolsToAgent('assistant', imageToolIds);

                // 使用图像生成工具
                const imageQuery = '生成一幅描绘未来城市的图像';
                console.log(`\n问题: ${imageQuery}`);
                const response = await bagctor.agents.assistant.generate(imageQuery);
                console.log(`回答:\n${response.text}\n`);
            } else {
                console.log('未找到图像相关工具');
            }
        }

        console.log('\nMCP 集成示例完成！');
    } catch (error) {
        console.error('示例执行过程中发生错误:', error);
    }
}

// 运行示例
runMCPExample().catch(console.error); 