import axios from 'axios';
import { z } from 'zod';
import { spawn } from 'child_process';

// ESM 兼容性导入
// @ts-ignore
import EventSourcePolyfill from 'event-source-polyfill';

/**
 * MCP 服务器定义
 */
export interface MCPServerDefinition {
    id: string;
    name: string;
    description: string;
    version: string;
    homepage?: string;
    schemas: Record<string, any>;
}

/**
 * MCP 注册表目录信息
 */
export interface MCPRegistryDirectory {
    name: string;
    description: string;
    version: string;
    homepage?: string;
    servers: string[];
}

/**
 * MCP 工具定义
 */
export interface MCPTool {
    name: string;
    description: string;
    parameters: {
        type: string;
        properties: Record<string, any>;
        required?: string[];
    };
    handler: (...args: any[]) => Promise<any>;
}

/**
 * MCP 客户端配置选项
 */
export interface MCPClientOptions {
    /** 注册表 URL */
    registryUrl?: string;
    /** 服务器 URL */
    serverUrl?: string;
    /** API 密钥 (如果需要) */
    apiKey?: string;
    /** 服务器传输方式 */
    transport?: 'http' | 'sse' | 'stdio';
    /** 如果传输方式为 stdio，则需要提供命令和参数 */
    server?: {
        command?: string;
        args?: string[];
        url?: URL;
        requestInit?: RequestInit;
    };
}

/**
 * MCP 服务器配置
 */
export interface MCPServerConfig {
    id: string;
    config: Record<string, any>;
}

/**
 * MCP 客户端
 * 用于与 MCP 服务器和注册表交互
 */
export class MCPClient {
    private registryUrl?: string;
    private serverUrl?: string;
    private apiKey?: string;
    private transport: 'http' | 'sse' | 'stdio' = 'http';
    private server?: {
        command?: string;
        args?: string[];
        url?: URL;
        requestInit?: RequestInit;
        process?: any;
    };
    private cachedTools: MCPTool[] = [];
    private cachedDirectory?: MCPRegistryDirectory;
    private cachedServerDefinitions: Record<string, MCPServerDefinition> = {};
    private eventSource?: any;
    private connected: boolean = false;

    /**
     * 构造一个新的 MCP 客户端
     */
    constructor(options: MCPClientOptions) {
        this.registryUrl = options.registryUrl;
        this.serverUrl = options.serverUrl;
        this.apiKey = options.apiKey;

        if (options.transport) {
            this.transport = options.transport;
        }

        if (options.server) {
            this.server = { ...options.server };
        }

        // 规范化注册表 URL
        if (this.registryUrl && !this.registryUrl.includes('mcp.json')) {
            // 检查URL是否以斜杠结尾
            if (!this.registryUrl.endsWith('/')) {
                this.registryUrl += '/';
            }
            // 添加 .well-known/mcp.json 路径
            if (!this.registryUrl.includes('.well-known')) {
                this.registryUrl += '.well-known/mcp.json';
            }
        }
    }

    /**
     * 连接到注册表并获取目录信息
     */
    async connectToRegistry(): Promise<MCPRegistryDirectory> {
        if (!this.registryUrl) {
            throw new Error('Registry URL is required to connect to a registry');
        }

        try {
            const response = await axios.get(this.registryUrl, {
                headers: this.apiKey ? { Authorization: `Bearer ${this.apiKey}` } : undefined
            });

            const directory = response.data as MCPRegistryDirectory;
            this.cachedDirectory = directory;
            return directory;
        } catch (error) {
            throw new Error(`Failed to connect to MCP registry: ${error instanceof Error ? error.message : String(error)}`);
        }
    }

    /**
     * 列出注册表中的所有服务器
     */
    async listServers(): Promise<string[]> {
        if (!this.cachedDirectory) {
            await this.connectToRegistry();
        }

        return this.cachedDirectory?.servers || [];
    }

