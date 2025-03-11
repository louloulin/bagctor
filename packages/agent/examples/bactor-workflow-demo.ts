/**
 * Bactor Workflow示例
 * 
 * 演示如何使用Bactor工作流系统
 */

import { ActorSystem } from '@bactor/core';
import { createWorkflowActor } from '../src/bactor/workflow-actor';

/**
 * 主函数
 */
async function main() {
    try {
        // 创建Actor系统
        const system = new ActorSystem();

        // 创建一个数据处理工作流
        const workflowActor = await createWorkflowActor(system, {
            name: 'data-processing-workflow',
            description: '一个简单的数据处理工作流'
        });

        console.log('Workflow actor created');

        // 定义工作流
        await system.ask(workflowActor, {
            type: 'defineWorkflow',
            steps: [
                {
                    id: 'fetchData',
                    execute: async ({ context }) => {
                        console.log('Fetching data...');
                        // 模拟获取数据
                        await new Promise(resolve => setTimeout(resolve, 1000));
                        return { data: [1, 2, 3, 4, 5] };
                    }
                },
                {
                    id: 'processData',
                    execute: async ({ context }) => {
                        const { data } = context.steps.fetchData.output;
                        console.log('Processing data:', data);
                        // 模拟处理数据
                        await new Promise(resolve => setTimeout(resolve, 500));
                        const processedData = data.map(x => x * 2);
                        return { processedData };
                    }
                },
                {
                    id: 'analyzeData',
                    execute: async ({ context }) => {
                        const { processedData } = context.steps.processData.output;
                        console.log('Analyzing data:', processedData);
                        // 模拟分析数据
                        await new Promise(resolve => setTimeout(resolve, 800));
                        const sum = processedData.reduce((a, b) => a + b, 0);
                        const average = sum / processedData.length;
                        return {
                            stats: {
                                sum,
                                average,
                                min: Math.min(...processedData),
                                max: Math.max(...processedData)
                            }
                        };
                    }
                }
            ],
            connections: [
                { from: 'fetchData', to: 'processData' },
                { from: 'processData', to: 'analyzeData' }
            ]
        });

        console.log('Workflow defined successfully.');

        // 启动工作流
        console.log('Starting workflow...');
        const { runId, result } = await system.ask(workflowActor, {
            type: 'startWorkflow',
            input: { source: 'example' }
        });

        console.log(`Workflow run ID: ${runId}`);
        console.log('Workflow result:', JSON.stringify(result, null, 2));

        // 查询工作流状态
        const { state } = await system.ask(workflowActor, {
            type: 'getWorkflowStatus',
            runId
        });

        console.log('Workflow state:', JSON.stringify(state, null, 2));

        // 停止Actor系统
        await system.stop();

    } catch (error) {
        console.error('Error:', error);
    }
}

// 运行示例
main(); 