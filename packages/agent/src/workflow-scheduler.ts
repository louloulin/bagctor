import {
    NodeIdentifier,
    WorkflowConfig,
    WorkflowStep,
    DistributedWorkflowScheduler,
    DistributedNode
} from './types';
import { Agent } from '@mastra/core/agent';
import { AgentInteractionProtocol } from './distributed-interaction';

export class DefaultWorkflowScheduler implements DistributedWorkflowScheduler {
    private nodes: Map<NodeIdentifier, DistributedNode>;
    private currentNodeId: NodeIdentifier;
    private agentsMap: Record<string, Agent>;

    constructor(
        nodes: Map<NodeIdentifier, DistributedNode>,
        currentNodeId: NodeIdentifier,
        agentsMap: Record<string, Agent>
    ) {
        this.nodes = nodes;
        this.currentNodeId = currentNodeId;
        this.agentsMap = agentsMap;
    }

    /**
     * 创建工作流执行计划
     */
    async createExecutionPlan(workflow: WorkflowConfig): Promise<{ steps: WorkflowStep[] }> {
        // 如果有节点分配配置，使用配置的分配
        if (workflow.nodeAssignment) {
            return {
                steps: workflow.steps.map(step => ({
                    ...step,
                    targetNode: workflow.nodeAssignment?.[step.agent] || 'local'
                }))
            };
        }

        // 否则，根据负载均衡策略分配
        return {
            steps: workflow.steps.map(step => ({
                ...step,
                targetNode: this.selectNodeByLoad(step)
            }))
        };
    }

    /**
     * 获取步骤的执行节点
     */
    async getExecutionNode(step: WorkflowStep): Promise<NodeIdentifier> {
        // 如果步骤已经有指定节点，直接返回
        if ((step as any).targetNode) {
            return (step as any).targetNode;
        }

        // 否则，选择一个合适的节点
        return this.selectNodeByLoad(step);
    }

    /**
     * 在远程节点执行步骤
     */
    async executeRemoteStep(node: NodeIdentifier, step: WorkflowStep, input: any): Promise<any> {
        // 获取目标节点信息
        const targetNode = this.nodes.get(node);
        if (!targetNode) {
            throw new Error(`Node ${node} not found`);
        }

        // 使用 AgentInteractionProtocol 发送执行请求
        return await AgentInteractionProtocol.sendMessage(
            this.currentNodeId,
            node,
            JSON.stringify({
                type: 'execute_step',
                agent: step.agent,
                input
            })
        );
    }

    /**
     * 获取替代节点（用于错误恢复）
     */
    async getAlternativeNode(step: WorkflowStep): Promise<NodeIdentifier> {
        // 获取当前节点
        const currentNode = (step as any).targetNode;

        // 选择一个不同的节点
        const availableNodes = Array.from(this.nodes.entries())
            .filter(([id, node]) =>
                id !== currentNode &&
                node.status === 'online' &&
                node.agents.includes(step.agent)
            );

        if (availableNodes.length === 0) {
            return 'local'; // 如果没有其他可用节点，使用本地节点
        }

        // 选择负载最低的节点
        return availableNodes.reduce((best, [id, node]) => {
            const currentLoad = node.resources.load;
            const bestNode = this.nodes.get(best);
            const bestLoad = bestNode ? bestNode.resources.load : Infinity;
            return currentLoad < bestLoad ? id : best;
        }, availableNodes[0][0]);
    }

    /**
     * 根据负载选择执行节点
     */
    private selectNodeByLoad(step: WorkflowStep): NodeIdentifier {
        // 获取所有可用且包含所需智能体的节点
        const availableNodes = Array.from(this.nodes.entries())
            .filter(([_, node]) =>
                node.status === 'online' &&
                node.agents.includes(step.agent)
            );

        if (availableNodes.length === 0) {
            return 'local'; // 如果没有可用节点，使用本地节点
        }

        // 选择负载最低的节点
        return availableNodes.reduce((best, [id, node]) => {
            const currentLoad = node.resources.load;
            const bestNode = this.nodes.get(best);
            const bestLoad = bestNode ? bestNode.resources.load : Infinity;
            return currentLoad < bestLoad ? id : best;
        }, availableNodes[0][0]);
    }

    /**
     * 获取工作流配置
     */
    async getWorkflow(workflowId: string): Promise<WorkflowConfig> {
        // 从存储中获取工作流配置
        // 这里应该实现实际的存储逻辑
        throw new Error('Method not implemented.');
    }

    /**
     * 获取工作流状态
     */
    async getWorkflowState(workflowId: string): Promise<any> {
        // 从存储中获取工作流状态
        // 这里应该实现实际的存储逻辑
        throw new Error('Method not implemented.');
    }

    /**
     * 调度工作流
     */
    async scheduleWorkflow(workflow: WorkflowConfig, workflowId: string): Promise<void> {
        // 将工作流保存到存储中
        // 这里应该实现实际的存储逻辑
        throw new Error('Method not implemented.');
    }

    /**
     * 执行工作流步骤
     */
    async executeStep(step: WorkflowStep, context: any): Promise<any> {
        // 获取执行节点
        const node = await this.getExecutionNode(step);

        // 准备步骤输入
        const input = typeof step.input === 'function'
            ? step.input(context)
            : step.input;

        // 执行步骤
        if (node === 'local') {
            // 本地执行
            const agent = this.agentsMap[step.agent];
            if (!agent) {
                throw new Error(`Agent ${step.agent} not found`);
            }
            return await agent.generate(input);
        } else {
            // 远程执行
            return await this.executeRemoteStep(node, step, input);
        }
    }
} 