    /**
     * 获取服务器定义
     */
    async getServerDefinition(serverId: string): Promise<MCPServerDefinition> {
        if (!this.registryUrl) {
            throw new Error('Registry URL is required to get server definition');
        }

        // 检查缓存
        if (this.cachedServerDefinitions[serverId]) {
            return this.cachedServerDefinitions[serverId];
        }

        try {
            // 从注册表URL提取基础路径
            const baseUrl = this.registryUrl.replace(/\.well-known\/mcp\.json$/, '').replace(/mcp\.json$/, '');
            const serverUrl = `${baseUrl}servers/${serverId}`;

            const response = await axios.get(serverUrl, {
                headers: this.apiKey ? { Authorization: `Bearer ${this.apiKey}` } : undefined
            });

            const serverDefinition = response.data as MCPServerDefinition;
            this.cachedServerDefinitions[serverId] = serverDefinition;
            return serverDefinition;
        } catch (error) {
            throw new Error(`Failed to get MCP server definition: ${error instanceof Error ? error.message : String(error)}`);
        }
    }

    /**
     * 验证服务器配置
     */
    validateServerConfig(serverDefinition: MCPServerDefinition, config: Record<string, any>): boolean {
        // 这里应该使用服务器定义中的 schema 来验证配置
        // 简化实现
        try {
            const configSchema = z.object(serverDefinition.schemas.config || {});
            configSchema.parse(config);
            return true;
        } catch (error) {
            return false;
        }
    }

    /**
     * 连接到 MCP 服务器
     */
    async connect(serverUrl?: string): Promise<void> {
        // 如果已经连接，先断开连接
        if (this.connected) {
            await this.disconnect();
        }

        if (serverUrl) {
            this.serverUrl = serverUrl;
        }

        // 根据传输方式连接
        switch (this.transport) {
            case 'http':
                await this.connectViaHttp();
                break;
            case 'sse':
                await this.connectViaSSE();
                break;
            case 'stdio':
                await this.connectViaStdio();
                break;
            default:
                throw new Error(`Unsupported transport type: ${this.transport}`);
        }

        this.connected = true;
    }

    /**
     * 通过 HTTP 连接到服务器
     */
    private async connectViaHttp(): Promise<void> {
        if (!this.serverUrl) {
            throw new Error('Server URL is required to connect via HTTP');
        }

        try {
            // 检查服务器是否可用
            await axios.get(this.serverUrl, {
                headers: this.apiKey ? { Authorization: `Bearer ${this.apiKey}` } : undefined
            });
        } catch (error) {
            throw new Error(`Failed to connect to MCP server via HTTP: ${error instanceof Error ? error.message : String(error)}`);
        }
    }

    /**
     * 通过 SSE 连接到服务器
     */
    private async connectViaSSE(): Promise<void> {
        if (!this.server?.url) {
            throw new Error('Server URL is required to connect via SSE');
        }

        try {
            // 创建事件源
            this.eventSource = new EventSourcePolyfill(this.server.url.toString(), {
                headers: {
                    ...(this.apiKey ? { Authorization: `Bearer ${this.apiKey}` } : {}),
                    ...(this.server.requestInit?.headers || {})
                }
            });

            // 等待连接建立
            await new Promise<void>((resolve, reject) => {
                if (!this.eventSource) {
                    reject(new Error('Event source not initialized'));
                    return;
                }

                const timeout = setTimeout(() => {
                    reject(new Error('Connection timeout'));
                }, 10000);

                this.eventSource.onopen = () => {
                    clearTimeout(timeout);
                    resolve();
                };

                this.eventSource.onerror = (event: any) => {
                    clearTimeout(timeout);
                    reject(new Error(`Failed to connect to SSE: ${JSON.stringify(event)}`));
                };
            });
        } catch (error) {
            throw new Error(`Failed to connect to MCP server via SSE: ${error instanceof Error ? error.message : String(error)}`);
        }
    }

    /**
     * 通过 stdio 连接到服务器
     */
    private async connectViaStdio(): Promise<void> {
        if (!this.server?.command) {
            throw new Error('Server command is required to connect via stdio');
        }

        try {
            // 启动子进程
            this.server.process = spawn(
                this.server.command,
                this.server.args || [],
                { stdio: ['pipe', 'pipe', 'pipe'] }
            );

            // 监听进程退出
            this.server.process.on('exit', (code: number) => {
                console.log(`MCP server process exited with code ${code}`);
                this.connected = false;
            });

            // 监听错误
            this.server.process.on('error', (err: Error) => {
                console.error('MCP server process error:', err);
                this.connected = false;
            });

            // 等待进程启动
            await new Promise<void>((resolve) => {
                setTimeout(resolve, 1000);
            });
        } catch (error) {
            throw new Error(`Failed to connect to MCP server via stdio: ${error instanceof Error ? error.message : String(error)}`);
        }
    }

