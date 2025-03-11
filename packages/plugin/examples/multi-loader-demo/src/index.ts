import { ActorSystem, log } from '@bactor/core';
import { loadStaticPlugin, loadDynamicPlugin } from './plugin-loader';
import * as path from 'path';

/**
 * BActor插件多方式加载演示
 * 
 * 此示例展示了如何使用两种不同方式加载插件：
 * 1. 通过package.json依赖方式（静态加载）
 * 2. 从文件系统或URL动态加载
 */
async function runDemo() {
    log.info('=== BActor插件多方式加载演示 ===');

    try {
        // 初始化Actor系统
        const system = new ActorSystem();
        await system.start();
        log.info('Actor系统已启动');

        // 插件配置
        const config = {
            debug: true,
            timeout: 5000
        };

        // 1. 静态加载 - 通过package.json依赖方式
        try {
            log.info('\n=== 演示1: 静态加载插件 ===');

            // 注意：在实际环境中，你会import一个npm安装的包
            // 但在示例中，我们直接导入本地文件
            const staticPluginPath = path.join(__dirname, '../plugins/static-plugin');
            log.info(`加载静态插件: ${staticPluginPath}`);

            // 模拟导入npm包
            const staticPluginModule = require(staticPluginPath);
            const staticPlugin = await loadStaticPlugin(system, staticPluginModule, {
                ...config,
                mode: 'static'
            });

            log.info(`静态插件已加载: ${staticPlugin.metadata.id}`);

            // 使用插件功能
            const result = await staticPlugin.handleMessage('greeting.sayHello', { name: '静态加载用户' });
            log.info(`插件响应: ${result.message}`);
        } catch (error) {
            log.error('静态加载插件失败:', error);
        }

        // 2. 动态加载 - 从文件系统加载
        try {
            log.info('\n=== 演示2: 动态加载插件 ===');

            const dynamicPluginPath = path.join(__dirname, '../plugins/dynamic-plugin');
            log.info(`动态加载插件: ${dynamicPluginPath}`);

            const dynamicPlugin = await loadDynamicPlugin(system, dynamicPluginPath, {
                ...config,
                mode: 'dynamic'
            });

            log.info(`动态插件已加载: ${dynamicPlugin.metadata.id}`);

            // 使用插件功能
            const result = await dynamicPlugin.handleMessage('weather.getReport', { city: '北京' });
            log.info(`插件响应:`, result);
        } catch (error) {
            log.error('动态加载插件失败:', error);
        }

        // 3. 动态加载 - 从URL加载（模拟）
        try {
            log.info('\n=== 演示3: 从URL动态加载插件 ===');
            log.info('注意：这是模拟演示，不会真正从URL下载插件');

            // 生产环境中这里会是一个真实的URL
            const pluginUrl = 'https://example.com/plugins/remote-plugin.zip';
            log.info(`从URL加载插件: ${pluginUrl}`);

            // 注意：在这个演示中，下载被模拟了，实际不会下载
            const remotePlugin = await loadDynamicPlugin(system, pluginUrl, {
                ...config,
                mode: 'remote'
            });

            // 这部分代码在示例中不会执行，因为下载是模拟的
            log.info(`远程插件已加载: ${remotePlugin.metadata.id}`);
        } catch (error) {
            log.warn('从URL加载插件失败 (预期中的错误，因为这只是模拟):', error);
        }

        log.info('\n=== 演示完成 ===');
        await system.stop();
    } catch (error) {
        log.error('演示失败:', error);
    }
}

/**
 * 启动演示
 */
if (require.main === module) {
    runDemo().catch(err => {
        console.error('演示执行错误:', err);
        process.exit(1);
    });
}

export { runDemo }; 