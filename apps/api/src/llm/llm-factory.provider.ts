import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ILLMProvider } from './interfaces/llm-provider.interface';
import { AnthropicProvider } from './providers/anthropic-provider.service';
import { GeminiProvider } from './providers/gemini-provider.service';
import { OpenAIProvider } from './providers/openai-provider.service';

@Injectable()
export class LLMProviderFactory {
  constructor(
    private openaiProvider: OpenAIProvider,
    private geminiProvider: GeminiProvider,
    private anthropicProvider: AnthropicProvider,
    private configService: ConfigService,
  ) {}

  getProvider(provider?: string): ILLMProvider {
    const defaultProvider =
      this.configService.get('DEFAULT_LLM_PROVIDER') || 'gemini';
    const selectedProvider = provider || defaultProvider;

    switch (selectedProvider.toLowerCase()) {
      case 'openai':
        return this.openaiProvider;
      case 'gemini':
        return this.geminiProvider;
      case 'anthropic':
        return this.anthropicProvider;
      default:
        return this.geminiProvider;
    }
  }
}
