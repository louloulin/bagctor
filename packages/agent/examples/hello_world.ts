/**
 * Hello World 智能体示例 (简化版)
 * 
 * 展示智能体系统的基本用法：
 * 1. 创建智能体
 * 2. 发送消息
 * 3. 处理响应
 */

import { AgentSystem } from '../src/agent_system';
import { BaseAgent } from '../src/base_agent';
import { AgentConfig, AgentMessage } from '../src/types';
import { PID } from '@bactor/core';

/**
 * 问候智能体 - 接收消息并回复问候
 */
class GreeterAgent extends BaseAgent {
    constructor(context: any, config: AgentConfig) {
        super(context, config);
        console.log('[GreeterAgent] 初始化完成');
        // 设置初始行为为task，确保能处理任务消息
        this.become('task');
        console.log('[GreeterAgent] 当前行为：', this.state.behavior);
        console.log('[GreeterAgent] 可用行为：', Array.from(this.behaviorMap.keys()));
    }

    protected async handleTask(message: AgentMessage): Promise<void> {
        console.log('[GreeterAgent] 收到任务消息:');
        console.log(JSON.stringify(message.payload, null, 2));

        // 从消息中提取名称
        const name = (message.payload as any).data?.target || 'World';
        const result = {
            message: `Hello, ${name}!`,
            timestamp: new Date().toISOString()
        };

        console.log(`[GreeterAgent] 生成响应: ${JSON.stringify(result)}`);

        // 发送回复
        const resultMessage: AgentMessage = {
            type: 'RESULT',
            sender: this.agentContext.self,
            timestamp: Date.now(),
            payload: {
                type: 'RESULT',
                result: result
            } as any
        };

        // 切换到result行为以处理结果消息
        this.become('result');
        await this.tell(message.sender, resultMessage);
        console.log(`[GreeterAgent] 已回复问候给 ${name}`);
    }

    // 实现必需的方法
    protected async handleResult(message: AgentMessage): Promise<void> {
        console.log('[GreeterAgent] 收到结果消息');
    }

    protected async handleFeedback(message: AgentMessage): Promise<void> {
        console.log('[GreeterAgent] 收到反馈消息');
    }

    protected async handleCoordination(message: AgentMessage): Promise<void> {
        console.log('[GreeterAgent] 收到协调消息');
    }
}

/**
 * 客户端智能体 - 发送消息并处理响应
 */
class ClientAgent extends BaseAgent {
    constructor(context: any, config: AgentConfig) {
        super(context, config);
        console.log('[ClientAgent] 初始化完成');
        // 设置初始行为为result，确保能处理结果消息
        this.become('result');
        console.log('[ClientAgent] 当前行为：', this.state.behavior);
        console.log('[ClientAgent] 可用行为：', Array.from(this.behaviorMap.keys()));
    }

    protected async handleResult(message: AgentMessage): Promise<void> {
        console.log('[ClientAgent] 收到响应消息:');
        console.log(JSON.stringify((message.payload as any).result, null, 2));
    }

    // 实现必需的方法
    protected async handleTask(message: AgentMessage): Promise<void> {
        console.log('[ClientAgent] 收到任务消息');
    }

    protected async handleFeedback(message: AgentMessage): Promise<void> {
        console.log('[ClientAgent] 收到反馈消息');
    }

    protected async handleCoordination(message: AgentMessage): Promise<void> {
        console.log('[ClientAgent] 收到协调消息');
    }
}

/**
 * 运行示例
 */
async function runExample() {
    console.log('创建 Agent System...');
    const system = new AgentSystem();

    try {
        // 创建客户端智能体
        console.log('创建客户端智能体...');
        const clientPID = await system.createAgent(ClientAgent, {
            role: 'client',
            capabilities: ['messaging']
        });
        console.log(`客户端智能体创建完成: ${JSON.stringify(clientPID)}`);

        // 创建问候智能体
        console.log('创建问候智能体...');
        const greeterPID = await system.createAgent(GreeterAgent, {
            role: 'greeter',
            capabilities: ['greeting']
        });
        console.log(`问候智能体创建完成: ${JSON.stringify(greeterPID)}`);

        // 先等待一下确保智能体已初始化
        await new Promise(resolve => setTimeout(resolve, 500));

        console.log('准备发送任务消息...');
        // 发送问候任务
        const message = {
            type: 'TASK',
            sender: clientPID,
            timestamp: Date.now(),
            payload: {
                type: 'TASK',
                data: { target: '小明' }
            } as any
        };

        console.log(`发送消息: ${JSON.stringify(message)}`);
        await system.send(greeterPID, message);
        console.log('消息已发送');

        // 等待处理完成
        console.log('等待处理完成...');
        await new Promise(resolve => setTimeout(resolve, 2000));

        // 清理资源
        console.log('停止智能体...');
        await system.stopAgent('client');
        await system.stopAgent('greeter');
        console.log('智能体已停止');

    } catch (error) {
        console.error('运行示例时出错:', error);
    }
}

// 运行示例
console.log('====== 开始运行 Hello World 智能体示例 ======');
runExample().then(() => {
    console.log('====== 示例运行完成 ======');
}); 