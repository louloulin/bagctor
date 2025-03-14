#!/usr/bin/env node

/**
 * 运行Worker示例的脚本
 */

const { execSync } = require('child_process');
const path = require('path');

// 定义示例文件路径
const examplePath = path.join(__dirname, 'examples/worker-example.ts');

console.log('===================================');
console.log('Bactor Worker功能示例');
console.log('===================================');
console.log('');
console.log('此脚本将演示如何使用Bactor的Worker功能执行多线程任务处理');
console.log('');
console.log('运行示例...');
console.log('');

try {
    // 使用bun运行TypeScript示例文件
    execSync(`bun run ${examplePath}`, { stdio: 'inherit' });

    console.log('');
    console.log('示例执行完成！');
    console.log('');
    console.log('要了解更多关于Worker功能的信息，请查看：');
    console.log('- API文档: packages/core/src/core/workers/README.md');
    console.log('- 实现状态: worker-implementation-status.md');
    console.log('');
} catch (error) {
    console.error('运行示例时出错:', error.message);
    process.exit(1);
} 