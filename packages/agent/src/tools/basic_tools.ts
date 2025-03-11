/**
 * 基础工具实现
 */
import { globalToolRegistry, Tool, ToolParameter } from './tool_interface';

/**
 * 工具集合类 - 基础工具
 */
export class BasicTools {
    /**
     * 网络搜索工具
     */
    static async webSearch(args: Record<string, any>): Promise<any> {
        const { query, limit = 5 } = args;

        // 模拟网络搜索
        // 实际实现中可以集成真实的搜索API，如Google Custom Search、Bing Search等
        return {
            results: [
                {
                    title: `搜索结果 1 for "${query}"`,
                    url: 'https://example.com/1',
                    snippet: `这是关于 "${query}" 的搜索结果片段。包含相关信息和摘要。`
                },
                {
                    title: `搜索结果 2 for "${query}"`,
                    url: 'https://example.com/2',
                    snippet: `另一个关于 "${query}" 的搜索结果片段。`
                }
            ].slice(0, limit),
            total: 2,
            query
        };
    }

    /**
     * 文本摘要工具
     */
    static async summarizeText(args: Record<string, any>): Promise<any> {
        const { text, max_length = 200 } = args;

        // 简单的摘要实现：截取前N个字符
        // 实际实现可以使用LLM或其他摘要算法
        const summary = text.length > max_length
            ? text.substring(0, max_length) + '...'
            : text;

        return {
            original_length: text.length,
            summary_length: summary.length,
            summary
        };
    }

    /**
     * 代码执行工具
     */
    static async executeCode(args: Record<string, any>): Promise<any> {
        const { code, timeout = 5000 } = args;

        try {
            // 创建安全的执行环境
            // 注意：实际实现应使用沙箱或隔离环境执行代码
            // 这里仅作为示例，并不安全
            const safeEval = (code: string): any => {
                // 创建一个安全的上下文
                const context: any = {
                    console: {
                        log: (...args: any[]) => context.__logs.push(args.join(' ')),
                        error: (...args: any[]) => context.__errors.push(args.join(' ')),
                        warn: (...args: any[]) => context.__warnings.push(args.join(' ')),
                    },
                    __logs: [],
                    __errors: [],
                    __warnings: [],
                    __result: undefined
                };

                try {
                    // 添加return以获取最后表达式的值
                    const wrappedCode = `
            try {
              __result = (function() { 
                ${code}
              })();
            } catch (e) {
              __errors.push(e.toString());
            }
          `;

                    // 执行代码
                    const fn = new Function(...Object.keys(context), wrappedCode);
                    fn(...Object.values(context));

                    return {
                        result: context.__result,
                        logs: context.__logs,
                        errors: context.__errors,
                        warnings: context.__warnings
                    };
                } catch (e) {
                    return {
                        result: null,
                        logs: context.__logs,
                        errors: [...context.__errors, e instanceof Error ? e.message : String(e)],
                        warnings: context.__warnings
                    };
                }
            };

            // 添加超时控制
            const timeoutPromise = new Promise((_, reject) => {
                setTimeout(() => reject(new Error('代码执行超时')), timeout);
            });

            const executionPromise = Promise.resolve(safeEval(code));

            const result = await Promise.race([executionPromise, timeoutPromise]);
            return result;
        } catch (error) {
            return {
                result: null,
                logs: [],
                errors: [error instanceof Error ? error.message : String(error)],
                warnings: []
            };
        }
    }
}

// 初始化并注册所有基础工具
export function initializeBasicTools(): void {
    // 手动注册工具
    globalToolRegistry.register({
        name: 'web_search',
        description: '在互联网上搜索信息',
        parameters: [
            {
                name: 'query',
                type: 'string',
                description: '搜索查询',
                required: true
            },
            {
                name: 'limit',
                type: 'number',
                description: '返回结果数量限制',
                required: false,
                default: 5
            }
        ],
        execute: BasicTools.webSearch
    });

    globalToolRegistry.register({
        name: 'text_summarize',
        description: '生成长文本的摘要',
        parameters: [
            {
                name: 'text',
                type: 'string',
                description: '需要摘要的文本',
                required: true
            },
            {
                name: 'max_length',
                type: 'number',
                description: '摘要的最大长度',
                required: false,
                default: 200
            }
        ],
        execute: BasicTools.summarizeText
    });

    globalToolRegistry.register({
        name: 'execute_code',
        description: '执行JavaScript/TypeScript代码片段',
        parameters: [
            {
                name: 'code',
                type: 'string',
                description: '要执行的代码',
                required: true
            },
            {
                name: 'timeout',
                type: 'number',
                description: '执行超时时间（毫秒）',
                required: false,
                default: 5000
            }
        ],
        execute: BasicTools.executeCode
    });
} 