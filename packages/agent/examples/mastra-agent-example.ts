/**
 * Mastra Agent与Bactor集成示例
 * 
 * 这个示例演示了如何使用Mastra Agent与Bactor框架集成，
 * 实现了计算器工具的调用和缓存优化。
 */

import { ActorSystem } from '@bactor/core';
import { createMastraAgentActor, MastraAgentConfig, MastraAgentMessageType } from '../src/bactor';
import { OpenAILanguageModel } from '@mastra/core/llm';
import { createTool } from '@mastra/core/tools';
import * as dotenv from 'dotenv';

// 加载环境变量
dotenv.config();

/**
 * 格式化日志输出
 */
function log(message: string, type: 'info' | 'success' | 'error' | 'warn' = 'info') {
    const colors = {
        info: '\x1b[36m',    // 青色
        success: '\x1b[32m', // 绿色
        error: '\x1b[31m',   // 红色
        warn: '\x1b[33m',    // 黄色
        reset: '\x1b[0m'     // 重置
    };

    console.log(`${colors[type]}[${type.toUpperCase()}] ${message}${colors.reset}`);
}

async function main() {
    // 创建Actor系统
    const system = new ActorSystem();
    log('Actor系统已创建');

    try {
        // 创建OpenAI语言模型
        const model = new OpenAILanguageModel({
            apiKey: process.env.OPENAI_API_KEY,
            model: 'gpt-4-turbo'
        });
        log('已配置OpenAI语言模型');

        // 创建计算器工具
        const calculatorTool = createTool({
            name: 'calculator',
            description: 'Perform mathematical calculations',
            parameters: {
                operation: {
                    type: 'string',
                    description: 'Mathematical operation: add, subtract, multiply, divide',
                    enum: ['add', 'subtract', 'multiply', 'divide']
                },
                a: {
                    type: 'number',
                    description: 'First operand'
                },
                b: {
                    type: 'number',
                    description: 'Second operand'
                }
            },
            handler: async ({ operation, a, b }) => {
                log(`执行计算: ${a} ${operation} ${b}`, 'info');

                // 模拟计算延迟
                await new Promise(resolve => setTimeout(resolve, 500));

                switch (operation) {
                    case 'add': return { result: a + b };
                    case 'subtract': return { result: a - b };
                    case 'multiply': return { result: a * b };
                    case 'divide':
                        if (b === 0) throw new Error('除数不能为零');
                        return { result: a / b };
                    default: throw new Error(`未知操作: ${operation}`);
                }
            }
        });
        log('已创建计算器工具');

        // 创建Mastra Agent配置
        const agentConfig: MastraAgentConfig = {
            name: 'Math Assistant',
            description: 'A helpful assistant that can perform mathematical calculations',
            instructions: 'You are a math assistant that can perform calculations using the calculator tool. Always show your work and explain the steps.',
            model: model,
            tools: {
                calculator: calculatorTool
            },
            // 启用缓存以提高性能
            enableCache: true,
            cacheTTL: 5 * 60 * 1000, // 5分钟缓存
            supervision: true // 启用错误监督
        };
        log('已创建Agent配置');

        // 创建MastraAgentActor
        const agentPid = await createMastraAgentActor(system, agentConfig);
        log('已创建MastraAgent Actor', 'success');

        // 定义测试案例
        const testQueries = [
            'What is 135 * 28?',
            'If I have 520 dollars and spend 175 dollars, how much do I have left?',
            'What is 1024 divided by 32?',
            // 重复查询用于测试缓存
            'What is 135 * 28?'
        ];

        // 依次处理查询
        for (const [index, query] of testQueries.entries()) {
            log(`\n查询 ${index + 1}/${testQueries.length}: "${query}"`, 'info');
            const startTime = Date.now();

            try {
                // 使用cacheKey进行缓存
                const cacheKey = `query-${query}`;

                // 发送请求并等待响应
                const response = await system.ask(agentPid, {
                    type: MastraAgentMessageType.GENERATE,
                    content: query,
                    cacheKey // 使用查询作为缓存键
                });

                // 计算响应时间
                const responseTime = Date.now() - startTime;

                // 输出结果
                log(`响应时间: ${responseTime}ms`, 'info');
                log(`回答:`, 'success');
                console.log('\n' + (response.result?.text || response.result) + '\n');

                // 如果有工具调用，显示工具调用信息
                const toolCalls = response.result?.toolCalls;
                if (toolCalls && toolCalls.length > 0) {
                    log(`工具调用: ${toolCalls.length}个`, 'info');
                    toolCalls.forEach((call: any, i: number) => {
                        console.log(`  工具 ${i + 1}: ${call.function?.name}`);
                        console.log(`  参数: ${call.function?.arguments}`);
                    });
                }
            } catch (error: any) {
                log(`处理查询时出错: ${error.message}`, 'error');
            }

            // 在查询之间添加延迟，除非是最后一个查询
            if (index < testQueries.length - 1) {
                log('等待下一个查询...', 'info');
                await new Promise(resolve => setTimeout(resolve, 1000));
            }
        }

        // 关闭Actor系统
        log('\n正在关闭Actor系统...', 'info');
        await system.stop();
        log('Actor系统已关闭', 'success');

    } catch (error: any) {
        log(`运行示例时出错: ${error.message}`, 'error');
        console.error(error);

        // 确保系统关闭
        try {
            await system.stop();
        } catch (e) {
            // 忽略关闭错误
        }

        process.exit(1);
    }
}

// 运行示例
log('启动Mastra Agent示例', 'info');
main().catch(error => {
    log('致命错误:', 'error');
    console.error(error);
    process.exit(1);
}); 