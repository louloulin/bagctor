import { Agent } from '@mastra/core/agent';
import { MCPClient, MCPTool, MCPConfiguration } from './client';

/**
 * MCP 集成选项
 */
export interface MCPIntegrationOptions {
    /** 是否启用 MCP 集成 */
    enabled: boolean;
    /** MCP 注册表 URL */
    registryUrl?: string;
    /** MCP 服务器列表 */
    servers?: Record<string, {
        url: string;
        apiKey?: string;
    }>;
    /** 是否自动发现和注册所有工具 */
    autoDiscoverTools?: boolean;
}

/**
 * MCP 工具适配器
 * 将 MCP 工具转换为 Mastra 工具格式
 */
export function adaptMCPToolToMastra(tool: MCPTool) {
    return {
        name: tool.name,
        description: tool.description,
        parameters: tool.parameters,
        handler: tool.handler
    };
}

/**
 * MCP 集成管理器
 * 负责发现和集成 MCP 工具到智能体
 */
export class MCPIntegrationManager {
    private options: MCPIntegrationOptions;
    private configuration: MCPConfiguration;
    private toolCache: Record<string, MCPTool> = {};
    private isInitialized = false;

    /**
     * 构造一个新的 MCP 集成管理器
     */
    constructor(options: MCPIntegrationOptions) {
        this.options = options;

        this.configuration = new MCPConfiguration({
            registry: options.registryUrl,
            servers: options.servers
        });
    }

    /**
     * 初始化 MCP 集成
     */
    async initialize(): Promise<void> {
        if (!this.options.enabled) {
            console.log('MCP integration is disabled');
            return;
        }

        try {
            // 获取连接的工具
            const connectedTools = await this.configuration.getConnectedTools();

            // 将工具添加到缓存
            for (const [serverId, tools] of Object.entries(connectedTools)) {
                for (const tool of tools) {
                    const toolId = `${serverId}/${tool.name}`;
                    this.toolCache[toolId] = tool;
                }
            }

            console.log(`MCP 集成已初始化，发现 ${Object.keys(this.toolCache).length} 个工具`);
            this.isInitialized = true;
        } catch (error) {
            console.error('初始化 MCP 集成时出错:', error);
            throw new Error(`Failed to initialize MCP integration: ${error instanceof Error ? error.message : String(error)}`);
        }
    }

    /**
     * 获取所有可用的 MCP 工具
     */
    async getAvailableTools(): Promise<Record<string, MCPTool>> {
        if (!this.isInitialized) {
            await this.initialize();
        }

        return this.toolCache;
    }

    /**
     * 向智能体注册 MCP 工具
     */
    async registerToolsToAgent(agent: Agent): Promise<string[]> {
        if (!this.options.enabled) {
            return [];
        }

        if (!this.isInitialized) {
            await this.initialize();
        }

        const registeredTools: string[] = [];

        for (const [toolId, tool] of Object.entries(this.toolCache)) {
            try {
                const mastraTool = adaptMCPToolToMastra(tool);
                // 使用智能体的工具配置方法
                if (agent.tools) {
                    agent.tools[toolId] = mastraTool;
                    registeredTools.push(toolId);
                }
            } catch (error) {
                console.warn(`Failed to register MCP tool ${toolId} to agent:`, error);
            }
        }

        console.log(`向智能体 ${agent.name || 'unknown'} 注册了 ${registeredTools.length} 个 MCP 工具`);
        return registeredTools;
    }

    /**
     * 注册特定的 MCP 工具到智能体
     */
    async registerSpecificToolToAgent(agent: Agent, toolId: string): Promise<boolean> {
        if (!this.options.enabled) {
            return false;
        }

        if (!this.isInitialized) {
            await this.initialize();
        }

        const tool = this.toolCache[toolId];
        if (!tool) {
            console.warn(`MCP tool ${toolId} not found`);
            return false;
        }

        try {
            const mastraTool = adaptMCPToolToMastra(tool);
            // 使用智能体的工具配置方法
            if (agent.tools) {
                agent.tools[toolId] = mastraTool;
                console.log(`向智能体 ${agent.name || 'unknown'} 注册了 MCP 工具 ${toolId}`);
                return true;
            }
            return false;
        } catch (error) {
            console.error(`注册 MCP 工具 ${toolId} 时出错:`, error);
            return false;
        }
    }

    /**
     * 添加新的 MCP 服务器
     */
    addServer(serverId: string, config: { url: string; apiKey?: string }): void {
        this.configuration.addServer(serverId, config);
        // 标记为未初始化，下次调用时重新发现工具
        this.isInitialized = false;
    }

    /**
     * 移除 MCP 服务器
     */
    removeServer(serverId: string): void {
        this.configuration.removeServer(serverId);

        // 从缓存中移除该服务器的工具
        for (const toolId of Object.keys(this.toolCache)) {
            if (toolId.startsWith(`${serverId}/`)) {
                delete this.toolCache[toolId];
            }
        }
    }
} 