    /**
     * 断开与服务器的连接
     */
    async disconnect(): Promise<void> {
        try {
            // 断开 SSE 连接
            if (this.eventSource) {
                this.eventSource.close();
                this.eventSource = undefined;
            }

            // 终止 stdio 进程
            if (this.server?.process) {
                this.server.process.kill();
                this.server.process = undefined;
            }

            this.connected = false;
        } catch (error) {
            console.error('Error disconnecting from MCP server:', error);
        }
    }

    /**
     * 获取可用工具列表
     */
    async tools(): Promise<Record<string, any>> {
        return this.discoverTools().then(tools => {
            const toolsMap: Record<string, any> = {};
            for (const tool of tools) {
                toolsMap[tool.name] = {
                    description: tool.description,
                    parameters: tool.parameters,
                    handler: tool.handler
                };
            }
            return toolsMap;
        });
    }

    /**
     * 获取可用工具列表
     */
    async discoverTools(): Promise<MCPTool[]> {
        if (!this.connected) {
            await this.connect();
        }

        try {
            // 根据传输方式获取工具
            let tools: MCPTool[] = [];

            switch (this.transport) {
                case 'http':
                    tools = await this.discoverToolsViaHttp();
                    break;
                case 'sse':
                case 'stdio':
                    tools = await this.discoverToolsViaRPC();
                    break;
                default:
                    throw new Error(`Unsupported transport type: ${this.transport}`);
            }

            this.cachedTools = tools;
            return tools;
        } catch (error) {
            throw new Error(`Failed to discover MCP tools: ${error instanceof Error ? error.message : String(error)}`);
        }
    }

    /**
     * 通过 HTTP 获取工具
     */
    private async discoverToolsViaHttp(): Promise<MCPTool[]> {
        if (!this.serverUrl) {
            throw new Error('Server URL is required to discover tools via HTTP');
        }

        const response = await axios.get(`${this.serverUrl}/tools`, {
            headers: this.apiKey ? { Authorization: `Bearer ${this.apiKey}` } : undefined
        });

        const tools = response.data.tools as MCPTool[];

        // 为每个工具创建处理程序
        return tools.map(tool => ({
            ...tool,
            handler: async (params: any) => {
                const toolResponse = await axios.post(
                    `${this.serverUrl}/tools/${tool.name}`,
                    params,
                    {
                        headers: this.apiKey ? { Authorization: `Bearer ${this.apiKey}` } : undefined
                    }
                );
                return toolResponse.data;
            }
        }));
    }

    /**
     * 通过 RPC 获取工具 (用于 SSE 和 stdio)
     */
    private async discoverToolsViaRPC(): Promise<MCPTool[]> {
        if (!this.server) {
            throw new Error('Server configuration is required to discover tools via RPC');
        }

        // 这里实现通过 RPC 获取工具的逻辑
        // 由于需要实际的 MCP 服务器来测试，这里只提供一个基本实现

        if (this.transport === 'sse' && this.eventSource) {
            // 向 SSE 服务器发送获取工具的请求
            // 这里应该实现实际的 SSE 通信逻辑

            // 模拟从 SSE 获取工具
            return [
                {
                    name: 'sse-tool',
                    description: 'A tool provided by SSE server',
                    parameters: {
                        type: 'object',
                        properties: {
                            query: {
                                type: 'string',
                                description: 'Query parameter'
                            }
                        },
                        required: ['query']
                    },
                    handler: async (params: any) => {
                        // 这里应该实现实际的 SSE 通信逻辑
                        return { result: `Processed ${params.query} via SSE` };
                    }
                }
            ];
        } else if (this.transport === 'stdio' && this.server.process) {
            // 向 stdio 服务器发送获取工具的请求
            // 这里应该实现实际的 stdio 通信逻辑

            // 模拟从 stdio 获取工具
            return [
                {
                    name: 'stdio-tool',
                    description: 'A tool provided by stdio server',
                    parameters: {
                        type: 'object',
                        properties: {
                            command: {
                                type: 'string',
                                description: 'Command to execute'
                            }
                        },
                        required: ['command']
                    },
                    handler: async (params: any) => {
                        // 这里应该实现实际的 stdio 通信逻辑
                        return { result: `Executed ${params.command} via stdio` };
                    }
                }
            ];
        }

        // 如果没有有效的传输方式，返回空数组
        return [];
    }

