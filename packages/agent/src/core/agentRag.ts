import { Actor, Message } from '@bactor/core';
import { PID } from '@bactor/common';
import type { ActorContext } from '@bactor/core';

/**
 * 基于Mastra的RAG功能创建的文档类型
 */
export interface Document {
    id: string;
    content: string;
    metadata: Record<string, any>;
    vectors?: number[][];
    chunks?: Document[];
}

/**
 * RAG操作参数
 */
export interface RagQueryParams {
    query: string;
    collection?: string;
    limit?: number;
    filter?: Record<string, any>;
}

/**
 * 添加文档参数
 */
export interface DocumentAddParams {
    document: Document;
    collection?: string;
}

/**
 * RAG状态
 */
export interface RagActorState {
    collections: Map<string, Document[]>;
    vectorDimensions: number;
    indexCreated: boolean;
}

/**
 * 查询RAG消息
 */
export interface RagQueryMessage extends Message {
    type: 'rag_query';
    params: RagQueryParams;
}

/**
 * 添加文档消息
 */
export interface DocumentAddMessage extends Message {
    type: 'add_document';
    params: DocumentAddParams;
}

/**
 * RAG查询响应消息
 */
export interface RagResultMessage extends Message {
    type: 'rag_result';
    results: Document[];
    scores?: number[];
}

/**
 * RAG错误消息
 */
export interface RagErrorMessage extends Message {
    type: 'rag_error';
    error: string;
}

export type RagMessage = RagQueryMessage | DocumentAddMessage;
export type RagResponseMessage = RagResultMessage | RagErrorMessage;

/**
 * 模拟向量编码函数
 * 在实际实现中，我们会使用OpenAI的Embedding API或其他嵌入模型
 */
function mockEmbedding(text: string, dimensions: number = 1536): number[] {
    // 创建一个伪随机但确定性的向量
    // 在实际实现中应替换为真实的嵌入
    const hash = Array.from(text).reduce((h, c) =>
        Math.imul(31, h) + c.charCodeAt(0) | 0, 0);

    const seed = Math.abs(hash);
    const rand = (n: number) => ((seed * (n + 1)) % 997) / 997;

    return Array(dimensions).fill(0).map((_, i) => rand(i));
}

/**
 * 计算向量余弦相似度
 */
function cosineSimilarity(a: number[], b: number[]): number {
    if (a.length !== b.length) {
        throw new Error('Vectors must have the same dimensions');
    }

    let dotProduct = 0;
    let normA = 0;
    let normB = 0;

    for (let i = 0; i < a.length; i++) {
        dotProduct += a[i] * b[i];
        normA += a[i] * a[i];
        normB += b[i] * b[i];
    }

    if (normA === 0 || normB === 0) {
        return 0;
    }

    return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}

/**
 * 代表Mastra RAG系统的Actor实现
 * 提供向量搜索和文档检索功能
 */
export class RagActor extends Actor<RagActorState, Message> {
    // 保存所有文档及其向量表示的内部存储
    private documentVectors: Map<string, number[]> = new Map();

    constructor(context: ActorContext) {
        super(context, {
            collections: new Map(),
            vectorDimensions: 1536, // OpenAI Embeddings维度
            indexCreated: false
        });

        // 创建默认集合
        this.state.collections.set('default', []);
    }

    /**
     * 定义Actor的行为
     */
    protected behaviors(): void {
        this.addBehavior('default', this.handleRagRequest.bind(this));
    }

    /**
     * 处理RAG请求
     */
    private async handleRagRequest(message: Message): Promise<void> {
        try {
            if (message.type === 'rag_query') {
                await this.handleQuery(message as RagQueryMessage);
            } else if (message.type === 'add_document') {
                await this.handleAddDocument(message as DocumentAddMessage);
            }
        } catch (error: any) {
            if (message.sender) {
                await this.send(message.sender, {
                    type: 'rag_error',
                    error: error?.message || String(error)
                } as RagErrorMessage);
            }
        }
    }

