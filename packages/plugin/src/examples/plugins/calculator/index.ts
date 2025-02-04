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
        log.info('Calculator actor created with config:', {
            precision: config.precision,
            maxOperands: config.maxOperands,
            context: context
        });
    }

    protected behaviors(): void {
        log.info('Registering calculator behaviors');
        this.addBehavior('calculator.calculate', this.handleCalculate.bind(this));
        log.info('Calculator behaviors registered');
    }

    private async handleCalculate(message: Message): Promise<void> {
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
                const error = `Too many operands. Maximum allowed: ${this.config.maxOperands}`;
                log.error('Validation error:', error);
                throw new Error(error);
            }

            if (operands.length < 2) {
                const error = 'At least two operands are required';
                log.error('Validation error:', error);
                throw new Error(error);
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
                        const error = 'Division by zero is not allowed';
                        log.error('Validation error:', error);
                        throw new Error(error);
                    }
                    result = operands.reduce((a: number, b: number) => {
                        log.info('Dividing:', { a, b });
                        return a / b;
                    });
                    break;
                default:
                    const error = `Unsupported operation: ${operation}`;
                    log.error('Validation error:', error);
                    throw new Error(error);
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
                const response = {
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
                const errorResponse = {
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