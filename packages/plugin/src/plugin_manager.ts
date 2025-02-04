import { Actor, ActorContext, Message, log } from '@bactor/core';
import { v4 as uuidv4 } from 'uuid';
import * as fs from 'fs-extra';
import * as path from 'path';
import * as semver from 'semver';
import { fork, ChildProcess } from 'child_process';
import {
    PluginMetadata,
    PluginInstance,
    PluginStatus,
    PluginQuery,
    PluginConfig,
    PluginMessage,
    PluginResponse,
    PluginManagerState
} from './types';
import { LocalPluginHub } from './plugin_hub';

interface PluginManagerActorState {
    behavior: string;
    data: PluginManagerState;
}

export class PluginManager extends Actor {
    private pluginState: PluginManagerState;
    private hub: LocalPluginHub;

    constructor(context: ActorContext, config: PluginConfig) {
        super(context);
        this.state = {
            behavior: 'plugin-manager',
            data: {
                plugins: new Map(),
                config
            }
        };
        this.pluginState = this.state.data;
        this.hub = new LocalPluginHub(config);

        // Ensure plugin directory exists
        fs.ensureDirSync(config.pluginsDir);
        if (config.tempDir) {
            fs.ensureDirSync(config.tempDir);
        }
    }

    protected behaviors(): void {
        // Register plugin message handlers
        this.addBehavior('plugin.query', this.handlePluginQuery.bind(this));
        this.addBehavior('plugin.install', this.handlePluginInstall.bind(this));
        this.addBehavior('plugin.uninstall', this.handlePluginUninstall.bind(this));
        this.addBehavior('plugin.update', this.handlePluginUpdate.bind(this));
        this.addBehavior('plugin.activate', this.handlePluginActivate.bind(this));
        this.addBehavior('plugin.deactivate', this.handlePluginDeactivate.bind(this));
        this.addBehavior('calculator.calculate', this.handlePluginMessage.bind(this));
        this.addBehavior('default', this.handlePluginMessage.bind(this));
        log.info('Plugin manager behaviors registered');
    }

    private async handlePluginQuery(message: Message): Promise<void> {
        try {
            const response = await this.query(message.payload.query || {});
            if (message.sender) {
                await this.context.send(message.sender, {
                    type: 'plugin.response',
                    payload: { success: true, data: response }
                });
            }
        } catch (error) {
            this.sendErrorResponse(message, error);
        }
    }

    private async handlePluginInstall(message: Message): Promise<void> {
        try {
            if (!message.payload.metadata) {
                throw new Error('Plugin metadata is required for installation');
            }
            await this.install(message.payload.metadata);
            if (message.sender) {
                await this.context.send(message.sender, {
                    type: 'plugin.response',
                    payload: { success: true }
                });
            }
        } catch (error) {
            this.sendErrorResponse(message, error);
        }
    }

    private async handlePluginUninstall(message: Message): Promise<void> {
        try {
            if (!message.payload.pluginId) {
                throw new Error('Plugin ID is required for uninstallation');
            }
            await this.uninstall(message.payload.pluginId);
            if (message.sender) {
                await this.context.send(message.sender, {
                    type: 'plugin.response',
                    payload: { success: true }
                });
            }
        } catch (error) {
            this.sendErrorResponse(message, error);
        }
    }

    private async handlePluginUpdate(message: Message): Promise<void> {
        try {
            if (!message.payload.pluginId) {
                throw new Error('Plugin ID is required for update');
            }
            await this.update(message.payload.pluginId);
            if (message.sender) {
                await this.context.send(message.sender, {
                    type: 'plugin.response',
                    payload: { success: true }
                });
            }
        } catch (error) {
            this.sendErrorResponse(message, error);
        }
    }

