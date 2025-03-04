export interface IRecommendation {
  category: string; // SEO, performance, accessibility, etc.
  priority: 'high' | 'medium' | 'low';
  description: string; // Description of the problem
  solution: string; // Recommended change
  rationale: string; // Justification of effectiveness
  implementation: string; // Example implementation (HTML/CSS code)
  expectedEffect: string; // Expected impact
}

export interface IRecommenderResponse {
  recommendations: IRecommendation[];
  rawResponse?: string; // Original LLM response
  processingTime?: number; // Time taken to generate response
  tokenUsage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
}

export interface IPromptTemplate {
  systemPrompt: string;
  userPromptPrefix?: string;
  userPromptSuffix?: string;
  responseFormat?: {
    type: string;
    schema?: Record<string, any>;
  };
}
