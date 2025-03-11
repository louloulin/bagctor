import { Actor, ActorContext, log, PID } from '@bactor/core';
export interface PluginContext {
    send(target: string | PID, type: string, payload: any): Promise<void>;
    registerHandler(messageType: string, handler: (payload: any) => Promise<any>): void;
    getPluginId(): string;
    log: typeof log;
}
export interface PluginMetadata {
    id: string;
    name: string;
    version: string;
    description?: string;
    author?: string;
    capabilities: string[];
    config?: Record<string, any>;
}
export interface BagctorPlugin<TConfig = any> {
    metadata: PluginMetadata;
    initialize(context: PluginContext, config: TConfig): Promise<void>;
    handleMessage<T = any>(type: string, payload: any): Promise<T>;
    cleanup(): Promise<void>;
}
export type MessageHandler<TPayload = any, TResult = any> = (payload: TPayload) => Promise<TResult>;
export declare abstract class PluginBase<TConfig = any> implements BagctorPlugin<TConfig> {
    abstract metadata: PluginMetadata;
    protected context: PluginContext;
    protected config: TConfig;
    private handlers;
    initialize(context: PluginContext, config: TConfig): Promise<void>;
    protected onInitialize(): Promise<void>;
    private registerCapabilities;
    protected registerHandler(messageType: string, handler: MessageHandler): void;
    handleMessage<T = any>(type: string, payload: any): Promise<T>;
    cleanup(): Promise<void>;
    protected onCleanup(): Promise<void>;
    private capitalizeFirstLetter;
}
export declare function createPluginContext(actor: Actor, actorContext: ActorContext, pluginId: string): PluginContext;
export declare function createPluginActor<TConfig = any>(Plugin: new () => BagctorPlugin<TConfig>, context: ActorContext, config: TConfig): Promise<Actor>;