    private async handlePluginActivate(message: Message): Promise<void> {
        log.info('Handling plugin activate message:', {
            type: message.type,
            payload: message.payload,
            sender: message.sender
        });

        try {
            if (!message.payload.pluginId) {
                throw new Error('Plugin ID is required for activation');
            }

            const pluginId = message.payload.pluginId;
            log.info('Starting plugin activation:', { pluginId });

            const plugin = this.pluginState.plugins.get(pluginId);
            if (!plugin) {
                throw new Error(`Plugin ${pluginId} not found`);
            }

            log.info('Plugin found:', {
                pluginId,
                type: plugin.metadata.type,
                status: plugin.status
            });

            await this.activate(pluginId);
            log.info('Plugin activated successfully:', { pluginId });

            if (message.sender) {
                const response = {
                    type: 'plugin.response',
                    payload: { success: true }
                };
                log.info('Sending activation response:', {
                    pluginId,
                    response
                });
                await this.context.send(message.sender, response);
            }
        } catch (error) {
            log.error('Plugin activation handler failed:', {
                error: error instanceof Error ? error.message : String(error),
                stack: error instanceof Error ? error.stack : undefined
            });
            this.sendErrorResponse(message, error);
        }
    }

    private async handlePluginDeactivate(message: Message): Promise<void> {
        try {
            if (!message.payload.pluginId) {
                throw new Error('Plugin ID is required for deactivation');
            }
            await this.deactivate(message.payload.pluginId);
            if (message.sender) {
                await this.context.send(message.sender, {
                    type: 'plugin.response',
                    payload: { success: true }
                });
            }
        } catch (error) {
            this.sendErrorResponse(message, error);
        }
    }

    private async handlePluginMessage(message: Message): Promise<void> {
        log.info('Plugin manager received message:', {
            type: message.type,
            payload: message.payload,
            sender: message.sender
        });

        try {
            // Extract plugin ID from the message
            const { pluginId, ...payload } = message.payload;
            if (!pluginId) {
                throw new Error('Plugin ID is required for plugin messages');
            }

            // Get the plugin instance
            const plugin = this.pluginState.plugins.get(pluginId);
            log.info('Retrieved plugin instance:', {
                pluginId,
                found: !!plugin,
                status: plugin?.status,
                hasActor: !!plugin?.actor
            });

            if (!plugin) {
                throw new Error(`Plugin ${pluginId} not found`);
            }

            // Check if plugin is active
            if (plugin.status !== 'active') {
                throw new Error(`Plugin ${pluginId} is not active`);
            }

            // Forward message to plugin actor
            if (plugin.actor) {
                const forwardedMessage = {
                    type: message.type,
                    payload,
                    sender: message.sender
                };
                log.info('Forwarding message to plugin:', {
                    pluginId,
                    messageType: message.type,
                    hasActor: !!plugin.actor,
                    forwardedMessage
                });
                await this.context.send(plugin.actor, forwardedMessage);
                log.info('Message forwarded successfully');
            } else {
                throw new Error(`Plugin ${pluginId} has no actor instance`);
            }
        } catch (error) {
            log.error('Error handling plugin message:', {
                error: error instanceof Error ? error.message : String(error),
                stack: error instanceof Error ? error.stack : undefined
            });
            this.sendErrorResponse(message, error);
        }
    }

    private sendErrorResponse(message: Message, error: unknown): void {
        if (message.sender) {
            this.context.send(message.sender, {
                type: 'plugin.response',
                payload: {
                    success: false,
                    error: error instanceof Error ? error.message : 'Unknown error'
                }
            }).catch((err: unknown) => {
                log.error('Failed to send error response:', err);
            });
        }
    }

    private async query(query: PluginQuery): Promise<PluginInstance[]> {
        const results: PluginInstance[] = [];
        for (const plugin of this.pluginState.plugins.values()) {
            if (this.matchesQuery(plugin, query)) {
                results.push(plugin);
            }
        }
        return results;
    }

