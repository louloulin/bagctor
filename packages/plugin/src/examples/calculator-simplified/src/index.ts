import { PluginBase, PluginMetadata } from '../../../core/plugin_base';

// 计算器配置接口
export interface CalculatorConfig {
    precision: number;
    maxOperands: number;
}

// 计算器操作接口
export interface CalculatorOperation {
    operation: 'add' | 'subtract' | 'multiply' | 'divide';
    operands: number[];
}

// 计算器结果接口
export interface CalculatorResult {
    success: boolean;
    result?: number;
    error?: string;
    operation?: string;
    operands?: number[];
}

// 简化的计算器插件实现
export class CalculatorPlugin extends PluginBase<CalculatorConfig> {
    // 插件元数据
    metadata: PluginMetadata = {
        id: 'calculator',
        name: 'Calculator Plugin',
        version: '1.0.0',
        description: 'A simple calculator plugin for BActor',
        author: 'BActor Team',
        capabilities: ['calculator.calculate'],
        config: {
            precision: 2,
            maxOperands: 10
        }
    };

    // 初始化时的额外逻辑
    protected async onInitialize(): Promise<void> {
        this.context.log.info('Calculator plugin initialized with config:', {
            precision: this.config.precision,
            maxOperands: this.config.maxOperands
        });
    }

    // 自动映射到 calculator.calculate 能力
    async handleCalculate(payload: CalculatorOperation): Promise<CalculatorResult> {
        const { operation, operands } = payload;
        this.context.log.info('Processing calculation:', { operation, operands });

        try {
            // 验证输入
            this.validateInput(operation, operands);

            // 执行计算
            const result = this.performOperation(operation, operands);

            // 按照指定精度四舍五入
            const roundedResult = Number(result.toFixed(this.config.precision));

            return {
                success: true,
                result: roundedResult,
                operation,
                operands
            };
        } catch (error) {
            this.context.log.error('Calculator error:', error);
            return {
                success: false,
                error: error instanceof Error ? error.message : 'Unknown error'
            };
        }
    }

    // 验证输入
    private validateInput(operation: string, operands: number[]): void {
        // 验证操作数数量
        if (operands.length > this.config.maxOperands) {
            throw new Error(`Too many operands. Maximum allowed: ${this.config.maxOperands}`);
        }

        if (operands.length < 2) {
            throw new Error('At least two operands are required');
        }

        // 验证操作类型
        if (!['add', 'subtract', 'multiply', 'divide'].includes(operation)) {
            throw new Error(`Unsupported operation: ${operation}`);
        }

        // 检查除零错误
        if (operation === 'divide' && operands.slice(1).some(n => n === 0)) {
            throw new Error('Division by zero is not allowed');
        }
    }

    // 执行计算操作
    private performOperation(operation: 'add' | 'subtract' | 'multiply' | 'divide', operands: number[]): number {
        switch (operation) {
            case 'add':
                return operands.reduce((a, b) => a + b);
            case 'subtract':
                return operands.reduce((a, b) => a - b);
            case 'multiply':
                return operands.reduce((a, b) => a * b);
            case 'divide':
                return operands.reduce((a, b) => a / b);
            default:
                throw new Error(`Unsupported operation: ${operation}`);
        }
    }
}

// 导出插件创建函数
export default function createPlugin(): CalculatorPlugin {
    return new CalculatorPlugin();
} 