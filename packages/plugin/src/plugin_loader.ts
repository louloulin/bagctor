import { Actor, ActorContext, log } from '@bactor/core';
import * as fs from 'fs-extra';
import * as path from 'path';
import { fork, ChildProcess } from 'child_process';
import { Worker as NodeWorker } from 'worker_threads';
import { PluginMetadata, PluginInstance, PluginStatus, WorkerType } from './types';

const isBun = typeof Bun !== 'undefined';

export class PluginLoader {
    constructor(private pluginsDir: string) {
        fs.ensureDirSync(this.pluginsDir);
    }

    /**
     * Load plugin from a package.json file
     */
    async loadFromPackage(packagePath: string): Promise<PluginMetadata> {
        try {
            // Read and validate package.json
            const pkgJson = await fs.readJson(path.join(packagePath, 'package.json'));
            const pluginJson = await fs.readJson(path.join(packagePath, 'plugin.json')).catch(() => ({}));

            // Merge package.json and plugin.json data
            const metadata: PluginMetadata = {
                id: pkgJson.name,
                name: pkgJson.name,
                version: pkgJson.version,
                description: pkgJson.description,
                author: pkgJson.author,
                dependencies: pkgJson.dependencies,
                type: pluginJson.type || 'inline',
                capabilities: pluginJson.capabilities || [],
                config: pluginJson.config || {},
                entry: pluginJson.entry || pkgJson.main || 'index.js',
                ...pluginJson
            };

            // Validate required fields
            this.validateMetadata(metadata);
            return metadata;
        } catch (error) {
            log.error('Failed to load plugin package:', error);
            throw new Error(`Failed to load plugin package: ${error instanceof Error ? error.message : String(error)}`);
        }
    }

    /**
     * Load plugin from a dynamic source (e.g., remote URL or local file)
     */
    async loadFromDynamic(source: string, metadata: Partial<PluginMetadata>): Promise<PluginMetadata> {
        try {
            // Create temporary directory for dynamic plugin
            const pluginDir = path.join(this.pluginsDir, `dynamic-${Date.now()}`);
            await fs.ensureDir(pluginDir);

            // Download or copy plugin source
            if (source.startsWith('http')) {
                // Implement remote download logic
                throw new Error('Remote plugin loading not implemented yet');
            } else {
                // Copy local file/directory
                await fs.copy(source, pluginDir);
            }

            // Generate and validate metadata
            const fullMetadata: PluginMetadata = {
                id: `dynamic-${Date.now()}`,
                name: metadata.name || `Dynamic Plugin ${Date.now()}`,
                version: metadata.version || '1.0.0',
                type: metadata.type || 'inline',
                capabilities: metadata.capabilities || [],
                entry: metadata.entry || 'index.js',
                ...metadata
            };

            this.validateMetadata(fullMetadata);
            return fullMetadata;
        } catch (error) {
            log.error('Failed to load dynamic plugin:', error);
            throw new Error(`Failed to load dynamic plugin: ${error instanceof Error ? error.message : String(error)}`);
        }
    }

    /**
     * Create plugin instance from metadata
     */
    async createInstance(
        metadata: PluginMetadata,
        context: ActorContext,
        config?: any
    ): Promise<PluginInstance> {
        try {
            const pluginPath = path.join(this.pluginsDir, metadata.id);
            const entryPath = path.join(pluginPath, metadata.entry || '');

            // Check if entry file exists
            if (!await fs.pathExists(entryPath)) {
                throw new Error(`Plugin entry file not found: ${entryPath}`);
            }

            let actor: Actor | undefined;
            let process: ChildProcess | undefined;
            let worker: WorkerType | undefined;

            switch (metadata.type) {
                case 'inline':
                    // Load plugin module
                    const module = isBun ?
                        await import(entryPath) :
                        require(entryPath);

                    if (typeof module.createActor !== 'function') {
                        throw new Error('Plugin must export createActor function');
                    }
                    actor = await module.createActor(context, config || metadata.config);
                    break;

                case 'process':
                    process = await this.createProcessPlugin(metadata, entryPath, config);
                    break;

                case 'worker':
                    worker = await this.createWorkerPlugin(metadata, entryPath, config);
                    break;

                default:
                    throw new Error(`Unsupported plugin type: ${metadata.type}`);
            }

            // 获取actor的PID（如果可用）
            let actorPid = undefined;
            if (actor && actor instanceof Actor) {
                // 通过spawn方法获取actor的PID
                actorPid = await context.spawn({
                    producer: () => actor!
                });
            }

            return {
                metadata,
                status: 'installed',
                config: config || metadata.config,
                actor,
                actorPid,
                process,
                worker
            };
        } catch (error) {
            log.error('Failed to create plugin instance:', error);
            throw new Error(`Failed to create plugin instance: ${error instanceof Error ? error.message : String(error)}`);
        }
    }

