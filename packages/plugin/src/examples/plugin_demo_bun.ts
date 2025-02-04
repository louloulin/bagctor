import { ActorSystem, log, Actor, Message, ActorContext, configureLogger } from '@bactor/core';
import * as path from 'path';
import * as fs from 'fs-extra';
import { PluginManager } from '../plugin_manager';
import { PluginMetadata } from '../types';
import { CalculatorMessage, CalculatorResponse } from './calculator/src/types';
import type { Bindings } from 'pino';

class TestActor extends Actor {
    private results: {
        inline: {
            count: number;
            lastResult: number;
            totalTime: number;
            samples: Array<{
                operands: number[];
                result: number;
                time: number;
            }>;
        };
        worker: {
            count: number;
            lastResult: number;
            totalTime: number;
            samples: Array<{
                operands: number[];
                result: number;
                time: number;
            }>;
        };
        process: {
            count: number;
            lastResult: number;
            totalTime: number;
            samples: Array<{
                operands: number[];
                result: number;
                time: number;
            }>;
        };
        specialTests: Array<{
            operation: string;
            operands: number[];
            result: number;
            time: number;
        }>;
    } = {
            inline: { count: 0, lastResult: 0, totalTime: 0, samples: [] },
            worker: { count: 0, lastResult: 0, totalTime: 0, samples: [] },
            process: { count: 0, lastResult: 0, totalTime: 0, samples: [] },
            specialTests: []
        };

    private startTime: number = 0;

    constructor(context: ActorContext) {
        super(context);
        log.info('Test actor constructed');
        this.startTime = performance.now();
    }

    protected behaviors(): void {
        log.info('Registering test actor behaviors');
        this.addBehavior('default', async (msg: Message) => {
            if (msg.type === 'calculator.result') {
                const response = msg as CalculatorResponse;
                const currentTime = performance.now();
                const elapsedTime = currentTime - this.startTime;

                if (response.payload.success) {
                    const { result, operation, operands } = response.payload;

                    // 记录特殊测试用例的结果
                    if (operands && operands.length > 2) {
                        this.results.specialTests.push({
                            operation: operation || 'unknown',
                            operands: operands,
                            result: result || 0,
                            time: elapsedTime
                        });
                        log.info('Special test calculation result:', {
                            operation,
                            operands,
                            result,
                            time: `${elapsedTime.toFixed(2)}ms`,
                            testCount: this.results.specialTests.length
                        });

                        // 当所有特殊测试完成时，打印详细汇总信息
                        if (this.results.specialTests.length === 5) {
                            log.info('All special tests completed:', {
                                tests: this.results.specialTests.map(test => ({
                                    operation: test.operation,
                                    operands: test.operands.join(' ' + test.operation + ' '),
                                    result: test.result,
                                    time: `${test.time.toFixed(2)}ms`
                                })),
                                averageTime: (this.results.specialTests.reduce((acc, test) => acc + test.time, 0) / 5).toFixed(2) + 'ms'
                            });
                        }
                    } else {
                        // 记录性能测试的结果
                        const sample = {
                            operands: operands || [],
                            result: result || 0,
                            time: elapsedTime
                        };

                        switch (operation) {
                            case 'add':
                                this.results.inline.count++;
                                this.results.inline.lastResult = result || 0;
                                this.results.inline.totalTime += elapsedTime;
                                this.results.inline.samples.push(sample);
                                if (this.results.inline.count % 100 === 0) {
                                    log.info('Inline calculation milestone:', {
                                        operation,
                                        count: this.results.inline.count,
                                        lastResult: this.results.inline.lastResult,
                                        averageTime: (this.results.inline.totalTime / this.results.inline.count).toFixed(2) + 'ms',
                                        lastOperands: operands
                                    });
                                }
                                break;
                            case 'multiply':
                                this.results.worker.count++;
                                this.results.worker.lastResult = result || 0;
                                this.results.worker.totalTime += elapsedTime;
                                this.results.worker.samples.push(sample);
                                if (this.results.worker.count % 100 === 0) {
                                    log.info('Worker calculation milestone:', {
                                        operation,
                                        count: this.results.worker.count,
                                        lastResult: this.results.worker.lastResult,
                                        averageTime: (this.results.worker.totalTime / this.results.worker.count).toFixed(2) + 'ms',
                                        lastOperands: operands
                                    });
                                }
                                break;
                            case 'divide':
                                this.results.process.count++;
                                this.results.process.lastResult = result || 0;
                                this.results.process.totalTime += elapsedTime;
                                this.results.process.samples.push(sample);
                                if (this.results.process.count % 100 === 0) {
                                    log.info('Process calculation milestone', {
                                        type: 'milestone',
                                        details: {
                                            operation,
                                            count: this.results.process.count,
                                            lastResult: this.results.process.lastResult,
                                            lastOperands: operands
                                        },
                                        metrics: {
                                            averageTime: (this.results.process.totalTime / this.results.process.count).toFixed(2) + 'ms',
                                            totalTime: this.results.process.totalTime.toFixed(2) + 'ms',
                                            progress: `${(this.results.process.count / 1000 * 100).toFixed(1)}%`
                                        },
                                        samples: this.results.process.samples.slice(-5) // 最近5个样本
                                    });
                                }
                                break;
                        }

                        // 当所有性能测试完成时，打印详细汇总信息
                        if (this.results.inline.count === 1000 &&
                            this.results.worker.count === 1000 &&
                            this.results.process.count === 1000) {
                            log.info('Performance tests summary:', {
                                inline: {
                                    totalOperations: this.results.inline.count,
                                    totalTime: this.results.inline.totalTime.toFixed(2) + 'ms',
                                    averageTime: (this.results.inline.totalTime / this.results.inline.count).toFixed(2) + 'ms',
                                    operationsPerSecond: (1000 / (this.results.inline.totalTime / this.results.inline.count)).toFixed(2)
                                },
                                worker: {
                                    totalOperations: this.results.worker.count,
                                    totalTime: this.results.worker.totalTime.toFixed(2) + 'ms',
                                    averageTime: (this.results.worker.totalTime / this.results.worker.count).toFixed(2) + 'ms',
                                    operationsPerSecond: (1000 / (this.results.worker.totalTime / this.results.worker.count)).toFixed(2)
                                },
                                process: {
                                    totalOperations: this.results.process.count,
                                    totalTime: this.results.process.totalTime.toFixed(2) + 'ms',
                                    averageTime: (this.results.process.totalTime / this.results.process.count).toFixed(2) + 'ms',
                                    operationsPerSecond: (1000 / (this.results.process.totalTime / this.results.process.count)).toFixed(2)
                                }
                            });
                        }
                    }
                } else {
                    log.error('Calculation failed:', {
                        error: response.payload.error,
                        operation: response.payload.operation,
                        operands: response.payload.operands,
                        time: `${elapsedTime.toFixed(2)}ms`
                    });
                }
            }
        });
    }
}

