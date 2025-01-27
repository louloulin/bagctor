import { log } from '@bactor/core';

export interface MemoryOptions {
    shortTermTTL?: number;  // milliseconds
    longTermTTL?: number;   // milliseconds
    maxShortTermSize?: number;
    maxLongTermSize?: number;
}

export class WorkingMemory {
    private shortTerm: Map<string, { value: any; timestamp: number }>;
    private longTerm: Map<string, { value: any; timestamp: number }>;
    private options: Required<MemoryOptions>;

    constructor(options: MemoryOptions = {}) {
        this.shortTerm = new Map();
        this.longTerm = new Map();
        this.options = {
            shortTermTTL: options.shortTermTTL || 5 * 60 * 1000, // 5 minutes
            longTermTTL: options.longTermTTL || 24 * 60 * 60 * 1000, // 24 hours
            maxShortTermSize: options.maxShortTermSize || 100,
            maxLongTermSize: options.maxLongTermSize || 1000
        };
    }

    async store(key: string, value: any, isLongTerm: boolean = false): Promise<void> {
        const memory = isLongTerm ? this.longTerm : this.shortTerm;
        const maxSize = isLongTerm ? this.options.maxLongTermSize : this.options.maxShortTermSize;

        // Clean up expired memories before storing new ones
        await this.cleanup();

        // If at capacity, remove oldest entry
        if (memory.size >= maxSize) {
            const oldest = [...memory.entries()].sort((a, b) => a[1].timestamp - b[1].timestamp)[0];
            if (oldest) {
                memory.delete(oldest[0]);
            }
        }

        memory.set(key, {
            value,
            timestamp: Date.now()
        });

        log.debug(`Stored ${isLongTerm ? 'long-term' : 'short-term'} memory: ${key}`);
    }

    async recall(key: string, isLongTerm: boolean = false): Promise<any | null> {
        const memory = isLongTerm ? this.longTerm : this.shortTerm;
        const ttl = isLongTerm ? this.options.longTermTTL : this.options.shortTermTTL;

        const entry = memory.get(key);
        if (!entry) {
            return null;
        }

        // Check if memory has expired
        if (Date.now() - entry.timestamp > ttl) {
            memory.delete(key);
            return null;
        }

        // Update timestamp on access
        entry.timestamp = Date.now();
        memory.set(key, entry);

        log.debug(`Recalled ${isLongTerm ? 'long-term' : 'short-term'} memory: ${key}`);
        return entry.value;
    }

    async forget(key: string, isLongTerm: boolean = false): Promise<void> {
        const memory = isLongTerm ? this.longTerm : this.shortTerm;
        memory.delete(key);
        log.debug(`Forgot ${isLongTerm ? 'long-term' : 'short-term'} memory: ${key}`);
    }

    async cleanup(): Promise<void> {
        const now = Date.now();

        // Cleanup short-term memory
        for (const [key, entry] of this.shortTerm.entries()) {
            if (now - entry.timestamp > this.options.shortTermTTL) {
                this.shortTerm.delete(key);
            }
        }

        // Cleanup long-term memory
        for (const [key, entry] of this.longTerm.entries()) {
            if (now - entry.timestamp > this.options.longTermTTL) {
                this.longTerm.delete(key);
            }
        }
    }

    // Statistics and debugging methods
    getStats(): { shortTermSize: number; longTermSize: number } {
        return {
            shortTermSize: this.shortTerm.size,
            longTermSize: this.longTerm.size
        };
    }

    async clear(): Promise<void> {
        this.shortTerm.clear();
        this.longTerm.clear();
        log.debug('Cleared all memories');
    }
} 