    private matchesQuery(plugin: PluginInstance, query: PluginQuery): boolean {
        if (query.id && plugin.metadata.id !== query.id) return false;
        if (query.name && plugin.metadata.name !== query.name) return false;
        if (query.version && !semver.satisfies(plugin.metadata.version, query.version)) return false;
        if (query.type && plugin.metadata.type !== query.type) return false;
        if (query.status && plugin.status !== query.status) return false;
        if (query.capability && !plugin.metadata.capabilities?.includes(query.capability)) return false;
        return true;
    }

    private async install(metadata: PluginMetadata, config?: any): Promise<void> {
        log.info('Installing plugin:', {
            pluginId: metadata.id,
            type: metadata.type,
            config
        });

        if (this.pluginState.plugins.has(metadata.id)) {
            throw new Error(`Plugin ${metadata.id} is already installed`);
        }

        // Check dependencies
        if (metadata.dependencies) {
            for (const [depId, version] of Object.entries(metadata.dependencies)) {
                const dep = this.pluginState.plugins.get(depId);
                if (!dep || !semver.satisfies(dep.metadata.version, version)) {
                    throw new Error(`Dependency not satisfied: ${depId}@${version}`);
                }
            }
        }

        // Create plugin instance
        const plugin: PluginInstance = {
            metadata,
            status: 'installed',
            config: {
                ...metadata.config,
                ...config
            }
        };

        log.info('Setting up plugin:', {
            pluginId: metadata.id,
            type: metadata.type,
            status: plugin.status
        });

        // Handle different plugin types
        try {
            switch (metadata.type) {
                case 'process':
                    await this.setupProcessPlugin(plugin);
                    break;
                case 'worker':
                    await this.setupWorkerPlugin(plugin);
                    break;
                case 'inline':
                    await this.setupInlinePlugin(plugin);
                    break;
                default:
                    throw new Error(`Unsupported plugin type: ${metadata.type}`);
            }

            this.pluginState.plugins.set(metadata.id, plugin);
            log.info('Plugin installed successfully:', {
                pluginId: metadata.id,
                type: metadata.type,
                status: plugin.status
            });

            if (this.pluginState.config.autoStart) {
                log.info('Auto-starting plugin:', metadata.id);
                await this.activate(metadata.id);
            }
        } catch (error) {
            log.error('Failed to install plugin:', {
                pluginId: metadata.id,
                type: metadata.type,
                error: error instanceof Error ? error.message : String(error)
            });
            throw error;
        }
    }

    private async uninstall(pluginId: string): Promise<void> {
        const plugin = this.pluginState.plugins.get(pluginId);
        if (!plugin) {
            throw new Error(`Plugin ${pluginId} is not installed`);
        }

        // Check if any other plugins depend on this one
        for (const other of this.pluginState.plugins.values()) {
            if (other.metadata.dependencies?.[pluginId]) {
                throw new Error(`Cannot uninstall: plugin ${other.metadata.id} depends on ${pluginId}`);
            }
        }

        // Deactivate if active
        if (plugin.status === 'active') {
            await this.deactivate(pluginId);
        }

        // Clean up based on plugin type
        switch (plugin.metadata.type) {
            case 'process':
                if (plugin.process) {
                    plugin.process.kill();
                }
                break;
            case 'worker':
                if (plugin.worker) {
                    plugin.worker.terminate();
                }
                break;
            case 'inline':
                if (plugin.actor) {
                    await this.context.stop(plugin.actor);
                }
                break;
        }

        // Remove plugin files
        const pluginDir = path.join(this.pluginState.config.pluginsDir, pluginId);
        await fs.remove(pluginDir);

        this.pluginState.plugins.delete(pluginId);
    }

    private async update(pluginId: string, version?: string): Promise<void> {
        const plugin = this.pluginState.plugins.get(pluginId);
        if (!plugin) {
            throw new Error(`Plugin ${pluginId} is not installed`);
        }

        // Get latest version from hub if not specified
        const newVersion = version || await this.hub.getLatestVersion(pluginId);
        if (!newVersion || !semver.gt(newVersion, plugin.metadata.version)) {
            return; // Already at latest version
        }

        // Download new version
        const pluginPath = await this.hub.download(pluginId, newVersion);
        const newMetadata = await this.loadPluginMetadata(pluginPath);

        // Deactivate current version
        if (plugin.status === 'active') {
            await this.deactivate(pluginId);
        }

        // Install new version
        await this.install(newMetadata, plugin.config);

        // Clean up old version
        await this.uninstall(pluginId);
    }

