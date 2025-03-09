import { GoogleGenerativeAI } from '@google/generative-ai';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ILLMProvider } from '../interfaces/llm-provider.interface';

@Injectable()
export class GeminiProvider implements ILLMProvider {
  private readonly logger = new Logger(GeminiProvider.name);
  private readonly apiKey: string;
  private readonly defaultModel: string;
  private genAI: GoogleGenerativeAI;

  constructor(private configService: ConfigService) {
    this.apiKey = this.configService.get<string>('GEMINI_API_KEY') ?? '';
    this.defaultModel =
      this.configService.get<string>('GEMINI_MODEL') || 'gemini-1.5-flash';
    this.genAI = new GoogleGenerativeAI(this.apiKey);
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
      // Получаем модель
      const model = this.genAI.getGenerativeModel({
        model: this.defaultModel,
      });

      // Для Gemini комбинируем системный промпт и пользовательский
      let fullPrompt = prompt;
      if (options.systemPrompt) {
        fullPrompt = `${options.systemPrompt}\n\n${prompt}`;
      }

      // Добавляем инструкции по JSON-форматированию, если нужно
      if (options.responseFormat?.type === 'json_object') {
        let jsonInstructions =
          '\n\nПожалуйста, верни ответ строго в формате JSON.';

        if (options.responseFormat.schema) {
          jsonInstructions +=
            ' Используй следующую схему:\n```json\n' +
            JSON.stringify(options.responseFormat.schema, null, 2) +
            '\n```';
        }

        fullPrompt += jsonInstructions;
      }

      // Настраиваем параметры генерации
      const generationConfig = {
        temperature: options.temperature || 0.2,
        maxOutputTokens: options.maxTokens || 4000,
      };

      // Отправляем запрос
      const result = await model.generateContent({
        contents: [{ role: 'user', parts: [{ text: fullPrompt }] }],
        generationConfig,
      });

      const response = result.response;
      const text = response.text();

      // Примерная оценка количества токенов
      // В реальной системе можно использовать токенайзер для подсчета
      const estimatedPromptTokens = Math.ceil(fullPrompt.length / 4);
      const estimatedCompletionTokens = Math.ceil(text.length / 4);

      return {
        text,
        usage: {
          promptTokens: estimatedPromptTokens,
          completionTokens: estimatedCompletionTokens,
          totalTokens: estimatedPromptTokens + estimatedCompletionTokens,
        },
      };
    } catch (error) {
      this.logger.error(`Error in Gemini API: ${error.message}`, error.stack);
      throw error;
    }
  }
}
