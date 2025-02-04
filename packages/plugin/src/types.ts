import { Actor, ActorContext, Message } from '@bactor/core';

export interface PluginMetadata {
    id: string;
    name: string;
    version: string;
    description?: string;
    author?: string;
    dependencies?: { [key: string]: string };
    type: 'process' | 'worker' | 'inline';
    capabilities?: string[];
    config?: any;
}

export interface PluginInstance {
    metadata: PluginMetadata;
    status: PluginStatus;
    config?: any;
    actor?: Actor;
    process?: any; // NodeJS.Process for process plugins
    worker?: Worker; // Worker for worker plugins
}

export type PluginStatus = 'installed' | 'active' | 'inactive' | 'error' | 'updating';

export interface PluginQuery {
    id?: string;
    name?: string;
    version?: string;
    type?: 'process' | 'worker' | 'inline';
    capability?: string;
    status?: PluginStatus;
}

export interface PluginMessage extends Message {
    type: 'plugin.query' | 'plugin.install' | 'plugin.uninstall' | 'plugin.update' | 'plugin.activate' | 'plugin.deactivate';
    payload: {
        pluginId?: string;
        query?: PluginQuery;
        metadata?: PluginMetadata;
        config?: any;
    };
}

export interface PluginResponse {
    success: boolean;
    data?: any;
    error?: string;
}

export interface PluginHub {
    search(query: PluginQuery): Promise<PluginMetadata[]>;
    download(pluginId: string, version?: string): Promise<string>; // Returns local path
    publish(metadata: PluginMetadata, packagePath: string): Promise<void>;
    remove(pluginId: string, version?: string): Promise<void>;
}

export interface PluginConfig {
    pluginsDir: string;
    tempDir?: string;
    autoStart?: boolean;
    maxConcurrentPlugins?: number;
    taskTimeout?: number;
    hubEndpoint?: string;
    hubCredentials?: {
        username: string;
        token: string;
    };
}

export interface PluginActor extends Actor {
    install(metadata: PluginMetadata, config?: any): Promise<void>;
    uninstall(pluginId: string): Promise<void>;
    update(pluginId: string, version?: string): Promise<void>;
    activate(pluginId: string): Promise<void>;
    deactivate(pluginId: string): Promise<void>;
    query(query: PluginQuery): Promise<PluginInstance[]>;
}

export interface PluginManagerState {
    plugins: Map<string, PluginInstance>;
    config: PluginConfig;
} 