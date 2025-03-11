/**
 * Team Agent Implementation
 * 
 * 用于协调多个Agent协作的团队Agent实现
 */

import { Actor, ActorContext, PID, Props } from '@bactor/core';
import { BactorAgent, BactorAgentConfig, AgentResponse } from './bactor-agent';
import { RoleAgent } from './role-agent';
import { SkillAgent } from './skill-agent';

/**
 * 团队成员信息
 */
export interface TeamMember {
    id: string;
    name: string;
    agent: PID;
    role: string;
    description: string;
}

/**
 * 团队Agent配置
 */
export interface TeamAgentConfig extends BactorAgentConfig {
    teamName: string;
    teamGoal: string;
    teamMembers?: TeamMember[];
    coordinationStrategy?: 'sequential' | 'parallel' | 'hierarchical';
}

/**
 * 任务分配结果
 */
interface TaskAssignment {
    memberId: string;
    task: string;
    priority: number;
}

/**
 * 团队Agent类
 * 
 * 用于协调多个Agent协作的Agent
 */
export class TeamAgent extends BactorAgent {
    private teamConfig: TeamAgentConfig;
    private teamMembers: Map<string, TeamMember> = new Map();

    constructor(context: ActorContext, config: TeamAgentConfig) {
        super(context, config);
        this.teamConfig = config;

        // 注册团队成员
        if (config.teamMembers) {
            for (const member of config.teamMembers) {
                this.registerTeamMember(member);
            }
        }

        // 增强系统提示以反映团队特性
        this.enhanceSystemPrompt();
    }

    /**
     * 增强系统提示以反映团队特性
     */
    private enhanceSystemPrompt(): void {
        const teamPrompt = this.buildTeamPrompt();

        // 更新底层Agent的系统提示
        if (this.mastraAgent) {
            const originalPrompt = this.mastraAgent.systemPrompt || "";
            this.mastraAgent.systemPrompt = `${originalPrompt}\n\n${teamPrompt}`;
        }
    }

    /**
     * 构建团队提示
     */
    private buildTeamPrompt(): string {
        const { teamName, teamGoal, coordinationStrategy } = this.teamConfig;

        let prompt = `You are the coordinator of team: ${teamName}\n\n`;
        prompt += `Team Goal: ${teamGoal}\n\n`;
        prompt += `Coordination Strategy: ${coordinationStrategy || 'sequential'}\n\n`;

        // 添加团队成员描述
        if (this.teamMembers.size > 0) {
            prompt += "Team Members:\n";
            this.teamMembers.forEach(member => {
                prompt += `- ${member.name} (${member.role}): ${member.description}\n`;
            });
            prompt += "\n";
        }

        prompt += "Your job is to coordinate these team members effectively to achieve the team goal.\n";

        return prompt;
    }

    /**
     * 注册团队成员
     */
    registerTeamMember(member: TeamMember): void {
        this.teamMembers.set(member.id, member);

        // 如果系统提示已经设置，则更新它
        if (this.mastraAgent && this.mastraAgent.systemPrompt) {
            this.enhanceSystemPrompt();
        }
    }

    /**
     * 移除团队成员
     */
    removeTeamMember(memberId: string): boolean {
        const result = this.teamMembers.delete(memberId);

        // 如果系统提示已经设置，则更新它
        if (result && this.mastraAgent && this.mastraAgent.systemPrompt) {
            this.enhanceSystemPrompt();
        }

        return result;
    }