    private async activate(pluginId: string): Promise<void> {
        const plugin = this.pluginState.plugins.get(pluginId);
        if (!plugin) {
            throw new Error(`Plugin ${pluginId} is not installed`);
        }

        if (plugin.status === 'active') {
            log.info('Plugin already active:', { pluginId });
            return;
        }

        log.info('Starting plugin activation process:', {
            pluginId,
            type: plugin.metadata.type,
            status: plugin.status,
            config: plugin.config
        });

        // Check max concurrent plugins limit
        const activeCount = Array.from(this.pluginState.plugins.values())
            .filter(p => p.status === 'active').length;
        if (this.pluginState.config.maxConcurrentPlugins &&
            activeCount >= this.pluginState.config.maxConcurrentPlugins) {
            throw new Error('Maximum number of concurrent plugins reached');
        }

        // Activate based on plugin type
        try {
            switch (plugin.metadata.type) {
                case 'process':
                    log.info('Activating process plugin:', { pluginId });
                    await this.activateProcessPlugin(plugin);
                    break;
                case 'worker':
                    log.info('Activating worker plugin:', { pluginId });
                    await this.activateWorkerPlugin(plugin);
                    break;
                case 'inline':
                    log.info('Activating inline plugin:', { pluginId });
                    await this.activateInlinePlugin(plugin);
                    break;
            }

            plugin.status = 'active';
            log.info('Plugin activation process completed:', {
                pluginId,
                type: plugin.metadata.type,
                status: plugin.status,
                hasActor: !!plugin.actor
            });
        } catch (error) {
            log.error('Plugin activation process failed:', {
                pluginId,
                type: plugin.metadata.type,
                error: error instanceof Error ? error.message : String(error),
                stack: error instanceof Error ? error.stack : undefined
            });
            throw error;
        }
    }

    private async deactivate(pluginId: string): Promise<void> {
        const plugin = this.pluginState.plugins.get(pluginId);
        if (!plugin) {
            throw new Error(`Plugin ${pluginId} is not installed`);
        }

        if (plugin.status !== 'active') {
            log.info('Plugin not active:', { pluginId, status: plugin.status });
            return;
        }

        log.info('Starting plugin deactivation:', {
            pluginId,
            type: plugin.metadata.type,
            status: plugin.status
        });

        try {
            // Deactivate based on plugin type
            switch (plugin.metadata.type) {
                case 'process':
                    await this.deactivateProcessPlugin(plugin);
                    break;
                case 'worker':
                    await this.deactivateWorkerPlugin(plugin);
                    break;
                case 'inline':
                    await this.deactivateInlinePlugin(plugin);
                    break;
            }

            plugin.status = 'inactive';
            log.info('Plugin deactivation completed:', {
                pluginId,
                type: plugin.metadata.type,
                status: plugin.status
            });
        } catch (error) {
            log.error('Plugin deactivation failed:', {
                pluginId,
                type: plugin.metadata.type,
                error: error instanceof Error ? error.message : String(error)
            });
            throw error;
        }
    }

    private async setupProcessPlugin(plugin: PluginInstance): Promise<void> {
        const pluginDir = path.join(this.pluginState.config.pluginsDir, plugin.metadata.id);
        const mainFile = path.join(pluginDir, 'index.js');

        if (!fs.existsSync(mainFile)) {
            throw new Error(`Plugin main file not found: ${mainFile}`);
        }

        // Validate the main file
        try {
            require.resolve(mainFile);
        } catch (error) {
            throw new Error(`Invalid plugin main file: ${error instanceof Error ? error.message : String(error)}`);
        }
    }

