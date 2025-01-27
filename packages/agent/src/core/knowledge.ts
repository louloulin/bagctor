import { log } from '@bactor/core';

export interface Knowledge {
    id: string;
    topic: string;
    content: any;
    metadata: {
        source: string;
        timestamp: number;
        confidence: number;
        tags: string[];
    };
}

export interface KnowledgeQuery {
    topic?: string;
    tags?: string[];
    minConfidence?: number;
    source?: string;
    timeRange?: {
        start: number;
        end: number;
    };
}

export class KnowledgeBase {
    private store: Map<string, Knowledge>;
    private topicIndex: Map<string, Set<string>>;
    private tagIndex: Map<string, Set<string>>;

    constructor() {
        this.store = new Map();
        this.topicIndex = new Map();
        this.tagIndex = new Map();
    }

    async learn(knowledge: Knowledge): Promise<void> {
        // Validate knowledge
        if (!knowledge.id || !knowledge.topic || !knowledge.content) {
            throw new Error('Invalid knowledge format');
        }

        // Store knowledge
        this.store.set(knowledge.id, {
            ...knowledge,
            metadata: {
                ...knowledge.metadata,
                timestamp: knowledge.metadata.timestamp || Date.now()
            }
        });

        // Update topic index
        if (!this.topicIndex.has(knowledge.topic)) {
            this.topicIndex.set(knowledge.topic, new Set());
        }
        this.topicIndex.get(knowledge.topic)?.add(knowledge.id);

        // Update tag index
        for (const tag of knowledge.metadata.tags) {
            if (!this.tagIndex.has(tag)) {
                this.tagIndex.set(tag, new Set());
            }
            this.tagIndex.get(tag)?.add(knowledge.id);
        }

        log.debug(`Learned new knowledge: ${knowledge.id} (${knowledge.topic})`);
    }

    async query(query: KnowledgeQuery): Promise<Knowledge[]> {
        let candidateIds = new Set<string>();

        // Filter by topic
        if (query.topic) {
            const topicIds = this.topicIndex.get(query.topic);
            if (!topicIds || topicIds.size === 0) {
                return [];
            }
            candidateIds = new Set(topicIds);
        }

        // Filter by tags
        if (query.tags && query.tags.length > 0) {
            const taggedIds = query.tags
                .map(tag => this.tagIndex.get(tag))
                .filter((ids): ids is Set<string> => ids !== undefined);

            if (taggedIds.length === 0) {
                return [];
            }

            // Intersection of all tag sets
            const intersection = new Set(taggedIds[0]);
            for (let i = 1; i < taggedIds.length; i++) {
                for (const id of intersection) {
                    if (!taggedIds[i].has(id)) {
                        intersection.delete(id);
                    }
                }
            }

            // If we already have candidates from topic filter, intersect with tag results
            if (candidateIds.size > 0) {
                for (const id of candidateIds) {
                    if (!intersection.has(id)) {
                        candidateIds.delete(id);
                    }
                }
            } else {
                candidateIds = intersection;
            }
        }

        // Get all knowledge entries if no topic or tag filters
        if (candidateIds.size === 0 && !query.topic && (!query.tags || query.tags.length === 0)) {
            candidateIds = new Set(this.store.keys());
        }

        // Apply additional filters
        const results = Array.from(candidateIds)
            .map(id => this.store.get(id))
            .filter((k): k is Knowledge => k !== undefined)
            .filter(k => {
                // Filter by confidence
                if (query.minConfidence !== undefined && k.metadata.confidence < query.minConfidence) {
                    return false;
                }

                // Filter by source
                if (query.source && k.metadata.source !== query.source) {
                    return false;
                }

                // Filter by time range
                if (query.timeRange) {
                    const timestamp = k.metadata.timestamp;
                    if (timestamp < query.timeRange.start || timestamp > query.timeRange.end) {
                        return false;
                    }
                }

                return true;
            });

        log.debug(`Query returned ${results.length} results`);
        return results;
    }

    async share(targetId: string, knowledgeId: string): Promise<void> {
        const knowledge = this.store.get(knowledgeId);
        if (!knowledge) {
            throw new Error(`Knowledge not found: ${knowledgeId}`);
        }

        // In a real implementation, this would send the knowledge to the target agent
        // For now, we just log it
        log.debug(`Shared knowledge ${knowledgeId} with ${targetId}`);
    }

    // Utility methods
    async forget(id: string): Promise<void> {
        const knowledge = this.store.get(id);
        if (!knowledge) {
            return;
        }

        // Remove from store
        this.store.delete(id);

        // Remove from topic index
        this.topicIndex.get(knowledge.topic)?.delete(id);

        // Remove from tag index
        for (const tag of knowledge.metadata.tags) {
            this.tagIndex.get(tag)?.delete(id);
        }

        log.debug(`Forgot knowledge: ${id}`);
    }

    getStats(): { totalKnowledge: number; topics: number; tags: number } {
        return {
            totalKnowledge: this.store.size,
            topics: this.topicIndex.size,
            tags: this.tagIndex.size
        };
    }

    async clear(): Promise<void> {
        this.store.clear();
        this.topicIndex.clear();
        this.tagIndex.clear();
        log.debug('Cleared all knowledge');
    }
} 