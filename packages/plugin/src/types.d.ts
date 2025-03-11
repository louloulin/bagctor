import { Actor, Message } from '@bactor/core';
import { Worker as NodeWorker } from 'worker_threads';
import { ChildProcess } from 'child_process';
declare global {
    var Bun: {
        spawn(command: string[], options?: SpawnOptions): ChildProcess;
        isMainThread: boolean;
        workerData: any;
        env: typeof process.env;
    };
    interface ImportMeta {
        dir?: string;
        main?: boolean;
    }
}
interface SpawnOptions {
    cwd?: string;
    env?: {
        [key: string]: string | undefined;
    };
    ipc?: boolean;
}
interface BunWorkerOptions {
    type?: 'module' | 'classic';
    workerData?: any;
    name?: string;
}
declare global {
    interface WorkerOptions extends BunWorkerOptions {
        type?: 'module' | 'classic';
        workerData?: any;
        name?: string;
    }
}
export type WorkerType = NodeWorker | Worker;
export interface PluginMetadata {
    id: string;
    name: string;
    version: string;
    description?: string;
    author?: string;
    dependencies?: {
        [key: string]: string;
    };
    type: 'process' | 'worker' | 'inline';
    capabilities?: string[];
    config?: any;
    entry?: string;
    workerType?: 'node' | 'web';
    runtime?: 'node' | 'bun';
}
export interface PluginInstance {
    metadata: PluginMetadata;
    status: PluginStatus;
    config?: any;
    actor?: Actor;
    process?: ChildProcess;
    worker?: WorkerType;
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
        source?: string;
    };
}
export interface PluginResponse {
    success: boolean;
    data?: any;
    error?: string;
}
export interface PluginHub {
    search(query: PluginQuery): Promise<PluginMetadata[]>;
    download(pluginId: string, version?: string): Promise<string>;
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
    runtime?: 'node' | 'bun';
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
export {};
