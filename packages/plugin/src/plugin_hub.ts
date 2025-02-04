import * as fs from 'fs-extra';
import * as path from 'path';
import * as semver from 'semver';
import { PluginHub, PluginMetadata, PluginQuery, PluginConfig } from './types';

export class LocalPluginHub implements PluginHub {
    private config: PluginConfig;
    private pluginsDir: string;

    constructor(config: PluginConfig) {
        this.config = config;
        this.pluginsDir = config.pluginsDir;
        fs.ensureDirSync(this.pluginsDir);
    }

    async search(query: PluginQuery): Promise<PluginMetadata[]> {
        const results: PluginMetadata[] = [];
        const dirs = await fs.readdir(this.pluginsDir);

        for (const dir of dirs) {
            try {
                const metadata = await this.loadPluginMetadata(dir);
                if (this.matchesQuery(metadata, query)) {
                    results.push(metadata);
                }
            } catch (error) {
                // Skip invalid plugin directories
                continue;
            }
        }

        return results;
    }

    async download(pluginId: string, version?: string): Promise<string> {
        const pluginDir = path.join(this.pluginsDir, pluginId);
        if (!fs.existsSync(pluginDir)) {
            throw new Error(`Plugin ${pluginId} not found in local repository`);
        }

        const metadata = await this.loadPluginMetadata(pluginId);
        if (version && metadata.version !== version) {
            throw new Error(`Version ${version} not found for plugin ${pluginId}`);
        }

        return pluginDir;
    }

    async publish(metadata: PluginMetadata, packagePath: string): Promise<void> {
        const pluginDir = path.join(this.pluginsDir, metadata.id);
        await fs.ensureDir(pluginDir);

        // Copy plugin files
        await fs.copy(packagePath, pluginDir);

        // Save metadata
        await fs.writeJson(path.join(pluginDir, 'plugin.json'), metadata, { spaces: 2 });
    }

    async remove(pluginId: string, version?: string): Promise<void> {
        const pluginDir = path.join(this.pluginsDir, pluginId);
        if (!fs.existsSync(pluginDir)) {
            throw new Error(`Plugin ${pluginId} not found in local repository`);
        }

        const metadata = await this.loadPluginMetadata(pluginId);
        if (version && metadata.version !== version) {
            throw new Error(`Version ${version} not found for plugin ${pluginId}`);
        }

        await fs.remove(pluginDir);
    }

    async getLatestVersion(pluginId: string): Promise<string | null> {
        try {
            const metadata = await this.loadPluginMetadata(pluginId);
            return metadata.version;
        } catch (error) {
            return null;
        }
    }

    private async loadPluginMetadata(pluginId: string): Promise<PluginMetadata> {
        const metadataPath = path.join(this.pluginsDir, pluginId, 'plugin.json');
        if (!fs.existsSync(metadataPath)) {
            throw new Error(`Plugin metadata not found: ${metadataPath}`);
        }

        const metadata = await fs.readJson(metadataPath);
        return metadata;
    }

    private matchesQuery(metadata: PluginMetadata, query: PluginQuery): boolean {
        if (query.id && metadata.id !== query.id) return false;
        if (query.name && metadata.name !== query.name) return false;
        if (query.version && !semver.satisfies(metadata.version, query.version)) return false;
        if (query.type && metadata.type !== query.type) return false;
        if (query.capability && !metadata.capabilities?.includes(query.capability)) return false;
        return true;
    }
} 