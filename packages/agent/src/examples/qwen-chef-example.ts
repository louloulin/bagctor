import { Agent } from '@mastra/core/agent';
import { createQwen } from 'qwen-ai-provider';

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

// 创建Qwen实例
const qwen = createQwen({
    baseURL: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    apiKey: 'sk-bc977c4e31e542f1a34159cb42478198',
});

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