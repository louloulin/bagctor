/**
 * 极简智能体示例
 */
import { AgentSystem } from '../src/agent_system';
import { BaseAgent } from '../src/base_agent';
import { AgentMessage } from '../src/types';

// 最简单的智能体实现
class MinimalAgent extends BaseAgent {
    constructor(context: any, config: any) {
        super(context, config);
        // 在构造函数中设置行为
        this.become('task');
    }

    // 必须实现的处理方法
    protected async handleTask(message: AgentMessage): Promise<void> {
        // 提取名称参数
        const name = (message.payload as any).name || 'World';
        console.log(`收到问候任务，目标: ${name}`);

        // 生成回复并发送
        await this.tell(message.sender, {
            type: 'RESULT',
            sender: this.agentContext.self,
            timestamp: Date.now(),
            payload: { message: `Hello, ${name}!` } as any
        });
    }

    // 处理结果消息
    protected async handleResult(message: AgentMessage): Promise<void> {
        console.log(`收到回应: ${JSON.stringify(message.payload)}`);
    }

    // 其他必需方法的空实现
    protected async handleFeedback(message: AgentMessage): Promise<void> { }
    protected async handleCoordination(message: AgentMessage): Promise<void> { }
}

// 主函数
async function main() {
    console.log("启动极简智能体示例...");

    // 创建智能体系统
    const system = new AgentSystem();

    try {
        // 创建智能体
        console.log("创建智能体...");
        const agent = await system.createAgent(MinimalAgent, {
            role: 'greeter',
            capabilities: ['greeting']
        });

        // 向自己发送消息
        console.log("发送消息...");
        await system.send(agent, {
            type: 'TASK',
            sender: agent,
            timestamp: Date.now(),
            payload: { name: '小明' } as any
        });

        // 等待处理
        await new Promise(resolve => setTimeout(resolve, 500));

        // 停止智能体
        console.log("停止智能体...");
        await system.stopAgent('greeter');

    } catch (error) {
        console.error('错误:', error);
    }
}

// 运行示例
main().then(() => console.log('完成')); 