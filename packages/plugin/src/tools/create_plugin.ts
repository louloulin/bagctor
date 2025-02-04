import * as fs from 'fs-extra';
import * as path from 'path';
import { log } from '@bactor/core';
import { execSync } from 'child_process';

interface PluginOptions {
    name: string;
    description?: string;
    author?: string;
    types?: ('inline' | 'worker' | 'process')[];
    typescript?: boolean;
    test?: boolean;
    debug?: boolean;
}

async function createPlugin(options: PluginOptions) {
    const templateDir = path.join(__dirname, '../examples/plugin_template');
    const targetDir = path.join(process.cwd(), options.name);

    try {
        // 检查目标目录是否存在
        if (await fs.pathExists(targetDir)) {
            log.error('Target directory already exists:', targetDir);
            process.exit(1);
        }

        // 复制模板
        log.info('Creating plugin from template...', { name: options.name });
        await fs.copy(templateDir, targetDir);

        // 修改 package.json
        const packageJsonPath = path.join(targetDir, 'package.json');
        const packageJson = await fs.readJson(packageJsonPath);
        packageJson.name = options.name;
        packageJson.description = options.description || '';
        packageJson.author = options.author || '';

        // 添加调试配置
        if (options.debug) {
            packageJson.scripts = {
                ...packageJson.scripts,
                'debug': 'bun run --inspect src/index.ts',
                'debug:worker': 'bun run --inspect src/worker.ts',
                'debug:process': 'bun run --inspect src/process.ts'
            };
        }

        // 添加测试配置
        if (options.test) {
            packageJson.scripts = {
                ...packageJson.scripts,
                'test': 'bun test',
                'test:watch': 'bun test --watch'
            };
        }

        await fs.writeJson(packageJsonPath, packageJson, { spaces: 2 });

        // 修改 plugin.json
        const pluginJsonPath = path.join(targetDir, 'plugin.json');
        const pluginJson = await fs.readJson(pluginJsonPath);
        pluginJson.name = options.name;
        pluginJson.description = options.description || '';
        await fs.writeJson(pluginJsonPath, pluginJson, { spaces: 2 });

        // 根据选择的类型保留相应文件
        const srcDir = path.join(targetDir, 'src');
        const files = ['index.ts', 'worker.ts', 'process.ts'];
        const types = options.types || ['inline'];

        for (const file of files) {
            const filePath = path.join(srcDir, file);
            if (file === 'index.ts') continue; // 保留主入口文件
            if (!types.some(type => file.startsWith(type))) {
                await fs.remove(filePath);
            }
        }

        // 创建测试目录和文件
        if (options.test) {
            const testDir = path.join(srcDir, '__tests__');
            await fs.ensureDir(testDir);

            // 创建测试文件
            const testFile = path.join(testDir, 'plugin.test.ts');
            const testContent = `import { expect, describe, test } from 'bun:test';
import { Plugin } from '../index';

describe('${options.name} Plugin Tests', () => {
    test('should initialize plugin', () => {
        const plugin = new Plugin();
        expect(plugin).toBeDefined();
    });

    // Add more test cases here
});`;
            await fs.writeFile(testFile, testContent);
        }

        // 创建调试配置
        if (options.debug) {
            const vscodePath = path.join(targetDir, '.vscode');
            await fs.ensureDir(vscodePath);

            const launchConfig = {
                version: '0.2.0',
                configurations: [
                    {
                        type: 'bun',
                        request: 'launch',
                        name: 'Debug Plugin',
                        program: '${workspaceFolder}/src/index.ts',
                        stopOnEntry: false,
                        cwd: '${workspaceFolder}'
                    },
                    {
                        type: 'bun',
                        request: 'launch',
                        name: 'Debug Worker',
                        program: '${workspaceFolder}/src/worker.ts',
                        stopOnEntry: false,
                        cwd: '${workspaceFolder}'
                    },
                    {
                        type: 'bun',
                        request: 'launch',
                        name: 'Debug Process',
                        program: '${workspaceFolder}/src/process.ts',
                        stopOnEntry: false,
                        cwd: '${workspaceFolder}'
                    }
                ]
            };

            await fs.writeJson(path.join(vscodePath, 'launch.json'), launchConfig, { spaces: 2 });
        }

        // 初始化 Git 仓库
        try {
            execSync('git init', { cwd: targetDir });
            execSync('git add .', { cwd: targetDir });
            execSync('git commit -m "Initial commit: Plugin scaffold created"', { cwd: targetDir });
        } catch (error) {
            log.warn('Failed to initialize git repository:', error);
        }

        log.info('Plugin created successfully!', {
            location: targetDir,
            name: options.name,
            types: options.types
        });

        // 打印使用说明
        console.log('\n=== Next Steps ===');
        console.log(`1. cd ${options.name}`);
        console.log('2. bun install');
        if (options.debug) {
            console.log('3. To debug:');
            console.log('   - Open in VS Code');
            console.log('   - Select debug configuration');
            console.log('   - Press F5 to start debugging');
        }
        if (options.test) {
            console.log('4. To run tests:');
            console.log('   - bun test');
            console.log('   - bun test:watch (for development)');
        }

    } catch (error) {
        log.error('Failed to create plugin:', error);
        // 清理失败的创建
        if (await fs.pathExists(targetDir)) {
            await fs.remove(targetDir);
        }
        process.exit(1);
    }
}

// 解析命令行参数
const args = process.argv.slice(2);
const options: PluginOptions = {
    name: '',
    description: '',
    author: '',
    types: ['inline'],
    typescript: true,
    test: false,
    debug: false
};

for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    switch (arg) {
        case '-d':
        case '--description':
            options.description = args[++i];
            break;
        case '-a':
        case '--author':
            options.author = args[++i];
            break;
        case '-t':
        case '--types':
            options.types = [];
            while (i + 1 < args.length && !args[i + 1].startsWith('-')) {
                const type = args[++i];
                if (['inline', 'worker', 'process'].includes(type)) {
                    options.types.push(type as 'inline' | 'worker' | 'process');
                }
            }
            break;
        case '--typescript':
            options.typescript = true;
            break;
        case '--test':
            options.test = true;
            break;
        case '--debug':
            options.debug = true;
            break;
        default:
            if (!arg.startsWith('-') && !options.name) {
                options.name = arg;
            }
    }
}

if (!options.name) {
    console.error('Error: Plugin name is required');
    console.log('\nUsage: create-bactor-plugin <name> [options]');
    console.log('\nOptions:');
    console.log('  -d, --description <description>  Plugin description');
    console.log('  -a, --author <author>           Plugin author');
    console.log('  -t, --types <types...>          Plugin types (inline, worker, process)');
    console.log('  --typescript                    Use TypeScript (default: true)');
    console.log('  --test                         Add test configuration');
    console.log('  --debug                        Add debug configuration');
    process.exit(1);
}

createPlugin(options); 