/**
 * Agent选择器 - 根据任务自动选择和组合合适的Agent
 */
import { PID } from '@bactor/core';
import { AgentSystem } from '../agent_system';
import { BaseAgent } from '../base_agent';
import { AgentConfig } from '../types';

/**
 * Agent类型
 */
export interface AgentType<T extends BaseAgent = BaseAgent> {
    // Agent类构造函数
    agentClass: new (...args: any[]) => T;

    // Agent类型名称
    name: string;

    // Agent类型描述
    description: string;

    // Agent特长任务类型
    taskTypes: string[];

    // Agent能力标签
    capabilities: string[];

    // Agent默认配置
    defaultConfig: Partial<AgentConfig>;

    // Agent是否适合特定任务的评分函数
    scoreForTask: (task: AgentTask) => number;
}

/**
 * Agent任务接口
 */
export interface AgentTask {
    // 任务ID
    id: string;

    // 任务类型
    type: string;

    // 任务描述
    description: string;

    // 任务输入
    input: any;

    // 任务所需能力
    requiredCapabilities?: string[];

    // 任务优先级
    priority?: number;

    // 任务截止时间
    deadline?: number;

    // 自定义属性
    [key: string]: any;
}

/**
 * Agent选择结果
 */
export interface AgentSelectionResult {
    // 选中的Agent PID
    agentPID: PID;

    // Agent类型
    agentType: AgentType;

    // 匹配得分
    score: number;

    // 用于该任务的配置
    config: AgentConfig;
}

/**
 * Agent选择器配置选项
 */
export interface AgentSelectorOptions {
    // 最小匹配得分阈值 (0-1)
    minScore?: number;

    // 是否启用缓存
    enableCache?: boolean;

    // 缓存过期时间（毫秒）
    cacheExpiry?: number;

    // 执行任务前的准备时间（毫秒）
    prepareTime?: number;
}

/**
 * Agent选择器
 */
export class AgentSelector {
    // 已注册的Agent类型
    private agentTypes: AgentType[] = [];

    // 选择器选项
    private options: Required<AgentSelectorOptions>;

    // Agent系统实例
    private agentSystem: AgentSystem;

    // 选择缓存
    private selectionCache: Map<string, {
        result: AgentSelectionResult;
        timestamp: number;
    }> = new Map();

    /**
     * 构造函数
     */
    constructor(
        agentSystem: AgentSystem,
        options: AgentSelectorOptions = {}
    ) {
        this.agentSystem = agentSystem;

        // 设置默认选项
        this.options = {
            minScore: options.minScore ?? 0.5,
            enableCache: options.enableCache ?? true,
            cacheExpiry: options.cacheExpiry ?? 5 * 60 * 1000, // 5分钟
            prepareTime: options.prepareTime ?? 1000 // 1秒
        };
    }

    /**
     * 注册Agent类型
     */
    registerAgentType(agentType: AgentType): void {
        this.agentTypes.push(agentType);
    }

    /**
     * 获取所有注册的Agent类型
     */
    getAgentTypes(): AgentType[] {
        return [...this.agentTypes];
    }

    /**
     * 根据任务选择最合适的Agent
     */
    async selectAgentForTask(task: AgentTask): Promise<AgentSelectionResult | null> {
        // 检查缓存
        if (this.options.enableCache) {
            const cachedResult = this.getFromCache(task);
            if (cachedResult) {
                return cachedResult;
            }
        }

        // 评分所有Agent类型
        const scoredAgents = this.agentTypes.map(agentType => {
            const score = agentType.scoreForTask(task);
            return { agentType, score };
        });

        // 按得分降序排序
        scoredAgents.sort((a, b) => b.score - a.score);

        // 获取得分最高的Agent
        const bestMatch = scoredAgents[0];

        // 检查是否超过最小得分阈值
        if (!bestMatch || bestMatch.score < this.options.minScore) {
            return null;
        }

        // 创建选定的Agent实例
        const config = this.prepareAgentConfig(bestMatch.agentType, task);
        const agentPID = await this.agentSystem.createAgent(
            bestMatch.agentType.agentClass,
            config
        );

        // 创建选择结果
        const result: AgentSelectionResult = {
            agentPID,
            agentType: bestMatch.agentType,
            score: bestMatch.score,
            config
        };

        // 缓存结果
        if (this.options.enableCache) {
            this.addToCache(task, result);
        }

        return result;
    }

    /**
     * 为一组任务选择多个Agent
     */
    async selectAgentsForTasks(tasks: AgentTask[]): Promise<Map<string, AgentSelectionResult | null>> {
        const results = new Map<string, AgentSelectionResult | null>();

        // 处理每个任务
        for (const task of tasks) {
            const result = await this.selectAgentForTask(task);
            results.set(task.id, result);
        }

        return results;
    }

    /**
     * 为任务选择最佳Agent组合
     */
    async selectTeamForTask(task: AgentTask, teamSize: number = 3): Promise<AgentSelectionResult[]> {
        // 评分所有Agent类型
        const scoredAgents = this.agentTypes.map(agentType => {
            const score = agentType.scoreForTask(task);
            return { agentType, score };
        });

        // 按得分降序排序
        scoredAgents.sort((a, b) => b.score - a.score);

        // 取得分最高的N个Agent
        const topAgents = scoredAgents.slice(0, teamSize);

        // 过滤掉得分低于阈值的Agent
        const qualifiedAgents = topAgents.filter(a => a.score >= this.options.minScore);

        // 创建每个Agent
        const team: AgentSelectionResult[] = [];

        for (const { agentType, score } of qualifiedAgents) {
            const config = this.prepareAgentConfig(agentType, task);
            const agentPID = await this.agentSystem.createAgent(
                agentType.agentClass,
                config
            );

            team.push({
                agentPID,
                agentType,
                score,
                config
            });
        }

        return team;
    }

    /**
     * 清理缓存
     */
    clearCache(): void {
        this.selectionCache.clear();
    }

    /**
     * 内部方法：从缓存获取结果
     */
    private getFromCache(task: AgentTask): AgentSelectionResult | null {
        if (!this.options.enableCache) {
            return null;
        }

        const cached = this.selectionCache.get(task.id);
        if (!cached) {
            return null;
        }

        // 检查是否过期
        const now = Date.now();
        if (now - cached.timestamp > this.options.cacheExpiry) {
            this.selectionCache.delete(task.id);
            return null;
        }

        return cached.result;
    }

    /**
     * 内部方法：添加结果到缓存
     */
    private addToCache(task: AgentTask, result: AgentSelectionResult): void {
        if (!this.options.enableCache) {
            return;
        }

        this.selectionCache.set(task.id, {
            result,
            timestamp: Date.now()
        });
    }

    /**
     * 内部方法：准备Agent配置
     */
    private prepareAgentConfig(agentType: AgentType, task: AgentTask): AgentConfig {
        // 合并默认配置和任务特定配置
        return {
            ...agentType.defaultConfig,
            role: agentType.name,
            context: {
                task: {
                    id: task.id,
                    type: task.type,
                    description: task.description
                }
            }
        } as AgentConfig;
    }
} 