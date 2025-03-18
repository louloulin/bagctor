import { Agent } from '@mastra/core/agent';
import { Step, Workflow as MastraWorkflow, MachineContext } from './workflow-compat';
import { NodeIdentifier, DistributedNode, AgentContext, WorkflowConfig, WorkflowStep, DistributedWorkflowScheduler } from './types';
import { AgentInteractionProtocol, SharedAgentMemory, DistributedErrorHandler } from './distributed-interaction';
import { EventEmitter } from 'events';

/**
 * 分布式工作流状态枚举
 */
enum WorkflowExecutionState {
    PENDING = 'pending',
    RUNNING = 'running',
    COMPLETED = 'completed',
    FAILED = 'failed',
    RECOVERING = 'recovering'
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
    retryCount?: number;
}

/**
 * 工作流类型
 */
type Workflow = MastraWorkflow;

/**
 * 分布式工作流调度器
 * 负责在分布式环境中调度和执行工作流
 */
export class DistributedWorkflowScheduler extends EventEmitter {
    private agentsMap: Record<string, Agent>;
    private nodes: Map<NodeIdentifier, DistributedNode>;
    private workflowStates: Map<string, {
        state: WorkflowExecutionState;
        stepStatus: Record<string, StepExecutionStatus>;
        context: Record<string, any>;
        lastUpdateTime: number;
    }> = new Map();
    private interactionProtocol: AgentInteractionProtocol;
    private readonly MAX_RETRIES = 3;
    private readonly RETRY_DELAY = 5000; // 5 seconds

    /**
     * 创建分布式工作流调度器
     */
    constructor(
        agents: Record<string, Agent>,
        nodes: Map<NodeIdentifier, DistributedNode>,
        interactionProtocol: AgentInteractionProtocol
    ) {
        super();
        this.agentsMap = agents;
        this.nodes = nodes;
        this.interactionProtocol = interactionProtocol;
        this.startMonitoring();
    }

    /**
     * 获取工作流实例
     */
    public getWorkflow(runId: string): Workflow {
        // TODO: 从持久化存储中获取工作流定义
        return new MastraWorkflow({ name: 'temp' });
    }

    /**
     * 启动工作流监控
     */
    private startMonitoring(): void {
        setInterval(() => {
            this.checkWorkflowHealth();
        }, 30000); // Check every 30 seconds
    }

    /**
     * 检查工作流健康状态
     */
    private async checkWorkflowHealth(): Promise<void> {
        for (const [runId, state] of this.workflowStates.entries()) {
            if (state.state === WorkflowExecutionState.RUNNING) {
                const now = Date.now();
                if (now - state.lastUpdateTime > 60000) { // 1 minute timeout
                    await this.handleWorkflowTimeout(runId);
                }
            }
        }
    }

    /**
     * 处理工作流超时
     */
    private async handleWorkflowTimeout(runId: string): Promise<void> {
        const state = this.workflowStates.get(runId);
        if (!state) return;

        // 标记为恢复状态
        this.updateWorkflowState(runId, WorkflowExecutionState.RECOVERING);
        this.emit('workflowTimeout', { runId, state });

        // 尝试恢复失败的步骤
        for (const [stepId, stepStatus] of Object.entries(state.stepStatus)) {
            if (stepStatus.state === 'failed' && (!stepStatus.retryCount || stepStatus.retryCount < this.MAX_RETRIES)) {
                await this.retryStep(runId, stepId);
            }
        }

        // 恢复工作流状态
        this.updateWorkflowState(runId, WorkflowExecutionState.RUNNING);
    }

    /**
     * 重新执行失败的步骤
     */
    public async retryStep(runId: string, stepId: string): Promise<void> {
        const state = this.workflowStates.get(runId);
        if (!state || state.state !== WorkflowExecutionState.FAILED) {
            throw new Error(`Workflow ${runId} is not in failed state`);
        }

        // 重新执行步骤
        const workflow = this.getWorkflow(runId);
        const step = workflow.getSteps().find((s: Step) => s.getId() === stepId);
        if (step) {
            await this.executeStep(workflow, step, runId);
        }
    }

    /**
     * 执行步骤
     */
    public async executeStep(workflow: Workflow, step: Step, runId: string): Promise<void> {
        // 更新步骤状态
        this.updateStepStatus(runId, step.getId(), {
            state: 'running',
            startTime: Date.now()
        });

        try {
            // 执行步骤
            const result = await step.execute({
                machineContext: new MachineContext(runId),
                agentsMap: this.agentsMap,
                stepId: step.getId()
            });

            // 更新步骤状态
            this.updateStepStatus(runId, step.getId(), {
                state: 'completed',
                endTime: Date.now(),
                result
            });
        } catch (error) {
            // 更新步骤状态
            this.updateStepStatus(runId, step.getId(), {
                state: 'failed',
                endTime: Date.now(),
                error
            });

            // 处理错误
            await this.handleStepError(runId, step.getId(), error);
        }
    }

