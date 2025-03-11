/**
 * 工具接口定义 - 为Agent提供扩展能力
 */

/**
 * 工具参数定义
 */
export interface ToolParameter {
    name: string;
    type: 'string' | 'number' | 'boolean' | 'object' | 'array';
    description: string;
    required: boolean;
    default?: any;
}

/**
 * 工具定义接口
 */
export interface Tool {
    // 工具唯一标识
    name: string;

    // 工具描述
    description: string;

    // 工具参数定义
    parameters: ToolParameter[];

    // 执行工具的函数
    execute: (args: Record<string, any>) => Promise<any>;
}

/**
 * 工具结果接口
 */
export interface ToolResult {
    // 执行成功或失败
    success: boolean;

    // 结果数据
    data?: any;

    // 错误信息
    error?: string;
}

/**
 * 工具注册表 - 管理系统中所有可用工具
 */
export class ToolRegistry {
    private tools: Map<string, Tool> = new Map();

    /**
     * 注册工具
     */
    register(tool: Tool): void {
        if (this.tools.has(tool.name)) {
            throw new Error(`Tool with name ${tool.name} is already registered`);
        }
        this.tools.set(tool.name, tool);
    }

    /**
     * 获取工具
     */
    get(name: string): Tool | undefined {
        return this.tools.get(name);
    }

    /**
     * 获取所有工具
     */
    getAllTools(): Tool[] {
        return Array.from(this.tools.values());
    }

    /**
     * 执行工具
     */
    async executeTool(name: string, args: Record<string, any>): Promise<ToolResult> {
        const tool = this.tools.get(name);

        if (!tool) {
            return {
                success: false,
                error: `Tool ${name} not found`
            };
        }

        try {
            // 验证必需参数
            for (const param of tool.parameters) {
                if (param.required && !(param.name in args) && !('default' in param)) {
                    return {
                        success: false,
                        error: `Missing required parameter: ${param.name}`
                    };
                }
            }

            const data = await tool.execute(args);
            return {
                success: true,
                data
            };
        } catch (error) {
            return {
                success: false,
                error: error instanceof Error ? error.message : String(error)
            };
        }
    }
}

// 全局工具注册表实例
export const globalToolRegistry = new ToolRegistry();

/**
 * 工具装饰器 - 用于简化工具注册
 */
export function registerTool(name: string, description: string, parameters: ToolParameter[] = []) {
    return function (target: any, propertyKey: string, descriptor: PropertyDescriptor) {
        const originalMethod = descriptor.value;

        const tool: Tool = {
            name,
            description,
            parameters,
            execute: originalMethod
        };

        globalToolRegistry.register(tool);

        return descriptor;
    };
} 