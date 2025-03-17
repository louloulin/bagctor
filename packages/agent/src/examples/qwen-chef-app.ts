import { Agent } from '@mastra/core/agent';
import { Mastra } from '@mastra/core';
import { createQwen } from 'qwen-ai-provider';
import * as readline from 'readline';

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
        console.log(`🔍 查找${cuisine || ''}食谱，包含: ${ingredients.join(', ')}`);

        // 模拟API调用延迟
        await new Promise(resolve => setTimeout(resolve, 500));

        // 返回模拟食谱数据
        return {
            recipes: [
                {
                    name: `${cuisine || '家常'}${ingredients[0]}料理`,
                    ingredients: ingredients,
                    steps: [
                        '准备所有食材并清洗干净',
                        `将${ingredients[0]}切成适当大小`,
                        '热锅，加入少量油',
                        `放入${ingredients[0]}翻炒至变色`,
                        `加入${ingredients[1] || '调味料'}继续翻炒`,
                        '加入适量水，盖上锅盖焖煮5分钟',
                        '调入盐和其他调味料调味',
                        '装盘，撒上葱花点缀',
                    ]
                }
            ],
            suggestions: `您可以用${ingredients[0]}作为主料制作多种菜品，比如${cuisine || '家常'}风味的烹饪方式最为简单易做。`
        };
    }
};

// 创建营养分析工具
const nutritionTool = {
    name: 'nutrition-tool',
    description: '分析食谱的营养成分',
    parameters: {
        type: 'object',
        properties: {
            recipe: {
                type: 'string',
                description: '需要分析的食谱名称'
            },
            ingredients: {
                type: 'array',
                items: { type: 'string' },
                description: '食谱中的食材'
            }
        },
        required: ['ingredients']
    },
    handler: async ({ recipe, ingredients }: {
        recipe: string,
        ingredients: string[]
    }) => {
        console.log(`📊 分析食谱 "${recipe}" 的营养成分`);

        // 模拟API调用延迟
        await new Promise(resolve => setTimeout(resolve, 700));

        // 返回模拟营养数据
        return {
            calories: Math.floor(Math.random() * 400) + 200,
            protein: Math.floor(Math.random() * 20) + 10,
            carbs: Math.floor(Math.random() * 30) + 20,
            fat: Math.floor(Math.random() * 15) + 5,
            vitamins: ['维生素A', '维生素C', '维生素B群'],
            healthIndex: Math.floor(Math.random() * 5) + 3,
            suggestions: `这道菜的营养均衡性较好，特别是${ingredients[0]}富含蛋白质。建议搭配一些绿叶蔬菜以增加膳食纤维的摄入。`
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
    你是Michel，一位经验丰富的家庭厨师。
    你擅长帮助人们利用已有的食材烹饪美味的菜肴。
    
    优先了解用户拥有的食材和厨具，然后建议可行的食谱。
    清晰解释烹饪步骤，并在需要时提供替代方案。
    保持友好和鼓励的语气。
    
    你必须使用提供的工具：
    1. cooking-tool：根据用户提供的食材查找食谱
    2. nutrition-tool：分析食谱的营养成分
    
    回答应当包括：
    - 基于用户食材的食谱建议
    - 烹饪方法的详细步骤
    - 营养价值分析
    - 相关烹饪技巧和建议
  `,
    model: qwen('qwen-plus-2024-12-20'),
    tools: {
        cookingTool,
        nutritionTool
    },
});

// 创建Mastra实例
const mastra = new Mastra({
    agents: {
        chefAgent
    }
});

// 创建命令行交互界面
const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

// 启动应用程序
async function startChefApp() {
    console.log('🍳 欢迎使用Chef Michel智能烹饪助手！');
    console.log('📝 请告诉我你有哪些食材，我会给你提供烹饪建议。');
    console.log('🔄 输入"exit"退出程序。\n');

    await promptUser();
}

// 用户提示
async function promptUser() {
    rl.question('你有哪些食材？> ', async (ingredients) => {
        if (ingredients.toLowerCase() === 'exit') {
            console.log('👋 谢谢使用Chef Michel智能烹饪助手！再见！');
            rl.close();
            return;
        }

        try {
            console.log('👨‍🍳 Chef Michel正在思考...');

            // 准备用户消息
            const userMessage = {
                role: 'user' as const,
                content: `我有这些食材：${ingredients}。我可以做什么料理？请提供详细的烹饪步骤和营养分析。`
            };

            // 调用Agent生成回复
            const response = await chefAgent.generate([userMessage]);

            // 输出Agent回复
            console.log('\n' + '='.repeat(50));
            console.log('👨‍🍳 Chef Michel:');
            console.log(response.text);
            console.log('='.repeat(50) + '\n');

            // 继续提问
            await promptUser();
        } catch (error) {
            console.error('❌ 发生错误:', error);
            console.log('请再试一次。\n');
            await promptUser();
        }
    });
}

// 启动应用
startChefApp(); 