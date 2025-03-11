/**
 * Skill Agent Implementation
 * 
 * 专注于执行特定技能的Agent实现，继承自BactorAgent
 */

import { ActorContext, PID } from '@bactor/core';
import { BactorAgent, BactorAgentConfig, AgentResponse } from './bactor-agent';
import { Tool } from '../tools';

/**
 * 技能Agent配置
 */
export interface SkillAgentConfig extends BactorAgentConfig {
    skillName: string;  // 技能名称
    skillDescription: string;  // 技能详细描述
    skillParams?: string[];  // 技能参数列表
    skillExamples?: string[];  // 技能使用示例
}

/**
 * 技能Agent类
 * 
 * 专注于执行特定技能的Agent，例如代码生成、数据分析、文本摘要等
 */
export class SkillAgent extends BactorAgent {
    private skillConfig: SkillAgentConfig;

    constructor(context: ActorContext, config: SkillAgentConfig) {
        super(context, config);
        this.skillConfig = config;

        // 增强系统提示以反映技能特性
        this.enhanceSystemPrompt();
    }

    /**
     * 增强系统提示以反映技能特性
     */
    private enhanceSystemPrompt(): void {
        const skillPrompt = this.buildSkillPrompt();

        // 更新底层Agent的系统提示
        if (this.mastraAgent) {
            // Use a safer approach that doesn't access systemPrompt directly
            const originalPrompt = (this.mastraAgent as any).config?.instructions || "";
            // Update the config instead of directly modifying the systemPrompt
            (this.mastraAgent as any).config = {
                ...(this.mastraAgent as any).config,
                instructions: `${originalPrompt}\n\n${skillPrompt}`
            };
        }
    }

    /**
     * 构建技能提示
     */
    private buildSkillPrompt(): string {
        const { skillName, skillDescription, skillParams, skillExamples } = this.skillConfig;

        let prompt = `You are specialized in the following skill: ${skillName}\n\n`;
        prompt += `Skill description: ${skillDescription}\n\n`;

        // 添加参数描述
        if (skillParams && skillParams.length > 0) {
            prompt += "This skill requires the following parameters:\n";
            skillParams.forEach(param => {
                prompt += `- ${param}\n`;
            });
            prompt += "\n";
        }

        // 添加示例
        if (skillExamples && skillExamples.length > 0) {
            prompt += "Examples of using this skill:\n";
            skillExamples.forEach((example, index) => {
                prompt += `Example ${index + 1}: ${example}\n`;
            });
            prompt += "\n";
        }

        prompt += "Focus exclusively on performing this skill to the best of your abilities.\n";

        return prompt;
    }

    /**
     * 执行技能
     * @param input 输入参数
     */
    async executeSkill(input: string): Promise<AgentResponse> {
        return this.generate(input);
    }

    /**
     * 验证输入
     */
    validateInput(input: string): boolean {
        // 确保输入不为空
        return Boolean(input && input.trim().length > 0);
    }
}

/**
 * 创建SkillAgent的工厂函数
 */
export function createSkillAgent(
    system: any,
    config: SkillAgentConfig
): Promise<PID> {
    return system.spawn({
        producer: (context: ActorContext) => new SkillAgent(context, config)
    });
} 