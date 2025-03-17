import { Agent } from '@mastra/core/agent';
import { Mastra } from '@mastra/core';
import { Bagctor } from '../bagctor';
import { createQwen } from 'qwen-ai-provider';

// 配置Qwen模型
const qwen = createQwen({
    baseURL: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    apiKey: 'sk-bc977c4e31e542f1a34159cb42478198',
});

// 工具定义
const cookingTool = {
    name: 'cooking-tool',
    description: '查找食谱和烹饪建议的工具',
    parameters: {
        type: 'object',
        properties: {
            ingredients: {
                type: 'array',
                items: { type: 'string' },
                description: '可用的食材列表'
            },
            cuisine: {
                type: 'string',
                description: '想要烹饪的菜系',
                enum: ['中餐', '西餐', '日料', '意餐', '任意']
            },
            dietary: {
                type: 'array',
                items: { type: 'string' },
                description: '饮食限制，如素食、无乳制品等'
            }
        },
        required: ['ingredients']
    },
    handler: async ({ ingredients, cuisine, dietary }: {
        ingredients: string[],
        cuisine?: string,
        dietary?: string[]
    }) => {
        // 这里实际应用中应该调用真实的食谱API
        // 这里只是模拟返回结果
        return {
            recipes: [
                {
                    name: '简易' + (cuisine || '家常') + '菜',
                    ingredients: ingredients.slice(0, 3),
                    steps: ['准备材料', '烹饪', '装盘']
                }
            ],
            suggestions: '根据您的食材，建议尝试简单的家常菜。'
        };
    }
};

// 创建使用Qwen模型的厨师智能体
export const chefAgent = new Agent({
    name: 'Chef Agent',
    instructions: `
    YOU MUST USE THE TOOL cooking-tool
    You are Michel, a practical and experienced home chef who helps people cook great meals with whatever 
    ingredients they have available. Your first priority is understanding what ingredients and equipment the user has access to, then suggesting achievable recipes. 
    You explain cooking steps clearly and offer substitutions when needed, maintaining a friendly and encouraging tone throughout.
  `,
    model: qwen('qwen-plus-2024-12-20'),
    tools: {
        cookingTool,
    },
});

// 创建使用Qwen模型的菜单设计师智能体
export const menuDesignerAgent = new Agent({
    name: 'Menu Designer',
    instructions: `
    You are a professional menu designer who can create balanced meal plans based on available ingredients.
    Focus on nutrition, variety, and presentation. Consider dietary restrictions and preferences when provided.
  `,
    model: qwen('qwen-plus-2024-12-20')
});

// 创建Mastra实例
const mastra = new Mastra({
    agents: {
        chefAgent,
        menuDesignerAgent
    }
});

// 创建Bagctor实例
const bagctor = new Bagctor({
    mastra: mastra,
    distribution: {
        clustered: false
    }
});

// 示例工作流
async function runCookingWorkflow() {
    // 创建工作流
    const cookingWorkflow = await bagctor.createWorkflow({
        name: '菜单设计和烹饪指导',
        steps: [
            {
                agent: 'Menu Designer',
                input: '设计一个使用鸡胸肉、西兰花和意面的健康晚餐',
                output: 'menu'
            },
            {
                agent: 'Chef Agent',
                input: (context) => `基于这个菜单提供详细的烹饪指导: ${context.menu}`,
                output: 'cookingGuide'
            }
        ]
    });

    // 执行工作流
    const result = await cookingWorkflow.execute();

    console.log('烹饪工作流完成:');
    console.log('菜单:', result.menu);
    console.log('烹饪指南:', result.cookingGuide);
}

// 运行示例
async function runExample() {
    try {
        console.log('运行烹饪工作流...');
        await runCookingWorkflow();
    } catch (error) {
        console.error('运行示例时出错:', error);
    }
}

// 执行示例
runExample(); 