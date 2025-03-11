import { ActorSystem, ActorContext, Actor, PID, log } from '@bactor/core';
import { BagctorPlugin, PluginMetadata } from '../../../src';
import * as fs from 'fs-extra';
import * as path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

// 可能的插件类型
export type PluginModule = {
    default: new () => BagctorPlugin<any>;
} | {
    createPlugin: () => BagctorPlugin<any>;
};

/**
 * 插件加载器 - 负责加载和管理插件
 */
export class PluginLoader {
    private system: ActorSystem;
    private loadedPlugins: Map<string, { plugin: BagctorPlugin<any>, actor?: Actor, pid?: PID }> = new Map();

    constructor(system: ActorSystem) {
        this.system = system;
    }

    /**
     * 从已安装的NPM包加载插件（静态加载）
     * 
     * @param pluginPackage 插件包或插件构造函数
     * @param config 插件配置
     * @returns 加载的插件实例
     */
    async loadStaticPlugin<TConfig = any>(
        pluginPackage: PluginModule | (new () => BagctorPlugin<TConfig>),
        config?: TConfig
    ): Promise<BagctorPlugin<TConfig>> {
        try {
            // 1. 从包或构造函数创建插件实例
            let plugin: BagctorPlugin<TConfig>;

            if (typeof pluginPackage === 'function') {
                // 直接使用构造函数
                plugin = new pluginPackage();
            } else if ('default' in pluginPackage && typeof pluginPackage.default === 'function') {
                // 使用默认导出的构造函数
                plugin = new pluginPackage.default();
            } else if ('createPlugin' in pluginPackage && typeof pluginPackage.createPlugin === 'function') {
                // 使用工厂函数
                plugin = pluginPackage.createPlugin() as BagctorPlugin<TConfig>;
            } else {
                throw new Error('无效的插件包格式，需要默认导出构造函数或createPlugin工厂函数');
            }

            // 2. 检查插件元数据
            this.validatePluginMetadata(plugin.metadata);

            // 3. 创建根上下文用于插件初始化
            const rootContext = new ActorContext(
                { id: `plugin-${plugin.metadata.id}-root` },
                this.system
            );

            // 4. 创建插件上下文
            const pluginContext = this.createPluginContext(rootContext, plugin.metadata.id);

            // 5. 初始化插件
            await plugin.initialize(pluginContext, config || {} as TConfig);

            // 6. 存储已加载的插件
            this.loadedPlugins.set(plugin.metadata.id, { plugin });

            log.info(`静态加载插件成功: ${plugin.metadata.id} (${plugin.metadata.version})`);
            return plugin;
        } catch (error) {
            log.error(`静态加载插件失败:`, error);
            throw error;
        }
    }

    /**
     * 从文件系统路径或URL动态加载插件
     * 
     * @param pluginPath 插件路径（本地文件系统路径或URL）
     * @param config 插件配置
     * @returns 加载的插件实例
     */
    async loadDynamicPlugin<TConfig = any>(
        pluginPath: string,
        config?: TConfig
    ): Promise<BagctorPlugin<TConfig>> {
        try {
            // 1. 检查是否为URL
            const isUrl = pluginPath.startsWith('http://') || pluginPath.startsWith('https://');
            let localPluginPath: string;

            if (isUrl) {
                // 处理远程URL插件（下载到临时目录）
                localPluginPath = await this.downloadPlugin(pluginPath);
            } else {
                // 使用本地路径
                localPluginPath = path.resolve(pluginPath);
            }

            // 2. 确认插件目录存在
            if (!await fs.pathExists(localPluginPath)) {
                throw new Error(`插件路径不存在: ${localPluginPath}`);
            }

            // 3. 读取插件元数据
            const pluginJsonPath = path.join(localPluginPath, 'package.json');
            if (!await fs.pathExists(pluginJsonPath)) {
                throw new Error(`插件package.json不存在: ${pluginJsonPath}`);
            }

            const packageJson = await fs.readJson(pluginJsonPath);
            log.info(`加载插件元数据: ${packageJson.name}@${packageJson.version}`);

            // 4. 确定插件入口文件
            const mainFile = packageJson.main || 'index.js';
            const entryPoint = path.join(localPluginPath, mainFile);

            // 5. 检查是否需要构建插件
            if (!await fs.pathExists(entryPoint) && await fs.pathExists(path.join(localPluginPath, 'src'))) {
                log.info(`插件需要构建: ${localPluginPath}`);
                await this.buildPlugin(localPluginPath);
            }

            // 6. 加载插件模块
            log.info(`从${entryPoint}加载插件模块`);
            // 注意：在实际实现中，你可能需要更复杂的模块加载逻辑
            // 这里简化为通过require加载，但在生产环境中需要考虑安全性和隔离
            const pluginModule = require(entryPoint);

            // 7. 使用静态加载方法完成剩余步骤
            return await this.loadStaticPlugin(pluginModule, config);
        } catch (error) {
            log.error(`动态加载插件失败:`, error);
            throw error;
        }
    }

