import { Agent } from '@mastra/core/agent';
import { Step, Workflow, MachineContext } from './workflow-compat';
import { NodeIdentifier, DistributedNode } from './types';
import { AgentInteractionProtocol, SharedAgentMemory, DistributedErrorHandler } from './distributed-interaction';

/**
 * 分布式工作流状态枚举
 */
enum WorkflowExecutionState {
    PENDING = 'pending',
    RUNNING = 'running',
    COMPLETED = 'completed',
    FAILED = 'failed'
}

/**
 * 步骤执行状态
 */
interface StepExecutionStatus {
    stepId: string;
    state: 'pending' | 'running' | 'completed' | 'failed';
    nodeId?: NodeIdentifier;
    startTime?: number;
    endTime?: number;
    result?: any;
    error?: any;
}

/**
 * 分布式工作流调度器
 * 负责协调跨节点的工作流执行
 */
export class DistributedWorkflowScheduler {
    private agentsMap: Record<string, Agent>;
    private nodes: Map<NodeIdentifier, DistributedNode>;
    private defaultNode: NodeIdentifier;
    private workflowStates: Map<string, {
        workflow: Workflow;
        state: WorkflowExecutionState;
        stepStatus: Record<string, StepExecutionStatus>;
    }> = new Map();

    constructor(agentsMap: Record<string, Agent>, nodes: Map<NodeIdentifier, DistributedNode>, defaultNode: NodeIdentifier) {
        this.agentsMap = agentsMap;
        this.nodes = nodes;
        this.defaultNode = defaultNode;
    }

    /**
     * 注册工作流到调度器
     */
    registerWorkflow(workflow: Workflow, runId: string): void {
        this.workflowStates.set(runId, {
            workflow,
            state: WorkflowExecutionState.PENDING,
            stepStatus: {}
        });
    }

    /**
     * 分配步骤到节点
     * 基于节点负载、步骤需求等分配最佳节点
     */
    assignStepToNode(step: Step, availableNodes: DistributedNode[]): NodeIdentifier {
        // 如果步骤已经指定了节点，尝试使用该节点
        const assignedNode = step.getNodeAssignment();
        if (assignedNode && this.nodes.has(assignedNode)) {
            return assignedNode;
        }

        // 简单负载均衡策略：选择负载最小的节点
        let bestNode = this.defaultNode;
        let lowestLoad = Number.MAX_VALUE;

        for (const node of availableNodes) {
            if (node.status === 'online' && node.resources.load < lowestLoad) {
                lowestLoad = node.resources.load;
                bestNode = node.id;
            }
        }

        return bestNode;
    }

    /**
     * 执行步骤
     * 支持在本地或远程节点执行
     */
    async executeStep(step: Step, context: MachineContext, runId: string): Promise<any> {
        const stepId = step.getId();
        const workflowState = this.workflowStates.get(runId);

        if (!workflowState) {
            throw new Error(`未找到工作流状态: ${runId}`);
        }

        // 更新步骤状态为运行中
        workflowState.stepStatus[stepId] = {
            stepId,
            state: 'running',
            startTime: Date.now()
        };

        try {
            // 分配步骤到节点
            const nodeId = this.assignStepToNode(step, Array.from(this.nodes.values()));
            workflowState.stepStatus[stepId].nodeId = nodeId;

            let result;
            const isLocalNode = nodeId === this.defaultNode;

            if (isLocalNode) {
                // 本地执行步骤
                result = await step.execute({
                    machineContext: context,
                    agentsMap: this.agentsMap,
                    stepId
                });
            } else {
                // 远程执行步骤
                // 1. 序列化上下文
                const serializedContext = JSON.stringify({
                    machineContext: context.getData(),
                    stepId
                });

                // 2. 发送到远程节点执行
                const remoteResult = await this.executeStepOnRemoteNode(nodeId, stepId, serializedContext);
                result = JSON.parse(remoteResult);
            }

            // 更新步骤状态为完成
            workflowState.stepStatus[stepId] = {
                ...workflowState.stepStatus[stepId],
                state: 'completed',
                endTime: Date.now(),
                result
            };

            return result;
        } catch (error) {
            // 更新步骤状态为失败
            workflowState.stepStatus[stepId] = {
                ...workflowState.stepStatus[stepId],
                state: 'failed',
                endTime: Date.now(),
                error
            };

            // 尝试故障恢复
            const recoverySuccessful = await this.attemptStepRecovery(step, context, runId);
            if (!recoverySuccessful) {
                throw error;
            }

            // 重新执行恢复后的步骤（使用不同节点）
            return await this.executeStep(step, context, runId);
        }
    }

    /**
     * 在远程节点执行步骤
     */
    private async executeStepOnRemoteNode(nodeId: NodeIdentifier, stepId: string, serializedContext: string): Promise<string> {
        // 使用AgentInteractionProtocol发送执行请求到远程节点
        const response = await AgentInteractionProtocol.sendMessage(
            'workflow_scheduler',
            `node_${nodeId}`,
            JSON.stringify({
                action: 'execute_step',
                stepId,
                context: serializedContext
            })
        );

        return response;
    }

