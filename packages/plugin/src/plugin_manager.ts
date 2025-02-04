import { Actor, ActorContext, Message, log } from '@bactor/core';
import { v4 as uuidv4 } from 'uuid';
import * as fs from 'fs-extra';
import * as path from 'path';
import * as semver from 'semver';
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
import { PluginLoader } from './plugin_loader';

interface PluginManagerActorState {
    behavior: string;
    data: PluginManagerState;
}

export class PluginManager extends Actor {
    private pluginState: PluginManagerState;
    private hub: LocalPluginHub;
    private loader: PluginLoader;

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
        this.loader = new PluginLoader(config.pluginsDir);

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
            const { metadata, source, config } = message.payload;

            let pluginMetadata: PluginMetadata;
            if (source) {
                // Dynamic loading from source
                pluginMetadata = await this.loader.loadFromDynamic(source, metadata || {});
            } else if (metadata) {
                // Loading from package.json
                const packagePath = path.join(this.pluginState.config.pluginsDir, metadata.id);
                pluginMetadata = await this.loader.loadFromPackage(packagePath);
            } else {
                throw new Error('Either metadata or source must be provided for installation');
            }

            // Create plugin instance
            const instance = await this.loader.createInstance(pluginMetadata, this.context, config);
            this.pluginState.plugins.set(pluginMetadata.id, instance);

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
                    error: error instanceof Error ? error.message : String(error)
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
        if (query.capability && !plugin.metadata.capabilities?.includes(query.capability)) return false;
        if (query.status && plugin.status !== query.status) return false;
        return true;
    }

    private async install(metadata: PluginMetadata): Promise<void> {
        // Implementation moved to handlePluginInstall
    }

    private async uninstall(pluginId: string): Promise<void> {
        const plugin = this.pluginState.plugins.get(pluginId);
        if (!plugin) {
            throw new Error(`Plugin ${pluginId} not found`);
        }

        // Deactivate if active
        if (plugin.status === 'active') {
            await this.deactivate(pluginId);
        }

        // Remove plugin files
        const pluginDir = path.join(this.pluginState.config.pluginsDir, pluginId);
        await fs.remove(pluginDir);

        // Remove from state
        this.pluginState.plugins.delete(pluginId);
    }

    private async update(pluginId: string): Promise<void> {
        const plugin = this.pluginState.plugins.get(pluginId);
        if (!plugin) {
            throw new Error(`Plugin ${pluginId} not found`);
        }

        // Get latest version from hub
        const latestVersion = await this.hub.getLatestVersion(pluginId);
        if (!latestVersion) {
            throw new Error(`No updates available for plugin ${pluginId}`);
        }

        if (!semver.gt(latestVersion, plugin.metadata.version)) {
            return; // Already at latest version
        }

        // Download new version
        const newPluginPath = await this.hub.download(pluginId, latestVersion);

        // Load new version metadata
        const newMetadata = await this.loader.loadFromPackage(newPluginPath);

        // Deactivate current version if active
        const wasActive = plugin.status === 'active';
        if (wasActive) {
            await this.deactivate(pluginId);
        }

        // Create new instance
        const newInstance = await this.loader.createInstance(newMetadata, this.context, plugin.config);
        this.pluginState.plugins.set(pluginId, newInstance);

        // Activate if it was active before
        if (wasActive) {
            await this.activate(pluginId);
        }
    }

    private async activate(pluginId: string): Promise<void> {
        const plugin = this.pluginState.plugins.get(pluginId);
        if (!plugin) {
            throw new Error(`Plugin ${pluginId} not found`);
        }

        if (plugin.status === 'active') {
            return; // Already active
        }

        try {
            plugin.status = 'updating';

            // Create actor if not exists
            if (!plugin.actor) {
                const instance = await this.loader.createInstance(plugin.metadata, this.context, plugin.config);
                plugin.actor = instance.actor;
            }

            plugin.status = 'active';
        } catch (error) {
            plugin.status = 'error';
            throw error;
        }
    }

    private async deactivate(pluginId: string): Promise<void> {
        const plugin = this.pluginState.plugins.get(pluginId);
        if (!plugin) {
            throw new Error(`Plugin ${pluginId} not found`);
        }

        if (plugin.status !== 'active') {
            return; // Not active
        }

        try {
            plugin.status = 'updating';

            // Cleanup based on plugin type
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
            }

            // Clear actor reference
            plugin.actor = undefined;
            plugin.status = 'inactive';
        } catch (error) {
            plugin.status = 'error';
            throw error;
        }
    }
} 