    /**
     * 卸载插件
     * 
     * @param pluginId 插件ID
     */
    async unloadPlugin(pluginId: string): Promise<void> {
        const pluginEntry = this.loadedPlugins.get(pluginId);
        if (!pluginEntry) {
            log.warn(`卸载插件失败: 插件 ${pluginId} 未加载`);
            return;
        }

        try {
            // 1. 停止插件Actor（如果存在）
            if (pluginEntry.pid && pluginEntry.actor) {
                await this.system.stop(pluginEntry.pid);
            }

            // 2. 执行插件清理
            await pluginEntry.plugin.cleanup();

            // 3. 从加载列表中移除
            this.loadedPlugins.delete(pluginId);

            log.info(`插件卸载成功: ${pluginId}`);
        } catch (error) {
            log.error(`卸载插件失败:`, error);
            throw error;
        }
    }

    /**
     * 获取所有已加载的插件
     */
    getLoadedPlugins(): { id: string, metadata: PluginMetadata }[] {
        return Array.from(this.loadedPlugins.entries()).map(([id, entry]) => {
            return {
                id,
                metadata: entry.plugin.metadata
            };
        });
    }

    // ==== 私有辅助方法 ====

    /**
     * 验证插件元数据合法性
     */
    private validatePluginMetadata(metadata: PluginMetadata): void {
        if (!metadata.id) {
            throw new Error('插件元数据缺少id字段');
        }
        if (!metadata.name) {
            throw new Error('插件元数据缺少name字段');
        }
        if (!metadata.version) {
            throw new Error('插件元数据缺少version字段');
        }
        if (!metadata.capabilities || !Array.isArray(metadata.capabilities)) {
            throw new Error('插件元数据缺少capabilities字段或格式不正确');
        }
    }

    /**
     * 创建插件上下文
     */
    private createPluginContext(actorContext: ActorContext, pluginId: string): any {
        // 简化的插件上下文实现
        return {
            send: async (target: PID | string, type: string, payload: any): Promise<void> => {
                const targetPid = typeof target === 'string' ? { id: target } : target;
                await actorContext.send(targetPid, { type, payload });
            },

            registerHandler: (messageType: string, handler: (payload: any) => Promise<any>): void => {
                // 在实际实现中，这里需要与Actor系统集成
                log.info(`注册消息处理器: ${messageType}`);
            },

            getPluginId: (): string => pluginId,

            log: log
        };
    }

    /**
     * 从URL下载插件到临时目录
     */
    private async downloadPlugin(url: string): Promise<string> {
        // 注意：这里简化实现，实际实现需要更安全的下载和验证逻辑
        log.info(`下载插件: ${url}`);
        const tmpDir = path.join(process.cwd(), 'tmp', 'plugins', `download-${Date.now()}`);
        await fs.ensureDir(tmpDir);

        // 这里应该实现实际的下载逻辑
        // 简化示例：假装已下载
        await fs.writeFile(path.join(tmpDir, 'download-info.txt'), `下载自: ${url}\n时间: ${new Date().toISOString()}`);

        return tmpDir;
    }

    /**
     * 构建插件（编译TypeScript等）
     */
    private async buildPlugin(pluginPath: string): Promise<void> {
        log.info(`构建插件: ${pluginPath}`);

        try {
            // 检查是否有构建脚本
            const packageJsonPath = path.join(pluginPath, 'package.json');
            const packageJson = await fs.readJson(packageJsonPath);

            if (packageJson.scripts && packageJson.scripts.build) {
                // 使用插件自己的构建脚本
                log.info(`使用插件构建脚本: ${packageJson.scripts.build}`);
                await execAsync('npm run build', { cwd: pluginPath });
            } else {
                // 默认TypeScript编译
                log.info('使用默认TypeScript编译');
                await execAsync('tsc --build', { cwd: pluginPath });
            }

            log.info(`插件构建完成: ${pluginPath}`);
        } catch (error) {
            log.error(`插件构建失败:`, error);
            throw new Error(`插件构建失败: ${error instanceof Error ? error.message : String(error)}`);
        }
    }
}

// 导出便捷函数
let defaultLoader: PluginLoader | null = null;

/**
 * 获取默认插件加载器
 */
export function getPluginLoader(system?: ActorSystem): PluginLoader {
    if (!defaultLoader) {
        if (!system) {
            throw new Error('首次获取加载器时必须提供ActorSystem');
        }
        defaultLoader = new PluginLoader(system);
    }
    return defaultLoader;
}

/**
 * 加载静态插件（简化接口）
 */
export async function loadStaticPlugin<TConfig = any>(
    system: ActorSystem,
    pluginPackage: PluginModule | (new () => BagctorPlugin<TConfig>),
    config?: TConfig
): Promise<BagctorPlugin<TConfig>> {
    const loader = getPluginLoader(system);
    return await loader.loadStaticPlugin(pluginPackage, config);
}

/**
 * 加载动态插件（简化接口）
 */
export async function loadDynamicPlugin<TConfig = any>(
    system: ActorSystem,
    pluginPath: string,
    config?: TConfig
): Promise<BagctorPlugin<TConfig>> {
    const loader = getPluginLoader(system);
    return await loader.loadDynamicPlugin(pluginPath, config);
} 