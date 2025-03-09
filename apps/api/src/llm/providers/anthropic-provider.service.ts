import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ILLMProvider } from '../interfaces/llm-provider.interface';

@Injectable()
export class AnthropicProvider implements ILLMProvider {
  private readonly logger = new Logger(AnthropicProvider.name);
  private readonly apiKey: string;
  private readonly apiUrl: string = 'https://api.anthropic.com/v1/messages';
  private readonly defaultModel: string;

  constructor(private configService: ConfigService) {
    this.apiKey = this.configService.get<string>('ANTHROPIC_API_KEY') ?? '';
    this.defaultModel =
      this.configService.get<string>('ANTHROPIC_MODEL') ||
      'claude-3-opus-20240229';
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
      const requestData = {
        model: this.defaultModel,
        messages: [{ role: 'user', content: prompt }],
        max_tokens: options.maxTokens || 4000,
        temperature: options.temperature || 0.2,
      };

      // Добавляем системный промпт, если есть
      if (options.systemPrompt) {
        requestData['system'] = options.systemPrompt;
      }

      // Для JSON-формата добавляем инструкции
      if (options.responseFormat?.type === 'json_object') {
        prompt += '\n\nПожалуйста, предоставь ответ в формате JSON.';

        if (options.responseFormat.schema) {
          prompt +=
            ' Используй следующую схему:\n```json\n' +
            JSON.stringify(options.responseFormat.schema, null, 2) +
            '\n```';
        }

        requestData.messages[0].content = prompt;
      }

      // Запрос к API Anthropic
      const response = await fetch(this.apiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': this.apiKey,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify(requestData),
      });

      if (!response.ok) {
        const errorData = await response.text();
        throw new Error(
          `Anthropic API error: ${response.status} - ${errorData}`,
        );
      }

      const data = await response.json();

      return {
        text: data.content[0].text,
        usage: data.usage
          ? {
              promptTokens: data.usage.input_tokens,
              completionTokens: data.usage.output_tokens,
              totalTokens: data.usage.input_tokens + data.usage.output_tokens,
            }
          : undefined,
      };
    } catch (error) {
      this.logger.error(
        `Error in Anthropic API: ${error.message}`,
        error.stack,
      );
      throw error;
    }
  }
}