    /**
     * 调度工作流执行
     */
    async scheduleWorkflow(workflow: Workflow, runId: string): Promise<void> {
        // 创建工作流状态
        this.workflowStates.set(runId, {
            state: WorkflowExecutionState.PENDING,
            stepStatus: {},
            context: {},
            lastUpdateTime: Date.now()
        });

        try {
            // 更新状态为运行中
            this.updateWorkflowState(runId, WorkflowExecutionState.RUNNING);

            // 按顺序执行每个步骤
            const stepSequence = (workflow as any).stepSequence;
            for (const stepId of stepSequence) {
                const step = (workflow as any).steps.find((s: Step) => s.getId() === stepId);
                if (!step) {
                    throw new Error(`未找到步骤: ${stepId}`);
                }
                await this.executeStep(workflow, step, runId);
            }

            // 更新状态为完成
            this.updateWorkflowState(runId, WorkflowExecutionState.COMPLETED);
        } catch (error) {
            // 更新状态为失败
            this.updateWorkflowState(runId, WorkflowExecutionState.FAILED);
            const context: AgentContext = {
                id: runId,
                agentId: 'workflow',
                nodeId: 'workflow',
                state: {
                    status: 'failed',
                    error: error instanceof Error ? error.message : String(error)
                },
                history: [],
                createdAt: Date.now(),
                updatedAt: Date.now()
            };
            await DistributedErrorHandler.handleNodeFailure(runId, context);
            throw error;
        }
    }

    /**
     * 更新工作流状态
     */
    private updateWorkflowState(runId: string, state: WorkflowExecutionState): void {
        const workflowState = this.workflowStates.get(runId);
        if (workflowState) {
            workflowState.state = state;
            workflowState.lastUpdateTime = Date.now();
            this.emit('workflowStateChange', { runId, state });
        }
    }

    /**
     * 更新步骤状态
     */
    private updateStepStatus(runId: string, stepId: string, status: Partial<StepExecutionStatus>): void {
        const workflowState = this.workflowStates.get(runId);
        if (workflowState) {
            workflowState.stepStatus[stepId] = {
                ...workflowState.stepStatus[stepId],
                ...status
            };
            workflowState.lastUpdateTime = Date.now();
            this.emit('stepStatusChange', { runId, stepId, status: workflowState.stepStatus[stepId] });
        }
    }

    /**
     * 获取工作流状态
     */
    getWorkflowState(runId: string): WorkflowExecutionState | undefined {
        return this.workflowStates.get(runId)?.state;
    }

    /**
     * 获取步骤执行状态
     */
    getStepStatus(runId: string, stepId: string): StepExecutionStatus | undefined {
        const workflowState = this.workflowStates.get(runId);
        return workflowState ? workflowState.stepStatus[stepId] : undefined;
    }

