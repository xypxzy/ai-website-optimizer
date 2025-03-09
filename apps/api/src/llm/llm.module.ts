import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { LLMProviderFactory } from './llm-factory.provider';
import { AnthropicProvider } from './providers/anthropic-provider.service';
import { GeminiProvider } from './providers/gemini-provider.service';
import { OpenAIProvider } from './providers/openai-provider.service';

@Module({
  imports: [ConfigModule],
  providers: [
    OpenAIProvider,
    GeminiProvider,
    AnthropicProvider,
    LLMProviderFactory,
  ],
  exports: [LLMProviderFactory],
})
export class LLMModule {}
