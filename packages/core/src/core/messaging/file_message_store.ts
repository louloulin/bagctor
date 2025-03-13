import { MessageEnvelope, MessageStore, DeliveryState } from './types';
import { PID } from '../types';
import { log } from '../../utils/logger';
import fs from 'fs/promises';
import path from 'path';

export class FileMessageStore implements MessageStore {
    private baseDir: string;
    private deliveryStatusFile: string;
    private messageDir: string;
    private initialized: Promise<void>;

    constructor(storageDir: string) {
        this.baseDir = storageDir;
        this.deliveryStatusFile = path.join(this.baseDir, 'delivery_status.json');
        this.messageDir = path.join(this.baseDir, 'messages');
        this.initialized = this.initializeStore();
    }

    private async initializeStore(): Promise<void> {
        try {
            await fs.mkdir(this.baseDir, { recursive: true });
            await fs.mkdir(this.messageDir, { recursive: true });

            // Initialize delivery status file if it doesn't exist
            try {
                await fs.access(this.deliveryStatusFile);
            } catch {
                await fs.writeFile(this.deliveryStatusFile, '{}');
            }
        } catch (error) {
            log.error('Failed to initialize message store', { error });
            throw error;
        }
    }

    private getMessagePath(messageId: string): string {
        return path.join(this.messageDir, `${messageId}.json`);
    }

    async save(message: MessageEnvelope): Promise<void> {
        await this.initialized;
        try {
            const messagePath = this.getMessagePath(message.id);
            await fs.writeFile(messagePath, JSON.stringify(message));

            const status = await this.loadDeliveryStatus();
            status[message.id] = DeliveryState.PENDING;
            await this.saveDeliveryStatus(status);

            log.debug('Message saved to file store', { messageId: message.id });
        } catch (error) {
            log.error('Failed to save message', { messageId: message.id, error });
            throw error;
        }
    }

