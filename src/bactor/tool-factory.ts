/**
 * 获取工具定义（用于LLM）
 */
getToolDefinitions(): ToolDefinition[] {
    return Array.from(this.tools.values()).map(tool => ({
        id: tool.id || tool.name,
        name: tool.name,
        description: tool.description,
        parameters: this.convertToJsonSchema(tool.parameters),
        execute: tool.execute
    }));
} 