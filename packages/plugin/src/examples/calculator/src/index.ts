import { Actor, ActorContext, Message, log, PID } from '@bactor/core';
import { CalculatorConfig, CalculatorOperation, CalculatorMessage, CalculatorResponse } from './types';

class CalculatorActor extends Actor {
    private config: CalculatorConfig;

    constructor(context: ActorContext, config: CalculatorConfig) {
        super(context);
        this.config = config;
        log.info('Calculator actor created with config:', {
            precision: config.precision,
            maxOperands: config.maxOperands
        });
    }

    protected behaviors(): void {
        log.info('Registering calculator behaviors');
        this.addBehavior('calculator.calculate', async (message: Message) => {
            if (message.type === 'calculator.calculate') {
                await this.handleCalculate(message as CalculatorMessage);
            }
        });
        log.info('Calculator behaviors registered');
    }

    private async handleCalculate(message: CalculatorMessage): Promise<void> {
        const { operation, operands } = message.payload;
        log.info('Processing calculation:', { operation, operands });

        try {
            // Validate input
            this.validateInput(operation, operands);

            // Perform calculation
            const result = this.performOperation(operation, operands);

            // Round to specified precision
            const roundedResult = Number(result.toFixed(this.config.precision));

            if (message.sender) {
                await this.sendSuccessResponse(message.sender, {
                    result: roundedResult,
                    operation,
                    operands
                });
            }
        } catch (error) {
            log.error('Calculator error:', error);
            if (message.sender) {
                await this.sendErrorResponse(message.sender, error);
            }
        }
    }

    private validateInput(operation: string, operands: number[]): void {
        // Validate number of operands
        if (operands.length > this.config.maxOperands) {
            throw new Error(`Too many operands. Maximum allowed: ${this.config.maxOperands}`);
        }

        if (operands.length < 2) {
            throw new Error('At least two operands are required');
        }

        // Validate operation
        if (!['add', 'subtract', 'multiply', 'divide'].includes(operation)) {
            throw new Error(`Unsupported operation: ${operation}`);
        }

        // Check for division by zero
        if (operation === 'divide' && operands.slice(1).some(n => n === 0)) {
            throw new Error('Division by zero is not allowed');
        }
    }

    private performOperation(operation: CalculatorOperation['operation'], operands: number[]): number {
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

    private async sendSuccessResponse(recipient: PID, data: {
        result: number;
        operation: string;
        operands: number[];
    }): Promise<void> {
        const response: CalculatorResponse = {
            type: 'calculator.result',
            payload: {
                success: true,
                ...data
            }
        };
        await this.context.send(recipient, response);
    }

    private async sendErrorResponse(recipient: PID, error: unknown): Promise<void> {
        const errorResponse: CalculatorResponse = {
            type: 'calculator.result',
            payload: {
                success: false,
                error: error instanceof Error ? error.message : 'Unknown error'
            }
        };
        await this.context.send(recipient, errorResponse);
    }
}

export async function createActor(context: ActorContext, config: CalculatorConfig): Promise<Actor> {
    log.info('Creating calculator actor');
    const actor = new CalculatorActor(context, config);
    return actor;
} 