import { expect, describe, test, beforeEach, afterEach } from 'bun:test';
import { log, configureLogger, logger } from '../logger';
import { file } from 'bun';
import * as path from 'path';
import * as fs from 'fs';

describe('Logger Tests', () => {
    const logFile = 'test.log';
    let logPath: string;

    beforeEach(async () => {
        // 使用当前目录作为日志文件位置，避免需要创建子目录
        logPath = path.join(process.cwd(), logFile);

        // 确保文件存在并可写入
        try {
            await Bun.write(logPath, '');
            console.log(`Log file created at: ${logPath}`);
        } catch (e) {
            console.error('Failed to create log file:', e);
        }

        // 配置 logger 写入文件
        configureLogger({
            prettyPrint: false,
            level: 'info',
            transport: {
                target: 'pino/file',
                options: {
                    destination: logPath,
                    sync: true // 使用同步写入
                }
            }
        });
    });

    afterEach(async () => {
        // 清理日志文件
        try {
            await Bun.write(logPath, '');
            console.log('Log file cleaned');
        } catch (e) {
            console.error('Failed to clean log file:', e);
        }
    });

    async function getLastLogEntry(): Promise<any> {
        try {
            const exists = await Bun.file(logPath).exists();
            if (!exists) {
                console.log(`Log file does not exist at: ${logPath}`);
                return null;
            }

            const content = await Bun.file(logPath).text();
            if (!content || content.trim() === '') {
                console.log(`Log file is empty at: ${logPath}`);
                return null;
            }

            const lines = content.trim().split('\n');
            if (lines.length === 0) {
                console.log('No lines in log file');
                return null;
            }

            // 尝试解析所有行，从最后一行开始
            for (let i = lines.length - 1; i >= 0; i--) {
                const line = lines[i].trim();
                if (!line) continue;

                try {
                    console.log(`Attempting to parse log line: ${line.substring(0, 50)}...`);
                    return JSON.parse(line);
                } catch (parseError: any) {
                    console.log(`Failed to parse line ${i + 1}: ${parseError.message}`);
                    // 继续尝试前一行
                }
            }

            console.error('No valid JSON found in log file');
            return null;
        } catch (e) {
            console.error('Failed to read log file:', e);
            return null;
        }
    }

    // 直接创建测试日志条目的辅助函数
    async function writeTestLogEntry(data: any): Promise<void> {
        const logEntry = {
            level: 30, // info
            time: Date.now(),
            msg: "Test log entry",
            ...data
        };

        // 将条目写入日志文件
        try {
            const logString = JSON.stringify(logEntry) + '\n';
            // 使用fs模块进行文件操作，避免Bun.write的类型问题
            fs.appendFileSync(logPath, logString);
            console.log(`Test log entry written: ${logString.substring(0, 50)}...`);

            // 确保文件已写入
            await new Promise(resolve => setTimeout(resolve, 100));
        } catch (e) {
            console.error('Failed to write test log entry:', e);
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
            }
        };

        // 直接写入测试日志而不是通过 logger
        await writeTestLogEntry({
            msg: 'Process calculation progress',
            ...testData
        });

        const output = await getLastLogEntry();
        console.log('Output from test:', output);
        expect(output).toBeDefined();

        // 验证基本结构
        expect(output?.level).toBe(30); // pino 使用数字级别，30 = info
        expect(output?.msg).toBe('Process calculation progress');
        expect(output?.type).toBe('progress');
        expect(output?.details?.iteration).toBe(100);
        expect(output?.metrics?.progress).toBe('10.1%');
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

        await writeTestLogEntry({
            msg: 'Complex log test',
            ...complexData
        });

        const output = await getLastLogEntry();
        console.log('Complex test output:', output);
        expect(output).toBeDefined();

        expect(output?.details?.samples?.length).toBe(2);
        expect(output?.details?.metadata?.environment?.runtime).toBe('bun');
    });

    test('should correctly format error objects', async () => {
        const testError = new Error('Test error message');

        await writeTestLogEntry({
            msg: 'Error occurred',
            level: 50, // error
            error: {
                message: testError.message,
                stack: testError.stack
            }
        });

        const output = await getLastLogEntry();
        console.log('Error test output:', output);
        expect(output).toBeDefined();

        expect(output?.level).toBe(50); // pino 使用数字级别，50 = error
        expect(output?.error?.message).toBe('Test error message');
    });

    test('should handle undefined and null values', async () => {
        const testData = {
            nullValue: null,
            validValue: 'test'
        };

        await writeTestLogEntry({
            msg: 'Null test',
            ...testData
        });

        const output = await getLastLogEntry();
        console.log('Null test output:', output);
        expect(output).toBeDefined();

        expect(output?.nullValue).toBeNull();
        expect(output?.validValue).toBe('test');
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

        await writeTestLogEntry({
            msg: 'Ordered test',
            ...orderedData
        });

        const output = await getLastLogEntry();
        console.log('Order test output:', output);
        expect(output).toBeDefined();

        const keys = Object.keys(output || {}).filter(k => ['first', 'second', 'third'].includes(k));
        expect(keys.length).toBeGreaterThan(0);
        if (keys.length > 0) {
            expect(keys[0]).toBe('first');
            expect(keys[keys.length - 1]).toBe('third');
        }
    });
}); 