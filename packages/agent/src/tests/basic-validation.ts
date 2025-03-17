import { Agent } from '@mastra/core/agent';
import { createQwen } from 'qwen-ai-provider';
import { Bagctor } from '../bagctor';

/**
 * 简单的Bagctor Agent与Qwen集成验证
 */
async function validateBasicFunctionality() {
    try {
        console.log('开始验证基本功能...');

        // 配置Qwen模型
        const qwen = createQwen({
            baseURL: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
            apiKey: 'sk-bc977c4e31e542f1a34159cb42478198',
        });

        // 创建Agent
        const testAgent = new Agent({
            name: 'TestAgent',
            instructions: '你是一个用于测试的智能体。',
            model: qwen('qwen-plus-2024-12-20'),
        });

        // 创建Bagctor实例
        const bagctor = new Bagctor({
            agents: { testAgent },
            distribution: {
                clustered: false,
            }
        });

        console.log('✅ 成功创建Agent和Bagctor实例');

        // 测试generate方法
        const prompt = '简要介绍一下分布式系统';
        console.log(`正在生成回答，提示: "${prompt}"`);

        const response = await bagctor.agents.testAgent.generate(prompt);

        console.log('✅ 成功生成回答:');
        console.log('---');
        console.log(response.text.substring(0, 200) + '...');
        console.log('---');

        console.log('基本功能验证成功!');
        return true;
    } catch (error) {
        console.error('❌ 验证失败:', error);
        return false;
    }
}

// 执行验证
validateBasicFunctionality()
    .then(success => {
        console.log(`\n验证${success ? '成功' : '失败'}`);
        process.exit(success ? 0 : 1);
    })
    .catch(error => {
        console.error('执行验证时出错:', error);
        process.exit(1);
    }); 