    /**
     * 尝试步骤恢复
     * 在步骤执行失败时尝试找到备用节点并恢复执行
     */
    private async attemptStepRecovery(step: Step, context: MachineContext, runId: string): Promise<boolean> {
        const stepId = step.getId();
        const workflowState = this.workflowStates.get(runId);

        if (!workflowState) {
            return false;
        }

        const failedStepStatus = workflowState.stepStatus[stepId];
        if (!failedStepStatus || !failedStepStatus.nodeId) {
            return false;
        }

        // 尝试找到备用节点
        const failedNodeId = failedStepStatus.nodeId;
        const alternativeNodes = Array.from(this.nodes.values())
            .filter(node => node.id !== failedNodeId && node.status === 'online');

        if (alternativeNodes.length === 0) {
            return false;
        }

        // 选择一个备用节点
        const recoveryNodeId = this.assignStepToNode(step, alternativeNodes);

        // 将步骤重新分配到备用节点
        step.assignToNode(recoveryNodeId);

        // 记录恢复尝试
        console.log(`尝试在备用节点 ${recoveryNodeId} 上恢复步骤 ${stepId} 的执行`);

        return true;
    }

    /**
     * 监控工作流执行状态
     */
    async monitorWorkflow(runId: string): Promise<void> {
        const workflowState = this.workflowStates.get(runId);

        if (!workflowState) {
            throw new Error(`未找到工作流状态: ${runId}`);
        }

        // 定期检查工作流状态
        const intervalId = setInterval(() => {
            // 检查所有步骤状态
            const allStepsComplete = Object.values(workflowState.stepStatus)
                .every(step => step.state === 'completed');

            const anyStepFailed = Object.values(workflowState.stepStatus)
                .some(step => step.state === 'failed');

            if (allStepsComplete) {
                workflowState.state = WorkflowExecutionState.COMPLETED;
                clearInterval(intervalId);
            } else if (anyStepFailed) {
                workflowState.state = WorkflowExecutionState.FAILED;
                clearInterval(intervalId);
            }
        }, 1000);

        // 确保不会无限等待
        setTimeout(() => {
            clearInterval(intervalId);
        }, 24 * 60 * 60 * 1000); // 24小时超时
    }

    /**
     * 获取工作流执行状态
     */
    getWorkflowStatus(runId: string): WorkflowExecutionState {
        const workflowState = this.workflowStates.get(runId);
        return workflowState ? workflowState.state : WorkflowExecutionState.PENDING;
    }

    /**
     * 获取步骤执行状态
     */
    getStepStatus(runId: string, stepId: string): StepExecutionStatus | undefined {
        const workflowState = this.workflowStates.get(runId);
        return workflowState ? workflowState.stepStatus[stepId] : undefined;
    }
}

/**
 * 分布式工作流执行器
 * 在Bagctor系统中集成Mastra兼容工作流
 */
export class DistributedWorkflowExecutor {
    private scheduler: DistributedWorkflowScheduler;
    private agentsMap: Record<string, Agent>;

    constructor(scheduler: DistributedWorkflowScheduler, agentsMap: Record<string, Agent>) {
        this.scheduler = scheduler;
        this.agentsMap = agentsMap;
    }

    /**
     * 执行Mastra兼容工作流
     */
    async executeWorkflow(workflow: Workflow, runId: string, triggerData?: any): Promise<any> {
        // 注册工作流到调度器
        this.scheduler.registerWorkflow(workflow, runId);

        // 创建工作流上下文
        const sharedContextId = await SharedAgentMemory.createWorkflowContext(runId);
        const machineContext = new MachineContext(runId, triggerData);

        // 储存触发数据到共享内存
        if (triggerData) {
            await SharedAgentMemory.updateWorkflowContext(sharedContextId, 'triggerData', triggerData);
        }

        // 开始监控工作流
        this.scheduler.monitorWorkflow(runId).catch(error => {
            console.error('工作流监控错误:', error);
        });

        // 执行工作流并返回结果
        return { runId, results: {} };
    }

    /**
     * 处理远程步骤执行请求
     * 用于接收和处理来自其他节点的步骤执行请求
     */
    async handleRemoteStepExecution(message: { stepId: string; context: string }): Promise<string> {
        const { stepId, context } = message;
        const parsedContext = JSON.parse(context);

        // 在本地执行步骤逻辑
        try {
            // 这里需要具体实现步骤的执行逻辑
            // 实际应用中需要加载步骤定义和所需资源
            const result = { success: true, data: `执行步骤 ${stepId} 的结果` };
            return JSON.stringify(result);
        } catch (error) {
            return JSON.stringify({ success: false, error: String(error) });
        }
    }
} 