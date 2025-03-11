import { Actor, ActorContext } from '@bactor/core';
import { BagctorPlugin } from '../core/plugin_base';
/**
 * 插件适配器函数 - 提供与现有ActorSystem的兼容性
 *
 * 此函数用于创建一个与BActor系统兼容的Actor，将新的插件接口与现有系统集成
 *
 * @param context ActorContext - Actor上下文
 * @param pluginConstructor - 插件构造函数
 * @param config - 插件配置
 * @returns Promise<Actor> - 返回适配后的Actor
 */
export declare function createPluginActorFromClass<TConfig = any>(context: ActorContext, pluginConstructor: new () => BagctorPlugin<TConfig>, config: TConfig): Promise<Actor>;
/**
 * 插件适配器函数 - 从插件工厂函数创建Actor
 *
 * 此函数用于从一个工厂函数创建插件，并将其包装为与BActor系统兼容的Actor
 *
 * @param context ActorContext - Actor上下文
 * @param pluginFactory - 创建插件的工厂函数
 * @param config - 插件配置
 * @returns Promise<Actor> - 返回适配后的Actor
 */
export declare function createPluginActorFromFactory<TConfig = any>(context: ActorContext, pluginFactory: (config: TConfig) => BagctorPlugin<TConfig>, config: TConfig): Promise<Actor>;
