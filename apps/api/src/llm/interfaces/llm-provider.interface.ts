export interface ILLMProvider {
  generateResponse(
    prompt: string,
    options: {
      temperature?: number;
      maxTokens?: number;
      responseFormat?: { type: string; schema?: Record<string, any> };
      systemPrompt?: string;
    },
  ): Promise<{
    text: string;
    usage?: {
      promptTokens: number;
      completionTokens: number;
      totalTokens: number;
    };
  }>;
}
