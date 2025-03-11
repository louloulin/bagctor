#!/usr/bin/env bun
/**
 * 插件系统演示运行脚本
 * 
 * 此脚本用于运行新设计的插件系统演示
 * 执行方式: bun run run_plugin_demo.ts
 */

import { runPluginDemo } from './plugin_demo';

console.log('开始运行插件系统演示...');
runPluginDemo()
    .then(() => {
        console.log('插件系统演示完成！');
        process.exit(0);
    })
    .catch(error => {
        console.error('插件系统演示失败:', error);
        process.exit(1);
    }); 