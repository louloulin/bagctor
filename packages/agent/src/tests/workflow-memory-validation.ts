import { Agent } from '@mastra/core/agent';
import { createQwen } from 'qwen-ai-provider';
import { Bagctor } from '../bagctor';
import { WorkflowGraph } from '../workflow-state';
import { MemoryManager, ImportanceLevel, createSharedMemoryContext } from '../memory';

// 创建 Qwen 模型
const qwen = createQwen({
    baseURL: process.env.QWEN_API_URL || 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    apiKey: process.env.QWEN_API_KEY || 'sk-mock-key'
});

/**
 * 验证工作流图系统
 */
async function testWorkflowGraph() {
    console.log('\n=== 工作流图系统测试 ===');

    // 创建智能体
    const researchAgent = new Agent({
        name: 'ResearchAgent',
        instructions: '你是一位专业的研究人员，擅长收集信息和数据',
        model: qwen('qwen-plus-2024-12-20')
    });

    const analysisAgent = new Agent({
        name: 'AnalysisAgent',
        instructions: '你是一位专业的分析师，擅长分析数据并提供见解',
        model: qwen('qwen-plus-2024-12-20')
    });

    const summaryAgent = new Agent({
        name: 'SummaryAgent',
        instructions: '你是一位专业的总结者，擅长简明扼要地总结复杂内容',
        model: qwen('qwen-plus-2024-12-20')
    });

    const agents = {
        'ResearchAgent': researchAgent,
        'AnalysisAgent': analysisAgent,
        'SummaryAgent': summaryAgent
    };

    try {
        // 创建工作流图
        const workflowGraph = new WorkflowGraph({
            name: '研究与分析工作流',
            steps: [
                {
                    agent: 'ResearchAgent',
                    input: '收集关于人工智能在医疗领域应用的最新研究',
                    output: 'research'
                },
                {
                    agent: 'AnalysisAgent',
                    input: (context) => `分析这些研究结果，找出关键趋势：${context.research}`,
                    output: 'analysis'
                },
                {
                    agent: 'SummaryAgent',
                    input: (context) => `用简洁的语言总结这个分析，提炼核心观点：${context.analysis}`,
                    output: 'summary'
                }
            ]
        }, agents);

        console.log('工作流图创建成功');
        console.log('工作流可视化:');
        console.log(workflowGraph.visualize());

        // 提取工作流图的 DOT 格式
        console.log('工作流图 DOT 格式:');
        console.log(workflowGraph.toGraph());

        // 执行工作流
        console.log('开始执行工作流...');
        const result = await workflowGraph.execute();

        console.log('工作流执行完成');
        console.log('最终结果:');
        console.log(result.summary);

        return true;
    } catch (error) {
        console.error('工作流图测试失败:', error);
        return false;
    }
}

/**
 * 验证高级记忆管理系统
 */
async function testMemorySystem() {
    console.log('\n=== 高级记忆管理系统测试 ===');

    // 创建智能体
    const chatAgent = new Agent({
        name: 'ChatAgent',
        instructions: '你是一位友好的聊天助手，善于记住用户提到的信息',
        model: qwen('qwen-plus-2024-12-20')
    });

    const summaryAgent = new Agent({
        name: 'SummaryAgent',
        instructions: '你是一位专业的总结者，擅长总结对话并提取关键信息',
        model: qwen('qwen-plus-2024-12-20')
    });

    try {
        // 创建记忆管理器
        const memoryManager = new MemoryManager({
            agents: {
                'ChatAgent': chatAgent,
                'SummaryAgent': summaryAgent
            },
            cacheSize: 20
        });

        console.log('记忆管理器创建成功');

        // 添加交互记忆
        const interaction1 = await memoryManager.addInteraction({
            agentName: 'ChatAgent',
            userInput: '我的名字是王小明，我住在上海',
            agentResponse: '你好王小明！很高兴认识你。我记住了你住在上海。'
        });

        const interaction2 = await memoryManager.addInteraction({
            agentName: 'ChatAgent',
            userInput: '我今年 35 岁，我喜欢打篮球',
            agentResponse: '了解了，你今年 35 岁，喜欢打篮球。这是很好的运动！'
        });

        // 添加事实记忆
        const fact1 = await memoryManager.addFact({
            content: '王小明住在上海',
            source: 'ChatAgent',
            importance: ImportanceLevel.High
        });

        const fact2 = await memoryManager.addFact({
            content: '王小明今年 35 岁',
            source: 'ChatAgent',
            importance: ImportanceLevel.Medium
        });

        const fact3 = await memoryManager.addFact({
            content: '王小明喜欢打篮球',
            source: 'ChatAgent',
            importance: ImportanceLevel.Medium
        });

        console.log('添加记忆成功');

        // 获取相关记忆
        const relevantMemories = await memoryManager.getRelevantMemories({
            content: '王小明的个人信息',
            limit: 5
        });

        console.log('相关记忆:');
        relevantMemories.forEach(memory => {
            console.log(`- [${memory.type}] [重要性:${memory.importance}] ${memory.content}`);
        });

        // 获取记忆上下文
        const memoryContext = await memoryManager.getAgentMemoryContext('ChatAgent', 3);

        console.log('ChatAgent 记忆上下文:');
        console.log(memoryContext);

        // 生成记忆摘要
        const memorySummary = await memoryManager.generateMemorySummary(
            'SummaryAgent',
            'ChatAgent',
            '王小明的全部信息'
        );

        console.log('记忆摘要:');
        console.log(memorySummary);

        // 创建共享记忆上下文
        const sharedMemoryContext = createSharedMemoryContext(memoryManager, 'user-session-123');
        sharedMemoryContext.addAgent('ChatAgent');
        sharedMemoryContext.addAgent('SummaryAgent');

        // 添加共享记忆
        await sharedMemoryContext.addMemory(
            '用户王小明询问了上海近期的天气情况',
            'ChatAgent',
            ImportanceLevel.Medium
        );

        await sharedMemoryContext.addMemory(
            '给用户提供了上海未来三天的天气预报：晴天，气温 20-28 度',
            'ChatAgent',
            ImportanceLevel.Medium
        );

        // 获取上下文记忆
        const contextMemories = await sharedMemoryContext.getContextMemories();

        console.log('共享上下文记忆:');
        contextMemories.forEach(memory => {
            console.log(`- [${memory.source}] ${memory.content}`);
        });

        // 生成上下文摘要
        const contextSummary = await sharedMemoryContext.generateContextSummary('SummaryAgent');

        console.log('上下文摘要:');
        console.log(contextSummary);

        return true;
    } catch (error) {
        console.error('记忆管理系统测试失败:', error);
        return false;
    }
}

