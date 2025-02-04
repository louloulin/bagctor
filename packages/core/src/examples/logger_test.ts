import { log, configureLogger } from '../utils/logger';

async function testLogger() {
    // 使用基本配置
    configureLogger({
        prettyPrint: false,
        level: 'info',
        formatters: {
            level: (label) => ({ level: label.toUpperCase() }),
            bindings: (bindings) => bindings,
            log: (obj) => ({
                ...obj,
                timestamp: new Date().toISOString(),
                data: JSON.stringify(obj, null, 2)
            })
        }
    });

    console.log('\n=== Testing Progress Log ===');
    const progressData = {
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

    log.info('Process calculation progress', progressData);
    console.log('Progress data:', JSON.stringify(progressData, null, 2));
    await new Promise(resolve => setTimeout(resolve, 100));

    console.log('\n=== Testing Complex Object Log ===');
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
    console.log('Complex data:', JSON.stringify(complexData, null, 2));
    await new Promise(resolve => setTimeout(resolve, 100));

    console.log('\n=== Testing Error Log ===');
    try {
        throw new Error('Test error');
    } catch (error) {
        log.error('Error occurred', { error, context: 'test' });
        console.log('Error data:', error);
    }
    await new Promise(resolve => setTimeout(resolve, 100));

    console.log('\n=== Testing Null Values Log ===');
    const nullData = {
        nullValue: null,
        undefinedValue: undefined,
        validValue: 'test'
    };

    log.info('Null test', nullData);
    console.log('Null data:', JSON.stringify(nullData, null, 2));
    await new Promise(resolve => setTimeout(resolve, 100));

    console.log('\n=== Testing Ordered Object Log ===');
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
    console.log('Ordered data:', JSON.stringify(orderedData, null, 2));
}

// 运行测试
testLogger().catch(console.error); 