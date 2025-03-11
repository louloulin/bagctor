import { Workflow, Step, Tool } from '../src';
import { z } from 'zod';

// 定义步骤1：计划生成
const planStep = new Step({
    name: 'PlanGenerationStep',
    description: 'Generate a plan for solving the problem',
    execute: async (input, context) => {
        // 在实际应用中，这里可能会使用LLM生成计划
        console.log('Generating plan for problem:', input.problem);

        return {
            plan: [
                'Step 1: Analyze the problem',
                'Step 2: Research potential solutions',
                'Step 3: Implement the best solution',
                'Step 4: Test and validate the solution'
            ]
        };
    }
});

// 定义步骤2：研究工具
const researchTool = new Tool({
    name: 'research-tool',
    description: 'Research information about a topic',
    inputSchema: z.object({
        topic: z.string().describe('The topic to research'),
    }),
    outputSchema: z.object({
        information: z.string().describe('Research results'),
        sources: z.array(z.string()).describe('Sources of information'),
    }),
    execute: async ({ topic }) => {
        // 模拟研究过程
        console.log('Researching about:', topic);

        return {
            information: `Detailed information about ${topic}...`,
            sources: ['Source 1', 'Source 2', 'Source 3']
        };
    }
});

// 定义步骤3：研究执行
const researchStep = new Step({
    name: 'ResearchStep',
    description: 'Research relevant information for the problem',
    tools: [researchTool],
    execute: async (input, context) => {
        // 获取前一步的计划
        const plan = input.plan;
        console.log('Executing research based on plan:', plan);

        // 使用研究工具获取信息
        const researchResults = await researchTool.execute({
            topic: input.problem
        });

        return {
            planWithResearch: {
                originalPlan: plan,
                researchResults
            }
        };
    }
});

// 定义步骤4：解决方案生成
const solutionStep = new Step({
    name: 'SolutionGenerationStep',
    description: 'Generate a solution based on research',
    execute: async (input, context) => {
        // 使用计划和研究结果生成解决方案
        console.log('Generating solution based on research and plan');

        return {
            solution: {
                title: `Solution for: ${input.problem}`,
                description: 'This is a comprehensive solution...',
                implementation: 'Implementation details...',
                conclusion: 'The problem has been solved successfully.'
            }
        };
    }
});

// 创建工作流
const problemSolverWorkflow = new Workflow({
    name: 'ProblemSolverWorkflow',
    description: 'A workflow to solve complex problems',
    steps: [planStep, researchStep, solutionStep]
});

// 测试工作流
async function main() {
    try {
        // 运行工作流
        const result = await problemSolverWorkflow.run({
            problem: 'How to optimize a Node.js application for performance?'
        });

        console.log('Workflow completed successfully!');
        console.log('Final result:', JSON.stringify(result, null, 2));
    } catch (error) {
        console.error('Workflow execution failed:', error);
    }
}

main(); 