    private async setupWorkerPlugin(plugin: PluginInstance): Promise<void> {
        const pluginDir = path.join(this.pluginState.config.pluginsDir, plugin.metadata.id);
        const mainFile = path.join(pluginDir, 'worker.js');

        if (!fs.existsSync(mainFile)) {
            throw new Error(`Plugin worker file not found: ${mainFile}`);
        }

        // Validate the worker file
        try {
            await fs.access(mainFile, fs.constants.R_OK);
        } catch (error) {
            throw new Error(`Invalid plugin worker file: ${error instanceof Error ? error.message : String(error)}`);
        }
    }

    private async setupInlinePlugin(plugin: PluginInstance): Promise<void> {
        const pluginDir = path.join(this.pluginState.config.pluginsDir, plugin.metadata.id);
        const mainFile = path.join(pluginDir, 'index.ts');
        log.info('Setting up inline plugin:', { pluginId: plugin.metadata.id, mainFile });

        if (!fs.existsSync(mainFile)) {
            throw new Error(`Plugin main file not found: ${mainFile}`);
        }

        // Validate the main file
        try {
            const pluginModule = await import(mainFile);
            if (typeof pluginModule.createActor !== 'function') {
                throw new Error('Plugin must export a createActor function');
            }
            log.info('Plugin module validated successfully');
        } catch (error) {
            log.error('Failed to validate plugin module:', error);
            throw new Error(`Invalid plugin module: ${error instanceof Error ? error.message : String(error)}`);
        }
    }

    private async activateProcessPlugin(plugin: PluginInstance): Promise<void> {
        const pluginDir = path.join(this.pluginState.config.pluginsDir, plugin.metadata.id);
        const mainFile = path.join(pluginDir, 'index.js');

        // Fork the plugin process
        const childProcess = fork(mainFile, [], {
            cwd: pluginDir,
            env: {
                ...process.env,
                PLUGIN_ID: plugin.metadata.id,
                PLUGIN_CONFIG: JSON.stringify(plugin.config || {})
            }
        });

        // Handle process events
        childProcess.on('error', (error: Error) => {
            log.error(`Plugin ${plugin.metadata.id} process error:`, error);
            this.handlePluginError(plugin, error);
        });

        childProcess.on('exit', (code: number) => {
            if (code !== 0) {
                log.error(`Plugin ${plugin.metadata.id} process exited with code ${code}`);
                this.handlePluginError(plugin, new Error(`Process exited with code ${code}`));
            }
        });

        // Store the process reference
        plugin.process = childProcess;

        // Wait for ready signal
        await new Promise<void>((resolve, reject) => {
            const timeout = setTimeout(() => {
                reject(new Error('Plugin activation timeout'));
            }, this.pluginState.config.taskTimeout || 30000);

            childProcess.once('message', (message: { type: string }) => {
                if (message.type === 'plugin.ready') {
                    clearTimeout(timeout);
                    resolve();
                }
            });
        });
    }

    private async activateWorkerPlugin(plugin: PluginInstance): Promise<void> {
        const pluginDir = path.join(this.pluginState.config.pluginsDir, plugin.metadata.id);
        const workerFile = path.join(pluginDir, 'worker.js');

        // Create worker
        const worker = new Worker(workerFile, {
            type: 'module',
            name: plugin.metadata.id
        });

        // Handle worker events
        worker.onerror = (error: ErrorEvent) => {
            log.error(`Plugin ${plugin.metadata.id} worker error:`, error);
            this.handlePluginError(plugin, error.error);
        };

        // Store the worker reference
        plugin.worker = worker;

        // Initialize the worker
        await new Promise<void>((resolve, reject) => {
            const timeout = setTimeout(() => {
                reject(new Error('Plugin activation timeout'));
            }, this.pluginState.config.taskTimeout || 30000);

            worker.onmessage = (event: MessageEvent) => {
                if (event.data.type === 'plugin.ready') {
                    clearTimeout(timeout);
                    resolve();
                }
            };

            worker.postMessage({
                type: 'plugin.init',
                payload: {
                    id: plugin.metadata.id,
                    config: plugin.config || {}
                }
            });
        });
    }