    /**
     * 获取指定工具
     */
    async getTool(toolName: string): Promise<MCPTool | undefined> {
        if (this.cachedTools.length === 0) {
            await this.discoverTools();
        }

        return this.cachedTools.find(tool => tool.name === toolName);
    }

    /**
     * 执行工具调用
     */
    async callTool(toolName: string, params: any): Promise<any> {
        const tool = await this.getTool(toolName);

        if (!tool) {
            throw new Error(`Tool not found: ${toolName}`);
        }

        return await tool.handler(params);
    }

    /**
     * 连接到服务器（兼容旧方法）
     */
    async connectToServer(serverUrl?: string): Promise<void> {
        return this.connect(serverUrl);
    }
}

/**
 * Mastra MCP 客户端
 * 兼容 Mastra 的 MCP 客户端接口
 * 提供了与 @mastra/mcp 包相同的 API
 */
export class MastraMCPClient {
    private name: string;
    private mcpClient: MCPClient;

    constructor(options: {
        name: string;
        server: {
            command?: string;
            args?: string[];
            url?: URL;
            requestInit?: RequestInit;
        };
    }) {
        this.name = options.name;

        // 确定传输方式
        let transport: 'http' | 'sse' | 'stdio' = 'http';
        if (options.server.command) {
            transport = 'stdio';
        } else if (options.server.url) {
            transport = 'sse';
        }

        // 创建对应的 MCP 客户端
        this.mcpClient = new MCPClient({
            transport,
            server: options.server
        });
    }

    /**
     * 连接到 MCP 服务器
     */
    async connect(): Promise<void> {
        await this.mcpClient.connect();
    }

    /**
     * 断开与服务器的连接
     */
    async disconnect(): Promise<void> {
        await this.mcpClient.disconnect();
    }

    /**
     * 获取可用工具
     */
    async tools(): Promise<Record<string, any>> {
        return this.mcpClient.tools();
    }
}

/**
 * MCP 配置管理器
 */
export class MCPConfiguration {
    private registry?: string;
    private servers: Record<string, Record<string, any>> = {};
    private clients: Record<string, MCPClient> = {};

    /**
     * 构造一个新的 MCP 配置
     */
    constructor(config: {
        registry?: string;
        servers?: Record<string, Record<string, any>>;
    }) {
        this.registry = config.registry;
        this.servers = config.servers || {};
    }

    /**
     * 获取连接的工具
     */
    async getConnectedTools(): Promise<Record<string, MCPTool[]>> {
        const toolsets: Record<string, MCPTool[]> = {};

        // 连接到每个服务器并获取工具
        for (const [serverId, config] of Object.entries(this.servers)) {
            try {
                // 创建客户端 (如果尚未创建)
                if (!this.clients[serverId]) {
                    this.clients[serverId] = new MCPClient({
                        serverUrl: config.url as string,
                        apiKey: config.apiKey as string
                    });
                }

                // 连接到服务器
                await this.clients[serverId].connect();

                // 获取工具
                const tools = await this.clients[serverId].discoverTools();
                toolsets[serverId] = tools;
            } catch (error) {
                console.warn(`Failed to connect to server ${serverId}: ${error instanceof Error ? error.message : String(error)}`);
            }
        }

        return toolsets;
    }

    /**
     * 添加服务器配置
     */
    addServer(serverId: string, config: Record<string, any>): void {
        this.servers[serverId] = config;
    }

    /**
     * 移除服务器配置
     */
    removeServer(serverId: string): void {
        delete this.servers[serverId];
        delete this.clients[serverId];
    }
} 