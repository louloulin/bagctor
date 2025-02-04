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
            const operation = message.payload as CalculatorOperation;

            // Validate operands
            if (!operation.operands || !Array.isArray(operation.operands)) {
                throw new Error('Invalid operands: must be an array of numbers');
            }

            if (operation.operands.length < 2) {
                throw new Error('At least two operands are required');
            }

            if (operation.operands.length > this.config.maxOperands) {
                throw new Error(`Too many operands: maximum is ${this.config.maxOperands}`);
            }

            // Perform calculation
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
                    if (operation.operands.some(n => n === 0)) {
                        throw new Error('Division by zero is not allowed');
                    }
                    result = operation.operands.reduce((a, b) => a / b);
                    break;
                default:
                    throw new Error(`Unsupported operation: ${operation.operation}`);
            }

            // Round to configured precision
            result = Number(result.toFixed(this.config.precision));

            // Send response
            if (message.sender) {
                await this.context.send(message.sender, {
                    type: 'calculator.result',
                    payload: {
                        success: true,
                        result,
                        operation: operation.operation,
                        operands: operation.operands
                    }
                });
            }

        } catch (error) {
            log.error('Calculator error:', error);
            if (message.sender) {
                await this.context.send(message.sender, {
                    type: 'calculator.result',
                    payload: {
                        success: false,
                        error: error instanceof Error ? error.message : 'Unknown error'
                    }
                });
            }
        }
    }
}

export async function createActor(context: ActorContext, config: any): Promise<Actor> {
    return new CalculatorActor(context, config);
} 