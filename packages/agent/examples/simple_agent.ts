/**
 * 简化版智能体示例
 * 
 * 这个示例展示了智能体系统的基本用法，更加简洁明了
 */

import { AgentSystem } from '../src/agent_system';
import { BaseAgent } from '../src/base_agent';
import { AgentConfig, AgentMessage } from '../src/types';
import { PID } from '@bactor/core';

/**
 * 简单智能体 - 能够接收消息并回复
 */
class SimpleAgent extends BaseAgent {
    // 重写父类的handleTask方法，处理任务消息
    protected async handleTask(message: AgentMessage): Promise<void> {
        console.log(`[SimpleAgent] 收到任务: ${JSON.stringify(message.payload)}`);

        // 从消息中提取目标名称
        const name = (message.payload as any).data?.name || 'World';

        // 创建简单的响应
        const response = {
            message: `Hello, ${name}!`,
            timestamp: new Date().toISOString()
        };

        // 创建结果消息并回复
        const resultMessage: AgentMessage = {
            type: 'RESULT',
            sender: this.agentContext.self,
            timestamp: Date.now(),
            payload: {
                type: 'RESULT',
                result: response
            } as any
        };

        // 发送回复
        await this.tell(message.sender, resultMessage);
        console.log(`[SimpleAgent] 已回复: ${JSON.stringify(response)}`);
    }

    // 简单实现其他必需的方法
    protected async handleResult(message: AgentMessage): Promise<void> {
        console.log(`[SimpleAgent] 收到结果: ${message.type}`);
    }

    protected async handleFeedback(message: AgentMessage): Promise<void> {
        console.log(`[SimpleAgent] 收到反馈: ${message.type}`);
    }

    protected async handleCoordination(message: AgentMessage): Promise<void> {
        console.log(`[SimpleAgent] 收到协调消息: ${message.type}`);
    }
}

/**
 * 运行示例
 */
async function runExample() {
    const system = new AgentSystem();

    try {
        // 创建智能体
        console.log('创建智能体...');
        const config: AgentConfig = {
            role: 'greeter',
            capabilities: ['greeting'],
            parameters: { language: 'chinese' }
        };
        const agentPID = await system.createAgent(SimpleAgent, config);

        // 创建并发送消息
        const message: AgentMessage = {
            type: 'TASK',
            sender: agentPID, // 自己给自己发消息简化示例
            timestamp: Date.now(),
            payload: {
                type: 'TASK',
                data: { name: '小明' }
            } as any
        };

        console.log('发送消息...');
        await system.send(agentPID, message);

        // 等待处理完成
        await new Promise(resolve => setTimeout(resolve, 1000));

        // 停止智能体
        await system.stopAgent('greeter');
        console.log('示例完成');

    } catch (error) {
        console.error('错误:', error);
    }
}

// 运行示例
runExample().catch(console.error); 