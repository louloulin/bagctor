import { Command } from 'commander';
import * as path from 'path';
import * as fs from 'fs-extra';
import { log } from '@bactor/core';
import { ActorSystem } from '@bactor/core';
import { PluginManager } from '../plugin_manager';
import { PluginMetadata } from '../types';

interface DebugOptions {
    type?: 'inline' | 'worker' | 'process';
    watch?: boolean;
    port?: string;
}

// 命令行配置
const program = new Command();

program
    .name('debug-bactor-plugin')
    .description('Debug a Bactor plugin')
    .version('0.1.0')
    .argument('<plugin-path>', 'path to plugin directory')
    .option('-t, --type <type>', 'plugin type (inline, worker, process)')
    .option('-w, --watch', 'watch for changes', false)
    .option('-p, --port <port>', 'debug port', '9229')
    .action((pluginPath: string, options: DebugOptions) => {
        debugPlugin(pluginPath, {
            type: options.type as 'inline' | 'worker' | 'process',
            watch: options.watch,
            port: options.port ? parseInt(options.port) : undefined
        });
    });

program.parse(); 