    /**
     * 分析任务并分配给适当的团队成员
     */
    private async analyzeAndAssignTask(task: string): Promise<TaskAssignment[]> {
        // 如果没有团队成员，则无法分配任务
        if (this.teamMembers.size === 0) {
            return [];
        }

        // 使用LLM分析任务并决定分配给哪个团队成员
        const prompt = `
Task: ${task}

Team Members:
${Array.from(this.teamMembers.values()).map(m => `- ${m.name} (${m.role}): ${m.description}`).join('\n')}

Please analyze this task and assign it to the most appropriate team member(s).
For each assignment, provide:
1. Member ID
2. Specific subtask description
3. Priority (1-10, where 10 is highest)

Format your response as JSON:
[
  {
    "memberId": "member_id",
    "task": "specific subtask description",
    "priority": priority_number
  }
]
`;

        try {
            const response = await this.generate(prompt);
            const assignmentText = response.content.trim();

            // 尝试解析JSON响应
            let assignments: TaskAssignment[] = [];

            try {
                // 查找JSON开始和结束的位置
                const jsonStart = assignmentText.indexOf('[');
                const jsonEnd = assignmentText.lastIndexOf(']') + 1;

                if (jsonStart >= 0 && jsonEnd > jsonStart) {
                    const jsonText = assignmentText.substring(jsonStart, jsonEnd);
                    assignments = JSON.parse(jsonText);
                }
            } catch (error) {
                console.error("Failed to parse task assignments:", error);
                // 如果解析失败，返回空数组
                return [];
            }

            return assignments;
        } catch (error) {
            console.error("Failed to generate task assignments:", error);
            return [];
        }
    }

    /**
     * 执行团队任务
     */
    async executeTeamTask(task: string): Promise<AgentResponse[]> {
        // 分析任务并分配给团队成员
        const assignments = await this.analyzeAndAssignTask(task);

        if (assignments.length === 0) {
            // 如果没有分配任务，则由团队Agent自己处理
            const response = await this.generate(task);
            return [response];
        }

        const results: AgentResponse[] = [];

        // 根据协调策略执行任务
        const strategy = this.teamConfig.coordinationStrategy || 'sequential';

        if (strategy === 'parallel') {
            // 并行执行所有任务
            const promises = assignments.map(async assignment => {
                const member = this.teamMembers.get(assignment.memberId);
                if (member) {
                    try {
                        // 向团队成员的Actor发送消息并等待响应
                        const response = await member.agent.ask({ type: 'GENERATE', content: assignment.task });
                        return response as AgentResponse;
                    } catch (error) {
                        console.error(`Error executing task by member ${member.name}:`, error);
                        return null;
                    }
                }
                return null;
            });

            const responses = await Promise.all(promises);
            results.push(...responses.filter(r => r !== null) as AgentResponse[]);
        } else {
            // 按优先级顺序执行任务
            // 首先按优先级排序
            assignments.sort((a, b) => b.priority - a.priority);

            for (const assignment of assignments) {
                const member = this.teamMembers.get(assignment.memberId);
                if (member) {
                    try {
                        // 向团队成员的Actor发送消息并等待响应
                        const response = await member.agent.ask({ type: 'GENERATE', content: assignment.task });
                        results.push(response as AgentResponse);
                    } catch (error) {
                        console.error(`Error executing task by member ${member.name}:`, error);
                    }
                }
            }
        }

        return results;
    }

    /**
     * 重写generate方法以支持团队协作
     */
    async generate(input: string): Promise<AgentResponse> {
        // 如果有团队成员并且不是内部任务分析请求，则使用团队协作
        if (this.teamMembers.size > 0 && !input.includes("Please analyze this task and assign it")) {
            const results = await this.executeTeamTask(input);

            // 汇总结果
            if (results.length > 0) {
                // 简单汇总：合并所有响应
                let combinedContent = "Team Results:\n\n";

                for (let i = 0; i < results.length; i++) {
                    const member = Array.from(this.teamMembers.values())[i % this.teamMembers.size];
                    combinedContent += `## From ${member.name} (${member.role}):\n\n${results[i].content}\n\n`;
                }

                return {
                    content: combinedContent,
                    toolCalls: results.flatMap(r => r.toolCalls || [])
                };
            }
        }

        // 如果没有团队成员或者是内部任务分析请求，则由团队Agent自己处理
        return super.generate(input);
    }
}

/**
 * 创建TeamAgent的工厂函数
 */
export function createTeamAgent(
    system: any,
    config: TeamAgentConfig
): Promise<ActorRef> {
    return system.spawn({
        producer: (context: ActorContext) => new TeamAgent(context, config)
    });
} 