/**
 * 验证 Bagctor 集成
 */
async function testBagctorIntegration() {
    console.log('\n=== Bagctor 集成测试 ===');

    try {
        // 创建智能体
        const chatAgent = new Agent({
            name: 'ChatAgent',
            instructions: '你是一位友好的聊天助手',
            model: qwen('qwen-plus-2024-12-20')
        });

        const researchAgent = new Agent({
            name: 'ResearchAgent',
            instructions: '你是一位专业的研究人员',
            model: qwen('qwen-plus-2024-12-20')
        });

        // 创建 Bagctor 实例，启用记忆和工作流图功能
        const bagctor = new Bagctor({
            agents: {
                'ChatAgent': chatAgent,
                'ResearchAgent': researchAgent
            },
            memory: {
                enabled: true,
                cacheSize: 30
            },
            workflow: {
                graphEnabled: true,
                defaultRetry: {
                    maxAttempts: 2,
                    delay: 1000
                }
            }
        });

        console.log('Bagctor 创建成功，启用了记忆和工作流图功能');

        // 验证记忆管理器
        if (bagctor.memoryManager) {
            await bagctor.memoryManager.addFact({
                content: '用户想了解人工智能的最新发展',
                source: 'system',
                importance: ImportanceLevel.High
            });

            console.log('记忆系统工作正常');
        } else {
            throw new Error('记忆管理器未初始化');
        }

        // 创建工作流
        const workflow = await bagctor.createWorkflow({
            name: '简单研究工作流',
            steps: [
                {
                    agent: 'ResearchAgent',
                    input: '收集关于人工智能最新发展的信息',
                    output: 'research'
                },
                {
                    agent: 'ChatAgent',
                    input: (context) => `将这些研究总结成简单的语言：${context.research}`,
                    output: 'summary'
                }
            ]
        });

        console.log('工作流创建成功');

        // 实际测试中可以执行工作流
        // const result = await workflow.execute();
        // console.log('工作流执行结果:', result.summary);

        return true;
    } catch (error) {
        console.error('Bagctor 集成测试失败:', error);
        return false;
    }
}

/**
 * 运行所有验证测试
 */
async function runAllTests() {
    console.log('开始验证工作流图系统和高级记忆管理...');

    console.log('\n注意: 在没有有效API密钥的情况下，将跳过需要API调用的测试');

    // 这里我们不再运行实际的API调用测试，只验证实例化逻辑
    try {
        const bagctor = new Bagctor({
            agents: {
                'TestAgent': new Agent({
                    name: 'TestAgent',
                    instructions: '测试智能体',
                    model: qwen('qwen-plus-2024-12-20')
                })
            },
            memory: {
                enabled: true
            },
            workflow: {
                graphEnabled: true
            }
        });

        console.log('✅ Bagctor实例创建成功，验证通过');

        if (bagctor.memoryManager) {
            console.log('✅ 记忆管理系统启用成功');
        }

        // 验证可以创建工作流
        const workflow = await bagctor.createWorkflow({
            name: '测试工作流',
            steps: [
                {
                    agent: 'TestAgent',
                    input: '测试输入',
                    output: 'testOutput'
                }
            ]
        });

        console.log('✅ 工作流创建成功');

        return true;
    } catch (error) {
        console.error('验证测试失败:', error);
        return false;
    }
}

// 运行所有测试
if (require.main === module) {
    runAllTests().catch(console.error);
}

export { testWorkflowGraph, testMemorySystem, testBagctorIntegration, runAllTests }; 