    private async activateInlinePlugin(plugin: PluginInstance): Promise<void> {
        const pluginDir = path.join(this.pluginState.config.pluginsDir, plugin.metadata.id);
        const mainFile = path.join(pluginDir, 'index.ts');
        log.info('Activating inline plugin:', {
            pluginId: plugin.metadata.id,
            mainFile,
            config: plugin.config
        });

        try {
            // Use Bun's built-in TypeScript support
            const pluginModule = await import(mainFile);
            log.info('Plugin module loaded:', {
                pluginId: plugin.metadata.id,
                exports: Object.keys(pluginModule)
            });

            const config = {
                ...plugin.metadata.config,
                ...plugin.config,
                pluginId: plugin.metadata.id
            };
            log.info('Creating actor with config:', config);

            const actor = await pluginModule.createActor(this.context, config);
            log.info('Actor created:', {
                pluginId: plugin.metadata.id,
                actorType: actor.constructor.name
            });

            if (!(actor instanceof Actor)) {
                throw new Error('Plugin must create an Actor instance');
            }

            plugin.actor = actor;
            await this.context.start(actor);
            log.info('Actor started:', {
                pluginId: plugin.metadata.id,
                actorId: this.context.id
            });

        } catch (error) {
            log.error('Failed to activate inline plugin:', {
                pluginId: plugin.metadata.id,
                error: error instanceof Error ? error.message : String(error),
                stack: error instanceof Error ? error.stack : undefined
            });
            throw error;
        }
    }

    private async deactivateProcessPlugin(plugin: PluginInstance): Promise<void> {
        if (plugin.process) {
            plugin.process.kill();
            plugin.process = undefined;
        }
    }

    private async deactivateWorkerPlugin(plugin: PluginInstance): Promise<void> {
        if (plugin.worker) {
            plugin.worker.terminate();
            plugin.worker = undefined;
        }
    }

    private async deactivateInlinePlugin(plugin: PluginInstance): Promise<void> {
        if (plugin.actor) {
            await this.context.stop(plugin.actor);
            plugin.actor = undefined;
        }
    }

    private handlePluginError(plugin: PluginInstance, error: Error): void {
        log.error(`Plugin ${plugin.metadata.id} error:`, error);
        plugin.status = 'error';

        // Clean up resources
        switch (plugin.metadata.type) {
            case 'process':
                if (plugin.process) {
                    plugin.process.kill();
                    plugin.process = undefined;
                }
                break;
            case 'worker':
                if (plugin.worker) {
                    plugin.worker.terminate();
                    plugin.worker = undefined;
                }
                break;
            case 'inline':
                if (plugin.actor) {
                    this.context.stop(plugin.actor).catch((err: Error) => {
                        log.error(`Failed to stop actor for plugin ${plugin.metadata.id}:`, err);
                    });
                    plugin.actor = undefined;
                }
                break;
        }
    }

    private async loadPluginMetadata(pluginPath: string): Promise<PluginMetadata> {
        const metadataPath = path.join(pluginPath, 'plugin.json');
        if (!fs.existsSync(metadataPath)) {
            throw new Error(`Plugin metadata not found: ${metadataPath}`);
        }

        try {
            const metadata = await fs.readJson(metadataPath);

            // Validate required fields
            if (!metadata.id || !metadata.name || !metadata.version || !metadata.type) {
                throw new Error('Invalid plugin metadata: missing required fields');
            }

            // Validate plugin type
            if (!['process', 'worker', 'inline'].includes(metadata.type)) {
                throw new Error(`Invalid plugin type: ${metadata.type}`);
            }

            return metadata;
        } catch (error) {
            throw new Error(`Failed to load plugin metadata: ${error instanceof Error ? error.message : String(error)}`);
        }
    }
} 