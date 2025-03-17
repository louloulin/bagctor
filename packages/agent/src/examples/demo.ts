import { Agent } from '@mastra/core/agent';
import { Bagctor } from '../bagctor';
import { createQwen } from 'qwen-ai-provider';
import { z } from 'zod';
import * as dotenv from 'dotenv';

// 加载环境变量
dotenv.config();

/**
 * Bagctor 智能体协作示例
 * 演示智能体协作完成复杂任务的能力
 */
async function runBagctorDemo() {
    console.log('启动 Bagctor 多智能体工作流示例...\n');

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

        // 创建多个专业智能体
        console.log('正在创建专业智能体...');

        // 1. 研究智能体 - 收集和分析信息
        const researchAgent = new Agent({
            name: 'ResearchAgent',
            instructions: `你是一个专业的研究助手，擅长收集和分析信息。
你的任务是提供详尽的研究结果，包括相关背景、最新进展和各种观点。
注重事实和数据，保持客观中立。`,
            model: qwen('qwen-plus-2024-12-20'),
        });

        // 2. 创意智能体 - 提供创新思路
        const creativeAgent = new Agent({
            name: 'CreativeAgent',
            instructions: `你是一个创意思考专家，擅长提供创新的想法和解决方案。
你的任务是基于研究结果，提出独特、创新的观点和可能性。
不要局限于常规思路，尝试从不同角度思考问题。`,
            model: qwen('qwen-plus-2024-12-20'),
        });

        // 3. 批判性思考智能体 - 评估方案的优缺点
        const criticalAgent = new Agent({
            name: 'CriticalAgent',
            instructions: `你是一个批判性思考专家，擅长分析和评估方案的优缺点。
你的任务是对创意方案进行全面分析，指出潜在问题和改进方向。
基于逻辑和事实提供建设性的批评，而不是简单否定。`,
            model: qwen('qwen-plus-2024-12-20'),
        });

        // 4. 总结智能体 - 整合信息并生成最终报告
        const summaryAgent = new Agent({
            name: 'SummaryAgent',
            instructions: `你是一个信息整合专家，擅长总结和提炼要点。
你的任务是整合多个来源的信息，提炼出核心观点和结论。
输出应简洁明了，重点突出，有逻辑性，适合决策者快速理解。`,
            model: qwen('qwen-plus-2024-12-20'),
        });

        // 创建天气查询工具
        const weatherTool = {
            name: 'weather',
            description: '查询指定城市的天气信息',
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
                // 实际应用中应调用真实的天气API
                return {
                    city,
                    temperature: 25,
                    condition: '晴天',
                    humidity: '60%',
                    forecast: '未来三天天气晴好'
                };
            }
        };

        // 将工具添加到研究智能体
        researchAgent.registerTool('weatherTool', weatherTool);

        // 创建Bagctor实例并注册智能体
        console.log('创建 Bagctor 实例...');
        const bagctor = new Bagctor({
            agents: {
                researchAgent,
                creativeAgent,
                criticalAgent,
                summaryAgent
            },
            // 实际项目可以启用分布式模式
            distribution: {
                clustered: false, // 示例中使用单机模式
            }
        });

        // 定义结构化输出模式
        const finalReportSchema = z.object({
            title: z.string(),
            summary: z.string(),
            keyPoints: z.array(z.string()),
            pros: z.array(z.string()),
            cons: z.array(z.string()),
            recommendation: z.string()
        });

        // 创建智能体工作流
        console.log('创建智能体工作流...');
        const projectAnalysisWorkflow = await bagctor.createWorkflow({
            name: '项目分析工作流',
            steps: [
                {
                    agent: 'ResearchAgent',
                    input: '收集关于"智能家居系统"的最新信息，包括技术趋势、市场状况和主要挑战',
                    output: 'research'
                },
                {
                    agent: 'CreativeAgent',
                    input: (context) => `基于以下研究，提出3-5个创新的智能家居系统设计思路:\n${context.research}`,
                    output: 'creative_ideas'
                },
                {
                    agent: 'CriticalAgent',
                    input: (context) => `评估以下智能家居系统创意方案的优缺点:\n${context.creative_ideas}`,
                    output: 'critical_analysis'
                },
                {
                    agent: 'SummaryAgent',
                    input: (context) => `
基于以下信息，生成一份完整的智能家居系统项目分析报告:

研究背景:
${context.research}

创意方案:
${context.creative_ideas}

方案分析:
${context.critical_analysis}
          `,
                    output: 'final_report',
                    schema: finalReportSchema
                }
            ]
        });

        // 执行工作流
        console.log('\n开始执行项目分析工作流，这可能需要几分钟...');
        console.log('----------------------------------------');

        console.time('工作流执行时间');
        const result = await projectAnalysisWorkflow.execute();
        console.timeEnd('工作流执行时间');

        console.log('----------------------------------------');
        console.log('\n项目分析工作流执行完成！');

        // 打印结构化输出结果
        if (result.final_report) {
            const report = result.final_report;
            console.log('\n==== 智能家居系统项目分析报告 ====');
            console.log(`\n📋 标题: ${report.title}`);
            console.log(`\n📝 摘要:\n${report.summary}`);

            console.log('\n🔑 关键要点:');
            report.keyPoints.forEach((point, index) => {
                console.log(`   ${index + 1}. ${point}`);
            });

            console.log('\n✅ 优势:');
            report.pros.forEach((pro, index) => {
                console.log(`   ${index + 1}. ${pro}`);
            });

            console.log('\n❗ 挑战:');
            report.cons.forEach((con, index) => {
                console.log(`   ${index + 1}. ${con}`);
            });

            console.log(`\n🚀 建议:\n${report.recommendation}`);
        } else {
            console.log('工作流未返回预期的结构化报告。');
        }

        console.log('\n演示完成！');
    } catch (error) {
        console.error('示例执行过程中发生错误:', error);
    }
}

// 运行示例
runBagctorDemo().catch(console.error); 