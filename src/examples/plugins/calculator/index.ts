import { Actor, ActorContext, Message, log } from '@bactor/core';

interface CalculatorConfig {
    precision: number;
    maxOperands: number;
}

interface CalculatorOperation {
    operation: 'add' | 'subtract' | 'multiply' | 'divide';
    operands: number[];
}

class CalculatorActor extends Actor {
    private config: CalculatorConfig;

    constructor(context: ActorContext, config: CalculatorConfig) {
        super(context);
        this.config = config;
    }

    protected behaviors(): void {
        this.addBehavior('calculator.calculate', this.handleCalculate.bind(this));
    }

    private async handleCalculate(message: Message): Promise<void> {
        try {
            const operation = message.data as CalculatorOperation;

            // Validate number of operands
            if (operation.operands.length > this.config.maxOperands) {
                throw new Error(`Too many operands. Maximum allowed: ${this.config.maxOperands}`);
            }

            if (operation.operands.length < 2) {
                throw new Error('At least two operands are required');
            }

            let result: number;
            switch (operation.operation) {
                case 'add':
                    result = operation.operands.reduce((a, b) => a + b);
                    break;
                case 'subtract':
                    result = operation.operands.reduce((a, b) => a - b);
                    break;
                case 'multiply':
                    result = operation.operands.reduce((a, b) => a * b);
                    break;
                case 'divide':
                    if (operation.operands.slice(1).some(n => n === 0)) {
                        throw new Error('Division by zero is not allowed');
                    }
                    result = operation.operands.reduce((a, b) => a / b);
                    break;
                default:
                    throw new Error(`Unsupported operation: ${operation.operation}`);
            }

            // Round to specified precision
            result = Number(result.toFixed(this.config.precision));

            await this.sender.tell({
                type: 'calculator.result',
                data: { result }
            });
        } catch (error) {
            await this.sender.tell({
                type: 'calculator.error',
                data: { error: error instanceof Error ? error.message : 'Unknown error' }
            });
        }
    }
}

export async function createActor(context: ActorContext, config: any): Promise<Actor> {
    return new CalculatorActor(context, config);
} 