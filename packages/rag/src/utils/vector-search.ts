import type { MastraVector, QueryResult } from '@bactor/agent/vector';
import type { VectorFilter } from '@bactor/agent/vector/filter';
import { embed } from 'ai';
import type { EmbeddingModel } from 'ai';

interface VectorQuerySearchParams {
  indexName: string;
  vectorStore: MastraVector;
  queryText: string;
  model: EmbeddingModel<string>;
  queryFilter?: VectorFilter;
  topK: number;
  includeVectors?: boolean;
  maxRetries?: number;
}

interface VectorQuerySearchResult {
  results: QueryResult[];
  queryEmbedding: number[];
}

// Helper function to handle vector query search
export const vectorQuerySearch = async ({
  indexName,
  vectorStore,
  queryText,
  model,
  queryFilter,
  topK,
  includeVectors = false,
  maxRetries = 2,
}: VectorQuerySearchParams): Promise<VectorQuerySearchResult> => {
  const { embedding } = await embed({
    value: queryText,
    model,
    maxRetries,
  });
  // Get relevant chunks from the vector database
  const results = await vectorStore.query({
    indexName,
    queryVector: embedding,
    topK,
    filter: queryFilter,
    includeVector: includeVectors,
  });

  return { results, queryEmbedding: embedding };
};
