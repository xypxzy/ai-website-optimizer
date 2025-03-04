import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { OpenAIRequestDto, OpenAIResponseDto } from '../dto/openai-request.dto';
import {
  IPromptTemplate,
  IRecommenderResponse,
} from '../interfaces/recommender.interface';
import { RecommendationProcessorService } from './recommendation-processor.service';

@Injectable()
export class OpenAIService {
  private readonly logger = new Logger(OpenAIService.name);
  private readonly apiKey: string | null;
  private readonly apiUrl: string =
    'https://api.openai.com/v1/chat/completions';
  private readonly defaultModel: string = 'gpt-4';
  private readonly maxRetries = 3;
  private readonly retryDelay = 1000; // ms

  constructor(
    private configService: ConfigService,
    private recommendationProcessor: RecommendationProcessorService,
  ) {
    this.apiKey = this.configService.get<string>('OPENAI_API_KEY') ?? null;
    if (!this.apiKey) {
      this.logger.error('OpenAI API key is not set');
    }
  }

  /**
   * Sends a prompt to OpenAI API and returns the structured response
   */
  async generateRecommendations(
    prompt: string,
    template?: IPromptTemplate,
  ): Promise<IRecommenderResponse> {
    const startTime = Date.now();

    try {
      // Prepare the request
      const requestDto: OpenAIRequestDto = {
        model: this.defaultModel,
        messages: [
          {
            role: 'system',
            content:
              template?.systemPrompt ||
              'You are an expert web developer and SEO specialist. Analyze the provided website data and generate specific, actionable recommendations for improvement. Format your response as JSON.',
          },
          {
            role: 'user',
            content:
              (template?.userPromptPrefix || '') +
              prompt +
              (template?.userPromptSuffix || ''),
          },
        ],
        temperature: 0.7,
        max_tokens: 4000,
        response_format: template?.responseFormat || { type: 'json_object' },
      };

      // Send request to OpenAI with retries
      const response = await this.callOpenAIWithRetries(requestDto);

      // Process the response
      const content = response.choices[0]?.message?.content || '';
      const processedResponse =
        await this.recommendationProcessor.processResponse(content);

      // Calculate processing time
      const processingTime = Date.now() - startTime;

      return {
        recommendations: processedResponse.recommendations,
        rawResponse: content,
        processingTime,
        tokenUsage: {
          promptTokens: response.usage.prompt_tokens,
          completionTokens: response.usage.completion_tokens,
          totalTokens: response.usage.total_tokens,
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
   * Makes the API call to OpenAI with retries
   */
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

  /**
   * Makes the actual API call to OpenAI
   */
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

  /**
   * Utility method to sleep for a specified time
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
