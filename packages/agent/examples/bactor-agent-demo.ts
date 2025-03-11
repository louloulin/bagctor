/**
 * Bactor Agent示例
 * 
 * 演示如何使用Bactor Agent系统
 */

import { ActorSystem } from '@bactor/core';
import { AgentSystem } from '../src/bactor/agent-system';
import { createTool } from '../src/bactor/tool-factory';

/**
 * 创建计算器工具
 */
function createCalculatorTool() {
    return createTool({
        id: 'calculator',
        description: 'Perform mathematical calculations',
        parameters: {
            operation: {
                type: 'string',
                description: 'Mathematical operation: add, subtract, multiply, divide',
                required: true,
                enum: ['add', 'subtract', 'multiply', 'divide']
            },
            a: {
                type: 'number',
                description: 'First operand',
                required: true
            },
            b: {
                type: 'number',
                description: 'Second operand',
                required: true
            }
        },
        execute: async (params) => {
            const { operation, a, b } = params;

            switch (operation) {
                case 'add': return { result: a + b };
                case 'subtract': return { result: a - b };
                case 'multiply': return { result: a * b };
                case 'divide': return { result: a / b };
                default: throw new Error(`Unknown operation: ${operation}`);
            }
        }
    });
}

/**
 * 主函数
 */
async function main() {
    try {
        // 创建Agent系统
        const agentSystem = new AgentSystem();

        // 创建数学助手Agent
        const mathAgent = agentSystem.createAgent({
            name: 'Math Assistant',
            description: '数学助手，可以执行各种计算',
            instructions: 'You are a math assistant that can perform calculations.',
            model: {
                provider: 'openai',
                name: 'gpt-4-turbo',
                apiKey: process.env.OPENAI_API_KEY
            },
            tools: {
                calculator: createCalculatorTool()
            }
        });

        console.log('Math Agent created:', mathAgent.path);

        // 发送任务
        const result = await agentSystem.sendTask(
            mathAgent.path,
            'Calculate 135 multiplied by 28'
        );

        console.log('Response:', result);

        // 关闭系统
        await agentSystem.stop();

    } catch (error) {
        console.error('Error:', error);
    }
}

// 运行示例
main(); 