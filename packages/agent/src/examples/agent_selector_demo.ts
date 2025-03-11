/**
 * Agent选择器使用示例
 */
import { AgentSystem } from '../agent_system';
import { AgentSelector, AgentType, AgentTask } from '../selector/agent_selector';
import { SkillAgent } from '../agents/skill_agent';
import { AssistantAgent } from '../agents/assistant_agent';

async function main() {
    console.log('=== Agent选择器示例 ===\n');

    // 创建Agent系统
    const system = new AgentSystem();

    // 创建Agent选择器
    const selector = new AgentSelector(system, {
        minScore: 0.6,
        enableCache: true
    });

    // 注册不同类型的Agent
    console.log('注册Agent类型...');

    // 注册程序员Agent
    const programmerType: AgentType = {
        agentClass: SkillAgent,
        name: 'programmer',
        description: '编写和调试代码的专家',
        taskTypes: ['code_generation', 'debugging', 'code_review'],
        capabilities: ['typescript', 'javascript', 'python', 'problem_solving'],
        defaultConfig: {
            role: 'skill_agent',
            parameters: {
                language: 'typescript',
                framework: 'node.js',
                testFramework: 'jest'
            }
        },
        scoreForTask: (task: AgentTask) => {
            // 根据任务类型和任务描述评分
            let score = 0;

            // 任务类型匹配度
            if (programmerType.taskTypes.includes(task.type)) {
                score += 0.5;
            }

            // 关键词匹配
            const keywords = ['代码', '编程', '函数', '开发', 'bug', '实现', '编写'];
            for (const keyword of keywords) {
                if (task.description.includes(keyword)) {
                    score += 0.1;
                }
            }

            // 能力匹配
            if (task.requiredCapabilities) {
                const matchedCapabilities = task.requiredCapabilities.filter(cap =>
                    programmerType.capabilities.includes(cap)
                );
                score += matchedCapabilities.length * 0.1;
            }

            return Math.min(score, 1.0);
        }
    };

    // 注册产品经理Agent
    const pmType: AgentType = {
        agentClass: SkillAgent,
        name: 'product_manager',
        description: '规划和管理产品的专家',
        taskTypes: ['product_planning', 'market_research', 'requirement_analysis'],
        capabilities: ['planning', 'analysis', 'user_experience', 'market_knowledge'],
        defaultConfig: {
            role: 'skill_agent',
            parameters: {
                language: 'natural',
                framework: 'agile',
                testFramework: 'user testing'
            }
        },
        scoreForTask: (task: AgentTask) => {
            let score = 0;

            // 任务类型匹配度
            if (pmType.taskTypes.includes(task.type)) {
                score += 0.5;
            }

            // 关键词匹配
            const keywords = ['产品', '市场', '规划', '需求', '用户', '分析', '调研'];
            for (const keyword of keywords) {
                if (task.description.includes(keyword)) {
                    score += 0.1;
                }
            }

            // 能力匹配
            if (task.requiredCapabilities) {
                const matchedCapabilities = task.requiredCapabilities.filter(cap =>
                    pmType.capabilities.includes(cap)
                );
                score += matchedCapabilities.length * 0.1;
            }

            return Math.min(score, 1.0);
        }
    };

    // 注册助手Agent
    const assistantType: AgentType = {
        agentClass: AssistantAgent,
        name: 'assistant',
        description: '通用助手，擅长回答问题和提供信息',
        taskTypes: ['information', 'assistance', 'conversation', 'general'],
        capabilities: ['conversation', 'assistance', 'knowledge'],
        defaultConfig: {
            role: 'assistant',
            parameters: {
                responseStyle: 'detailed',
                expertise: ['general'],
                contextMemory: 10
            }
        },
        scoreForTask: (task: AgentTask) => {
            // 助手是通用型的，对大多数任务都能提供一定帮助
            let score = 0.3; // 基础分

            // 任务类型匹配
            if (assistantType.taskTypes.includes(task.type)) {
                score += 0.4;
            }

            // 关键词匹配
            const keywords = ['帮助', '信息', '解释', '问题', '回答', '什么是'];
            for (const keyword of keywords) {
                if (task.description.includes(keyword)) {
                    score += 0.05;
                }
            }

            // 对于不明确的任务，助手得分更高
            if (task.type === 'general' || !task.type) {
                score += 0.2;
            }

            return Math.min(score, 1.0);
        }
    };

    // 注册Agent类型
    selector.registerAgentType(programmerType);
    selector.registerAgentType(pmType);
    selector.registerAgentType(assistantType);

    console.log('已注册Agent类型:', selector.getAgentTypes().map(t => t.name).join(', '));

    // 创建一些任务
    const tasks: AgentTask[] = [
        {
            id: 'task1',
            type: 'code_generation',
            description: '编写一个TypeScript函数，计算斐波那契数列',
            input: {
                details: '需要处理大数，优化性能'
            },
            requiredCapabilities: ['typescript', 'problem_solving']
        },
        {
            id: 'task2',
            type: 'product_planning',
            description: '分析市场需求，确定产品路线图',
            input: {
                market: 'B2B SaaS'
            },
            requiredCapabilities: ['planning', 'market_knowledge']
        },
        {
            id: 'task3',
            type: 'general',
            description: '解释什么是Actor模型及其优势',
            input: {
                context: '分布式系统'
            }
        }
    ];

    // 为每个任务选择最合适的Agent
    console.log('\n为任务选择合适的Agent:');
    for (const task of tasks) {
        console.log(`\n任务: ${task.description}`);

        const result = await selector.selectAgentForTask(task);
        if (result) {
            console.log(`  选择了 ${result.agentType.name} (匹配度: ${result.score.toFixed(2)})`);
            console.log(`  Agent PID: ${result.agentPID}`);
        } else {
            console.log('  没有找到合适的Agent');
        }
    }

    // 为一个任务选择团队
    console.log('\n为复杂任务选择Agent团队:');
    const complexTask: AgentTask = {
        id: 'complex1',
        type: 'project',
        description: '开发一个基于TypeScript的产品管理工具，需要设计UI和后端API',
        input: {
            deadline: '2周',
            features: ['用户管理', '产品规划', '任务跟踪']
        },
        requiredCapabilities: ['typescript', 'planning', 'user_experience']
    };

    const team = await selector.selectTeamForTask(complexTask, 2);
    console.log(`任务: ${complexTask.description}`);
    console.log(`团队成员:`);
    for (const agent of team) {
        console.log(`  ${agent.agentType.name} (匹配度: ${agent.score.toFixed(2)})`);
    }

    console.log('\nAgent选择器示例完成');
}

// 运行示例
main().catch(err => {
    console.error('示例执行错误:', err);
}); 