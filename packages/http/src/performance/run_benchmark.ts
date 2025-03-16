/**
 * HTTP 性能基准测试运行器
 * 使用 HttpBenchmark 类执行各种场景的性能测试
 */

import path from 'path';
import { HttpBenchmark, standardTestSuite, loadTestSuite, dataTransferTestSuite } from './http_benchmark';

// 创建输出目录
const outputPath = path.join(process.cwd(), 'benchmark-results');

/**
 * 运行完整的基准测试
 */
async function runFullBenchmark() {
    console.log('=== Starting Full HTTP Performance Benchmark ===');

    // 配置基准测试
    const benchmark = new HttpBenchmark({
        name: 'Bactor HTTP Full Performance Test',
        description: 'Comprehensive performance analysis of the HTTP server component',
        testSuites: [
            standardTestSuite,
            loadTestSuite,
            dataTransferTestSuite
        ],
        baseUrl: 'http://localhost:3038',
        outputPath
    });

    try {
        // 运行所有测试并获取结果
        const results = await benchmark.runAll();

        // 打印结果摘要
        console.log('\n=== Benchmark Complete ===');
        console.log(`Total duration: ${results.duration.toFixed(2)} seconds`);
        console.log(`Reports saved to: ${outputPath}`);

    } catch (error) {
        console.error('Benchmark failed:', error);
    }
}

/**
 * 运行标准基准测试
 */
async function runStandardBenchmark() {
    console.log('=== Starting Standard HTTP Performance Benchmark ===');

    // 配置基准测试
    const benchmark = new HttpBenchmark({
        name: 'Bactor HTTP Standard Performance Test',
        description: 'Basic performance analysis of the HTTP server component',
        testSuites: [standardTestSuite],
        baseUrl: 'http://localhost:3038',
        outputPath
    });

    try {
        // 运行测试
        await benchmark.runAll();

    } catch (error) {
        console.error('Benchmark failed:', error);
    }
}

/**
 * 运行负载测试
 */
async function runLoadTest() {
    console.log('=== Starting HTTP Load Test ===');

    // 配置基准测试
    const benchmark = new HttpBenchmark({
        name: 'Bactor HTTP Load Test',
        description: 'Testing HTTP server performance under various load levels',
        testSuites: [loadTestSuite],
        baseUrl: 'http://localhost:3038',
        outputPath
    });

    try {
        // 运行测试
        await benchmark.runAll();

    } catch (error) {
        console.error('Benchmark failed:', error);
    }
}

/**
 * 运行数据传输测试
 */
async function runDataTransferTest() {
    console.log('=== Starting HTTP Data Transfer Test ===');

    // 配置基准测试
    const benchmark = new HttpBenchmark({
        name: 'Bactor HTTP Data Transfer Test',
        description: 'Testing HTTP server performance with different payload sizes',
        testSuites: [dataTransferTestSuite],
        baseUrl: 'http://localhost:3038',
        outputPath
    });

    try {
        // 运行测试
        await benchmark.runAll();

    } catch (error) {
        console.error('Benchmark failed:', error);
    }
}

/**
 * 主函数
 */
async function main() {
    // 获取命令行参数
    const args = process.argv.slice(2);
    const testType = args[0] || 'standard';

    // 根据参数运行不同类型的测试
    switch (testType) {
        case 'full':
            await runFullBenchmark();
            break;
        case 'load':
            await runLoadTest();
            break;
        case 'data':
            await runDataTransferTest();
            break;
        case 'standard':
        default:
            await runStandardBenchmark();
            break;
    }
}

// 运行主函数
main().catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
}); 