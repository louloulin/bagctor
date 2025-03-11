// 导出核心插件接口
export {
    BagctorPlugin,
    PluginBase,
    PluginContext,
    PluginMetadata,
    MessageHandler,
    createPluginContext
} from './core/plugin_base';

// 导出适配器
export {
    createPluginActorFromClass,
    createPluginActorFromFactory
} from './adapters/plugin_adapter';

// 导出类型定义
export * from './types';

// 为向后兼容性导出
export { createPluginActor } from './core/plugin_base'; 