/**
 * Mastra兼容的工具定义
 * 提供与Mastra完全兼容的工具API，同时增强Bagctor的分布式能力
 */

import { z } from 'zod';
import type { ZodType, ZodTypeDef, ZodTypeAny } from 'zod';

/**
 * 工具参数类型
 */
export interface ToolParameters {
    type: string;
    properties: Record<string, any>;
    required?: string[];
    [key: string]: any;
}

/**
 * 工具执行上下文
 */
export interface ToolContext {
    agentId?: string;
    requestId?: string;
    threadId?: string;
    resourceId?: string;
    metadata?: Record<string, any>;
    [key: string]: any;
}

/**
 * 工具定义接口
 */
export interface Tool<TInput = any, TOutput = any> {
    /**
     * 工具名称
     */
    name: string;

    /**
     * 工具描述
     */
    description: string;

    /**
     * 工具参数定义
     */
    parameters: ToolParameters;

    /**
     * 工具处理函数
     */
    handler: (params: TInput, context?: ToolContext) => Promise<TOutput>;
}

/**
 * 查询工具选项
 */
export interface QueryToolOptions<TInput, TOutput> {
    /**
     * 工具名称
     */
    name: string;

    /**
     * 工具描述
     */
    description: string;

    /**
     * 参数定义，支持Zod模式
     */
    parameters: z.ZodObject<any>;

    /**
     * 处理函数
     */
    handler: (params: TInput) => Promise<TOutput>;
}

/**
 * 操作工具选项
 */
export interface ActionToolOptions<TInput, TOutput> {
    /**
     * 工具名称
     */
    name: string;

    /**
     * 工具描述
     */
    description: string;

    /**
     * 参数定义，支持Zod模式
     */
    parameters: z.ZodObject<any>;

    /**
     * 处理函数
     */
    handler: (params: TInput) => Promise<TOutput>;

    /**
     * 是否需要确认
     */
    requireConfirmation?: boolean;
}

/**
 * 定义查询工具
 * 完全兼容Mastra的defineQuery API
 */
export function defineQuery<TInput extends Record<string, any>, TOutput>(
    options: QueryToolOptions<TInput, TOutput>
): Tool<TInput, TOutput> {
    // 将Zod模式转换为OpenAPI兼容格式
    const parameters = zodToJsonSchema(options.parameters);

    return {
        name: options.name,
        description: options.description,
        parameters,
        handler: options.handler
    };
}

/**
 * 定义操作工具
 * 完全兼容Mastra的defineAction API
 */
export function defineAction<TInput extends Record<string, any>, TOutput>(
    options: ActionToolOptions<TInput, TOutput>
): Tool<TInput, TOutput> {
    // 将Zod模式转换为OpenAPI兼容格式
    const parameters = zodToJsonSchema(options.parameters);

    return {
        name: options.name,
        description: options.description,
        parameters,
        handler: options.handler
    };
}

/**
 * 创建工具
 */
export function createTool<TInput extends Record<string, any>, TOutput>(
    options: {
        id: string;
        description: string;
        inputSchema: z.ZodType<TInput>;
        outputSchema?: z.ZodType<TOutput>;
        execute: (params: { context: TInput }) => Promise<TOutput>;
    }
): Tool<TInput, TOutput> {
    // 将Zod模式转换为OpenAPI兼容格式
    const parameters = zodTypeToJsonSchema(options.inputSchema);

    return {
        name: options.id,
        description: options.description,
        parameters,
        handler: async (params: TInput) => {
            return options.execute({ context: params });
        }
    };
}

/**
 * 工具集合，用于分组管理工具
 */
export class ToolSet {
    private tools: Record<string, Tool> = {};

    /**
     * 添加工具
     */
    add(tool: Tool): this {
        this.tools[tool.name] = tool;
        return this;
    }

    /**
     * 获取工具
     */
    get(name: string): Tool | undefined {
        return this.tools[name];
    }

    /**
     * 获取所有工具
     */
    getAll(): Record<string, Tool> {
        return { ...this.tools };
    }