    /**
     * 处理文档添加请求
     */
    private async handleAddDocument(message: DocumentAddMessage): Promise<void> {
        const { document, collection = 'default' } = message.params;

        // 确保集合存在
        if (!this.state.collections.has(collection)) {
            this.state.collections.set(collection, []);
        }

        // 如果文档没有ID，生成一个
        if (!document.id) {
            document.id = `doc_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
        }

        // 生成文档向量表示
        const docVector = mockEmbedding(document.content, this.state.vectorDimensions);
        this.documentVectors.set(document.id, docVector);

        // 将文档存储到集合
        const docs = this.state.collections.get(collection) || [];
        docs.push(document);

        // 更新状态
        const updatedCollections = new Map(this.state.collections);
        updatedCollections.set(collection, docs);

        this.setState({
            ...this.state,
            collections: updatedCollections
        });

        // 发送成功响应
        if (message.sender) {
            await this.send(message.sender, {
                type: 'rag_result',
                results: [document]
            } as RagResultMessage);
        }
    }

    /**
     * 处理向量查询请求
     */
    private async handleQuery(message: RagQueryMessage): Promise<void> {
        const { query, collection = 'default', limit = 5, filter } = message.params;

        // 检查集合是否存在
        if (!this.state.collections.has(collection)) {
            throw new Error(`Collection '${collection}' not found`);
        }

        // 获取集合中的文档
        const docs = this.state.collections.get(collection) || [];

        // 创建查询向量
        const queryVector = mockEmbedding(query, this.state.vectorDimensions);

        // 计算每个文档与查询的相似度
        const similarities: [Document, number][] = [];

        for (const doc of docs) {
            // 应用过滤器
            if (filter && !this.matchesFilter(doc, filter)) {
                continue;
            }

            const docVector = this.documentVectors.get(doc.id);
            if (docVector) {
                const score = cosineSimilarity(queryVector, docVector);
                similarities.push([doc, score]);
            }
        }

        // 按相似度降序排序并获取前N个结果
        const results = similarities
            .sort((a, b) => b[1] - a[1])
            .slice(0, limit);

        const topDocs = results.map(([doc]) => doc);
        const scores = results.map(([, score]) => score);

        // 发送结果
        if (message.sender) {
            await this.send(message.sender, {
                type: 'rag_result',
                results: topDocs,
                scores
            } as RagResultMessage);
        }
    }

    /**
     * 检查文档是否匹配过滤条件
     */
    private matchesFilter(doc: Document, filter: Record<string, any>): boolean {
        for (const [key, value] of Object.entries(filter)) {
            // 先检查元数据
            if (doc.metadata && key in doc.metadata) {
                if (doc.metadata[key] !== value) {
                    return false;
                }
                continue;
            }

            // 然后检查文档本身
            if ((doc as any)[key] !== value) {
                return false;
            }
        }

        return true;
    }
}

/**
 * RAG客户端接口，用于AgentActor调用
 */
export class AgentRag {
    private actorRef: PID;
    private context: ActorContext;

    constructor(actorRef: PID, context: ActorContext) {
        this.actorRef = actorRef;
        this.context = context;
    }

    /**
     * 添加文档到RAG系统
     */
    async addDocument(doc: Document, collection?: string): Promise<Document[]> {
        return new Promise((resolve, reject) => {
            this.context.send(this.actorRef, {
                type: 'add_document',
                params: {
                    document: doc,
                    collection
                },
                sender: this.context.self
            } as DocumentAddMessage)
                .then(() => {
                    const timeout = setTimeout(() => {
                        reject(new Error('RAG operation timed out'));
                    }, 5000);

                    // 简化实现
                    resolve([doc]);
                    clearTimeout(timeout);
                })
                .catch(reject);
        });
    }

    /**
     * 查询RAG系统
     */
    async query(queryText: string, collection?: string, limit?: number, filter?: Record<string, any>): Promise<Document[]> {
        return new Promise((resolve, reject) => {
            this.context.send(this.actorRef, {
                type: 'rag_query',
                params: {
                    query: queryText,
                    collection,
                    limit,
                    filter
                },
                sender: this.context.self
            } as RagQueryMessage)
                .then(() => {
                    const timeout = setTimeout(() => {
                        reject(new Error('RAG operation timed out'));
                    }, 5000);

                    // 简化实现
                    resolve([]);
                    clearTimeout(timeout);
                })
                .catch(reject);
        });
    }
} 