/**
 * 集成Agent系统示例
 * 
 * 这个示例展示了如何使用增强的Agent系统同时管理Bactor和Mastra Agent，
 * 包括工具共享、统计跟踪和Agent之间的协作。
 */

import { AgentSystem, AgentType } from '../src/bactor';
import { MastraAgentConfig, MastraAgentMessageType } from '../src/bactor/mastra-agent-actor';
import { BactorAgentConfig } from '../src/bactor/bactor-agent';
import * as dotenv from 'dotenv';
import * as readline from 'readline';

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

/**
 * 创建控制台交互接口
 */
function createInterface() {
    return readline.createInterface({
        input: process.stdin,
        output: process.stdout
    });
}

/**
 * 创建日期工具
 */
function createDateTool() {
    return {
        name: 'date_tool',
        description: 'Get current date and time information',
        parameters: {
            format: {
                type: 'string',
                description: 'Date format (full, date, time)',
                enum: ['full', 'date', 'time']
            },
            timezone: {
                type: 'string',
                description: 'Timezone (UTC, local)',
                enum: ['UTC', 'local']
            }
        },
        execute: async ({ format, timezone }: { format: string, timezone: string }) => {
            const now = timezone === 'UTC' ? new Date() : new Date();

            if (format === 'full') {
                return { result: now.toLocaleString() };
            } else if (format === 'date') {
                return { result: now.toLocaleDateString() };
            } else if (format === 'time') {
                return { result: now.toLocaleTimeString() };
            } else {
                return { result: now.toString() };
            }
        }
    };
}

/**
 * 创建天气工具
 */
function createWeatherTool() {
    return {
        name: 'weather_tool',
        description: 'Get current weather information for a location',
        parameters: {
            location: {
                type: 'string',
                description: 'City name or location'
            }
        },
        execute: async ({ location }: { location: string }) => {
            // 这里仅模拟天气数据，实际应用中可以调用真实的天气API
            const weatherData: Record<string, { temp: number, condition: string, humidity: number }> = {
                'New York': { temp: 22, condition: 'Sunny', humidity: 45 },
                'London': { temp: 18, condition: 'Cloudy', humidity: 72 },
                'Tokyo': { temp: 26, condition: 'Rainy', humidity: 80 },
                'Beijing': { temp: 29, condition: 'Clear', humidity: 50 },
                'Sydney': { temp: 25, condition: 'Partly Cloudy', humidity: 65 }
            };

            const defaultWeather = { temp: 20, condition: 'Unknown', humidity: 60 };
            const weather = weatherData[location] || defaultWeather;

            return {
                result: `Weather in ${location}: ${weather.temp}°C, ${weather.condition}, Humidity: ${weather.humidity}%`
            };
        }
    };
}

/**
 * 创建计算器工具
 */
