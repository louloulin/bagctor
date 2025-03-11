import { simulateReadableStream } from 'ai';

/**
 * Mock language model implementation for testing
 */

// Create a local implementation compatible with LanguageModelV1
interface MockLanguageModelV1Props {
  doGenerate: (props: Record<string, any>) => Promise<{ text: string, toolCalls?: any[] }>;
  doStream: (props: Record<string, any>) => Promise<{ text: string, toolCalls?: any[] }>;
}

class MockLanguageModelV1 {
  // Add the required properties that a real LanguageModelV1 would have
  specificationVersion = 'v1';
  provider = 'mock';
  modelId = 'mock-model';
  defaultObjectGenerationMode = 'json';
  requiresApiKey = false;
  isTokenLimited = false;

  private props: MockLanguageModelV1Props;

  constructor(props: MockLanguageModelV1Props) {
    this.props = props;
  }

  async generate(props: Record<string, any>) {
    return this.props.doGenerate(props);
  }

  async stream(props: Record<string, any>) {
    return this.props.doStream(props);
  }
}

// Standard mock implementation
export function createMockLanguageModel(options?: {
  returnText?: string;
  returnToolCalls?: any[];
}) {
  const returnText = options?.returnText || "This is a mock response";
  const returnToolCalls = options?.returnToolCalls || [];

  return new MockLanguageModelV1({
    doGenerate: async (props: Record<string, any>) => {
      console.log("Mock LLM generate called with:", props);
      return {
        text: returnText,
        toolCalls: returnToolCalls
      };
    },
    doStream: async (props: Record<string, any>) => {
      console.log("Mock LLM stream called with:", props);
      if (props.onChunk) {
        // Simulate streaming with chunks
        const chunks = returnText.split(" ");
        for (const chunk of chunks) {
          await new Promise(resolve => setTimeout(resolve, 100));
          props.onChunk(chunk + " ");
        }
      }

      return {
        text: returnText,
        toolCalls: returnToolCalls
      };
    }
  });
}

import { MastraLLM } from './model';

/**
 * Mock LLM for testing
 */
export class MockLLM extends MastraLLM {
  constructor() {
    // Create a wrapped mock that implements the LanguageModelV1 interface
    const mockModel = createMockLanguageModel();
    // @ts-ignore - Use the mock model even though it doesn't fully implement the interface
    super({ model: mockModel });
  }
}
