import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ILLMProvider } from '../interfaces/llm-provider.interface';

@Injectable()
export class OpenAIProvider implements ILLMProvider {
  private readonly logger = new Logger(OpenAIProvider.name);
  private readonly apiKey: string;
  private readonly apiUrl: string =
    'https://api.openai.com/v1/chat/completions';
  private readonly defaultModel: string;

  constructor(private configService: ConfigService) {
    this.apiKey = this.configService.get<string>('OPENAI_API_KEY') ?? '';
    this.defaultModel =
      this.configService.get<string>('OPENAI_MODEL') || 'gpt-4o';
  }

  async generateResponse(
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
  }> {
    try {
      const messages: Array<{ role: string; content: string }> = [];

      if (options.systemPrompt) {
        messages.push({ role: 'system', content: options.systemPrompt });
      }

      messages.push({ role: 'user', content: prompt });

      const requestData = {
        model: this.defaultModel,
        messages,
        temperature: options.temperature || 0.2,
        max_tokens: options.maxTokens || 4000,
        response_format: options.responseFormat || undefined,
      };

      // Запрос к API OpenAI
      const response = await fetch(this.apiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify(requestData),
      });

      if (!response.ok) {
        const errorData = await response.text();
        throw new Error(`OpenAI API error: ${response.status} - ${errorData}`);
      }

      const data = await response.json();

      return {
        text: data.choices[0].message.content,
        usage: {
          promptTokens: data.usage.prompt_tokens,
          completionTokens: data.usage.completion_tokens,
          totalTokens: data.usage.total_tokens,
        },
      };
    } catch (error) {
      this.logger.error(`Error in OpenAI API: ${error.message}`, error.stack);
      throw error;
    }
  }
}