function createCalculatorTool() {
    return {
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
        execute: async ({ operation, a, b }: { operation: string, a: number, b: number }) => {
            log(`执行计算: ${a} ${operation} ${b}`, 'info');

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
    };
}

// 模拟语言模型实现
const mockLanguageModel = {
    name: 'mock-model',
    invoke: async (params: any) => {
        return {
            choices: [
                {
                    message: {
                        role: 'assistant',
                        content: `[模拟回答] 对于问题: "${params.messages[params.messages.length - 1].content}"的回答`
                    }
                }
            ]
        };
    },
    // 兼容ai SDK所需属性
    modelId: 'mock-model-v1',
    format: 'json'
};

/**
 * 主函数
 */
async function main() {
    try {
        // 创建Agent系统，启用日志和统计
        const system = new AgentSystem({
            logging: true,
            statistics: true,
            tools: {
                date_tool: createDateTool(),
                weather_tool: createWeatherTool(),
                calculator: createCalculatorTool()
            }
        });

        // 创建Mastra Agent (助手)
        const assistantConfig: MastraAgentConfig = {
            name: 'Assistant',
            description: 'A helpful assistant that can answer general questions',
            instructions: `You are a helpful assistant. You can use various tools to help answer questions.
Use the date_tool to get current date and time.
Use the weather_tool to check weather in a location.
Use the calculator for math calculations.
Always be polite and concise in your responses.`,
            model: mockLanguageModel as any,
            enableCache: true,
            cacheTTL: 5 * 60 * 1000 // 5分钟缓存
        };

        const assistantPid = await system.createMastraAgent(assistantConfig);
        log('助手Agent已创建', 'success');

        // 创建Bactor Agent (专家)
        const expertConfig: BactorAgentConfig = {
            name: 'Expert',
            description: 'A domain expert who specializes in technical information',
            instructions: `You are a technical expert. You specialize in providing technical and scientific information.
You can use the calculator tool for complex calculations.
Your responses should be detailed and precise, focusing on technical accuracy.`,
            model: mockLanguageModel as any,
            maxMemoryEntries: 50 // 限制记忆条目数
        };

        const expertPid = await system.createBactorAgent(expertConfig);
        log('专家Agent已创建', 'success');

        // 打印系统统计信息
        system.printStatistics();

        // 创建交互式控制台
        const rl = createInterface();

        log('\n欢迎使用集成Agent系统！', 'success');
        log('您可以与两个Agent交互:', 'info');
        log('1. 助手 - 擅长一般问题和工具使用', 'info');
        log('2. 专家 - 擅长技术和科学信息', 'info');
        log('输入 "exit" 退出\n', 'info');

        // 交互循环
        let running = true;
        while (running) {
            const agent = await new Promise<string>(resolve => {
                rl.question('选择Agent (1=助手, 2=专家): ', answer => {
                    resolve(answer.trim());
                });
            });

            if (agent === 'exit') {
                running = false;
                continue;
            }

            const selectedPid = agent === '2' ? expertPid : assistantPid;
            const agentName = agent === '2' ? 'Expert' : 'Assistant';

            const query = await new Promise<string>(resolve => {
                rl.question(`向${agentName}提问: `, answer => {
                    resolve(answer.trim());
                });
            });

            if (query === 'exit') {
                running = false;
                continue;
            }

            if (query === 'stats') {
                system.printStatistics();
                continue;
            }

            log(`正在处理查询...`, 'info');
            const startTime = Date.now();

            try {
                // 生成缓存键
                const cacheKey = `${agentName}-${query}`;

                // 向选定的Agent发送请求
                const messageType = agent === '2' ? 'generate' : MastraAgentMessageType.GENERATE;

                // 使用ActorSystem的ask方法发送消息，并等待回复
                const response = await system.getActorSystem().send(selectedPid, {
                    type: messageType,
                    content: query,
                    cacheKey,
                    // 添加回复者，以便Actor可以回复
                    sender: system.getActorSystem().getActor('system')
                });

                // 计算响应时间
                const responseTime = Date.now() - startTime;

                // 增加消息计数
                system.incrementMessageCount();

                // 模拟响应
                log(`响应时间: ${responseTime}ms`, 'info');
                log(`${agentName}回答:`, 'success');

                // 为了示例目的，这里给出模拟响应
                console.log('\n这是一个模拟回答，因为我们没有实现真正的消息收发机制。在实际环境中，这将是AI生成的回答。\n');
                console.log(`查询: ${query}`);
                console.log(`代理: ${agentName}`);
                console.log(`缓存键: ${cacheKey}`);
                console.log(`响应时间: ${responseTime}ms\n`);
            } catch (error: any) {
                log(`处理查询时出错: ${error.message}`, 'error');
            }
        }

        // 关闭交互式控制台
        rl.close();

        // 关闭Agent系统
        log('\n正在关闭Agent系统...', 'info');
        await system.shutdown();
        log('系统已关闭', 'success');

    } catch (error: any) {
        log(`运行示例时出错: ${error.message}`, 'error');
        console.error(error);
        process.exit(1);
    }
}

// 运行示例
log('启动集成Agent系统示例', 'info');
main().catch(error => {
    log('致命错误:', 'error');
    console.error(error);
    process.exit(1);
}); 