    /**
     * 执行工具
     */
    async execute<TInput, TOutput>(
        name: string,
        params: TInput,
        context?: ToolContext
    ): Promise<TOutput> {
        const tool = this.get(name);
        if (!tool) {
            throw new Error(`Tool not found: ${name}`);
        }

        return tool.handler(params, context) as Promise<TOutput>;
    }
}

/**
 * 将Zod对象模式转换为JSON Schema格式
 */
function zodToJsonSchema(schema: z.ZodObject<any>): ToolParameters {
    const shape = schema._def.shape();
    const properties: Record<string, any> = {};
    const required: string[] = [];

    for (const [key, value] of Object.entries(shape)) {
        const zodSchema = value as ZodTypeAny;
        // 处理必须字段
        if (!zodSchema.isOptional()) {
            required.push(key);
        }

        properties[key] = zodTypeToProperty(zodSchema);
    }

    return {
        type: 'object',
        properties,
        required: required.length > 0 ? required : undefined
    };
}

/**
 * 将通用Zod类型转换为JSON Schema属性
 */
function zodTypeToJsonSchema(zodSchema: ZodTypeAny): ToolParameters {
    if (zodSchema instanceof z.ZodObject) {
        return zodToJsonSchema(zodSchema);
    }

    // 处理其他顶级类型
    const property = zodTypeToProperty(zodSchema);
    return {
        type: 'object',
        properties: {
            value: property
        },
        required: ['value']
    };
}

/**
 * 将Zod类型转换为JSON Schema属性
 */
function zodTypeToProperty(zodSchema: ZodTypeAny): any {
    // 处理字符串
    if (zodSchema instanceof z.ZodString) {
        const property: Record<string, any> = { type: 'string' };

        // 添加描述信息
        const description = zodSchema._def.description;
        if (description) {
            property.description = description;
        }

        return property;
    }

    // 处理数字
    if (zodSchema instanceof z.ZodNumber) {
        const property: Record<string, any> = { type: 'number' };

        // 添加描述信息
        const description = zodSchema._def.description;
        if (description) {
            property.description = description;
        }

        return property;
    }

    // 处理布尔值
    if (zodSchema instanceof z.ZodBoolean) {
        const property: Record<string, any> = { type: 'boolean' };

        // 添加描述信息
        const description = zodSchema._def.description;
        if (description) {
            property.description = description;
        }

        return property;
    }

    // 处理数组
    if (zodSchema instanceof z.ZodArray) {
        const property: Record<string, any> = {
            type: 'array',
            items: zodTypeToProperty(zodSchema._def.type)
        };

        // 添加描述信息
        const description = zodSchema._def.description;
        if (description) {
            property.description = description;
        }

        return property;
    }

    // 处理枚举
    if (zodSchema instanceof z.ZodEnum) {
        const property: Record<string, any> = {
            type: 'string',
            enum: zodSchema._def.values
        };

        // 添加描述信息
        const description = zodSchema._def.description;
        if (description) {
            property.description = description;
        }

        return property;
    }

    // 处理联合类型
    if (zodSchema instanceof z.ZodUnion) {
        const property: Record<string, any> = {
            oneOf: zodSchema._def.options.map((opt: ZodTypeAny) => zodTypeToProperty(opt))
        };

        // 添加描述信息
        const description = zodSchema._def.description;
        if (description) {
            property.description = description;
        }

        return property;
    }

    // 处理可选类型
    if (zodSchema instanceof z.ZodOptional) {
        return zodTypeToProperty(zodSchema._def.innerType);
    }

    // 处理默认类型
    if (zodSchema instanceof z.ZodDefault) {
        return zodTypeToProperty(zodSchema._def.innerType);
    }

    // 处理nullable类型
    if (zodSchema instanceof z.ZodNullable) {
        return {
            anyOf: [
                zodTypeToProperty(zodSchema._def.innerType),
                { type: 'null' }
            ]
        };
    }

    // 处理any类型
    if (zodSchema instanceof z.ZodAny) {
        return {};
    }

    // 默认处理
    return { type: 'object' };
} 