    async get(messageId: string): Promise<MessageEnvelope | null> {
        await this.initialized;
        try {
            const messagePath = this.getMessagePath(messageId);
            const content = await fs.readFile(messagePath, 'utf-8');
            return JSON.parse(content);
        } catch (error) {
            if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
                return null;
            }
            log.error('Failed to get message', { messageId, error });
            throw error;
        }
    }

    async delete(messageId: string): Promise<void> {
        await this.initialized;
        try {
            const messagePath = this.getMessagePath(messageId);

            try {
                await fs.unlink(messagePath);
            } catch (error) {
                if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
                    throw error;
                }
            }

            // Ensure the status is completely removed
            const status = await this.loadDeliveryStatus();
            if (messageId in status) {
                delete status[messageId];
                await fs.writeFile(this.deliveryStatusFile, JSON.stringify(status), { encoding: 'utf8' });
            }

            log.debug('Message deleted', { messageId });
        } catch (error) {
            log.error('Failed to delete message', { messageId, error });
            throw error;
        }
    }

    async getUnacknowledged(pid: PID): Promise<MessageEnvelope[]> {
        await this.initialized;
        try {
            const status = await this.loadDeliveryStatus();
            const files = await fs.readdir(this.messageDir);
            const unacknowledged: MessageEnvelope[] = [];

            for (const file of files) {
                const messageId = path.parse(file).name;
                const messageStatus = status[messageId];

                // Include messages that are either PENDING or have no status yet
                if (!messageStatus || messageStatus === DeliveryState.PENDING) {
                    const message = await this.get(messageId);
                    if (message && message.receiver.id === pid.id) {
                        unacknowledged.push(message);
                    }
                }
            }

            log.debug('Retrieved unacknowledged messages', {
                pid: pid.id,
                count: unacknowledged.length
            });

            return unacknowledged;
        } catch (error) {
            log.error('Failed to get unacknowledged messages', { pid, error });
            throw error;
        }
    }

    async markAsDelivered(messageId: string): Promise<void> {
        await this.initialized;
        try {
            const status = await this.loadDeliveryStatus();
            status[messageId] = DeliveryState.DELIVERED;
            await this.saveDeliveryStatus(status);
            log.debug('Message marked as delivered', { messageId });
        } catch (error) {
            log.error('Failed to mark message as delivered', { messageId, error });
            throw error;
        }
    }

    async markAsAcknowledged(messageId: string): Promise<void> {
        await this.initialized;
        try {
            const status = await this.loadDeliveryStatus();
            status[messageId] = DeliveryState.ACKNOWLEDGED;
            await this.saveDeliveryStatus(status);
            log.debug('Message marked as acknowledged', { messageId });
        } catch (error) {
            log.error('Failed to mark message as acknowledged', { messageId, error });
            throw error;
        }
    }

    async getMessageStatus(messageId: string): Promise<DeliveryState | null> {
        await this.initialized;
        try {
            const status = await this.loadDeliveryStatus();
            return status[messageId] || null;
        } catch (error) {
            log.error('Failed to get message status', { messageId, error });
            throw error;
        }
    }

    async clear(): Promise<void> {
        await this.initialized;
        try {
            // Get all message files before deleting
            const files = await fs.readdir(this.messageDir);

            // Delete all message files
            await Promise.all(
                files.map(file => fs.unlink(path.join(this.messageDir, file)))
            );

            // Create empty delivery status file
            await fs.writeFile(this.deliveryStatusFile, '{}', { encoding: 'utf8' });

            log.debug('All messages cleared');
        } catch (error) {
            log.error('Failed to clear messages', { error });
            throw error;
        }
    }

    private async loadDeliveryStatus(): Promise<Record<string, DeliveryState>> {
        try {
            const content = await fs.readFile(this.deliveryStatusFile, 'utf-8');
            if (!content || !content.trim()) {
                return {};
            }
            try {
                return JSON.parse(content);
            } catch (parseError) {
                log.error('Failed to parse delivery status, resetting', { error: parseError });
                // If we can't parse the file, return an empty object and save it to reset the file
                await this.saveDeliveryStatus({});
                return {};
            }
        } catch (error) {
            if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
                // If the file doesn't exist, create it with an empty object
                await this.saveDeliveryStatus({});
                return {};
            }
            throw error;
        }
    }

    private async saveDeliveryStatus(status: Record<string, DeliveryState>): Promise<void> {
        const tempFile = `${this.deliveryStatusFile}.tmp`;
        try {
            // Ensure parent directory exists for both temp and target files
            const parentDir = path.dirname(this.deliveryStatusFile);
            await fs.mkdir(parentDir, { recursive: true });

            // Load current status first to handle concurrent updates
            let currentStatus: Record<string, DeliveryState> = {};
            try {
                const content = await fs.readFile(this.deliveryStatusFile, 'utf-8');
                if (content && content.trim()) {
                    try {
                        currentStatus = JSON.parse(content);
                    } catch (parseError) {
                        log.error('Failed to parse delivery status during merge', { error: parseError });
                    }
                }
            } catch (error) {
                if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
                    throw error;
                }
            }

            // Create a clone of the current status as deep copy
            const mergedStatus = Object.assign({}, currentStatus);

            // Merge by individual keys to ensure we don't lose any updates
            for (const [key, value] of Object.entries(status)) {
                mergedStatus[key] = value;
            }

            // Convert to string first to catch any JSON stringification errors
            const contentToWrite = JSON.stringify(mergedStatus);

            // Write to temp file
            await fs.writeFile(tempFile, contentToWrite, { encoding: 'utf8' });

            try {
                // Atomically rename temp file to target file
                await fs.rename(tempFile, this.deliveryStatusFile);
            } catch (renameError) {
                // If rename fails, try to write directly
                await fs.writeFile(this.deliveryStatusFile, contentToWrite, { encoding: 'utf8' });
                // Try to clean up temp file
                await fs.unlink(tempFile).catch(() => { });
            }
        } catch (error) {
            try {
                await fs.unlink(tempFile).catch(() => { });
            } catch {
                // Ignore cleanup errors
            }
            throw error;
        }
    }
} 