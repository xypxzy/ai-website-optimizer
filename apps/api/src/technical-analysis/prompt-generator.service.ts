import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { ITechnicalAnalysisResult } from './technical-analysis.service';

/**
 * Интерфейс результата генерации промптов
 */
export interface IGeneratedPrompt {
  id: string;
  name: string;
  description: string;
  promptText: string;
  targetUse: string;
}

@Injectable()
export class PromptGeneratorService {
  private readonly logger = new Logger(PromptGeneratorService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Генерирует промпты для LLM на основе результатов технического анализа
   * @param scanId ID сканирования
   * @param analysisResult Результаты технического анализа
   */
  public async generatePrompts(
    scanId: string,
    analysisResult: ITechnicalAnalysisResult,
  ): Promise<IGeneratedPrompt[]> {
    this.logger.log(`Generating prompts for scan ${scanId}`);

    const generatedPrompts: IGeneratedPrompt[] = [];

    try {
      // Получаем данные о сканировании
      const pageScan = await this.prisma.pageScan.findUnique({
        where: { id: scanId },
      });

      if (!pageScan) {
        throw new Error(`Scan with ID ${scanId} not found`);
      }

      // Генерируем различные промпты на основе результатов анализа
      const seoPrompt = this.generateSeoPrompt(analysisResult);
      const performancePrompt = this.generatePerformancePrompt(analysisResult);
      // Здесь можно добавить другие промпты для разных типов анализа

      // Добавляем промпты в результат
      if (seoPrompt) {
        generatedPrompts.push(seoPrompt);
      }

      if (performancePrompt) {
        generatedPrompts.push(performancePrompt);
      }

      // Сохраняем промпты в базу данных
      await this.savePromptsToDatabase(scanId, generatedPrompts);

      return generatedPrompts;
    } catch (error) {
      this.logger.error(
        `Error generating prompts: ${error.message}`,
        error.stack,
      );
      throw error;
    }
  }

  /**
   * Генерирует промпт для SEO-оптимизации
   * @param analysisResult Результаты технического анализа
   */
  private generateSeoPrompt(
    analysisResult: ITechnicalAnalysisResult,
  ): IGeneratedPrompt | null {
    const seoResult = analysisResult.analyzers['SeoAnalyzer'];

    if (!seoResult) {
      return null;
    }

    // Собираем информацию о проблемах SEO
    const seoIssues = seoResult.issues
      .map(
        (issue) =>
          `- ${issue.message}${issue.recommendations ? ` (Рекомендации: ${issue.recommendations.join(', ')})` : ''}`,
      )
      .join('\n');

    // Собираем информацию о метриках SEO
    const seoMetrics = JSON.stringify(seoResult.metrics, null, 2);

    // Формируем промпт для LLM
    const promptText = `
# SEO-анализ веб-страницы

## URL страницы
${analysisResult.url}

## Общая оценка SEO
${seoResult.score}/100

## Выявленные проблемы
${seoIssues}

## Метрики SEO
\`\`\`json
${seoMetrics}
\`\`\`

## Задача для LLM
На основе приведенного выше анализа, предложите конкретные улучшения для SEO-оптимизации страницы:

1. Оптимизация мета-тегов (title, description)
2. Улучшение структуры заголовков
3. Оптимизация контента с учетом ключевых слов
4. Улучшение канонических URL и перелинковки

Для каждого улучшения предоставьте:
- Конкретный код или текст для внедрения
- Обоснование, почему это улучшит SEO
- Ожидаемый эффект на ранжирование

Приоритизируйте рекомендации по их потенциальному влиянию.
`;

    return {
      id: '',
      name: 'SEO-оптимизация',
      description: 'Промпт для генерации рекомендаций по улучшению SEO',
      promptText,
      targetUse: 'seo',
    };
  }

  /**
   * Генерирует промпт для оптимизации производительности
   * @param analysisResult Результаты технического анализа
   */
  private generatePerformancePrompt(
    analysisResult: ITechnicalAnalysisResult,
  ): IGeneratedPrompt | null {
    const performanceResult = analysisResult.analyzers['PerformanceAnalyzer'];

    if (!performanceResult) {
      return null;
    }

    // Собираем информацию о проблемах производительности
    const performanceIssues = performanceResult.issues
      .map(
        (issue) =>
          `- ${issue.message}${issue.recommendations ? ` (Рекомендации: ${issue.recommendations.join(', ')})` : ''}`,
      )
      .join('\n');

    // Собираем информацию о метриках производительности
    const performanceMetrics = JSON.stringify(
      performanceResult.metrics,
      null,
      2,
    );

    // Формируем промпт для LLM
    const promptText = `
# Анализ производительности веб-страницы

## URL страницы
${analysisResult.url}

## Общая оценка производительности
${performanceResult.score}/100

## Выявленные проблемы
${performanceIssues}

## Метрики производительности
\`\`\`json
${performanceMetrics}
\`\`\`

## Задача для LLM
На основе приведенного выше анализа, предложите конкретные улучшения для оптимизации производительности страницы:

1. Оптимизация загрузки ресурсов (JavaScript, CSS, изображений)
2. Улучшение времени до первого отображения контента (FCP)
3. Улучшение времени до интерактивности (TTI)
4. Оптимизация кэширования и сжатия

Для каждого улучшения предоставьте:
- Конкретный код или настройки для внедрения
- Обоснование, почему это улучшит производительность
- Ожидаемый эффект на метрики скорости

Приоритизируйте рекомендации по их потенциальному влиянию.
`;

    return {
      id: '',
      name: 'Оптимизация производительности',
      description:
        'Промпт для генерации рекомендаций по улучшению производительности',
      promptText,
      targetUse: 'performance',
    };
  }

  /**
   * Сохраняет промпты в базу данных
   * @param scanId ID сканирования
   * @param prompts Промпты для сохранения
   */
  private async savePromptsToDatabase(
    scanId: string,
    prompts: IGeneratedPrompt[],
  ): Promise<void> {
    try {
      await this.prisma.$transaction(
        prompts.map((prompt) =>
          this.prisma.prompt.create({
            data: {
              name: prompt.name,
              description: prompt.description,
              promptText: prompt.promptText,
              targetUse: prompt.targetUse,
              pageScanId: scanId,
            },
          }),
        ),
      );

      this.logger.log(`Saved ${prompts.length} prompts for scan ${scanId}`);
    } catch (error) {
      this.logger.error(
        `Error saving prompts to database: ${error.message}`,
        error.stack,
      );
      throw error;
    }
  }

  /**
   * Получает сохраненные промпты для сканирования
   * @param scanId ID сканирования
   */
  public async getPromptsByScanId(scanId: string): Promise<IGeneratedPrompt[]> {
    try {
      const prompts = await this.prisma.prompt.findMany({
        where: { pageScanId: scanId },
      });

      return prompts.map((prompt) => ({
        id: prompt.id,
        name: prompt.name,
        description: prompt.description || '',
        promptText: prompt.promptText,
        targetUse: prompt.targetUse,
      }));
    } catch (error) {
      this.logger.error(`Error getting prompts: ${error.message}`, error.stack);
      throw error;
    }
  }
}
