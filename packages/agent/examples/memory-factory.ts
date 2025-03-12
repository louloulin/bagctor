/**
 * Memory Factory
 * 
 * This module provides factory functions to create memory implementations for the Bactor system.
 */

// Simple in-memory implementation that satisfies the Memory interface
export function createMemory(maxEntries = 100) {
    const entries: Array<{
        id: string;
        role: 'user' | 'assistant' | 'system' | 'function' | 'tool';
        content: string;
        timestamp: number;
        metadata?: Record<string, any>;
    }> = [];

    return {
        async add(input: string, response: string, metadata?: Record<string, any>): Promise<void> {
            const timestamp = Date.now();

            // Add user input
            entries.push({
                id: `user-${timestamp}`,
                role: 'user',
                content: input,
                timestamp,
                metadata
            });

            // Add assistant response
            entries.push({
                id: `assistant-${timestamp}`,
                role: 'assistant',
                content: response,
                timestamp: timestamp + 1, // Ensure correct order
                metadata
            });

            // Remove oldest entries if exceeding maxEntries
            if (entries.length > maxEntries) {
                entries.splice(0, entries.length - maxEntries);
            }
        },

        async retrieve(query: string, options: {
            limit?: number;
            recency?: boolean;
            filter?: (entry: any) => boolean;
        } = {}): Promise<any[]> {
            const { limit = 10, recency = true, filter } = options;

            // Copy entries
            let result = [...entries];

            // Apply filter
            if (filter) {
                result = result.filter(filter);
            }

            // Sort by timestamp
            if (recency) {
                result.sort((a, b) => b.timestamp - a.timestamp);
            }

            // Return limited number of entries
            return result.slice(0, limit);
        },

        async clear(): Promise<void> {
            entries.length = 0;
        }
    };
} 