    /**
     * 处理步骤错误
     */
    private async handleStepError(runId: string, stepId: string, error: any): Promise<void> {
        const state = this.workflowStates.get(runId);
        if (!state) return;

        const stepStatus = state.stepStatus[stepId];
        if (!stepStatus) return;

        // 增加重试计数
        stepStatus.retryCount = (stepStatus.retryCount || 0) + 1;

        // 检查是否需要重试
        if (stepStatus.retryCount <= this.MAX_RETRIES) {
            // 等待重试延迟
            await new Promise(resolve => setTimeout(resolve, this.RETRY_DELAY));

            // 重置步骤状态
            this.updateStepStatus(runId, stepId, {
                state: 'pending',
                startTime: undefined,
                endTime: undefined,
                result: undefined,
                error: undefined
            });

            // 重新执行步骤
            const workflow = this.getWorkflow(runId);
            const step = workflow.getSteps().find((s: Step) => s.getId() === stepId);
            if (step) {
                await this.executeStep(workflow, step, runId);
            }
        } else {
            // 超过最大重试次数，标记工作流为失败
            this.updateWorkflowState(runId, WorkflowExecutionState.FAILED);
        }
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
     * 执行分布式工作流
     * @param workflow 工作流配置
     * @param context 执行上下文
     */
    async executeWorkflow(workflow: WorkflowConfig, context: any = {}) {
        // 验证工作流配置
        this.validateWorkflow(workflow);

        // 获取工作流调度计划
        const executionPlan = await this.scheduler.createExecutionPlan(workflow);

        // 执行工作流步骤
        const results = {};
        for (const step of executionPlan.steps) {
            try {
                // 获取执行节点
                const executionNode = await this.scheduler.getExecutionNode(step);

                // 准备步骤输入
                const input = typeof step.input === 'function'
                    ? step.input(context)
                    : step.input;

                // 在目标节点执行步骤
                const result = await this.executeStepOnNode(executionNode, step, input);

                // 存储结果
                if (step.output) {
                    results[step.output] = result;
                    context[step.output] = result;
                }
            } catch (error) {
                // 处理错误并尝试恢复
                await this.handleStepError(step, error, workflow);
            }
        }

        return results;
    }

    /**
     * 在指定节点上执行工作流步骤
     */
    private async executeStepOnNode(node: NodeIdentifier, step: WorkflowStep, input: any) {
        const agent = this.agentsMap[step.agent];
        if (!agent) {
            throw new Error(`Agent ${step.agent} not found`);
        }

        // 如果是本地节点，直接执行
        if (node === 'local') {
            return await agent.generate(input);
        }

        // 否则，通过远程调用执行
        return await this.scheduler.executeRemoteStep(node, step, input);
    }

    /**
     * 验证工作流配置
     */
    private validateWorkflow(workflow: WorkflowConfig) {
        if (!workflow.steps || !Array.isArray(workflow.steps)) {
            throw new Error('Invalid workflow: steps must be an array');
        }

        for (const step of workflow.steps) {
            if (!step.agent || !this.agentsMap[step.agent]) {
                throw new Error(`Invalid workflow: agent ${step.agent} not found`);
            }
        }
    }

    /**
     * 处理步骤执行错误
     */
    private async handleStepError(step: WorkflowStep, error: Error, workflow: WorkflowConfig) {
        // 检查是否有重试配置
        const retryConfig = workflow.retry || {
            maxAttempts: 3,
            delay: 1000
        };

        // 尝试重试执行
        let attempts = 1;
        while (attempts < retryConfig.maxAttempts) {
            try {
                // 等待指定延迟
                await new Promise(resolve => setTimeout(resolve, retryConfig.delay));

                // 重新调度到不同节点
                const newNode = await this.scheduler.getAlternativeNode(step);
                return await this.executeStepOnNode(newNode, step, step.input);
            } catch (retryError) {
                attempts++;
                if (attempts >= retryConfig.maxAttempts) {
                    throw new Error(`Step ${step.agent} failed after ${attempts} attempts: ${error.message}`);
                }
            }
        }

        throw error;
    }

    /**
     * 处理远程步骤执行请求
     * 用于接收和处理来自其他节点的步骤执行请求
     */
    async handleRemoteStepExecution(message: { stepId: string; context: string; runId: string }): Promise<string> {
        const { stepId, context, runId } = message;
        const parsedContext = JSON.parse(context);

        try {
            // 获取工作流实例
            const workflow = this.scheduler.getWorkflow(runId);
            const step = workflow.getSteps().find((s: Step) => s.getId() === stepId);

            if (!step) {
                throw new Error(`Step ${stepId} not found in workflow ${runId}`);
            }

            // 创建机器上下文
            const machineContext = new MachineContext(runId, parsedContext);

            // 执行步骤
            const result = await step.execute({
                machineContext,
                agentsMap: this.agentsMap,
                stepId
            });

            // 更新共享内存中的步骤结果
            await SharedAgentMemory.updateWorkflowContext(runId, stepId, result);

            return JSON.stringify({
                success: true,
                result,
                timestamp: Date.now()
            });
        } catch (error) {
            // 记录错误到共享内存
            await SharedAgentMemory.updateWorkflowContext(runId, `${stepId}_error`, {
                error: error instanceof Error ? error.message : String(error),
                timestamp: Date.now()
            });

            return JSON.stringify({
                success: false,
                error: error instanceof Error ? error.message : String(error),
                timestamp: Date.now()
            });
        }
    }

    /**
     * 恢复工作流执行
     * 用于从失败状态恢复工作流
     */
    public async recoverWorkflow(runId: string): Promise<void> {
        const state = this.scheduler.getWorkflowState(runId);
        if (!state || state !== WorkflowExecutionState.FAILED) {
            throw new Error(`Workflow ${runId} is not in failed state`);
        }

        // 获取工作流实例
        const workflow = this.scheduler.getWorkflow(runId);

        // 从共享内存恢复上下文
        const contextId = `workflow_context_${runId}`;
        const context = await SharedAgentMemory.get(contextId);
        if (!context) {
            throw new Error(`No context found for workflow ${runId}`);
        }

        // 重新调度工作流
        await this.scheduler.scheduleWorkflow(workflow, runId);
    }

    /**
     * 执行远程步骤执行请求
     */
    public async handleRemoteStepExecutionRequest(request: {
        runId: string;
        stepId: string;
        nodeId: NodeIdentifier;
    }): Promise<void> {
        try {
            // 获取工作流实例
            const workflow = this.scheduler.getWorkflow(request.runId);
            const step = workflow.getSteps().find((s: Step) => s.getId() === request.stepId);
            if (step) {
                await this.scheduler.executeStep(workflow, step, request.runId);
            }
        } catch (error) {
            console.error(`Failed to execute remote step: ${request.stepId}`, error);
            throw error;
        }
    }
}