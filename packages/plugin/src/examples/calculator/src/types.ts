import { Message } from '@bactor/core';

export interface CalculatorConfig {
    precision: number;
    maxOperands: number;
}

export interface CalculatorOperation {
    operation: 'add' | 'subtract' | 'multiply' | 'divide';
    operands: number[];
}

export interface CalculatorResult {
    success: boolean;
    result?: number;
    error?: string;
    operation?: string;
    operands?: number[];
}

export interface CalculatorMessage extends Message {
    type: 'calculator.calculate';
    payload: CalculatorOperation;
}

export interface CalculatorResponse extends Message {
    type: 'calculator.result';
    payload: CalculatorResult;
} 