async function testLogger() {
    // 测试基本日志
    log.info('Basic log test', { value: 123 });

    // 测试对象日志
    log.info('Object log test', {
        number: 42,
        string: 'test',
        array: [1, 2, 3],
        nested: {
            a: 1,
            b: 2
        }
    });

    // 测试计算结果日志
    const testCalc = {
        operation: 'multiply',
        operands: [5, 3],
        result: 15
    };
    log.info('Calculation result test', testCalc);

    // 测试错误日志
    try {
        throw new Error('Test error');
    } catch (error) {
        log.error('Error test', { error });
    }
}

async function runPluginDemoBun() {
    // 配置日志格式
    configureLogger({
        prettyPrint: false,
        level: 'info',
        formatters: {
            level: (label: string) => ({ level: label.toUpperCase() }),
            bindings: (bindings: Bindings) => bindings,
            log: (obj: Record<string, any>) => ({
                ...obj,
                timestamp: new Date().toISOString(),
                data: JSON.stringify(obj, null, 2)
            })
        }
    });

    console.log('\n=== Starting Plugin Demo ===');
    log.info('Starting plugin demo with Bun runtime');

    // Initialize actor system
    const system = new ActorSystem();
    await system.start();
    console.log('\n=== Actor System Started ===');
    log.info('Actor system started');

    // Create plugin manager
    const currentDir = import.meta.dir || __dirname;
    const pluginsDir = path.join(currentDir, 'calculator');
    const tempDir = path.join(currentDir, 'temp');
    console.log('\n=== Plugin Directories ===');
    log.info('Plugin directories:', { pluginsDir, tempDir });

    const pluginManager = await system.spawn({
        producer: (context) => new PluginManager(context, {
            pluginsDir,
            tempDir,
            runtime: 'bun'
        })
    });
    console.log('\n=== Plugin Manager Created ===');
    log.info('Plugin manager created', {
        id: pluginManager,
        config: {
            pluginsDir,
            tempDir,
            runtime: 'bun'
        }
    });

    try {
        // Install calculator plugin
        console.log('\n=== Installing Calculator Plugin ===');
        const calculatorPluginPath = path.join(pluginsDir);
        log.info('Installing calculator plugin', {
            path: calculatorPluginPath,
            details: {
                type: 'installation',
                status: 'starting'
            }
        });

        // Load plugin metadata
        const metadataPath = path.join(calculatorPluginPath, 'src', 'plugin.json');
        const metadata = await fs.readJson(metadataPath) as PluginMetadata;
        metadata.runtime = 'bun';
        log.info('Plugin metadata loaded', {
            metadata: JSON.stringify(metadata, null, 2)
        });

        // Install plugin
        await system.send(pluginManager, {
            type: 'plugin.install',
            payload: { metadata }
        });
        log.info('Calculator plugin installed', {
            status: 'success',
            pluginId: 'calculator'
        });

        // Activate plugin
        console.log('\n=== Activating Calculator Plugin ===');
        await system.send(pluginManager, {
            type: 'plugin.activate',
            payload: { pluginId: 'calculator' }
        });
        log.info('Calculator plugin activated', {
            status: 'success',
            pluginId: 'calculator'
        });

        // Create test actor
        console.log('\n=== Creating Test Actor ===');
        const testActor = await system.spawn({
            producer: (context) => new TestActor(context)
        });
        log.info('Test actor created', { id: testActor });

        // Run performance tests
        console.log('\n=== Running Performance Tests ===');
        log.info('Starting performance tests', {
            details: {
                tests: ['inline', 'worker', 'process'],
                operations: 1000,
                types: ['add', 'multiply', 'divide']
            }
        });

        // Test inline plugin performance
        console.log('\n=== Testing Inline Plugin ===');
        const startInline = performance.now();
        for (let i = 0; i < 1000; i++) {
            const message: Message = {
                type: 'calculator.calculate',
                payload: {
                    operation: 'add',
                    operands: [i, i + 1]
                },
                sender: testActor
            };
            await system.send(pluginManager, message);
            if (i % 100 === 0) {
                log.info('Inline calculation progress', {
                    type: 'progress',
                    details: {
                        iteration: i,
                        operation: 'add',
                        operands: [i, i + 1],
                        expectedResult: 2 * i + 1
                    },
                    metrics: {
                        progress: `${((i + 1) / 1000 * 100).toFixed(1)}%`,
                        remainingIterations: 1000 - (i + 1),
                        elapsedTime: `${(performance.now() - startInline).toFixed(2)}ms`
                    }
                });
                console.log('Progress data:', {
                    iteration: i,
                    progress: `${((i + 1) / 1000 * 100).toFixed(1)}%`,
                    operation: 'add'
                });
                await new Promise(resolve => setTimeout(resolve, 50));
            }
        }

        // Test worker plugin performance
        console.log('\n=== Testing Worker Plugin ===');
        metadata.type = 'worker';
        await system.send(pluginManager, {
            type: 'plugin.install',
            payload: { metadata }
        });
        await system.send(pluginManager, {
            type: 'plugin.activate',
            payload: { pluginId: 'calculator' }
        });

        const startWorker = performance.now();
        for (let i = 0; i < 1000; i++) {
            const message: Message = {
                type: 'calculator.calculate',
                payload: {
                    operation: 'multiply',
                    operands: [i, i + 1]
                },
                sender: testActor
            };
            await system.send(pluginManager, message);
            if (i % 100 === 0) {
                log.info('Worker calculation progress', {
                    type: 'progress',
                    details: {
                        iteration: i,
                        operation: 'multiply',
                        operands: [i, i + 1],
                        expectedResult: (i + 1) * (i + 2)
                    },
                    metrics: {
                        progress: `${((i + 2) / 1000 * 100).toFixed(1)}%`,
                        remainingIterations: 1000 - (i + 2),
                        elapsedTime: `${(performance.now() - startWorker).toFixed(2)}ms`
                    }
                });
                console.log('Progress data:', {
                    iteration: i,
                    progress: `${((i + 2) / 1000 * 100).toFixed(1)}%`,
                    operation: 'multiply'
                });
                await new Promise(resolve => setTimeout(resolve, 50));
            }
        }

        // Test process plugin performance
        console.log('\n=== Testing Process Plugin ===');
        metadata.type = 'process';
        await system.send(pluginManager, {
            type: 'plugin.install',
            payload: { metadata }
        });
        await system.send(pluginManager, {
            type: 'plugin.activate',
            payload: { pluginId: 'calculator' }
        });

        const startProcess = performance.now();
        for (let i = 0; i < 1000; i++) {
            const message: Message = {
                type: 'calculator.calculate',
                payload: {
                    operation: 'divide',
                    operands: [i + 1, 1]
                },
                sender: testActor
            };
            await system.send(pluginManager, message);
            if (i % 100 === 0) {
                log.info('Process calculation progress', {
                    type: 'progress',
                    details: {
                        iteration: i,
                        operation: 'divide',
                        operands: [i + 1, 1],
                        expectedResult: i + 1
                    },
                    metrics: {
                        progress: `${((i + 1) / 1000 * 100).toFixed(1)}%`,
                        remainingIterations: 1000 - (i + 1),
                        elapsedTime: `${(performance.now() - startProcess).toFixed(2)}ms`
                    }
                });
                console.log('Progress data:', {
                    iteration: i,
                    progress: `${((i + 1) / 1000 * 100).toFixed(1)}%`,
                    operation: 'divide'
                });
                await new Promise(resolve => setTimeout(resolve, 50));
            }
        }

        // Additional test cases
        console.log('\n=== Running Special Test Cases ===');

        // Test addition with multiple operands
        const addMessage: Message = {
            type: 'calculator.calculate',
            payload: {
                operation: 'add',
                operands: [10, 20, 30, 40, 50]
            },
            sender: testActor
        };
        await system.send(pluginManager, addMessage);
        log.info('Addition test sent', {
            type: 'test',
            details: {
                operation: 'add',
                operands: [10, 20, 30, 40, 50],
                expectedResult: 150
            }
        });
        await new Promise(resolve => setTimeout(resolve, 100));

        // Test subtraction
        const subtractMessage: Message = {
            type: 'calculator.calculate',
            payload: {
                operation: 'subtract',
                operands: [100, 20, 30]
            },
            sender: testActor
        };
        await system.send(pluginManager, subtractMessage);
        log.info('Subtraction test sent', {
            type: 'test',
            details: {
                operation: 'subtract',
                operands: [100, 20, 30],
                expectedResult: 50
            }
        });
        await new Promise(resolve => setTimeout(resolve, 100));

        // Test multiplication
        const multiplyMessage: Message = {
            type: 'calculator.calculate',
            payload: {
                operation: 'multiply',
                operands: [2, 3, 4]
            },
            sender: testActor
        };
        await system.send(pluginManager, multiplyMessage);
        log.info('Multiplication test sent', {
            type: 'test',
            details: {
                operation: 'multiply',
                operands: [2, 3, 4],
                expectedResult: 24
            }
        });
        await new Promise(resolve => setTimeout(resolve, 100));

        // Test division
        const divideMessage: Message = {
            type: 'calculator.calculate',
            payload: {
                operation: 'divide',
                operands: [100, 2, 2]
            },
            sender: testActor
        };
        await system.send(pluginManager, divideMessage);
        log.info('Division test sent', {
            type: 'test',
            details: {
                operation: 'divide',
                operands: [100, 2, 2],
                expectedResult: 25
            }
        });
        await new Promise(resolve => setTimeout(resolve, 100));

        // Test error handling (division by zero)
        try {
            const errorMessage: Message = {
                type: 'calculator.calculate',
                payload: {
                    operation: 'divide',
                    operands: [10, 0]
                },
                sender: testActor
            };
            await system.send(pluginManager, errorMessage);
            log.info('Division by zero test sent', {
                type: 'test',
                details: {
                    operation: 'divide',
                    operands: [10, 0],
                    expectedError: 'Division by zero'
                }
            });
            await new Promise(resolve => setTimeout(resolve, 100));
        } catch (error) {
            log.error('Division by zero test error', {
                error: error instanceof Error ? error.message : String(error),
                type: error instanceof Error ? error.constructor.name : 'Unknown'
            });
        }

        // Wait longer to receive all responses
        await new Promise(resolve => setTimeout(resolve, 2000));

    } catch (error) {
        console.log('\n=== Error Occurred ===');
        log.error('Error during plugin demo', {
            error: error instanceof Error ? {
                message: error.message,
                stack: error.stack,
                type: error.constructor.name
            } : String(error),
            context: 'plugin_demo'
        });
    } finally {
        // Clean up
        console.log('\n=== Cleaning Up ===');
        log.info('Stopping actor system');
        await system.stop();
        log.info('Plugin demo completed', {
            status: 'success',
            timestamp: new Date().toISOString()
        });
    }
}

// Run the demo if this is the main module
if (import.meta.main || require.main === module) {
    runPluginDemoBun().catch(error => {
        log.error('Demo failed:', error instanceof Error ? error.message : String(error));
        if (error instanceof Error && error.stack) {
            log.error('Stack trace:', error.stack);
        }
        process.exit(1);
    });
}

export { runPluginDemoBun }; 