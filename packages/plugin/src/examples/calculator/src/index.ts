import { Actor, ActorContext, Message, log } from '@bactor/core';
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
        log.info('Calculator received message:', {
            type: message.type,
            payload: message.payload,
            sender: message.sender
        });

        try {
            const { operation, operands } = message.payload;
            log.info('Processing calculation:', {
                operation,
                operands,
                config: this.config
            });

            // Validate number of operands
            if (operands.length > this.config.maxOperands) {
                throw new Error(`Too many operands. Maximum allowed: ${this.config.maxOperands}`);
            }

            if (operands.length < 2) {
                throw new Error('At least two operands are required');
            }

            let result: number;
            log.info('Performing calculation');
            switch (operation) {
                case 'add':
                    result = operands.reduce((a: number, b: number) => {
                        log.info('Adding:', { a, b });
                        return a + b;
                    });
                    break;
                case 'subtract':
                    result = operands.reduce((a: number, b: number) => {
                        log.info('Subtracting:', { a, b });
                        return a - b;
                    });
                    break;
                case 'multiply':
                    result = operands.reduce((a: number, b: number) => {
                        log.info('Multiplying:', { a, b });
                        return a * b;
                    });
                    break;
                case 'divide':
                    if (operands.slice(1).some((n: number) => n === 0)) {
                        throw new Error('Division by zero is not allowed');
                    }
                    result = operands.reduce((a: number, b: number) => {
                        log.info('Dividing:', { a, b });
                        return a / b;
                    });
                    break;
                default:
                    throw new Error(`Unsupported operation: ${operation}`);
            }

            // Round to specified precision
            const originalResult = result;
            result = Number(result.toFixed(this.config.precision));
            log.info('Calculation completed:', {
                operation,
                operands,
                originalResult,
                roundedResult: result,
                precision: this.config.precision
            });

            if (message.sender) {
                const response: CalculatorResponse = {
                    type: 'calculator.result',
                    payload: {
                        success: true,
                        result,
                        operation,
                        operands
                    }
                };
                log.info('Sending success response:', response);
                await this.context.send(message.sender, response);
                log.info('Success response sent');
            } else {
                log.warn('No sender to respond to');
            }
        } catch (error) {
            log.error('Calculator error:', error);
            if (message.sender) {
                const errorResponse: CalculatorResponse = {
                    type: 'calculator.result',
                    payload: {
                        success: false,
                        error: error instanceof Error ? error.message : 'Unknown error'
                    }
                };
                log.info('Sending error response:', errorResponse);
                await this.context.send(message.sender, errorResponse);
                log.info('Error response sent');
            } else {
                log.warn('No sender to respond to error');
            }
        }
    }
}

export async function createActor(context: ActorContext, config: any): Promise<Actor> {
    log.info('Creating calculator actor:', {
        context,
        config
    });
    const actor = new CalculatorActor(context, config);
    log.info('Calculator actor created');
    return actor;
} 