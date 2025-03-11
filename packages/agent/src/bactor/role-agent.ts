/**
 * Role Agent Implementation
 * 
 * 专注于扮演特定角色的Agent实现，继承自BactorAgent
 */

import { Actor, ActorContext, PID } from '@bactor/core';
import { BactorAgent, BactorAgentConfig, AgentResponse } from './bactor-agent';
import { Tool } from '../tools';

// Mock Memory implementation
interface Memory {
    add(input: string, response: string, metadata?: Record<string, any>): Promise<void>;
    retrieve(query: string, options?: any): Promise<any[]>;
    clear(): Promise<void>;
}

/**
 * 角色Agent配置
 */
export interface RoleAgentConfig extends BactorAgentConfig {
    role: string;
    capabilities?: string[];
    personality?: string;
    knowledge?: string[];
}

/**
 * 角色Agent类
 * 
 * 专注于扮演特定角色的Agent，如ProductManager, Programmer, Designer等
 */
export class RoleAgent extends BactorAgent {
    private roleConfig: RoleAgentConfig;

    constructor(context: ActorContext, config: RoleAgentConfig) {
        super(context, config);
        this.roleConfig = config;

        // 增强系统提示以反映角色特性
        this.enhanceSystemPrompt();
    }

    /**
     * 增强系统提示以反映角色特性
     */
    private enhanceSystemPrompt(): void {
        const rolePrompt = this.buildRolePrompt();

        // 更新底层Agent的系统提示 - use config-based approach instead of direct property access
        if (this.mastraAgent) {
            // Use a safer approach that doesn't access systemPrompt directly
            const originalPrompt = (this.mastraAgent as any).config?.instructions || "";
            // Update the config instead of directly modifying the systemPrompt
            (this.mastraAgent as any).config = {
                ...(this.mastraAgent as any).config,
                instructions: `${originalPrompt}\n\n${rolePrompt}`
            };
        }
    }

    /**
     * 构建角色提示
     */
    private buildRolePrompt(): string {
        const { role, capabilities, personality, knowledge } = this.roleConfig;

        let prompt = `You are a ${role}.\n\n`;

        // 添加能力描述
        if (capabilities && capabilities.length > 0) {
            prompt += "Your capabilities include:\n";
            capabilities.forEach(capability => {
                prompt += `- ${capability}\n`;
            });
            prompt += "\n";
        }

        // 添加性格描述
        if (personality) {
            prompt += `Your personality traits: ${personality}\n\n`;
        }

        // 添加知识领域
        if (knowledge && knowledge.length > 0) {
            prompt += "Your knowledge areas include:\n";
            knowledge.forEach(area => {
                prompt += `- ${area}\n`;
            });
            prompt += "\n";
        }

        return prompt;
    }

    /**
     * 根据角色能力修改生成的响应
     */
    async generate(input: string): Promise<AgentResponse> {
        // 获取基础实现的响应
        const response = await super.generate(input);

        // 这里可以添加角色特定的后处理逻辑
        // 例如，添加角色特定的"口头禅"或格式化输出

        return response;
    }
}

/**
 * 创建RoleAgent的工厂函数
 */
export function createRoleAgent(
    system: any,
    config: RoleAgentConfig
): Promise<PID> {
    return system.spawn({
        producer: (context: ActorContext) => new RoleAgent(context, config)
    });
} 