import { GenerativeModel, GoogleGenerativeAI } from '@google/generative-ai';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  IPromptTemplate,
  IRecommenderResponse,
} from '../interfaces/recommender.interface';
import { RecommendationProcessorService } from './recommendation-processor.service';

@Injectable()
export class OpenAIService {
  private readonly logger = new Logger(OpenAIService.name);
  private readonly apiKey: string | null;
  // private readonly apiUrl: string =
  //   'https://api.openai.com/v1/chat/completions';
  private readonly defaultModel: string =
    this.configService.get<string>('GEMINI_MODEL') || 'gemini-1.5-flash';
  private readonly maxRetries = 3;
  private readonly retryDelay = 1000; // ms
  private genAI: GoogleGenerativeAI;
  private model: GenerativeModel;

  constructor(
    private configService: ConfigService,
    private recommendationProcessor: RecommendationProcessorService,
  ) {
    this.logger.log(
      `Initializing OpenAI service: ${this.configService.get<string>('GEMINI_API_KEY')}`,
    );
    this.apiKey = this.configService.get<string>('GEMINI_API_KEY') ?? null;
    if (!this.apiKey) {
      this.logger.error('Gemini API key is not set');
    } else {
      // Initialize Gemini client
      this.genAI = new GoogleGenerativeAI(this.apiKey);
      this.model = this.genAI.getGenerativeModel({ model: this.defaultModel });
    }
  }

  /**
   * Sends a prompt to Gemini API and returns the structured response
   */
  async generateRecommendations(
    prompt: string,
    template?: IPromptTemplate,
  ): Promise<IRecommenderResponse> {
    const startTime = Date.now();

    try {
      // Prepare the system prompt
      const systemPrompt =
        template?.systemPrompt ||
        'You are an expert web developer and SEO specialist. Analyze the provided website data and generate specific, actionable recommendations for improvement. Format your response as JSON.';

      // Combine prompts
      const fullPrompt = `${systemPrompt}\n\n${template?.userPromptPrefix || ''}${prompt}${template?.userPromptSuffix || ''}`;

      // Add JSON instruction if needed
      const jsonInstruction =
        template?.responseFormat?.type === 'json_object'
          ? '\n\nProvide your response as a valid JSON object.'
          : '';

      const completePrompt = fullPrompt + jsonInstruction;

      // Send request to Gemini with retries
      const response = await this.callGeminiWithRetries(completePrompt);

      // Process the response
      const content = response.text || '';
      const processedResponse =
        await this.recommendationProcessor.processResponse(content);

      // Calculate processing time
      const processingTime = Date.now() - startTime;

      // Note: Gemini doesn't return token counts in the same way as OpenAI
      // We're using estimated counts here
      const estimatedTokens = this.estimateTokenCount(completePrompt, content);

      return {
        recommendations: processedResponse.recommendations,
        rawResponse: content,
        processingTime,
        tokenUsage: {
          promptTokens: estimatedTokens.promptTokens,
          completionTokens: estimatedTokens.completionTokens,
          totalTokens: estimatedTokens.totalTokens,
        },
      };
    } catch (error) {
      this.logger.error(
        `Error generating recommendations: ${error.message}`,
        error.stack,
      );
      throw error;
    }
  }

  /**
   * Calls Gemini API with retries
   */
  private async callGeminiWithRetries(
    prompt: string,
  ): Promise<{ text: string }> {
    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= this.maxRetries; attempt++) {
      try {
        return await this.callGemini(prompt);
      } catch (error) {
        lastError = error;

        // Check for rate limiting or server errors
        if (
          error.message.includes('429') ||
          error.message.includes('500') ||
          error.message.includes('503') ||
          error.message.includes('rate limit')
        ) {
          this.logger.warn(
            `Attempt ${attempt} failed, retrying in ${this.retryDelay * attempt}ms: ${error.message}`,
          );
          await this.sleep(this.retryDelay * attempt);
          continue;
        }

        // For other errors, don't retry
        throw error;
      }
    }

    throw lastError;
  }

  /**
   * Makes the actual API call to Gemini
   */
  private async callGemini(prompt: string): Promise<{ text: string }> {
    try {
      if (!this.model) {
        throw new Error('Gemini model not initialized');
      }

      // Generate content using Gemini
      const result = await this.model.generateContent(prompt);
      const response = result.response;
      const text = response.text();

      return { text };
    } catch (error) {
      this.logger.error(
        `Error calling Gemini API: ${error.message}`,
        error.stack,
      );
      throw error;
    }
  }

  /**
   * Estimate token counts (approximation)
   * This is a simple estimation as Gemini doesn't return token counts directly
   */
  private estimateTokenCount(
    prompt: string,
    response: string,
  ): {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  } {
    // Rough estimation: ~4 characters per token
    const promptTokens = Math.ceil(prompt.length / 4);
    const completionTokens = Math.ceil(response.length / 4);

    return {
      promptTokens,
      completionTokens,
      totalTokens: promptTokens + completionTokens,
    };
  }

  /**
   * Utility method to sleep for a specified time
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /* 
  // Original OpenAI implementation (commented out as requested)
  
  private async callOpenAIWithRetries(
    requestDto: OpenAIRequestDto,
  ): Promise<OpenAIResponseDto> {
    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= this.maxRetries; attempt++) {
      try {
        return await this.callOpenAI(requestDto);
      } catch (error) {
        lastError = error;

        // If it's a rate limit error (429) or a server error (5xx), wait and retry
        if (error.message.includes('429') || error.message.includes('5')) {
          this.logger.warn(
            `Attempt ${attempt} failed, retrying in ${this.retryDelay * attempt}ms: ${error.message}`,
          );
          await this.sleep(this.retryDelay * attempt);
          continue;
        }

        // For other errors, don't retry
        throw error;
      }
    }

    throw lastError;
  }

  private async callOpenAI(
    requestDto: OpenAIRequestDto,
  ): Promise<OpenAIResponseDto> {
    try {
      const response = await fetch(this.apiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify(requestDto),
      });

      if (!response.ok) {
        const errorBody = await response.text();
        throw new Error(`OpenAI API error: ${response.status} - ${errorBody}`);
      }

      return await response.json();
    } catch (error) {
      this.logger.error(
        `Error calling OpenAI API: ${error.message}`,
        error.stack,
      );
      throw error;
    }
  }
  */
}
