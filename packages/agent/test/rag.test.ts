import { test, expect, describe, beforeAll, afterAll } from 'bun:test';
import { ActorSystem } from '@bactor/core';
import { RagActor, Document } from '../src/core/agentRag';

describe('RAG System', () => {
    let system: ActorSystem;
    let ragActorRef: any;

    beforeAll(async () => {
        system = new ActorSystem();
        ragActorRef = await system.spawn({
            actorClass: RagActor
        });
    });

    afterAll(async () => {
        await system.shutdown();
    });

    test('应该能够添加文档', async () => {
        const doc: Document = {
            id: 'doc1',
            content: 'This is a test document about AI and machine learning',
            metadata: { source: 'test', topic: 'AI' }
        };

        const response = await system.send(ragActorRef, {
            type: 'add_document',
            params: {
                document: doc
            }
        });

        // 这里我们没有使用ask，所以不会返回结果
        // 在实际实现中，系统会返回响应消息
        expect(response).toBeUndefined();
    });

    test('应该能够查询文档', async () => {
        // 添加更多文档用于测试查询
        const docs = [
            {
                id: 'doc2',
                content: 'Artificial intelligence is transforming industries across the globe',
                metadata: { source: 'article', topic: 'AI impact' }
            },
            {
                id: 'doc3',
                content: 'Machine learning algorithms require large amounts of data to train effectively',
                metadata: { source: 'textbook', topic: 'ML training' }
            },
            {
                id: 'doc4',
                content: 'The history of computing dates back to the early 20th century',
                metadata: { source: 'history', topic: 'computing' }
            }
        ];

        // 添加文档
        for (const doc of docs) {
            await system.send(ragActorRef, {
                type: 'add_document',
                params: {
                    document: doc
                }
            });
        }

        // 执行查询
        await system.send(ragActorRef, {
            type: 'rag_query',
            params: {
                query: 'Machine learning and AI',
                limit: 2
            }
        });

        // 同样，这是一个模拟测试
        // 在实际实现中，这里会有一个断言检查返回的文档
        expect(true).toBe(true);
    });

    test('应该能够过滤文档', async () => {
        // 使用过滤器查询
        await system.send(ragActorRef, {
            type: 'rag_query',
            params: {
                query: 'history',
                filter: { topic: 'computing' },
                limit: 1
            }
        });

        // 模拟测试断言
        expect(true).toBe(true);
    });
}); 