    private async createProcessPlugin(
        metadata: PluginMetadata,
        entryPath: string,
        config?: any
    ): Promise<ChildProcess> {
        return new Promise((resolve, reject) => {
            try {
                // Fork the plugin process
                const childProcess = isBun ?
                    Bun.spawn(['bun', 'run', entryPath], {
                        env: {
                            ...process.env,
                            PLUGIN_ID: metadata.id,
                            PLUGIN_CONFIG: JSON.stringify(config || metadata.config || {})
                        },
                        cwd: path.dirname(entryPath),
                        ipc: true
                    }) :
                    fork(entryPath, [], {
                        cwd: path.dirname(entryPath),
                        env: {
                            ...process.env,
                            PLUGIN_ID: metadata.id,
                            PLUGIN_CONFIG: JSON.stringify(config || metadata.config || {})
                        }
                    });

                // Handle process events
                childProcess.on('error', (error: Error) => {
                    log.error(`Plugin ${metadata.id} process error:`, error);
                    reject(error);
                });

                childProcess.on('exit', (code: number | null) => {
                    if (code !== 0 && code !== null) {
                        const error = new Error(`Plugin process exited with code ${code}`);
                        log.error(`Plugin ${metadata.id} process exit:`, error);
                        reject(error);
                    }
                });

                // Wait for ready signal
                childProcess.once('message', (message: any) => {
                    if (message?.type === 'plugin.ready') {
                        log.info(`Plugin ${metadata.id} process ready`);
                        resolve(childProcess);
                    } else {
                        reject(new Error('Invalid plugin ready message'));
                    }
                });

                // Set timeout for initialization
                const timeout = setTimeout(() => {
                    childProcess.kill();
                    reject(new Error('Plugin initialization timeout'));
                }, 30000); // 30 seconds timeout

                // Clear timeout when process is ready
                childProcess.once('message', () => {
                    clearTimeout(timeout);
                });
            } catch (error) {
                reject(error);
            }
        });
    }

    private async createWorkerPlugin(
        metadata: PluginMetadata,
        entryPath: string,
        config?: any
    ): Promise<WorkerType> {
        if (isBun) {
            return this.createBunWorker(metadata, entryPath, config);
        } else {
            return this.createNodeWorker(metadata, entryPath, config);
        }
    }

    private async createBunWorker(
        metadata: PluginMetadata,
        entryPath: string,
        config?: any
    ): Promise<Worker> {
        return new Promise((resolve, reject) => {
            try {
                // Create Bun Worker
                const worker = new Worker(entryPath, {
                    type: 'module',
                    workerData: {
                        pluginId: metadata.id,
                        config: config || metadata.config || {}
                    }
                });

                // Handle worker events
                worker.onerror = (error: ErrorEvent) => {
                    log.error(`Plugin ${metadata.id} worker error:`, error);
                    reject(error);
                };

                worker.onmessage = (event: MessageEvent) => {
                    const message = event.data;
                    if (message?.type === 'plugin.ready') {
                        log.info(`Plugin ${metadata.id} worker ready`);
                        resolve(worker);
                    }
                };

                // Set timeout for initialization
                const timeout = setTimeout(() => {
                    worker.terminate();
                    reject(new Error('Worker initialization timeout'));
                }, 30000);

                // Send initialization message
                worker.postMessage({
                    type: 'plugin.init',
                    payload: {
                        pluginId: metadata.id,
                        config: config || metadata.config || {}
                    }
                });

                // Clear timeout when worker is ready
                worker.addEventListener('message', () => {
                    clearTimeout(timeout);
                }, { once: true });

            } catch (error) {
                reject(error);
            }
        });
    }

    private async createNodeWorker(
        metadata: PluginMetadata,
        entryPath: string,
        config?: any
    ): Promise<NodeWorker> {
        return new Promise((resolve, reject) => {
            try {
                // Create Node.js Worker
                const worker = new NodeWorker(entryPath, {
                    workerData: {
                        pluginId: metadata.id,
                        config: config || metadata.config || {}
                    }
                });

                // Handle worker events
                worker.on('error', (error) => {
                    log.error(`Plugin ${metadata.id} worker error:`, error);
                    reject(error);
                });

                worker.on('messageerror', (error) => {
                    log.error(`Plugin ${metadata.id} worker message error:`, error);
                    reject(error);
                });

                // Set up message handler for initialization
                worker.on('message', (message) => {
                    if (message?.type === 'plugin.ready') {
                        log.info(`Plugin ${metadata.id} worker ready`);
                        resolve(worker);
                    }
                });

                // Set timeout for initialization
                const timeout = setTimeout(() => {
                    worker.terminate();
                    reject(new Error('Worker initialization timeout'));
                }, 30000);

                // Send initialization message
                worker.postMessage({
                    type: 'plugin.init',
                    payload: {
                        pluginId: metadata.id,
                        config: config || metadata.config || {}
                    }
                });

                // Clear timeout when worker is ready
                worker.once('message', () => {
                    clearTimeout(timeout);
                });

            } catch (error) {
                reject(error);
            }
        });
    }

    private validateMetadata(metadata: PluginMetadata): void {
        const requiredFields = ['id', 'name', 'version', 'type'];
        for (const field of requiredFields) {
            if (!metadata[field as keyof PluginMetadata]) {
                throw new Error(`Missing required field in plugin metadata: ${field}`);
            }
        }

        if (!['inline', 'process', 'worker'].includes(metadata.type)) {
            throw new Error(`Invalid plugin type: ${metadata.type}`);
        }
    }
} 