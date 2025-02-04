import * as path from 'path';
import * as fs from 'fs-extra';
import { log } from '@bactor/core';
import { ActorSystem } from '@bactor/core';
import { PluginManager } from '../plugin_manager';
import { PluginMetadata } from '../types';

interface DebugOptions {
    type?: 'inline' | 'worker' | 'process';
    watch?: boolean;
    port?: string | number;
}

async function debugPlugin(pluginPath: string, options: DebugOptions) {
    try {
        // 规范化路径
        const absolutePath = path.resolve(pluginPath);
        if (!await fs.pathExists(absolutePath)) {
            log.error('Plugin directory not found:', absolutePath);
            process.exit(1);
        }

        // 读取插件配置
        const metadataPath = path.join(absolutePath, 'plugin.json');
        if (!await fs.pathExists(metadataPath)) {
            log.error('Plugin metadata not found:', metadataPath);
            process.exit(1);
        }

        const metadata = await fs.readJson(metadataPath) as PluginMetadata;
        if (options.type) {
            metadata.type = options.type;
        }

        // 创建临时目录
        const tempDir = path.join(process.cwd(), '.bactor-debug');
        await fs.ensureDir(tempDir);

        // 初始化 Actor 系统
        const system = new ActorSystem();
        await system.start();

        // 创建插件管理器
        const pluginManager = await system.spawn({
            producer: (context) => new PluginManager(context, {
                pluginsDir: absolutePath,
                tempDir,
                runtime: 'bun'
            })
        });

        // 安装插件
        log.info('Installing plugin for debugging...', {
            path: absolutePath,
            type: metadata.type
        });

        await system.send(pluginManager, {
            type: 'plugin.install',
            payload: { metadata }
        });

        // 激活插件
        log.info('Activating plugin...');
        await system.send(pluginManager, {
            type: 'plugin.activate',
            payload: { pluginId: metadata.name }
        });

        log.info('Plugin ready for debugging', {
            name: metadata.name,
            type: metadata.type,
            location: absolutePath
        });

        // 设置清理函数
        const cleanup = async () => {
            log.info('Cleaning up...');
            await system.stop();
            await fs.remove(tempDir);
            process.exit(0);
        };

        process.on('SIGINT', cleanup);
        process.on('SIGTERM', cleanup);

        // 保持进程运行
        await new Promise(() => { });

    } catch (error) {
        log.error('Debug session failed:', error);
        process.exit(1);
    }
}

// 解析命令行参数
const args = process.argv.slice(2);
const options: DebugOptions = {
    type: undefined,
    watch: false,
    port: '9229'
};
let pluginPath = '';

for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    switch (arg) {
        case '-t':
        case '--type':
            const type = args[++i];
            if (['inline', 'worker', 'process'].includes(type)) {
                options.type = type as 'inline' | 'worker' | 'process';
            }
            break;
        case '-w':
        case '--watch':
            options.watch = true;
            break;
        case '-p':
        case '--port':
            options.port = args[++i];
            break;
        default:
            if (!arg.startsWith('-') && !pluginPath) {
                pluginPath = arg;
            }
    }
}

if (!pluginPath) {
    console.error('Error: Plugin path is required');
    console.log('\nUsage: debug-bactor-plugin <plugin-path> [options]');
    console.log('\nOptions:');
    console.log('  -t, --type <type>    Plugin type (inline, worker, process)');
    console.log('  -w, --watch          Watch for changes');
    console.log('  -p, --port <port>    Debug port (default: 9229)');
    process.exit(1);
}

debugPlugin(pluginPath, options); 