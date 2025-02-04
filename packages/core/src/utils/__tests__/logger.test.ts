import { expect, describe, test, beforeEach, afterEach } from 'bun:test';
import { log, configureLogger, logger } from '../logger';
import { file } from 'bun';
import * as path from 'path';

describe('Logger Tests', () => {
    const logFile = 'test.log';
    let logPath: string;

    beforeEach(async () => {
        logPath = path.join(process.cwd(), logFile);

        // 配置 logger 写入文件
        configureLogger({
            prettyPrint: false,
            level: 'info',
            transport: {
                target: 'pino/file',
                options: { destination: logPath }
            }
        });
    });

    afterEach(async () => {
        // 清理日志文件
        try {
            await Bun.write(logPath, '');
        } catch (e) {
            console.error('Failed to clean log file:', e);
        }
    });

    async function getLastLogEntry(): Promise<any> {
        try {
            const content = await Bun.file(logPath).text();
            const lines = content.trim().split('\n');
            if (lines.length === 0) return null;
            return JSON.parse(lines[lines.length - 1]);
        } catch (e) {
            console.error('Failed to read log file:', e);
            return null;
        }
    }

    test('should correctly log structured progress data', async () => {
        const testData = {
            type: 'progress',
            details: {
                iteration: 100,
                operation: 'divide',
                operands: [101, 1],
                expectedResult: 101
            },
            metrics: {
                progress: '10.1%',
                remainingIterations: 900
            },
            timestamp: new Date().toISOString()
        };

        log.info('Process calculation progress', testData);

        // 等待日志写入
        await new Promise(resolve => setTimeout(resolve, 100));

        const output = await getLastLogEntry();
        expect(output).toBeDefined();

        // 验证基本结构
        expect(output.level).toBe(30); // pino 使用数字级别，30 = info
        expect(output.msg).toBe('Process calculation progress');
        expect(output.traceId).toBeDefined();
        expect(output.timestamp).toBeDefined();

        // 验证嵌套数据结构
        expect(output.type).toBe('progress');
        expect(output.details).toEqual(testData.details);
        expect(output.metrics).toEqual(testData.metrics);
    });

    test('should handle multiple nested objects and arrays', async () => {
        const complexData = {
            type: 'milestone',
            details: {
                operation: 'multiply',
                samples: [
                    { input: [1, 2], output: 2 },
                    { input: [2, 3], output: 6 }
                ],
                metadata: {
                    version: '1.0',
                    environment: {
                        runtime: 'bun',
                        mode: 'test'
                    }
                }
            }
        };

        log.info('Complex log test', complexData);

        await new Promise(resolve => setTimeout(resolve, 100));
        const output = await getLastLogEntry();
        expect(output).toBeDefined();

        expect(output.details.samples.length).toBe(2);
        expect(output.details.metadata.environment.runtime).toBe('bun');
    });

    test('should correctly format error objects', async () => {
        const error = new Error('Test error');
        log.error('Error occurred', { error, context: 'test' });

        await new Promise(resolve => setTimeout(resolve, 100));
        const output = await getLastLogEntry();
        expect(output).toBeDefined();

        expect(output.level).toBe(50); // pino 使用数字级别，50 = error
        expect(output.error).toBeDefined();
        expect(output.error.message).toBe('Test error');
        expect(output.error.stack).toBeDefined();
        expect(output.context).toBe('test');
    });

    test('should handle undefined and null values', async () => {
        const data = {
            nullValue: null,
            undefinedValue: undefined,
            validValue: 'test'
        };

        log.info('Null test', data);

        await new Promise(resolve => setTimeout(resolve, 100));
        const output = await getLastLogEntry();
        expect(output).toBeDefined();

        expect(output.nullValue).toBeNull();
        expect('undefinedValue' in output).toBe(false); // pino 会忽略 undefined 值
        expect(output.validValue).toBe('test');
    });

    test('should maintain order of nested objects', async () => {
        const orderedData = {
            first: 1,
            second: {
                a: 'a',
                b: 'b',
                c: {
                    deep: true
                }
            },
            third: 3
        };

        log.info('Ordered test', orderedData);

        await new Promise(resolve => setTimeout(resolve, 100));
        const output = await getLastLogEntry();
        expect(output).toBeDefined();

        const keys = Object.keys(output).filter(k => ['first', 'second', 'third'].includes(k));
        expect(keys).toEqual(['first', 'second', 'third']);
    });
}); 